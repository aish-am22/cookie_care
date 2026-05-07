import { db } from '../../infra/db.js';
import type { CreateDraftingSessionBody, DraftingSessionPayload } from '../../schemas/drafting.schema.js';
import { draftingSessionPayloadSchema } from '../../schemas/drafting.schema.js';
import { buildClauseToSectionMap, loadMasterLibraryFromDisk, parseClauseVersion, splitClauseByNumberedHeadings } from './masterLibrary.js';

type ClauseOption = {
  clauseId: string;
  title: string;
  version: string;
  status: string;
  sourceDocuments: string[];
  parts: Array<{ order: number; heading: string | null; text: string }>;
  text: string;
};

function pickRecommendedClause(options: ClauseOption[], preferredClauseId?: string): ClauseOption {
  const preferred = preferredClauseId ? options.find((option) => option.clauseId === preferredClauseId) : undefined;
  if (preferred) return preferred;

  const goldOption = options.find((option) => option.status.toLowerCase() === 'gold');
  return goldOption ?? options[0];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDraftHtml(title: string, recommendations: DraftingSessionPayload['recommendations']): string {
  const sectionHtml = recommendations
    .map((section, index) => {
      const clause = section.options.find((option) => option.clauseId === section.recommendedClauseId) ?? section.options[0];
      const clauseText = clause?.text ?? '';
      return `<h2>${index + 1}. ${escapeHtml(section.slotName)}</h2><p>${escapeHtml(clauseText)}</p>`;
    })
    .join('');

  return `<!DOCTYPE html><html><body><h1>${escapeHtml(title)}</h1>${sectionHtml}</body></html>`;
}

export async function createDraftingSession(userId: string, input: CreateDraftingSessionBody): Promise<DraftingSessionPayload> {
  const masterLibrary = loadMasterLibraryFromDisk();
  const clauseSectionMap = buildClauseToSectionMap(masterLibrary);

  const supportedClauseIds = Array.from(
    new Set(masterLibrary.master_template.sections.flatMap((section) => section.supported_clauses)),
  );

  const storedClauses = await db.masterClause.findMany({
    where: { id: { in: supportedClauseIds } },
    include: { parts: { orderBy: { partOrder: 'asc' } } },
  });
  const storedById = new Map(storedClauses.map((clause) => [clause.id, clause]));

  const optionsBySection = new Map<string, ClauseOption[]>();
  for (const clause of masterLibrary.clause_library) {
    const sectionMeta = clauseSectionMap.get(clause.id);
    if (!sectionMeta) continue;

    const stored = storedById.get(clause.id);
    const parts = stored
      ? stored.parts.map((part) => ({ order: part.partOrder, heading: part.heading, text: part.text }))
      : splitClauseByNumberedHeadings(clause.text);

    const option: ClauseOption = {
      clauseId: clause.id,
      title: clause.title,
      version: stored?.version ?? parseClauseVersion(clause.id),
      status: stored?.status ?? clause.status,
      sourceDocuments: stored
        ? Array.isArray(stored.sourceDocuments)
          ? stored.sourceDocuments.filter((value): value is string => typeof value === 'string')
          : clause.source_documents
        : clause.source_documents,
      parts,
      text: stored?.text ?? clause.text,
    };

    const existing = optionsBySection.get(sectionMeta.sectionId) ?? [];
    existing.push(option);
    optionsBySection.set(sectionMeta.sectionId, existing);
  }

  const skeleton = masterLibrary.master_template.sections.map((section) => {
    const options = optionsBySection.get(section.section_id) ?? [];
    const selected = pickRecommendedClause(options, input.preferredClausesBySection?.[section.section_id]);

    return {
      sectionId: section.section_id,
      slotName: section.slot_name,
      supportedClauseIds: section.supported_clauses,
      selectedClauseId: selected?.clauseId ?? section.supported_clauses[0] ?? 'unavailable',
    };
  });

  const recommendations = masterLibrary.master_template.sections.map((section) => {
    const options = optionsBySection.get(section.section_id) ?? [];
    const selected = pickRecommendedClause(options, input.preferredClausesBySection?.[section.section_id]);

    return {
      sectionId: section.section_id,
      slotName: section.slot_name,
      recommendedClauseId: selected?.clauseId ?? section.supported_clauses[0] ?? 'unavailable',
      options,
    };
  });

  const title = input.documentTitle ?? masterLibrary.master_template.document_title;

  const created = await db.draftingSession.create({
    data: {
      userId,
      title,
      payload: {
        skeleton,
        recommendations,
      },
      renderFormat: 'html',
      renderContent: renderDraftHtml(title, recommendations),
    },
  });

  const payload = draftingSessionPayloadSchema.parse({
    sessionId: created.id,
    title: created.title,
    skeleton,
    recommendations,
    render: {
      format: 'html',
      content: created.renderContent,
    },
    createdAt: created.createdAt.toISOString(),
  });

  return payload;
}

export async function getDraftingSession(userId: string, sessionId: string): Promise<DraftingSessionPayload | null> {
  const session = await db.draftingSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    return null;
  }

  const payloadData = session.payload as {
    skeleton?: unknown;
    recommendations?: unknown;
  };

  return draftingSessionPayloadSchema.parse({
    sessionId: session.id,
    title: session.title,
    skeleton: payloadData.skeleton,
    recommendations: payloadData.recommendations,
    render: {
      format: session.renderFormat === 'openxml' ? 'openxml' : 'html',
      content: session.renderContent,
    },
    createdAt: session.createdAt.toISOString(),
  });
}

export function buildWordAddInManifest(apiBaseUrl: string): string {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/$/, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0" xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="TaskPaneApp">
  <Id>3f685f64-b6de-4df3-a06c-8db26f4dfabc</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>Cookie Care</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="Cookie Care Drafting"/>
  <Description DefaultValue="DPA/NDA drafting assistant for Word"/>
  <Hosts>
    <Host Name="Document"/>
  </Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="${normalizedBaseUrl}/#/legal"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
</OfficeApp>`;
}

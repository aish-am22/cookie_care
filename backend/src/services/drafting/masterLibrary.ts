import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const masterSectionSchema = z.object({
  section_id: z.string().min(1),
  slot_name: z.string().min(1),
  supported_clauses: z.array(z.string().min(1)).min(1),
});

export const masterClauseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source_documents: z.array(z.string().min(1)).min(1),
  text: z.string().min(1),
  status: z.string().min(1),
});

export const masterLibrarySchema = z.object({
  master_template: z.object({
    document_title: z.string().min(1),
    description: z.string().min(1),
    sections: z.array(masterSectionSchema).min(1),
  }),
  clause_library: z.array(masterClauseSchema).min(1),
  global_variable_schema: z.object({
    $schema: z.string(),
    title: z.string(),
    type: z.string(),
    description: z.string(),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).default([]),
  }),
});

export type MasterLibrary = z.infer<typeof masterLibrarySchema>;
export type MasterClause = z.infer<typeof masterClauseSchema>;

// Matches clause version suffixes such as "_v1", "_v2", "_v3".
const versionPattern = /_v(\d+)$/i;
// Matches numbered heading starters such as "1. ", "2.3. ", "5.2.4. ".
const numberedHeadingPattern = /\b(\d+(?:\.\d+)*\.)\s+/g;

export interface ClausePart {
  heading: string | null;
  text: string;
  order: number;
}

export function parseClauseVersion(clauseId: string): string {
  const match = clauseId.match(versionPattern);
  return match ? `v${match[1]}` : 'v1';
}

export function splitClauseByNumberedHeadings(text: string): ClausePart[] {
  const matches = [...text.matchAll(numberedHeadingPattern)];
  if (matches.length === 0) {
    return [{ heading: null, text: text.trim(), order: 1 }];
  }

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
      const segment = text.slice(start, end).trim();
      return {
        heading: match[1],
        text: segment,
        order: index + 1,
      };
    })
    .filter((part) => part.text.length > 0);
}

export function resolveMasterLibraryPath(): string {
  const configuredPath = process.env['MASTER_LIBRARY_PATH'];
  if (configuredPath) {
    return path.resolve(process.cwd(), configuredPath);
  }
  return path.resolve(process.cwd(), 'data/templates/dpa_master.json');
}

export function loadMasterLibraryFromDisk(masterPath = resolveMasterLibraryPath()): MasterLibrary {
  const fileContent = readFileSync(masterPath, 'utf8');
  const raw = JSON.parse(fileContent) as unknown;
  return masterLibrarySchema.parse(raw);
}

export function buildClauseToSectionMap(masterLibrary: MasterLibrary): Map<string, { sectionId: string; slotName: string }> {
  const map = new Map<string, { sectionId: string; slotName: string }>();
  for (const section of masterLibrary.master_template.sections) {
    for (const clauseId of section.supported_clauses) {
      map.set(clauseId, { sectionId: section.section_id, slotName: section.slot_name });
    }
  }
  return map;
}

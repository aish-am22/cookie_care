import React, { useEffect, useMemo, useState } from 'react';
import { contractsApi } from '../../api/contractsApi';
import { aiApi, DRAFT_SUGGESTION_TOP_K, buildDraftRetrievalQuestion, type RetrievedContextChunk } from '../../api/aiApi';
import { useTemplates } from '../../hooks/useTemplates';
import { TemplateLibrary } from '../TemplateLibrary';
import type { ContractTemplate } from '../../types';
import { AlertTriangleIcon, ArrowPathIcon, BookOpenIcon, DocumentTextIcon } from '../Icons';
import { DocumentViewer } from './DocumentViewer';
import { parseDocumentSections, stripHtml } from '../../utils/legalReview';

const contractTypes = ['Non-Disclosure Agreement (NDA)', 'Consulting Agreement', 'Service Agreement'] as const;

export const DraftTab: React.FC = () => {
  const [contractType, setContractType] = useState<string>(contractTypes[0]);
  const [jurisdiction, setJurisdiction] = useState('');
  const [parties, setParties] = useState('');
  const [keyTerms, setKeyTerms] = useState('');

  const [suggestions, setSuggestions] = useState<RetrievedContextChunk[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<RetrievedContextChunk | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('none');

  const [draftTitle, setDraftTitle] = useState('Generated Draft');
  const [draftContent, setDraftContent] = useState('');
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ContractTemplate | null>(null);

  const { templates, fetchTemplates } = useTemplates();

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const draftSections = useMemo(() => parseDocumentSections(stripHtml(draftContent)), [draftContent]);
  const previewSections = useMemo(() => parseDocumentSections(previewTemplate?.content ?? ''), [previewTemplate]);
  const buildTemplatePreviewUrl = (templateId: string) => `${window.location.origin}${window.location.pathname}#/legal/templates/${templateId}`;

  const handleRetrieveSuggestions = async () => {
    setIsRetrieving(true);
    setError(null);

    try {
      const result = await aiApi.retrieveContext({
        question: buildDraftRetrievalQuestion({ contractType, jurisdiction, parties, keyTerms }),
        docType: 'TEMPLATE',
        topK: DRAFT_SUGGESTION_TOP_K,
      });
      setSuggestions(result.chunks);
      setSelectedSuggestion(result.chunks[0] ?? null);
    } catch (retrieveError) {
      setSuggestions([]);
      setSelectedSuggestion(null);
      setError(retrieveError instanceof Error ? retrieveError.message : 'Failed to fetch template suggestions.');
    } finally {
      setIsRetrieving(false);
    }
  };

  const handleGenerateDraft = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const detailPayload = {
        contractType,
        jurisdiction,
        parties,
        keyTerms,
        selectedRagContext: selectedSuggestion?.content,
      };

      const templateSeed = [selectedTemplate?.content, selectedSuggestion?.content]
        .filter((item): item is string => Boolean(item))
        .join('\n\n');

      const generated = await contractsApi.generate(
        contractType,
        JSON.stringify(detailPayload, null, 2),
        templateSeed || undefined,
      );

      setDraftTitle(generated.title);
      setDraftContent(generated.content);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate draft.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(22rem,25rem)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)]">Draft brief</h3>
            <p className="text-sm text-[var(--text-primary)] mt-1">Combine template retrieval and generation in one workflow.</p>

            <div className="mt-4 space-y-3">
              <label className="text-sm font-medium text-[var(--text-primary)] block">
                Contract type
                <select
                  value={contractType}
                  onChange={(event) => setContractType(event.target.value)}
                  className="mt-1.5 w-full h-11 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm"
                >
                  {contractTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-[var(--text-primary)] block">
                Jurisdiction
                <input
                  value={jurisdiction}
                  onChange={(event) => setJurisdiction(event.target.value)}
                  className="mt-1.5 w-full h-11 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm"
                  placeholder="e.g., Delaware, GDPR"
                />
              </label>

              <label className="text-sm font-medium text-[var(--text-primary)] block">
                Parties
                <input
                  value={parties}
                  onChange={(event) => setParties(event.target.value)}
                  className="mt-1.5 w-full h-11 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm"
                  placeholder="e.g., Alpha Corp and Beta Ltd"
                />
              </label>

              <label className="text-sm font-medium text-[var(--text-primary)] block">
                Key terms
                <textarea
                  value={keyTerms}
                  onChange={(event) => setKeyTerms(event.target.value)}
                  rows={4}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                  placeholder="Payment model, SLA, IP ownership, liability caps..."
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleRetrieveSuggestions}
                  disabled={isRetrieving}
                  className="h-11 rounded-xl border border-brand-blue text-brand-blue font-semibold hover:bg-brand-blue/10 disabled:opacity-60"
                >
                  {isRetrieving ? 'Retrieving...' : 'Get suggestions'}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={isGenerating}
                  className="h-11 rounded-xl bg-brand-blue text-white font-semibold hover:bg-brand-blue-light disabled:bg-slate-400"
                >
                  {isGenerating ? 'Generating...' : 'Generate draft'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-[var(--text-headings)]">Template source</h3>
              <button
                type="button"
                onClick={fetchTemplates}
                className="h-8 px-3 rounded-lg border border-[var(--border-primary)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center gap-1"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Refresh
              </button>
            </div>
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className="mt-3 w-full h-11 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm"
            >
              <option value="none">None (RAG-only context)</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>

            <div className="mt-4 space-y-2 max-h-56 overflow-y-auto pr-1">
              {isRetrieving ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] animate-pulse" />
                ))
              ) : suggestions.length > 0 ? (
                suggestions.map((chunk, index) => (
                  <button
                    type="button"
                    key={`${chunk.documentId}-${chunk.chunkIndex}-${index}`}
                    onClick={() => setSelectedSuggestion(chunk)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      selectedSuggestion?.chunkIndex === chunk.chunkIndex && selectedSuggestion.documentId === chunk.documentId
                        ? 'border-brand-blue bg-brand-blue/5'
                        : 'border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-brand-blue/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--text-headings)]">{chunk.documentTitle}</p>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)]">{chunk.score.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] mt-2 line-clamp-3">{chunk.content}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border-primary)] p-4 text-sm text-[var(--text-primary)]">
                  No suggestions yet. Use “Get suggestions” to retrieve relevant template context.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <DocumentViewer
            title={draftTitle}
            sections={draftSections}
            emptyMessage="Generated draft preview appears here."
            className="min-h-[32rem] xl:h-[calc(100vh-18rem)]"
            scrollAreaClassName="p-5 space-y-4"
          />

          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)]">Grounding sources</h3>
            {suggestions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((chunk, index) => (
                  <span
                    key={`${chunk.documentId}-${chunk.chunkIndex}-${index}`}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-[var(--border-primary)] text-xs bg-[var(--bg-primary)] text-[var(--text-headings)]"
                  >
                    <BookOpenIcon className="h-4 w-4 text-brand-blue" />
                    {chunk.documentTitle}
                    {chunk.sectionLabel ? ` • ${chunk.sectionLabel}` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-primary)]">No retrieval context yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)] flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-brand-blue" />
              Manage templates in Draft flow
            </h3>
            <p className="text-sm text-[var(--text-primary)] mt-1">Click a template to preview it in-app, or open the dedicated preview page in a new tab.</p>
            <div className="mt-4">
              <TemplateLibrary
                templates={templates}
                onTemplatesChange={fetchTemplates}
                onTemplatePreview={setPreviewTemplate}
                buildTemplatePreviewUrl={buildTemplatePreviewUrl}
              />
            </div>
          </div>
        </div>
      </div>

      {previewTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[1px] p-4 sm:p-8">
          <div className="mx-auto h-full max-w-6xl bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-[var(--border-primary)] flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-headings)]">{previewTemplate.name}</h3>
                <p className="text-xs text-[var(--text-primary)] mt-0.5">Template preview</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={buildTemplatePreviewUrl(previewTemplate.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="h-9 px-3 rounded-lg border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] inline-flex items-center"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  className="h-9 px-3 rounded-lg border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-5 flex-1 min-h-0">
              <DocumentViewer
                title={previewTemplate.name}
                sections={previewSections}
                className="h-full"
                scrollAreaClassName="p-5 space-y-4"
                emptyMessage="This template does not contain previewable text."
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-start gap-2">
          <AlertTriangleIcon className="h-5 w-5 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

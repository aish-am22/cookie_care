import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { contractsApi } from '../../api/contractsApi';
import { aiApi, DRAFT_SUGGESTION_TOP_K, buildDraftRetrievalQuestion, type RetrievedContextChunk } from '../../api/aiApi';
import { useTemplates } from '../../hooks/useTemplates';
import { TemplateLibrary } from '../TemplateLibrary';
import type { ContractTemplate } from '../../types';
import {
  AlertTriangleIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  SaveIcon,
  SearchIcon,
  SparklesIcon,
} from '../Icons';
import { DocumentViewer } from './DocumentViewer';
import { parseDocumentSections, stripHtml } from '../../utils/legalReview';
import { buildTemplatePreviewHash } from '../../utils/legalReviewRoutes';

const contractTypes = ['Non-Disclosure Agreement (NDA)', 'Consulting Agreement', 'Service Agreement'] as const;

const STEP_LABELS = ['Contract Type', 'Parties & Jurisdiction', 'Key Terms', 'Optional Clauses'] as const;

const OPTIONAL_CLAUSE_OPTIONS = [
  { id: 'limitation-liability', label: 'Limitation of Liability', tags: ['risk', 'standard'] },
  { id: 'indemnification', label: 'Indemnification', tags: ['risk'] },
  { id: 'dispute-resolution', label: 'Dispute Resolution / Arbitration', tags: ['jurisdiction'] },
  { id: 'force-majeure', label: 'Force Majeure', tags: ['standard'] },
  { id: 'ip-assignment', label: 'IP Assignment', tags: ['risk'] },
  { id: 'non-compete', label: 'Non-Compete', tags: ['jurisdiction', 'risk'] },
  { id: 'data-protection', label: 'Data Protection / GDPR', tags: ['jurisdiction', 'compliance'] },
  { id: 'audit-rights', label: 'Audit Rights', tags: ['standard'] },
] as const;

const MOCK_CLAUSES = [
  { id: 'c1', name: 'Standard Confidentiality', tags: ['standard', 'nda'], description: 'Industry-standard NDA confidentiality clause.' },
  { id: 'c2', name: 'Mutual NDA', tags: ['nda'], description: 'Mutual non-disclosure for bilateral agreements.' },
  { id: 'c3', name: 'GDPR Data Processing', tags: ['jurisdiction', 'gdpr'], description: 'GDPR-compliant data processing addendum.' },
  { id: 'c4', name: 'IP Indemnification', tags: ['risk'], description: 'Covers IP indemnification obligations.' },
  { id: 'c5', name: 'Limitation of Liability Cap', tags: ['risk'], description: 'Sets a cap on maximum financial liability.' },
  { id: 'c6', name: 'Force Majeure Standard', tags: ['standard'], description: 'Addresses unforeseeable circumstances.' },
];

type ClauseSource = 'Template' | 'RAG' | 'Rule';

interface ClauseTraceItem {
  id: string;
  name: string;
  source: ClauseSource;
}

const clauseSourceStyles: Record<ClauseSource, string> = {
  Template: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  RAG: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Rule: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

export const DraftTab: React.FC = () => {
  // Wizard step
  const [currentStep, setCurrentStep] = useState(0);

  // Form fields
  const [contractType, setContractType] = useState<string>(contractTypes[0]);
  const [jurisdiction, setJurisdiction] = useState('');
  const [parties, setParties] = useState('');
  const [keyTerms, setKeyTerms] = useState('');
  const [optionalClauses, setOptionalClauses] = useState<Record<string, boolean>>(
    Object.fromEntries(OPTIONAL_CLAUSE_OPTIONS.map((c) => [c.id, false])),
  );

  // Clause library
  const [clauseSearch, setClauseSearch] = useState('');
  const [includedClauses, setIncludedClauses] = useState<Record<string, boolean>>({});

  // Template & RAG
  const [suggestions, setSuggestions] = useState<RetrievedContextChunk[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<RetrievedContextChunk | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('none');

  // Draft state
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

  const buildTemplatePreviewUrl = useCallback(
    (templateId: string) => `${window.location.origin}${window.location.pathname}${buildTemplatePreviewHash(templateId)}`,
    [],
  );

  const filteredClauses = useMemo(() => {
    if (!clauseSearch.trim()) return MOCK_CLAUSES;
    const q = clauseSearch.toLowerCase();
    return MOCK_CLAUSES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q)),
    );
  }, [clauseSearch]);

  const clauseTraceItems = useMemo((): ClauseTraceItem[] => {
    if (!draftContent) return [];
    const items: ClauseTraceItem[] = [
      { id: 'ct-parties', name: 'Parties & Definitions', source: 'Template' },
      { id: 'ct-term', name: 'Term & Termination', source: 'Template' },
    ];
    if (selectedSuggestion) {
      items.push({ id: 'ct-rag', name: selectedSuggestion.documentTitle, source: 'RAG' });
    }
    OPTIONAL_CLAUSE_OPTIONS.filter((c) => optionalClauses[c.id]).forEach((c) => {
      items.push({ id: `ct-opt-${c.id}`, name: c.label, source: 'Rule' });
    });
    return items;
  }, [draftContent, selectedSuggestion, optionalClauses]);

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
        optionalClauses: OPTIONAL_CLAUSE_OPTIONS.filter((c) => optionalClauses[c.id]).map((c) => c.label),
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

  const renderWizardStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-primary)]">Select the type of contract to draft:</p>
            <div className="space-y-2">
              {contractTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setContractType(type)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                    contractType === type
                      ? 'border-brand-blue bg-brand-blue/5 text-[var(--text-headings)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-brand-blue/60'
                  }`}
                >
                  <p className="text-sm font-semibold">{type}</p>
                </button>
              ))}
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-3">
            <label className="text-sm font-medium text-[var(--text-primary)] block">
              Parties
              <input
                value={parties}
                onChange={(e) => setParties(e.target.value)}
                className="mt-1.5 w-full h-11 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm"
                placeholder="e.g., Alpha Corp and Beta Ltd"
              />
            </label>
            <label className="text-sm font-medium text-[var(--text-primary)] block">
              Jurisdiction
              <input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                className="mt-1.5 w-full h-11 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm"
                placeholder="e.g., Delaware, GDPR"
              />
            </label>
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <label className="text-sm font-medium text-[var(--text-primary)] block">
              Key terms
              <textarea
                value={keyTerms}
                onChange={(e) => setKeyTerms(e.target.value)}
                rows={5}
                className="mt-1.5 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
                placeholder="Payment model, SLA, IP ownership, liability caps..."
              />
            </label>
          </div>
        );
      case 3:
        return (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-primary)]">Select optional clauses to include in the generated draft:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {OPTIONAL_CLAUSE_OPTIONS.map((clause) => (
                <label
                  key={clause.id}
                  className="flex items-start gap-3 p-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] cursor-pointer hover:border-brand-blue/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={optionalClauses[clause.id] ?? false}
                    onChange={(e) => setOptionalClauses((prev) => ({ ...prev, [clause.id]: e.target.checked }))}
                    className="mt-0.5 accent-brand-blue"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-headings)]">{clause.label}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {clause.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(22rem,25rem)_minmax(0,1fr)] gap-6 items-start">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Multi-step wizard */}
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)]">Draft brief</h3>
            <p className="text-sm text-[var(--text-primary)] mt-1">Guided setup for your contract draft.</p>

            {/* Step indicator */}
            <div className="mt-4 flex items-center gap-1">
              {STEP_LABELS.map((label, index) => (
                <React.Fragment key={label}>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    title={label}
                    className="flex flex-col items-center"
                  >
                    <span
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        index < currentStep
                          ? 'bg-brand-blue text-white'
                          : index === currentStep
                            ? 'bg-brand-blue text-white ring-2 ring-brand-blue/30'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                      }`}
                    >
                      {index < currentStep ? '\u2713' : index + 1}
                    </span>
                  </button>
                  {index < STEP_LABELS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 rounded-full transition-colors ${
                        index < currentStep ? 'bg-brand-blue' : 'bg-[var(--border-primary)]'
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
            <p className="mt-2 text-xs font-semibold text-brand-blue">
              Step {currentStep + 1} of {STEP_LABELS.length}: {STEP_LABELS[currentStep]}
            </p>

            {/* Step content */}
            <div className="mt-4">{renderWizardStep()}</div>

            {/* Wizard navigation */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                disabled={currentStep === 0}
                className="h-9 px-3 rounded-xl border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Back
              </button>
              {currentStep < STEP_LABELS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
                  className="h-9 px-3 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue-light flex items-center gap-1"
                >
                  Next
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetrieveSuggestions}
                    disabled={isRetrieving}
                    className="h-9 px-3 rounded-xl border border-brand-blue text-brand-blue text-sm font-semibold hover:bg-brand-blue/10 disabled:opacity-60"
                  >
                    {isRetrieving ? 'Retrieving...' : 'Get suggestions'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={isGenerating}
                    className="h-9 px-3 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue-light disabled:bg-slate-400 flex items-center gap-1.5"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {isGenerating ? 'Generating...' : 'Generate Draft'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Template & Clause Library */}
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-[var(--text-headings)] flex items-center gap-2">
                <BookOpenIcon className="h-5 w-5 text-brand-blue" />
                Template &amp; Clause Library
              </h3>
              <button
                type="button"
                onClick={fetchTemplates}
                className="h-8 px-3 rounded-lg border border-[var(--border-primary)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center gap-1"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Refresh
              </button>
            </div>

            {/* Template selector */}
            <div className="mt-3">
              <p className="text-xs font-medium text-[var(--text-primary)] mb-2">Template</p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId('none')}
                  className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition-colors ${
                    selectedTemplateId === 'none'
                      ? 'border-brand-blue bg-brand-blue/5 text-[var(--text-headings)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-brand-blue/60'
                  }`}
                >
                  <span className="font-medium">None</span>
                  <span className="text-xs ml-2 opacity-70">RAG-only context</span>
                </button>
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`rounded-xl border px-3 py-2 transition-colors ${
                      selectedTemplateId === template.id
                        ? 'border-brand-blue bg-brand-blue/5'
                        : 'border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-brand-blue/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTemplateId(template.id)}
                        className="text-sm font-medium text-[var(--text-headings)] truncate text-left flex-1"
                      >
                        {template.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTemplate(template)}
                        className="text-xs text-brand-blue hover:underline flex-shrink-0"
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <p className="text-xs text-[var(--text-primary)] px-1">No templates yet. Upload via the panel below.</p>
                )}
              </div>
            </div>

            {/* Clause library search */}
            <div className="mt-4">
              <p className="text-xs font-medium text-[var(--text-primary)] mb-2">Clause Library</p>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-primary)]" />
                <input
                  value={clauseSearch}
                  onChange={(e) => setClauseSearch(e.target.value)}
                  placeholder="Search clauses..."
                  className="w-full h-9 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] pl-9 pr-3 text-sm"
                />
              </div>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
                {filteredClauses.map((clause) => (
                  <div
                    key={clause.id}
                    className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-headings)]">{clause.name}</p>
                        <p className="text-xs text-[var(--text-primary)] mt-0.5">{clause.description}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {clause.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <label className="flex-shrink-0 flex items-center gap-1.5 cursor-pointer">
                        <span className="text-xs text-[var(--text-primary)]">Include</span>
                        <input
                          type="checkbox"
                          checked={includedClauses[clause.id] ?? false}
                          onChange={(e) => setIncludedClauses((prev) => ({ ...prev, [clause.id]: e.target.checked }))}
                          className="accent-brand-blue"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Template management (upload/delete) */}
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)] flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-brand-blue" />
              Manage Templates
            </h3>
            <p className="text-sm text-[var(--text-primary)] mt-1">Upload, preview, or remove templates used during draft generation.</p>
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

        {/* Right Column */}
        <div className="space-y-4">
          {/* Draft preview */}
          <DocumentViewer
            title={draftTitle}
            sections={draftSections}
            emptyMessage="Generated draft preview appears here."
            className="min-h-[32rem] xl:h-[calc(100vh-18rem)]"
            scrollAreaClassName="p-5 space-y-4"
          />

          {/* Action buttons */}
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={isGenerating}
                className="h-9 px-4 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue-light disabled:bg-slate-400 flex items-center gap-1.5"
              >
                <SparklesIcon className="h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Generate Draft'}
              </button>
              <button
                type="button"
                disabled={!draftContent}
                className="h-9 px-4 rounded-xl border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 flex items-center gap-1.5"
                title="Preview DOCX (coming soon)"
              >
                <DocumentTextIcon className="h-4 w-4" />
                Preview DOCX
              </button>
              <button
                type="button"
                disabled={!draftContent}
                className="h-9 px-4 rounded-xl border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 flex items-center gap-1.5"
                title="Export (coming soon)"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Export
              </button>
              <button
                type="button"
                disabled={!draftContent}
                className="h-9 px-4 rounded-xl border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 flex items-center gap-1.5"
                title="Save as Template (coming soon)"
              >
                <SaveIcon className="h-4 w-4" />
                Save as Template
              </button>
            </div>
          </div>

          {/* Clause Trace */}
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)]">Clause Trace</h3>
            <p className="text-xs text-[var(--text-primary)] mt-0.5">Clauses inserted in the draft and their sources.</p>
            {clauseTraceItems.length > 0 ? (
              <div className="mt-3 space-y-2">
                {clauseTraceItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2"
                  >
                    <p className="text-sm text-[var(--text-headings)] font-medium truncate">{item.name}</p>
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold ${clauseSourceStyles[item.source]}`}>
                      {item.source}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border-2 border-dashed border-[var(--border-primary)] p-5 text-center">
                <p className="text-sm text-[var(--text-primary)]">No clauses traced yet. Generate a draft to see the clause breakdown.</p>
              </div>
            )}
          </div>

          {/* Evidence & Playbook (formerly Grounding sources) */}
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)]">Evidence &amp; Playbook</h3>
            <p className="text-xs text-[var(--text-primary)] mt-0.5">Retrieved context and playbook references used during generation.</p>
            {suggestions.length > 0 ? (
              <div className="mt-3 space-y-2">
                {suggestions.map((chunk, index) => (
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
                      <div className="flex items-center gap-2 min-w-0">
                        <BookOpenIcon className="h-4 w-4 text-brand-blue flex-shrink-0" />
                        <p className="text-sm font-semibold text-[var(--text-headings)] truncate">{chunk.documentTitle}</p>
                        {chunk.sectionLabel && (
                          <span className="text-xs text-[var(--text-primary)] flex-shrink-0">&middot; {chunk.sectionLabel}</span>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)]">
                        {chunk.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] mt-2 line-clamp-2">{chunk.content}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border-2 border-dashed border-[var(--border-primary)] p-5 text-center">
                <BookOpenIcon className="mx-auto h-8 w-8 text-[var(--text-primary)]/40" />
                <p className="mt-2 text-sm text-[var(--text-primary)]">No retrieval context yet.</p>
                <p className="text-xs text-[var(--text-primary)]/70 mt-1">Use "Get suggestions" on step 4 to retrieve relevant playbook and template context.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Template preview modal */}
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

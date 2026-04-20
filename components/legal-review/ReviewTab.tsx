import React, { useMemo, useRef, useState } from 'react';
import * as mammoth from 'mammoth';
import { aiApi, DEFAULT_RAG_TOP_K } from '../../api/aiApi';
import { legalApi } from '../../api/legalApi';
import type { RagCitation } from '../../api/aiApi';
import type { LegalAnalysisResult } from '../../types';
import { AlertTriangleIcon, PaperAirplaneIcon, ScaleIcon, UploadCloudIcon } from '../Icons';
import { DocumentViewer } from './DocumentViewer';
import {
  attachRiskToSections,
  getMatchableSnippet,
  mapClauseAnalysisToFindings,
  normalizeInsufficientAnswer,
  parseDocumentSections,
  type ReviewFinding,
} from '../../utils/legalReview';

const riskUi = {
  high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200',
  safe: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-200',
} as const;

export const ReviewTab: React.FC = () => {
  const [documentText, setDocumentText] = useState('');
  const [fileName, setFileName] = useState('');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LegalAnalysisResult | null>(null);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const [askInput, setAskInput] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askCitations, setAskCitations] = useState<RagCitation[]>([]);

  const [isParsing, setIsParsing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sections = useMemo(() => parseDocumentSections(documentText), [documentText]);
  const sectionsWithRisk = useMemo(() => attachRiskToSections(sections, findings), [sections, findings]);
  const sectionIdByHeading = useMemo(() => {
    const index = new Map<string, string>();
    sectionsWithRisk.forEach((section) => {
      index.set(section.heading.toLowerCase(), section.id);
    });
    return index;
  }, [sectionsWithRisk]);
  const sectionSearchIndex = useMemo(
    () => sectionsWithRisk.map((section) => ({
      id: section.id,
      haystack: `${section.heading} ${section.content}`.toLowerCase(),
      content: section.content.toLowerCase(),
    })),
    [sectionsWithRisk],
  );

  const riskCounts = useMemo(() => findings.reduce(
    (acc, finding) => {
      acc[finding.riskLevel] += 1;
      return acc;
    },
    { high: 0, medium: 0, safe: 0 },
  ), [findings]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setAnalysisWarning(null);
    setIsParsing(true);
    setFileName(file.name);

    try {
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setDocumentText(result.value);
      } else {
        const text = await file.text();
        setDocumentText(text);
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? `Unable to read this file: ${parseError.message}` : 'Unable to read this file. Please upload a DOCX or TXT document.');
      setFileName('');
    } finally {
      setIsParsing(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!documentText.trim()) {
      setError('Upload or paste a legal document to start review.');
      return;
    }

    setError(null);
    setAnalysisWarning(null);
    setIsAnalyzing(true);
    setAskAnswer(null);
    setAskCitations([]);

    const ingestPromise = aiApi.ingestDocument({
      title: fileName || 'Uploaded Legal Document',
      filename: fileName || 'legal-document.txt',
      content: documentText,
      mimeType: 'text/plain',
      docType: 'CONTRACT',
    });

    const reviewPromise = legalApi.review(documentText, 'neutral');

    const [ingestResult, reviewResult] = await Promise.allSettled([ingestPromise, reviewPromise]);

    if (ingestResult.status === 'fulfilled') {
      setDocumentId(ingestResult.value.documentId);
    } else {
      setDocumentId(null);
      setAnalysisWarning('Document analysis completed, but RAG indexing failed. Q&A may be limited.');
    }

    if (reviewResult.status === 'fulfilled') {
      setAnalysis(reviewResult.value);
      setFindings(mapClauseAnalysisToFindings(reviewResult.value.analysis));
    } else {
      setAnalysis(null);
      setFindings([]);
      setError(reviewResult.reason instanceof Error ? reviewResult.reason.message : 'Failed to analyze this document.');
    }

    setIsAnalyzing(false);
  };

  const handleAsk = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!askInput.trim()) return;

    setIsAsking(true);
    setError(null);

    try {
      const response = await aiApi.askRag({
        question: askInput,
        documentId: documentId ?? undefined,
        topK: DEFAULT_RAG_TOP_K,
      });
      setAskAnswer(response.answer);
      setAskCitations(response.citations);
    } catch (askError) {
      setAskAnswer(null);
      setAskCitations([]);
      setError(askError instanceof Error ? askError.message : 'Failed to run document Q&A.');
    } finally {
      setIsAsking(false);
    }
  };

  const mapFindingToSection = (finding: ReviewFinding): string | null => {
    const clauseName = finding.clauseName.toLowerCase();
    const snippet = getMatchableSnippet(finding.snippet);
    const match = sectionSearchIndex.find((section) => {
      return section.haystack.includes(clauseName) || section.haystack.includes(snippet);
    });
    return match?.id ?? null;
  };

  const mapCitationToSection = (citation: RagCitation): string | null => {
    if (citation.sectionLabel) {
      const byHeading = sectionIdByHeading.get(citation.sectionLabel.toLowerCase());
      if (byHeading) return byHeading;
    }
    if (citation.snippet) {
      const snippet = getMatchableSnippet(citation.snippet);
      const match = sectionSearchIndex.find((section) => section.content.includes(snippet));
      if (match) return match.id;
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)]">Document intake</h3>
            <p className="text-sm text-[var(--text-primary)] mt-1">Upload or paste the contract you want to review.</p>

            <textarea
              value={documentText}
              onChange={(event) => setDocumentText(event.target.value)}
              rows={10}
              className="mt-4 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3 text-sm text-[var(--text-headings)] focus:ring-2 focus:ring-brand-blue"
              placeholder="Paste legal text here..."
              disabled={isParsing || isAnalyzing}
            />

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              accept=".docx,.txt"
              className="hidden"
              disabled={isParsing || isAnalyzing}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing || isAnalyzing}
              className="mt-3 w-full rounded-xl border-2 border-dashed border-[var(--border-primary)] px-4 py-4 hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-60"
            >
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--text-headings)]">
                <UploadCloudIcon className="h-5 w-5 text-brand-blue" />
                {isParsing ? 'Parsing document...' : fileName ? `Selected: ${fileName}` : 'Upload DOCX / TXT'}
              </div>
            </button>

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isParsing || isAnalyzing || !documentText.trim()}
              className="mt-4 w-full h-11 rounded-xl bg-brand-blue text-white font-semibold hover:bg-brand-blue-light disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ScaleIcon className="h-5 w-5" />
              {isAnalyzing ? 'Analyzing document...' : 'Run legal review'}
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-center">
                <p className="text-xs font-medium text-red-600">High risk</p>
                <p className="text-xl font-bold text-red-700">{riskCounts.high}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-center">
                <p className="text-xs font-medium text-amber-600">Medium risk</p>
                <p className="text-xl font-bold text-amber-700">{riskCounts.medium}</p>
              </div>
              <div className="rounded-xl border border-green-200 bg-green-50/70 p-3 text-center">
                <p className="text-xs font-medium text-green-600">Safe</p>
                <p className="text-xl font-bold text-green-700">{riskCounts.safe}</p>
              </div>
            </div>
            {analysis ? (
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 text-sm">
                <p className="font-semibold text-[var(--text-headings)]">Overall risk: {analysis.overallRisk.level}</p>
                <p className="mt-1 text-[var(--text-primary)]">{analysis.overallRisk.summary}</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-primary)]">Run legal review to generate clause findings and overall contract risk.</p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)]">Findings</h3>
            <p className="text-sm text-[var(--text-primary)] mt-1">Click a finding to focus the mapped clause in viewer.</p>
            <div className="mt-4 space-y-3 max-h-[24rem] overflow-y-auto pr-1">
              {isAnalyzing ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-20 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] animate-pulse" />
                ))
              ) : findings.length > 0 ? (
                findings.map((finding) => (
                  <button
                    key={finding.id}
                    type="button"
                    onClick={() => {
                      const sectionId = mapFindingToSection(finding);
                      if (sectionId) setActiveSectionId(sectionId);
                    }}
                    className={`w-full text-left rounded-xl border bg-[var(--bg-primary)] p-3 transition-colors ${
                      mapFindingToSection(finding) === activeSectionId
                        ? 'border-brand-blue ring-1 ring-brand-blue/30'
                        : 'border-[var(--border-primary)] hover:border-brand-blue'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--text-headings)]">{finding.clauseName}</p>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${riskUi[finding.riskLevel]}`}>
                        {finding.riskLevel}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] mt-2">{finding.snippet}</p>
                    <p className="text-xs text-[var(--text-primary)] mt-1">{finding.rationale}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border-primary)] p-4 text-sm text-[var(--text-primary)]">
                  No findings yet. Run legal review to populate risk analysis.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--text-headings)]">Ask about this document</h3>
            <p className="text-sm text-[var(--text-primary)] mt-1">Grounded Q&A with source references that sync to the viewer.</p>
            <form onSubmit={handleAsk} className="mt-4 flex gap-2">
              <input
                value={askInput}
                onChange={(event) => setAskInput(event.target.value)}
                className="flex-1 h-11 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm"
                placeholder="Ask a question about obligations, liability, scope..."
                disabled={isAsking}
              />
              <button
                type="submit"
                disabled={isAsking || !askInput.trim()}
                className="h-11 px-4 rounded-xl bg-brand-blue text-white font-semibold hover:bg-brand-blue-light disabled:bg-slate-400"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
              </button>
            </form>

            <div className="mt-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 min-h-[8rem]">
              {isAsking ? (
                <div className="space-y-2">
                  <div className="h-3 w-5/6 bg-[var(--bg-tertiary)] animate-pulse rounded" />
                  <div className="h-3 w-4/6 bg-[var(--bg-tertiary)] animate-pulse rounded" />
                  <div className="h-3 w-3/6 bg-[var(--bg-tertiary)] animate-pulse rounded" />
                </div>
              ) : askAnswer ? (
                <>
                  <p className="text-sm text-[var(--text-headings)] whitespace-pre-wrap leading-relaxed">
                    {askAnswer.startsWith('INSUFFICIENT_EVIDENCE') ? normalizeInsufficientAnswer(askAnswer) : askAnswer}
                  </p>
                  {askCitations.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {askCitations.map((citation, index) => (
                        <button
                          key={`${citation.documentId}-${citation.versionId}-${index}`}
                          type="button"
                          onClick={() => {
                            const sectionId = mapCitationToSection(citation);
                            if (sectionId) setActiveSectionId(sectionId);
                          }}
                          className="px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-headings)] hover:border-brand-blue transition-colors"
                          title={citation.snippet}
                        >
                          {citation.documentTitle}
                          {citation.sectionLabel ? ` • ${citation.sectionLabel}` : ''}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--text-primary)]">No citations returned for this answer.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--text-primary)]">Ask a question to see grounded answer and source references.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <DocumentViewer
            title="In-app contract viewer"
            sections={sectionsWithRisk}
            activeSectionId={activeSectionId}
            onSectionSelect={setActiveSectionId}
            emptyMessage="Upload or paste a document to enable clause viewer and risk highlighting."
            className="min-h-[32rem] xl:h-[calc(100vh-18rem)]"
            scrollAreaClassName="p-5 space-y-4"
          />
        </div>
      </div>

      {analysisWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {analysisWarning}
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

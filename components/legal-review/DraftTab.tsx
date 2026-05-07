import React, { useMemo, useState } from 'react';
import { draftingApi } from '../../api/draftingApi';
import type { DraftingSessionPayload } from '../../types/api';
import { AlertTriangleIcon, SparklesIcon, DocumentTextIcon, BookOpenIcon } from '../Icons';
import { DocumentViewer } from './DocumentViewer';
import { parseDocumentSections, stripHtml } from '../../utils/legalReview';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRenderedHtml(session: DraftingSessionPayload, selectedClauseIds: Record<string, string>): string {
  const sections = session.recommendations
    .map((recommendation, index) => {
      const selectedClauseId = selectedClauseIds[recommendation.sectionId] ?? recommendation.recommendedClauseId;
      const selected = recommendation.options.find((option) => option.clauseId === selectedClauseId) ?? recommendation.options[0];
      if (!selected) {
        return `<h2>${index + 1}. ${escapeHtml(recommendation.slotName)}</h2><p>No clause options available for this section.</p>`;
      }
      return `<h2>${index + 1}. ${escapeHtml(recommendation.slotName)}</h2><p>${escapeHtml(selected.text)}</p>`;
    })
    .join('');

  return `<!DOCTYPE html><html><body><h1>${escapeHtml(session.title)}</h1>${sections}</body></html>`;
}

export const DraftTab: React.FC = () => {
  const [documentTitle, setDocumentTitle] = useState('Master Data Processing Agreement (DPA)');
  const [session, setSession] = useState<DraftingSessionPayload | null>(null);
  const [selectedClauseIds, setSelectedClauseIds] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renderedHtml = useMemo(() => {
    if (!session) return '';
    return buildRenderedHtml(session, selectedClauseIds);
  }, [session, selectedClauseIds]);

  const renderedSections = useMemo(() => {
    if (!session) return [];
    return parseDocumentSections(stripHtml(renderedHtml || session.render.content));
  }, [session, renderedHtml]);

  const handleCreateDraft = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const created = await draftingApi.createSession({ documentTitle });
      setSession(created);
      setSelectedClauseIds(
        created.skeleton.reduce<Record<string, string>>((acc, section) => {
          acc[section.sectionId] = section.selectedClauseId;
          return acc;
        }, {}),
      );
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'Failed to create drafting session.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <label className="flex-1 text-sm font-medium text-[var(--text-primary)]">
            Draft title
            <input
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              className="mt-1.5 w-full h-11 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={handleCreateDraft}
            disabled={isLoading}
            className="h-11 px-5 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue-light disabled:bg-slate-400 inline-flex items-center justify-center gap-2"
          >
            <SparklesIcon className="h-4 w-4" />
            {isLoading ? 'Preparing draft...' : 'Create Drafting Session'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-[var(--text-headings)] flex items-center gap-2">
            <DocumentTextIcon className="h-5 w-5 text-brand-blue" />
            DPA Skeleton
          </h3>
          <p className="text-xs text-[var(--text-primary)] mt-1">Structure-first view of each section in the draft.</p>
          {session ? (
            <div className="mt-4 space-y-2.5 max-h-[32rem] overflow-y-auto pr-1">
              {session.skeleton.map((section, index) => (
                <div key={section.sectionId} className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
                  <p className="text-sm font-semibold text-[var(--text-headings)]">{index + 1}. {section.slotName}</p>
                  <p className="text-xs text-[var(--text-primary)] mt-1">Selected: {selectedClauseIds[section.sectionId] ?? section.selectedClauseId}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border-2 border-dashed border-[var(--border-primary)] p-5 text-center text-sm text-[var(--text-primary)]">
              Create a drafting session to load the skeleton.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-[var(--text-headings)] flex items-center gap-2">
            <BookOpenIcon className="h-5 w-5 text-brand-blue" />
            AI Recommendations &amp; Clause Options
          </h3>
          <p className="text-xs text-[var(--text-primary)] mt-1">Choose the best clause variant per section.</p>
          {session ? (
            <div className="mt-4 space-y-3 max-h-[32rem] overflow-y-auto pr-1">
              {session.recommendations.map((recommendation) => (
                <div key={recommendation.sectionId} className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3.5">
                  <p className="text-sm font-semibold text-[var(--text-headings)]">{recommendation.slotName}</p>
                  <div className="mt-2 space-y-2">
                    {recommendation.options.map((option) => {
                      const isSelected = (selectedClauseIds[recommendation.sectionId] ?? recommendation.recommendedClauseId) === option.clauseId;
                      return (
                        <button
                          key={option.clauseId}
                          type="button"
                          onClick={() => setSelectedClauseIds((prev) => ({ ...prev, [recommendation.sectionId]: option.clauseId }))}
                          className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                            isSelected
                              ? 'border-brand-blue bg-brand-blue/5'
                              : 'border-[var(--border-primary)] hover:border-brand-blue/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-[var(--text-headings)]">{option.title}</p>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-primary)]">{option.version}</span>
                          </div>
                          <p className="text-xs text-[var(--text-primary)] mt-1 line-clamp-2">{option.text}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border-2 border-dashed border-[var(--border-primary)] p-5 text-center text-sm text-[var(--text-primary)]">
              Clause recommendations appear here after draft session creation.
            </div>
          )}
        </div>
      </div>

      <DocumentViewer
        title={session?.title ?? 'Draft Preview'}
        sections={renderedSections}
        emptyMessage="Generated draft preview appears here."
        className="min-h-[30rem]"
        scrollAreaClassName="p-5 space-y-4"
      />

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-start gap-2">
          <AlertTriangleIcon className="h-5 w-5 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

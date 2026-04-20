import React, { useState } from 'react';
import { aiApi, buildNegotiationPrompt, type RagCitation } from '../../api/aiApi';
import { AlertTriangleIcon, ScaleIcon } from '../Icons';
import { normalizeInsufficientAnswer } from '../../utils/legalReview';

const modes = [
  { id: 'strict', label: 'Strict' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'flexible', label: 'Flexible' },
] as const;

type NegotiationMode = (typeof modes)[number]['id'];

export const NegotiateTab: React.FC = () => {
  const [currentClause, setCurrentClause] = useState('');
  const [counterpartyClause, setCounterpartyClause] = useState('');
  const [mode, setMode] = useState<NegotiationMode>('balanced');
  const [suggestedLanguage, setSuggestedLanguage] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [citations, setCitations] = useState<RagCitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseSuggestion = (answer: string) => {
    const normalized = answer.startsWith('INSUFFICIENT_EVIDENCE') ? normalizeInsufficientAnswer(answer) : answer;
    const sections = normalized.split(/\n\n+/);
    const language = sections[0] || normalized;
    const rationalePart = sections.slice(1).join('\n\n');
    return {
      language,
      rationale: rationalePart || 'Rationale not explicitly provided; review source-backed answer above.',
    };
  };

  const handleSuggestLanguage = async () => {
    if (!currentClause.trim() || !counterpartyClause.trim()) {
      setError('Provide both current clause and counterparty clause to generate fallback language.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await aiApi.askRag({
        question: buildNegotiationPrompt({ currentClause, counterpartyClause, mode }),
        topK: 8,
        docType: 'PLAYBOOK',
      });
      const parsed = parseSuggestion(response.answer);
      setSuggestedLanguage(parsed.language);
      setRationale(parsed.rationale);
      setCitations(response.citations);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : 'Failed to suggest fallback language.');
      setSuggestedLanguage(null);
      setRationale(null);
      setCitations([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-[var(--text-headings)]">Current clause</h3>
          <textarea
            value={currentClause}
            onChange={(event) => setCurrentClause(event.target.value)}
            rows={10}
            className="mt-3 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3 text-sm"
            placeholder="Paste your current approved clause..."
          />
        </div>
        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-[var(--text-headings)]">Counterparty clause</h3>
          <textarea
            value={counterpartyClause}
            onChange={(event) => setCounterpartyClause(event.target.value)}
            rows={10}
            className="mt-3 w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3 text-sm"
            placeholder="Paste counterparty language for comparison..."
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-[var(--text-headings)]">Negotiation mode</p>
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                mode === item.id
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'bg-[var(--bg-primary)] text-[var(--text-primary)] border-[var(--border-primary)] hover:border-brand-blue/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSuggestLanguage}
          disabled={isLoading}
          className="mt-4 h-11 px-5 rounded-xl bg-brand-blue text-white font-semibold hover:bg-brand-blue-light disabled:bg-slate-400 flex items-center gap-2"
        >
          <ScaleIcon className="h-5 w-5" />
          {isLoading ? 'Generating fallback language...' : 'Suggest fallback language'}
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-[var(--text-headings)]">Negotiation suggestion</h3>
        {isLoading ? (
          <div className="mt-3 space-y-2">
            <div className="h-3 w-11/12 bg-[var(--bg-tertiary)] animate-pulse rounded" />
            <div className="h-3 w-9/12 bg-[var(--bg-tertiary)] animate-pulse rounded" />
            <div className="h-3 w-7/12 bg-[var(--bg-tertiary)] animate-pulse rounded" />
          </div>
        ) : suggestedLanguage ? (
          <div className="mt-3 space-y-4">
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
              <p className="text-xs uppercase tracking-wide font-semibold text-[var(--text-primary)]">Suggested language</p>
              <p className="mt-2 text-sm whitespace-pre-wrap text-[var(--text-headings)]">{suggestedLanguage}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
              <p className="text-xs uppercase tracking-wide font-semibold text-[var(--text-primary)]">Rationale</p>
              <p className="mt-2 text-sm whitespace-pre-wrap text-[var(--text-primary)]">{rationale}</p>
            </div>
            {citations.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {citations.map((citation, index) => (
                  <span
                    key={`${citation.documentId}-${citation.versionId}-${index}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--border-primary)] text-xs bg-[var(--bg-primary)] text-[var(--text-headings)]"
                    title={citation.snippet}
                  >
                    {citation.documentTitle}
                    {citation.sectionLabel ? ` • ${citation.sectionLabel}` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-primary)]">No source references returned.</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-primary)]">Suggestion will appear here after running fallback generation.</p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-start gap-2">
          <AlertTriangleIcon className="h-5 w-5 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

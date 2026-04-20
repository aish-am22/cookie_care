import React, { useEffect, useMemo, useRef } from 'react';
import type { DocumentSection, RiskBucket } from '../../utils/legalReview';

const riskStyles: Record<RiskBucket, { badge: string; card: string; dot: string; label: string }> = {
  high: {
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200',
    card: 'border-red-300 bg-red-50/50 dark:bg-red-900/10',
    dot: 'bg-red-500',
    label: 'High risk',
  },
  medium: {
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
    card: 'border-amber-300 bg-amber-50/40 dark:bg-amber-900/10',
    dot: 'bg-amber-500',
    label: 'Medium risk',
  },
  safe: {
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200',
    card: 'border-green-300 bg-green-50/40 dark:bg-green-900/10',
    dot: 'bg-green-500',
    label: 'Safe',
  },
};

interface DocumentViewerProps {
  title: string;
  sections: DocumentSection[];
  activeSectionId?: string | null;
  onSectionSelect?: (sectionId: string) => void;
  emptyMessage?: string;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  title,
  sections,
  activeSectionId,
  onSectionSelect,
  emptyMessage = 'Document preview will appear here once content is available.',
}) => {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!activeSectionId) return;
    const node = sectionRefs.current[activeSectionId];
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeSectionId]);

  const renderedSections = useMemo(() => sections.filter((section) => section.content.trim()), [sections]);

  return (
    <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-sm h-full min-h-[24rem]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]">
        <h3 className="text-sm font-semibold text-[var(--text-headings)]">{title}</h3>
        <span className="text-xs text-[var(--text-primary)]">{renderedSections.length} sections</span>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
        {renderedSections.length === 0 ? (
          <div className="h-56 border-2 border-dashed border-[var(--border-primary)] rounded-xl flex items-center justify-center text-sm text-[var(--text-primary)] text-center px-6">
            {emptyMessage}
          </div>
        ) : (
          renderedSections.map((section) => {
            const risk = section.riskLevel ? riskStyles[section.riskLevel] : null;
            const isActive = activeSectionId === section.id;
            return (
              <div
                id={section.id}
                key={section.id}
                ref={(node) => {
                  sectionRefs.current[section.id] = node;
                }}
                onClick={() => onSectionSelect?.(section.id)}
                className={`rounded-xl border p-4 transition-all cursor-pointer ${
                  risk ? risk.card : 'border-[var(--border-primary)] bg-[var(--bg-primary)]'
                } ${isActive ? 'ring-2 ring-brand-blue' : ''}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <h4 className="text-sm font-semibold text-[var(--text-headings)]">{section.heading}</h4>
                  {risk && (
                    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold ${risk.badge}`}>
                      <span className={`h-2 w-2 rounded-full ${risk.dot}`} />
                      {risk.label}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{section.content}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

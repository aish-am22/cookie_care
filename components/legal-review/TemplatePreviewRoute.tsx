import React, { useEffect, useMemo } from 'react';
import { ArrowPathIcon } from '../Icons';
import { useTemplates } from '../../hooks/useTemplates';
import { DocumentViewer } from './DocumentViewer';
import { parseDocumentSections } from '../../utils/legalReview';

interface TemplatePreviewRouteProps {
  templateId: string;
}

export const TemplatePreviewRoute: React.FC<TemplatePreviewRouteProps> = ({ templateId }) => {
  const { templates, isLoading, fetchTemplates } = useTemplates();

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const template = useMemo(
    () => templates.find((item) => item.id === templateId),
    [templateId, templates],
  );

  const sections = useMemo(
    () => parseDocumentSections(template?.content ?? ''),
    [template?.content],
  );

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 shadow-sm flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-headings)]">Template preview</h3>
          <p className="text-sm text-[var(--text-primary)] mt-1">
            {template ? template.name : 'Open templates in a dedicated preview page.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#/legal';
          }}
          className="h-9 px-3 rounded-lg border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
        >
          Back to Legal Review
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 shadow-sm space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] animate-pulse" />
          ))}
        </div>
      ) : template ? (
        <DocumentViewer
          title={template.name}
          sections={sections}
          className="h-[calc(100vh-16rem)]"
          scrollAreaClassName="p-5 space-y-4"
          emptyMessage="Template content is empty."
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-primary)] bg-[var(--bg-secondary)] p-10 text-center">
          <ArrowPathIcon className="mx-auto h-8 w-8 text-[var(--text-primary)]/70" />
          <p className="text-sm font-medium text-[var(--text-headings)] mt-3">Template not found</p>
          <p className="text-sm text-[var(--text-primary)] mt-1">This template may have been removed. Return to Draft tab and choose another one.</p>
        </div>
      )}
    </div>
  );
};

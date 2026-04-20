import React, { useState } from 'react';
import { DocumentTextIcon, ScaleIcon, RedactIcon } from './Icons';
import { ReviewTab } from './legal-review/ReviewTab';
import { DraftTab } from './legal-review/DraftTab';
import { NegotiateTab } from './legal-review/NegotiateTab';

type LegalReviewTab = 'review' | 'draft' | 'negotiate';

const tabs: Array<{ id: LegalReviewTab; label: string; icon: React.ReactNode }> = [
  { id: 'review', label: 'Review', icon: <ScaleIcon className="h-5 w-5" /> },
  { id: 'draft', label: 'Draft', icon: <DocumentTextIcon className="h-5 w-5" /> },
  { id: 'negotiate', label: 'Negotiate', icon: <RedactIcon className="h-5 w-5" /> },
];

export const LegalReviewerView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LegalReviewTab>('review');

  return (
    <div className="max-w-7xl mx-auto mt-6">
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-2 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 h-11 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] shadow-sm'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'review' && <ReviewTab />}
        {activeTab === 'draft' && <DraftTab />}
        {activeTab === 'negotiate' && <NegotiateTab />}
      </div>
    </div>
  );
};

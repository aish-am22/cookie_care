import type { ClauseAnalysis, RiskLevel } from '../types';

export type RiskBucket = 'high' | 'medium' | 'safe';

export interface DocumentSection {
  id: string;
  heading: string;
  content: string;
  riskLevel?: RiskBucket;
}

export interface ReviewFinding {
  id: string;
  clauseName: string;
  snippet: string;
  rationale: string;
  riskLevel: RiskBucket;
  source?: string;
  sectionId?: string;
}

const headingPattern = /^\s*((\d+(\.\d+)*)[.)-]?\s+)?([A-Z][\w\s/&-]{3,})\s*$/;

export function mapRiskBucket(risk: RiskLevel | string): RiskBucket {
  const normalized = risk.toLowerCase();
  if (normalized.includes('critical') || normalized.includes('high')) return 'high';
  if (normalized.includes('medium')) return 'medium';
  return 'safe';
}

export function parseDocumentSections(text: string): DocumentSection[] {
  const segments = text
    .split(/\n\s*\n/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.map((segment, index) => {
    const lines = segment.split('\n').map((line) => line.trim()).filter(Boolean);
    const firstLine = lines[0] ?? `Clause ${index + 1}`;
    const isHeading = headingPattern.test(firstLine);
    const heading = isHeading ? firstLine : `Clause ${index + 1}`;
    const content = isHeading ? lines.slice(1).join('\n').trim() || firstLine : lines.join('\n');

    return {
      id: `clause-${index + 1}`,
      heading,
      content,
    };
  });
}

export function attachRiskToSections(sections: DocumentSection[], findings: ReviewFinding[]): DocumentSection[] {
  return sections.map((section) => {
    const matchingFindings = findings.filter((finding) => {
      const haystack = `${section.heading} ${section.content}`.toLowerCase();
      return haystack.includes(finding.clauseName.toLowerCase()) || haystack.includes(finding.snippet.slice(0, 60).toLowerCase());
    });

    const riskLevel = matchingFindings.some((finding) => finding.riskLevel === 'high')
      ? 'high'
      : matchingFindings.some((finding) => finding.riskLevel === 'medium')
        ? 'medium'
        : matchingFindings.length > 0
          ? 'safe'
          : undefined;

    return {
      ...section,
      riskLevel,
    };
  });
}

export function mapClauseAnalysisToFindings(analysis: ClauseAnalysis[]): ReviewFinding[] {
  return analysis.map((clause, index) => ({
    id: `finding-${index + 1}`,
    clauseName: clause.clause,
    snippet: clause.summary,
    rationale: clause.risk || clause.recommendation,
    riskLevel: mapRiskBucket(clause.riskLevel),
    source: clause.recommendation,
  }));
}

export function normalizeInsufficientAnswer(answer: string): string {
  return answer.replace(/^INSUFFICIENT_EVIDENCE:\s*/i, '').trim();
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').trim();
}

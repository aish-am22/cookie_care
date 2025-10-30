

// This file defines types shared within the backend service.

export enum CookieCategory {
  NECESSARY = 'Necessary',
  ANALYTICS = 'Analytics',
  MARKETING = 'Marketing',
  FUNCTIONAL = 'Functional',
  UNKNOWN = 'Unknown',
}

export enum ComplianceStatus {
  COMPLIANT = 'Compliant',
  PRE_CONSENT_POTENTIAL_ISSUE = 'Pre-Consent Potential Issue',
  POST_REJECTION_POTENTIAL_ISSUE = 'Post-Rejection Potential Issue',
  UNKNOWN = 'Unknown',
}

export type CookieParty = 'First' | 'Third';
export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational' | 'Unknown';


export interface CookieInfo {
  key: string;
  name: string;
  provider: string; 
  category: CookieCategory | string;
  expiry: string;
  purpose: string;
  party: CookieParty;
  isHttpOnly: boolean;
  isSecure: boolean;
  complianceStatus: ComplianceStatus | string;
  remediation: string;
  pagesFound: string[];
  oneTrustClassification?: string;
  databaseClassification?: string;
}

export interface TrackerInfo {
    key: string;
    hostname: string;
    category: CookieCategory | string;
    complianceStatus: ComplianceStatus;
    remediation: string;
    pagesFound: string[];
    databaseClassification?: string;
    oneTrustClassification?: string;
}

export interface LocalStorageInfo {
  key: string; // combination of origin and storageKey
  origin: string;
  storageKey: string;
  category: CookieCategory | string;
  complianceStatus: ComplianceStatus | string;
  remediation: string;
  pagesFound: string[];
  purpose: string;
  oneTrustClassification?: string;
}

export interface ThirdPartyDomainInfo {
  hostname: string;
  count: number;
  pagesFound: string[];
  category: CookieCategory | string;
  complianceStatus: ComplianceStatus;
  remediation: string;
  oneTrustClassification?: string;
}

export interface LocalStorageItem {
    origin: string;
    key: string;
    value: string;
    pageUrl: string;
}

export interface NetworkRequestItem {
    hostname: string;
    url: string;
    isTracker: boolean;
    pageUrl: string;
}

export interface PageDetail {
    url: string;
    time: string;
    banner: 'found' | 'not found';
    cookiesCount: number;
    thirdPartyRequestsCount: number;
    trackingRequestsCount: number;
    duplicateTrackingEventsFound: boolean;
    externalLinksCount: number;
}


export interface ComplianceInfo {
    riskLevel: RiskLevel;
    assessment: string;
}

export interface GoogleConsentV2Status {
  detected: boolean;
  status: string; // e.g., "ad_storage: granted; analytics_storage: denied"
}

export interface ScanResultData {
  uniqueCookies: CookieInfo[];
  uniqueTrackers: TrackerInfo[];
  uniqueLocalStorage: LocalStorageInfo[];
  thirdPartyDomains: ThirdPartyDomainInfo[];
  pages: { url: string }[];
  screenshotBase64: string;
  compliance: {
    gdpr: ComplianceInfo;
    ccpa: ComplianceInfo;
  };
  consentBannerDetected: boolean;
  cookiePolicyDetected: boolean;
  pagesScannedCount: number;
  googleConsentV2: GoogleConsentV2Status;
  cmpProvider: string;
}


// --- Legal Reviewer Types ---
export type LegalPerspective = 'controller' | 'processor' | 'neutral';

export interface ClauseAnalysis {
  clause: string;
  summary: string;
  risk: string;
  riskLevel: RiskLevel;
  recommendation: string;
}

export interface LegalAnalysisResult {
  overallRisk: {
    level: RiskLevel;
    summary: string;
  };
  analysis: ClauseAnalysis[];
}

export interface GeneratedContract {
    title: string;
    content: string;
}

export interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
}

export interface ContractTemplate {
    id: string;
    name: string;
    content: string;
}


// --- Vulnerability Scanner Types ---

export enum VulnerabilityCategory {
  SECURITY_HEADERS = 'Security Headers',
  COOKIE_CONFIG = 'Cookie Configuration',
  INFO_EXPOSURE = 'Information Exposure',
  INSECURE_TRANSPORT = 'Insecure Transport',
  SOFTWARE_FINGERPRINTING = 'Software Fingerprinting',
  FRONTEND_SECURITY = 'Frontend Security',
  THIRD_PARTY_RISK = 'Third-Party Risk',
  BEST_PRACTICES = 'Best Practices',
  UNKNOWN = 'Unknown',
}

export interface VulnerabilityFinding {
    name: string;
    riskLevel: RiskLevel;
    category: VulnerabilityCategory | string;
    description: string;
    impact: string;
    evidence: string;
    remediation: string;
    references: {
        title: string;
        url: string;
    }[];
}

export interface VulnerabilityScanResult {
    overallRisk: {
        level: RiskLevel;
        score: number; // 0.0 - 10.0
        summary: string;
    };
    findings: VulnerabilityFinding[];
}
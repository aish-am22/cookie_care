



export enum CookieCategory {
  NECESSARY = 'Necessary',
  ANALYTICS = 'Analytics',
  MARKETING = 'Marketing',
  FUNCTIONAL = 'Functional',
  UNKNOWN = 'Unknown',
}

export enum FilterCategory {
    ALL = 'All Technologies',
    TRACKERS = 'Trackers',
    VIOLATIONS = 'Violations',
    NECESSARY = 'Necessary',
    ANALYTICS = 'Analytics',
    MARKETING = 'Marketing',
    FUNCTIONAL = 'Functional',
    UNKNOWN = 'Unknown',
}

export type ComplianceStatus = 'Compliant' | 'Pre-Consent Potential Issue' | 'Post-Rejection Potential Issue' | 'Unknown';
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
  complianceStatus: ComplianceStatus;
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
    key: string;
    origin: string;
    storageKey: string;
    category: CookieCategory | string;
    complianceStatus: ComplianceStatus;
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
  pagesScannedCount: number;
  googleConsentV2: GoogleConsentV2Status;
  cmpProvider: string;
  cookiePolicyDetected: boolean;
}

// --- Legal Review Types ---
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
export type VulnerabilityCategory = 'Security Headers' | 'Cookie Configuration' | 'Information Exposure' | 'Insecure Transport' | 'Software Fingerprinting' | 'Frontend Security' | 'Third-Party Risk' | 'Best Practices' | 'Unknown';

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
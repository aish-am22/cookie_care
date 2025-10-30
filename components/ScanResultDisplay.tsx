





import React, { useState, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { 
  CookieIcon, TagInventoryIcon, CheckCircleIcon, ShieldExclamationIcon, FileTextIcon, 
  XMarkIcon, ArrowDownTrayIcon, GlobeAltIcon, DocumentChartBarIcon, DatabaseIcon,
  GoogleGLogo, InformationCircleIcon, ScaleIcon, PaperAirplaneIcon, TableCellsIcon
} from './Icons';
import { CookieCategory, type ScanResultData, type PageDetail, type CookieInfo, type TrackerInfo, type LocalStorageInfo, type ComplianceStatus, type RiskLevel, type CookieParty, type ThirdPartyDomainInfo } from '../types';

const ITEMS_PER_PAGE = 10;
const API_BASE_URL = (window as any).API_BASE_URL;

// --- STYLING & HELPERS ---
const getComplianceStyle = (status: ComplianceStatus) => {
    switch (status) {
        case 'Pre-Consent Potential Issue':
        case 'Post-Rejection Potential Issue':
            return { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-500/30' };
        case 'Compliant':
            return { text: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-500/30' };
        default:
            return { text: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/20', border: 'border-slate-500/30' };
    }
};

const getCategoryInfo = (category: CookieCategory | string) => {
    switch (category) {
        case CookieCategory.NECESSARY: return { color: '#3b82f6' }; // blue
        case CookieCategory.ANALYTICS: return { color: '#8b5cf6' }; // violet
        case CookieCategory.MARKETING: return { color: '#ec4899' }; // pink
        case CookieCategory.FUNCTIONAL: return { color: '#10b981' }; // green
        default: return { color: '#64748b' }; // slate
    }
};

// --- SUB-COMPONENTS ---

const StatCard: React.FC<{ 
  title: string; 
  value: string | number; 
  icon: React.ReactNode; 
  risk?: RiskLevel; 
  details?: string; 
  valueClassName?: string;
  onClick?: () => void;
}> = ({ title, value, icon, risk, details, valueClassName, onClick }) => {
    const riskColor = risk === 'High' || risk === 'Critical' || risk === 'Medium' ? 'text-red-500 dark:text-red-400' : 'text-[var(--text-headings)]';
    const finalValueClass = valueClassName || 'text-3xl font-bold';
    const containerClasses = `bg-[var(--bg-secondary)] p-5 rounded-xl border border-[var(--border-primary)] flex items-start gap-4 ${onClick ? 'cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors' : ''}`;
    
    return (
        <div className={containerClasses} title={details} onClick={onClick}>
            <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg text-brand-blue">{icon}</div>
            <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
                <p className={`${finalValueClass} ${riskColor}`}>{value}</p>
            </div>
        </div>
    );
};

const DetailsModal: React.FC<{ item: CookieInfo | TrackerInfo | LocalStorageInfo; onClose: () => void }> = ({ item, onClose }) => {
    const isCookie = 'name' in item;
    const isStorage = 'storageKey' in item;
    const { text, bg } = getComplianceStyle(item.complianceStatus);

    let title = '';
    let icon: React.ReactNode;
    if (isStorage) {
      title = item.storageKey;
      icon = <DatabaseIcon className="h-6 w-6 text-brand-blue" />;
    } else if (isCookie) {
      title = item.name;
      icon = <CookieIcon className="h-6 w-6 text-brand-blue" />;
    } else {
      title = item.hostname;
      icon = <TagInventoryIcon className="h-6 w-6 text-brand-blue" />;
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-up" onClick={onClose}>
            <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl max-w-2xl w-full" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-[var(--border-primary)] flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {icon}
                        <h3 className="text-lg font-bold text-[var(--text-headings)] max-w-md truncate">{title}</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]"><XMarkIcon className="h-6 w-6"/></button>
                </header>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className={`p-3 rounded-lg ${bg}`}>
                            <p className="font-semibold text-[var(--text-headings)]">Compliance Status</p>
                            <p className={text}>{item.complianceStatus}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                            <p className="font-semibold text-[var(--text-headings)]">AI Classification</p>
                            <p>{item.category}</p>
                        </div>
                    </div>
                     {('databaseClassification' in item && item.databaseClassification || 'oneTrustClassification' in item && item.oneTrustClassification) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            {'databaseClassification' in item && item.databaseClassification && 
                                <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                                    <p className="font-semibold text-[var(--text-headings)]">DB Classification</p>
                                    <p>{item.databaseClassification}</p>
                                </div>
                            }
                            {'oneTrustClassification' in item && item.oneTrustClassification &&
                                 <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                                    <p className="font-semibold text-[var(--text-headings)]">OneTrust Category</p>
                                    <p>{item.oneTrustClassification}</p>
                                </div>
                            }
                        </div>
                     )}

                    {(isCookie) && (
                         <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                            <p className="font-semibold text-[var(--text-headings)]">Cookie Party</p>
                            <p className="truncate">{item.party} Party</p>
                        </div>
                    )}


                    {(isCookie || isStorage) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                             <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                                <p className="font-semibold text-[var(--text-headings)]">{isCookie ? 'Provider' : 'Origin'}</p>
                                <p className="truncate">{isCookie ? item.provider : item.origin}</p>
                            </div>
                            {isCookie && 
                                <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                                    <p className="font-semibold text-[var(--text-headings)]">Expiry</p>
                                    <p>{item.expiry}</p>
                                </div>
                            }
                        </div>
                    )}
                     {(isCookie || isStorage) && item.purpose && (
                        <div>
                            <h4 className="text-sm font-semibold text-[var(--text-headings)]">AI-Generated Purpose</h4>
                            <p className="text-sm text-[var(--text-primary)] mt-1">{item.purpose}</p>
                        </div>
                    )}

                    <div>
                        <h4 className="text-sm font-semibold text-green-600 dark:text-green-400">Remediation Plan</h4>
                        <div className="mt-2 p-3 bg-[var(--bg-primary)] rounded-md border border-[var(--border-primary)]">
                          <p className="text-sm text-green-700 dark:text-green-300 whitespace-pre-wrap font-mono">{item.remediation}</p>
                        </div>
                    </div>
                    
                    <div>
                        <h4 className="text-sm font-semibold text-[var(--text-headings)]">Found On ({item.pagesFound.length} Pages)</h4>
                        <ul className="text-sm text-[var(--text-primary)] mt-2 list-disc list-inside bg-[var(--bg-primary)] p-3 rounded-md border border-[var(--border-primary)] max-h-40 overflow-y-auto">
                            {item.pagesFound.map(page => <li key={page} className="truncate" title={page}>{page}</li>)}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ConsentV2InfoModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-up" onClick={onClose}>
        <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <header className="p-4 border-b border-[var(--border-primary)] flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <InformationCircleIcon className="h-6 w-6 text-brand-blue" />
                    <h3 className="text-lg font-bold text-[var(--text-headings)]">About Google Consent Mode v2</h3>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]"><XMarkIcon className="h-6 w-6"/></button>
            </header>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                    <h4 className="font-semibold text-[var(--text-headings)]">What is Google Consent Mode v2?</h4>
                    <p className="text-sm text-[var(--text-primary)] mt-1">
                        Google Consent Mode v2 is a framework that allows your website to communicate a user's cookie consent choices (e.g., 'accepted' or 'rejected') to Google's advertising and analytics services, like Google Ads and Google Analytics.
                    </p>
                </div>
                <div>
                    <h4 className="font-semibold text-green-600 dark:text-green-400">What does "Detected" mean?</h4>
                    <p className="text-sm text-[var(--text-primary)] mt-1">
                        When we detect Consent Mode v2, it means your website is using this modern standard. It allows Google's tags to adjust their behavior based on user consent. For example, if a user rejects analytics cookies, Google Analytics can still collect basic, anonymous data in a 'cookieless' way for modeling purposes, helping you retain some measurement insights while respecting user privacy. It is a key requirement for using Google's services for audiences in the European Economic Area (EEA).
                    </p>
                </div>
                 <div>
                    <h4 className="font-semibold text-orange-600 dark:text-orange-400">What does "Not Detected" mean?</h4>
                    <p className="text-sm text-[var(--text-primary)] mt-1">
                       This means your website is likely not sending consent signals to Google services. This can lead to a complete loss of advertising and analytics data for users who do not consent, particularly from the EEA. Implementing Consent Mode v2 is highly recommended to ensure compliance and better data modeling.
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

type PotentialIssueItem = (CookieInfo & { itemType: 'Cookie' }) 
| (LocalStorageInfo & { itemType: 'Storage' })
| {
    key: string;
    name: string;
    itemType: 'Tracker Group';
    category: string;
    complianceStatus: ComplianceStatus;
    pagesFound: string[];
    count: number;
    databaseClassification: string;
    oneTrustClassification: string;
    remediation: string;
};

// --- MAIN COMPONENT ---
export const ScanResultDisplay: React.FC<{ result: ScanResultData; scannedUrl: string }> = ({ result, scannedUrl }) => {
  const [activeTab, setActiveTab] = useState<'potentialIssues' | 'cookies' | 'trackers' | 'storage' | 'domains' | 'pages'>('potentialIssues');
  const [selectedItem, setSelectedItem] = useState<CookieInfo | TrackerInfo | LocalStorageInfo | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pdfExportAreaRef = useRef<HTMLDivElement>(null);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const potentialIssuesData: PotentialIssueItem[] = useMemo(() => {
    const cookieIssues = result.uniqueCookies
        .filter(c => c.complianceStatus !== 'Compliant')
        .map(c => ({ ...c, itemType: 'Cookie' as const }));

    const trackerIssues = result.uniqueTrackers.filter(t => t.complianceStatus !== 'Compliant');
    
    const severity: Record<ComplianceStatus, number> = { 'Pre-Consent Potential Issue': 2, 'Post-Rejection Potential Issue': 1, 'Compliant': 0, 'Unknown': 0 };

    const groupedTrackerIssues = Object.values(trackerIssues.reduce((acc, tracker) => {
        const hostname = tracker.hostname;
        if (!acc[hostname]) {
            acc[hostname] = {
                key: hostname, name: hostname, itemType: 'Tracker Group' as const,
                category: new Set<string>(), complianceStatus: tracker.complianceStatus,
                pagesFound: new Set<string>(), count: 0, databaseClassification: new Set<string>(),
                oneTrustClassification: new Set<string>(), remediation: tracker.remediation,
            };
        }
        acc[hostname].count++;
        acc[hostname].category.add(tracker.category);
        tracker.pagesFound.forEach(p => acc[hostname].pagesFound.add(p));
        if (tracker.databaseClassification) acc[hostname].databaseClassification.add(tracker.databaseClassification);
        if (tracker.oneTrustClassification) acc[hostname].oneTrustClassification.add(tracker.oneTrustClassification);
        if (severity[tracker.complianceStatus] > severity[acc[hostname].complianceStatus]) {
            acc[hostname].complianceStatus = tracker.complianceStatus;
            acc[hostname].remediation = tracker.remediation; // Take remediation from most severe
        }
        return acc;
    }, {} as Record<string, any>)).map((group: any) => ({
        ...group,
        category: Array.from(group.category).join(', '),
        pagesFound: Array.from(group.pagesFound),
        databaseClassification: Array.from(group.databaseClassification).join(', ') || 'N/A',
        oneTrustClassification: Array.from(group.oneTrustClassification).join(', ') || 'N/A',
    }));

    const storageIssues = result.uniqueLocalStorage
        .filter(s => s.complianceStatus !== 'Compliant')
        .map(s => ({ ...s, itemType: 'Storage' as const }));

    return [...cookieIssues, ...groupedTrackerIssues, ...storageIssues];
  }, [result]);

  const potentialIssuesCount = useMemo(() => potentialIssuesData.length, [potentialIssuesData]);
  
  const cookieCategoryData = useMemo(() => {
    const counts = result.uniqueCookies.reduce((acc, cookie) => {
        const category = cookie.category || CookieCategory.UNKNOWN;
        acc[category] = (acc[category] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: getCategoryInfo(name).color }));
  }, [result.uniqueCookies]);

  const topProvidersData = useMemo(() => {
    const providerCounts: Record<string, number> = {};
    result.uniqueCookies.forEach(c => providerCounts[c.provider] = (providerCounts[c.provider] || 0) + 1);
    result.uniqueTrackers.forEach(t => providerCounts[t.hostname] = (providerCounts[t.hostname] || 0) + 1);
    return Object.entries(providerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
  }, [result.uniqueCookies, result.uniqueTrackers]);

  const createReportPdf = async (): Promise<jsPDF | null> => {
    const exportArea = pdfExportAreaRef.current;
    if (!exportArea) {
      console.error("Export area not found.");
      return null;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pdfWidth - (margin * 2);

    const primaryTextColor = isDark ? '#F1F5F9' : '#1E293B';
    const secondaryTextColor = isDark ? '#94A3B8' : '#64748B';
    const blueColor = '#3B82F6';
    const redColor = '#DC2626';
    let yPos = 20;

    // --- Cover Page ---
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(32);
    pdf.setTextColor(blueColor);
    pdf.text('Cookie Scan Report', pdfWidth / 2, 80, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(16);
    pdf.setTextColor(secondaryTextColor);
    pdf.text('Compliance Analysis For:', pdfWidth / 2, 110, { align: 'center' });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(primaryTextColor);
    pdf.text(new URL(scannedUrl).hostname, pdfWidth / 2, 125, { align: 'center' });
    pdf.setFontSize(12);
    pdf.setTextColor(secondaryTextColor);
    pdf.text(`Scan Date: ${new Date().toLocaleDateString()}`, pdfWidth / 2, 150, { align: 'center' });

    // --- Summary Page ---
    pdf.addPage();
    yPos = 20;

    // --- Screenshot ---
    if (result.screenshotBase64) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.setTextColor(primaryTextColor);
        pdf.text('Website Screenshot', margin, yPos);
        yPos += 10;
        const screenshotHeight = (contentWidth * 9) / 16;
        pdf.addImage(`data:image/jpeg;base64,${result.screenshotBase64}`, 'JPEG', margin, yPos, contentWidth, screenshotHeight);
        yPos += screenshotHeight + 15;
    }

    // --- Scan Summary Stats ---
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(primaryTextColor);
    pdf.text('Scan Summary', margin, yPos);
    yPos += 10;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const col1X = margin;
    const col2X = pdfWidth / 2;

    pdf.text(`Pages Scanned: ${result.pagesScannedCount}`, col1X, yPos);
    pdf.text(`Unique Cookies: ${result.uniqueCookies.length}`, col2X, yPos);
    yPos += 7;
    pdf.text(`Trackers Found: ${result.uniqueTrackers.length}`, col1X, yPos);
    pdf.text(`Storage Items: ${result.uniqueLocalStorage.length}`, col2X, yPos);
    yPos += 7;
    pdf.text(`Consent Banner: ${result.consentBannerDetected ? "Detected" : "Not Detected"}`, col1X, yPos);
    pdf.text(`Cookie Policy: ${result.cookiePolicyDetected ? "Detected" : "Not Detected"}`, col2X, yPos);
    yPos += 7;
    pdf.text(`Google Consent V2: ${result.googleConsentV2.detected ? "Detected" : "Not Detected"}`, col1X, yPos);
    pdf.text(`CMP Detected: ${result.cmpProvider || 'N/A'}`, col2X, yPos);
    yPos += 7;
    pdf.setTextColor(redColor);
    pdf.text(`Potential Issues: ${potentialIssuesCount}`, col1X, yPos);
    pdf.setTextColor(primaryTextColor);
    yPos += 12;


    // --- Charts ---
    const chartElements = exportArea.querySelectorAll('.chart-container');
    const chartPromises = Array.from(chartElements).map(el => html2canvas(el as HTMLElement, { scale: 2, useCORS: true, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }));
    const canvases = await Promise.all(chartPromises);
    
    pdf.addImage(canvases[0].toDataURL('image/png'), 'PNG', margin, yPos, 85, 65);
    pdf.addImage(canvases[1].toDataURL('image/png'), 'PNG', margin + 95, yPos, 85, 65);
    yPos += 80;

    // --- Detailed Findings ---
    const addFindingToPdf = (item: any, type: 'Cookie' | 'Tracker' | 'Storage' | 'Tracker Group') => {
         const neededHeight = 50; // estimate
         if (yPos + neededHeight > pdf.internal.pageSize.getHeight() - 20) {
            pdf.addPage();
            yPos = 20;
         }
         pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
         let name = '';
         if (type === 'Cookie') name = (item as CookieInfo).name;
         else if (type === 'Tracker') name = (item as TrackerInfo).hostname;
         else if (type === 'Storage') name = (item as LocalStorageInfo).storageKey;
         else if (type === 'Tracker Group') name = `${(item as any).name} (${(item as any).count} trackers)`;
         
         const status = item.complianceStatus;
         
         if(status !== 'Compliant') pdf.setTextColor(redColor);
         pdf.text(`[${type}] ${name}`, margin, yPos);
         pdf.setTextColor(primaryTextColor);
         yPos += 7;
         
         pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
         pdf.text(`AI Category: ${item.category} | Status: ${status}`, margin, yPos);
         yPos += 5;

         if (type === 'Cookie' || type === 'Tracker' || type === 'Tracker Group') {
            const classifiedItem = item as CookieInfo | TrackerInfo | PotentialIssueItem;
            if ('databaseClassification' in classifiedItem && classifiedItem.databaseClassification) {
                pdf.text(`DB Category: ${classifiedItem.databaseClassification}`, margin, yPos);
                yPos += 5;
            }
            if (classifiedItem.oneTrustClassification) {
                pdf.text(`OneTrust Category: ${classifiedItem.oneTrustClassification}`, margin, yPos);
                yPos += 5;
            }
        }
         yPos += 2;


         pdf.setFont('helvetica', 'bold');
         pdf.text('Remediation:', margin, yPos);
         pdf.setFont('helvetica', 'normal');
         const remediationLines = pdf.splitTextToSize(item.remediation, contentWidth - 25);
         pdf.text(remediationLines, margin + 25, yPos);
         yPos += (remediationLines.length * 4) + 5;
         pdf.setDrawColor(isDark ? '#334155' : '#E2E8F0');
         pdf.line(margin, yPos, pdfWidth - margin, yPos);
         yPos += 5;
    };

    if (potentialIssuesData.length > 0) {
        pdf.addPage(); yPos = 20;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(redColor);
        pdf.text('Potential Compliance Issues Summary', margin, yPos); yPos += 10;
        potentialIssuesData.forEach(v => addFindingToPdf(v, (v as any).itemType));
    }
    
    if(result.uniqueCookies.length > 0) {
        pdf.addPage(); yPos = 20;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(primaryTextColor);
        pdf.text('All Cookies Found', margin, yPos); yPos += 10;
        result.uniqueCookies.forEach(c => addFindingToPdf(c, 'Cookie'));
    }

    if(result.uniqueTrackers.length > 0) {
        pdf.addPage(); yPos = 20;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(primaryTextColor);
        pdf.text('All Trackers Found', margin, yPos); yPos += 10;
        result.uniqueTrackers.forEach(t => addFindingToPdf(t, 'Tracker'));
    }
    
    if(result.uniqueLocalStorage.length > 0) {
        pdf.addPage(); yPos = 20;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(primaryTextColor);
        pdf.text('All Local Storage Items Found', margin, yPos); yPos += 10;
        result.uniqueLocalStorage.forEach(s => addFindingToPdf(s, 'Storage'));
    }
    
    return pdf;
  }

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
        const pdf = await createReportPdf();
        if (pdf) {
            pdf.save(`Cookie-Report-${new URL(scannedUrl).hostname}.pdf`);
        }
    } catch (err) {
        console.error("PDF Export failed:", err);
    } finally {
        setIsExporting(false);
    }
  };

  const escapeCsvCell = (cellData: any): string => {
    const cell = String(cellData ?? '');
    if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
        const escapedCell = cell.replace(/"/g, '""');
        return `"${escapedCell}"`;
    }
    return cell;
  };

  const handleExportCsv = () => {
      setIsExportingCsv(true);
      try {
          const sections = [];
          const headers = {
              cookies: ['Name', 'Category', 'DB Category', 'OneTrust Category', 'Party', 'Provider', 'Expiry', 'Compliance Status', 'Remediation', 'Pages Found Count', 'Pages Found'],
              trackers: ['Hostname', 'Category', 'DB Category', 'OneTrust Category', 'Compliance Status', 'Remediation', 'Pages Found Count', 'Pages Found'],
              storage: ['Storage Key', 'Origin', 'Category', 'OneTrust Category', 'Compliance Status', 'Purpose', 'Remediation', 'Pages Found Count', 'Pages Found'],
              domains: ['Hostname', 'Category', 'OneTrust Category', 'Compliance Status', 'Remediation', 'Request Count on Pages', 'Pages Found'],
          };

          if (result.uniqueCookies.length > 0) {
              const cookieRows = result.uniqueCookies.map(c => [
                  c.name, c.category, c.databaseClassification, c.oneTrustClassification, c.party, c.provider, c.expiry, c.complianceStatus, c.remediation, c.pagesFound.length, c.pagesFound.join(', ')
              ].map(escapeCsvCell).join(','));
              sections.push('Cookies\n' + [headers.cookies.join(','), ...cookieRows].join('\n'));
          }
          
          if (result.uniqueTrackers.length > 0) {
              const trackerRows = result.uniqueTrackers.map(t => [
                  t.hostname, t.category, t.databaseClassification, t.oneTrustClassification, t.complianceStatus, t.remediation, t.pagesFound.length, t.pagesFound.join(', ')
              ].map(escapeCsvCell).join(','));
              sections.push('Trackers\n' + [headers.trackers.join(','), ...trackerRows].join('\n'));
          }

          if (result.uniqueLocalStorage.length > 0) {
              const storageRows = result.uniqueLocalStorage.map(s => [
                  s.storageKey, s.origin, s.category, s.oneTrustClassification, s.complianceStatus, s.purpose, s.remediation, s.pagesFound.length, s.pagesFound.join(', ')
              ].map(escapeCsvCell).join(','));
              sections.push('Local/Session Storage\n' + [headers.storage.join(','), ...storageRows].join('\n'));
          }

          if (result.thirdPartyDomains.length > 0) {
               const domainRows = result.thirdPartyDomains.map(d => [
                  d.hostname, d.category, d.oneTrustClassification, d.complianceStatus, d.remediation, d.count, d.pagesFound.join(', ')
              ].map(escapeCsvCell).join(','));
              sections.push('Third Party Domains\n' + [headers.domains.join(','), ...domainRows].join('\n'));
          }

          const csvContent = sections.join('\n\n\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', `Cookie-Report-${new URL(scannedUrl).hostname}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (err) {
          console.error("CSV Export failed:", err);
      } finally {
          setIsExportingCsv(false);
      }
  };


  const handleSendEmail = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !/^\S+@\S+\.\S+$/.test(email) || isSendingEmail) {
        return;
      }
      setIsSendingEmail(true);
      setEmailStatus('idle');
      try {
        const pdf = await createReportPdf();
        if (pdf) {
          const pdfData = pdf.output('datauristring').split(',')[1];
          const fileName = `Cookie-Report-${new URL(scannedUrl).hostname}.pdf`;
          const response = await fetch(`${API_BASE_URL}/api/email-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pdfData, fileName }),
          });

          if (!response.ok) {
            throw new Error('Server failed to send email.');
          }
          setEmailStatus('success');
          setEmail('');
        }
      } catch (err) {
        console.error("Email send failed:", err);
        setEmailStatus('error');
      } finally {
        setIsSendingEmail(false);
        setTimeout(() => setEmailStatus('idle'), 4000);
      }
  };
  
  const paginatedData = useMemo(() => {
    const dataMap = {
        cookies: result.uniqueCookies,
        trackers: result.uniqueTrackers,
        storage: result.uniqueLocalStorage,
        potentialIssues: potentialIssuesData,
        domains: result.thirdPartyDomains,
        pages: result.pages,
    };
    const data = dataMap[activeTab] || [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return data.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [result, activeTab, currentPage, potentialIssuesData]);
  
  const dataMapForTotal = {
    cookies: result.uniqueCookies,
    trackers: result.uniqueTrackers,
    storage: result.uniqueLocalStorage,
    potentialIssues: potentialIssuesData,
    domains: result.thirdPartyDomains,
    pages: result.pages,
  };
  const totalItems = dataMapForTotal[activeTab]?.length || 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  
  const TabButton: React.FC<{tabId: typeof activeTab, label: string, count: number, icon: React.ReactNode}> = ({ tabId, label, count, icon }) => {
    const isActive = activeTab === tabId;
    
    let activeClasses = 'border-brand-blue text-brand-blue';
    let hoverClasses = 'hover:bg-[var(--bg-tertiary)]';
    if (label === 'Potential Issues') {
        if (isActive) {
            activeClasses = 'border-red-500 text-red-500';
        }
        hoverClasses = 'hover:bg-red-50 dark:hover:bg-red-900/20';
    }

    return (
      <button onClick={() => { setActiveTab(tabId); setCurrentPage(1); }} className={`flex items-center gap-2 px-4 py-3 border-b-2 font-semibold transition-colors ${isActive ? activeClasses : `border-transparent text-[var(--text-primary)] ${hoverClasses}`}`}>
        {icon} {label} ({count})
      </button>
    );
  };
  
  return (
    <>
      <div ref={pdfExportAreaRef} className="max-w-7xl mx-auto animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
            <div>
                <h2 className="text-3xl font-bold text-[var(--text-headings)]">Compliance Dashboard</h2>
                <p className="text-[var(--text-primary)] mt-1">
                    Report for: <a href={scannedUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-blue hover:underline">{new URL(scannedUrl).hostname}</a>
                </p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <button onClick={handleExportCsv} disabled={isExporting || isExportingCsv} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed">
                        <TableCellsIcon className="h-5 w-5"/>
                        {isExportingCsv ? 'Generating...' : 'Export CSV'}
                    </button>
                    <button onClick={handleExportPDF} disabled={isExporting || isExportingCsv} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-blue rounded-md shadow-sm hover:bg-brand-blue-light disabled:bg-slate-400 disabled:cursor-not-allowed">
                        <ArrowDownTrayIcon className="h-5 w-5"/>
                        {isExporting ? 'Generating...' : 'Export PDF'}
                    </button>
                </div>
                <div className="flex flex-col">
                    <form onSubmit={handleSendEmail} className="flex items-center gap-1">
                        <input 
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email report to..."
                            disabled={isSendingEmail}
                            className="px-3 py-2 text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-md focus:ring-2 focus:ring-brand-blue transition w-48 sm:w-60"
                            aria-label="Email address for report"
                        />
                        <button
                            type="submit"
                            disabled={isSendingEmail || !email}
                            title={emailStatus === 'success' ? 'Report sent!' : 'Send Report'}
                            className="w-10 h-10 flex items-center justify-center bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all"
                        >
                            {isSendingEmail ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : emailStatus === 'success' ? (
                                <CheckCircleIcon className="h-5 w-5" />
                            ) : (
                                <PaperAirplaneIcon className="h-5 w-5"/>
                            )}
                        </button>
                    </form>
                    <div className="h-4 mt-1 px-1">
                        {emailStatus === 'success' && <p className="text-xs font-medium text-green-600 dark:text-green-400 animate-fade-in-up">Report sent successfully!</p>}
                        {emailStatus === 'error' && <p className="text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in-up">Failed to send report. Please try again.</p>}
                    </div>
                </div>
            </div>
        </div>
        
        {/* NEW LAYOUT: Screenshot & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-8">
             {/* Left: Screenshot */}
            <div className="lg:col-span-2 bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm">
                <h3 className="text-lg font-bold text-[var(--text-headings)] mb-3">Website Screenshot</h3>
                <div className="rounded-lg overflow-hidden border-2 border-[var(--border-primary)] group">
                    <div className="bg-[var(--bg-tertiary)] px-4 py-2 text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-400"></span>
                        <span className="h-2 w-2 rounded-full bg-yellow-400"></span>
                        <span className="h-2 w-2 rounded-full bg-green-400"></span>
                        <div className="ml-2 bg-[var(--bg-primary)] rounded-full px-3 py-0.5 truncate">{new URL(scannedUrl).protocol}//{new URL(scannedUrl).hostname}</div>
                    </div>
                    {result.screenshotBase64 ? (
                      <img src={`data:image/jpeg;base64,${result.screenshotBase64}`} alt={`Screenshot of ${scannedUrl}`} className="w-full" />
                    ) : (
                      <div className="aspect-video bg-[var(--bg-primary)] flex items-center justify-center text-sm text-[var(--text-primary)]">Screenshot not available.</div>
                    )}
                </div>
            </div>

            {/* Right: Stats */}
            <div className="lg:col-span-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <StatCard title="Pages Scanned" value={result.pagesScannedCount} icon={<DocumentChartBarIcon className="h-6 w-6"/>} />
                    <StatCard 
                        title="Consent Banner" 
                        value={result.consentBannerDetected ? "Detected" : "Not Detected"} 
                        icon={result.consentBannerDetected ? <CheckCircleIcon className="h-6 w-6"/> : <ShieldExclamationIcon className="h-6 w-6"/>}
                        risk={result.consentBannerDetected ? 'Informational' : 'High'}
                    />
                    <StatCard 
                        title="Cookie Policy" 
                        value={result.cookiePolicyDetected ? "Detected" : "Not Detected"} 
                        icon={<FileTextIcon className="h-6 w-6"/>}
                        risk={result.cookiePolicyDetected ? 'Informational' : 'Medium'}
                    />
                    <StatCard title="Potential Issues" value={potentialIssuesCount} icon={potentialIssuesCount > 0 ? <ShieldExclamationIcon className="h-6 w-6"/> : <CheckCircleIcon className="h-6 w-6"/>} risk={potentialIssuesCount > 0 ? 'High' : 'Low'} />
                    <StatCard title="Unique Cookies" value={result.uniqueCookies.length} icon={<CookieIcon className="h-6 w-6"/>} />
                    <StatCard title="3rd Party Domains" value={result.thirdPartyDomains.length} icon={<GlobeAltIcon className="h-6 w-6"/>} />
                    <StatCard title="Storage Items" value={result.uniqueLocalStorage.length} icon={<DatabaseIcon className="h-6 w-6"/>} />
                    <StatCard 
                        title="Google Consent V2" 
                        value={result.googleConsentV2.detected ? "Detected" : "Not Detected"} 
                        icon={<GoogleGLogo className="h-6 w-6"/>} 
                        risk={result.googleConsentV2.detected ? 'Informational' : 'Low'}
                        details={result.googleConsentV2.status}
                        onClick={() => setIsConsentModalOpen(true)}
                    />
                    <StatCard title="CMP Detected" value={result.cmpProvider || 'N/A'} icon={<ScaleIcon className="h-6 w-6"/>} />
                </div>
            </div>
        </div>


        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
            <div className="lg:col-span-2 bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-primary)] chart-container">
                <h3 className="text-lg font-bold text-[var(--text-headings)] mb-4">Cookie Categories</h3>
                 <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                        <Pie data={cookieCategoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
                            const radius = innerRadius + (outerRadius - innerRadius) * 1.2;
                            const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                            const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                            return <text x={x} y={y} fill="var(--text-primary)" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12">{`${(percent * 100).toFixed(0)}%`}</text>;
                        }}>
                            {cookieCategoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Pie>
                        <ChartTooltip contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}/>
                    </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 text-xs">
                    {cookieCategoryData.map(item => <div key={item.name} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{backgroundColor: item.fill}}/><span>{item.name}</span></div>)}
                </div>
            </div>
            <div className="lg:col-span-3 bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-primary)] chart-container">
                 <h3 className="text-lg font-bold text-[var(--text-headings)] mb-4">Top 5 Data Recipients</h3>
                 <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProvidersData} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" horizontal={false}/>
                        <XAxis type="number" stroke="var(--text-primary)" fontSize="12" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" stroke="var(--text-primary)" fontSize="12" width={100} tickLine={false} axisLine={false} />
                        <ChartTooltip cursor={{fill: 'var(--bg-tertiary)'}} contentStyle={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}/>
                        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Tabs & Table */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
            <div className="flex items-center border-b border-[var(--border-primary)] px-4 flex-wrap">
                <TabButton tabId="potentialIssues" label="Potential Issues" count={potentialIssuesCount} icon={<ShieldExclamationIcon className="h-5 w-5"/>}/>
                <TabButton tabId="cookies" label="Cookies" count={result.uniqueCookies.length} icon={<CookieIcon className="h-5 w-5"/>}/>
                <TabButton tabId="trackers" label="Trackers" count={result.uniqueTrackers.length} icon={<TagInventoryIcon className="h-5 w-5"/>}/>
                <TabButton tabId="storage" label="Storage" count={result.uniqueLocalStorage.length} icon={<DatabaseIcon className="h-5 w-5"/>}/>
                <TabButton tabId="domains" label="3rd Party Domains" count={result.thirdPartyDomains.length} icon={<GlobeAltIcon className="h-5 w-5"/>}/>
                <TabButton tabId="pages" label="Pages Scanned" count={result.pages.length} icon={<FileTextIcon className="h-5 w-5"/>}/>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border-primary)]">
                    <thead className="bg-[var(--bg-tertiary)]/50">
                        {activeTab === 'potentialIssues' && (
                            <tr className="text-left text-xs font-semibold text-[var(--text-primary)] uppercase">
                                <th className="px-6 py-3">Name / Key</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">AI Category</th>
                                <th className="px-6 py-3">DB Category</th>
                                <th className="px-6 py-3">OneTrust Category</th>
                                <th className="px-6 py-3">Issue Type</th>
                                <th className="px-6 py-3">Pages Found</th>
                            </tr>
                        )}
                        {activeTab === 'cookies' && (
                            <tr className="text-left text-xs font-semibold text-[var(--text-primary)] uppercase">
                                <th className="px-6 py-3">Cookie Name</th>
                                <th className="px-6 py-3">Party</th>
                                <th className="px-6 py-3">AI Category</th>
                                <th className="px-6 py-3">DB Category</th>
                                <th className="px-6 py-3">OneTrust Category</th>
                                <th className="px-6 py-3">Compliance Status</th>
                                <th className="px-6 py-3">Pages Found</th>
                            </tr>
                        )}
                        {activeTab === 'trackers' && (
                             <tr className="text-left text-xs font-semibold text-[var(--text-primary)] uppercase">
                                <th className="px-6 py-3">Tracker Hostname</th>
                                <th className="px-6 py-3">AI Category</th>
                                <th className="px-6 py-3">DB Category</th>
                                <th className="px-6 py-3">OneTrust Category</th>
                                <th className="px-6 py-3">Compliance Status</th>
                                <th className="px-6 py-3">Pages Found</th>
                            </tr>
                        )}
                        {activeTab === 'storage' && (
                             <tr className="text-left text-xs font-semibold text-[var(--text-primary)] uppercase">
                                <th className="px-6 py-3">Storage Key</th><th className="px-6 py-3">Origin</th><th className="px-6 py-3">AI Category</th><th className="px-6 py-3">OneTrust Category</th><th className="px-6 py-3">Compliance Status</th><th className="px-6 py-3">Pages Found</th>
                            </tr>
                        )}
                        {activeTab === 'domains' && (
                            <tr className="text-left text-xs font-semibold text-[var(--text-primary)] uppercase">
                                <th className="px-6 py-3">Hostname</th><th className="px-6 py-3">AI Category</th><th className="px-6 py-3">OneTrust Category</th><th className="px-6 py-3">Compliance Status</th><th className="px-6 py-3">Pages Found</th>
                            </tr>
                        )}
                        {activeTab === 'pages' && (
                             <tr className="text-left text-xs font-semibold text-[var(--text-primary)] uppercase"><th className="px-6 py-3">Scanned URL</th></tr>
                        )}
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)]">
                        {paginatedData.map((item: any) => {
                           if (activeTab === 'potentialIssues') {
                                const issue = item as PotentialIssueItem;
                                const { text } = getComplianceStyle(issue.complianceStatus);
                                let name: string;
                                if (issue.itemType === 'Storage') {
                                    name = issue.storageKey;
                                } else {
                                    name = issue.name; // Both Cookie and Tracker Group have .name
                                    if (issue.itemType === 'Tracker Group') {
                                        name = `${issue.name} (${issue.count} trackers)`;
                                    }
                                }
                                
                                const isClickable = issue.itemType !== 'Tracker Group';
                                return (
                                    <tr key={issue.key} onClick={() => isClickable && setSelectedItem(issue as any)} className={`${isClickable ? 'hover:bg-[var(--bg-tertiary)] cursor-pointer' : ''}`}>
                                        <td className="px-6 py-4 text-sm font-semibold text-[var(--text-headings)]">{ name }</td>
                                        <td className="px-6 py-4 text-sm">{issue.itemType}</td>
                                        <td className="px-6 py-4 text-sm">{issue.category}</td>
                                        <td className="px-6 py-4 text-sm">{('databaseClassification' in issue && issue.databaseClassification) || 'N/A'}</td>
                                        <td className="px-6 py-4 text-sm">{('oneTrustClassification' in issue && issue.oneTrustClassification) || 'N/A'}</td>
                                        <td className={`px-6 py-4 text-sm font-medium ${text}`}>{issue.complianceStatus}</td>
                                        <td className="px-6 py-4 text-sm text-center">{issue.pagesFound.length}</td>
                                    </tr>
                                );
                           }
                           if (activeTab === 'cookies') {
                                const cookie = item as CookieInfo;
                                const { text } = getComplianceStyle(cookie.complianceStatus);
                                return (
                                    <tr key={cookie.key} onClick={() => setSelectedItem(cookie)} className="hover:bg-[var(--bg-tertiary)] cursor-pointer">
                                        <td className="px-6 py-4 text-sm font-semibold text-[var(--text-headings)]">{cookie.name}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                                cookie.party === 'First' 
                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' 
                                                : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                                            }`}>
                                                {cookie.party} Party
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm">{cookie.category}</td>
                                        <td className="px-6 py-4 text-sm">{cookie.databaseClassification || 'N/A'}</td>
                                        <td className="px-6 py-4 text-sm">{cookie.oneTrustClassification || 'N/A'}</td>
                                        <td className={`px-6 py-4 text-sm font-medium ${text}`}>{cookie.complianceStatus}</td>
                                        <td className="px-6 py-4 text-sm text-center">{cookie.pagesFound.length}</td>
                                    </tr>
                                );
                            }
                            if (activeTab === 'trackers') {
                                const tracker = item as TrackerInfo;
                                const { text } = getComplianceStyle(tracker.complianceStatus);
                                return (
                                    <tr key={tracker.key} onClick={() => setSelectedItem(tracker)} className="hover:bg-[var(--bg-tertiary)] cursor-pointer">
                                        <td className="px-6 py-4 text-sm font-semibold text-[var(--text-headings)] max-w-sm truncate" title={tracker.hostname}>{tracker.hostname}</td>
                                        <td className="px-6 py-4 text-sm">{tracker.category}</td>
                                        <td className="px-6 py-4 text-sm">{tracker.databaseClassification || 'N/A'}</td>
                                        <td className="px-6 py-4 text-sm">{tracker.oneTrustClassification || 'N/A'}</td>
                                        <td className={`px-6 py-4 text-sm font-medium ${text}`}>{tracker.complianceStatus}</td>
                                        <td className="px-6 py-4 text-sm text-center">{tracker.pagesFound.length}</td>
                                    </tr>
                                );
                            }
                            if (activeTab === 'storage') {
                                const storage = item as LocalStorageInfo;
                                const { text } = getComplianceStyle(storage.complianceStatus);
                                return (
                                    <tr key={storage.key} onClick={() => setSelectedItem(storage)} className="hover:bg-[var(--bg-tertiary)] cursor-pointer">
                                        <td className="px-6 py-4 text-sm font-semibold text-[var(--text-headings)] max-w-xs truncate">{storage.storageKey}</td>
                                        <td className="px-6 py-4 text-sm max-w-xs truncate">{storage.origin}</td>
                                        <td className="px-6 py-4 text-sm">{storage.category}</td>
                                        <td className="px-6 py-4 text-sm">{storage.oneTrustClassification || 'N/A'}</td>
                                        <td className={`px-6 py-4 text-sm font-medium ${text}`}>{storage.complianceStatus}</td>
                                        <td className="px-6 py-4 text-sm text-center">{storage.pagesFound.length}</td>
                                    </tr>
                                );
                            }
                            if (activeTab === 'domains') {
                                const domain = item as ThirdPartyDomainInfo;
                                const { text } = getComplianceStyle(domain.complianceStatus);
                                return (
                                    <tr key={domain.hostname} className="hover:bg-[var(--bg-tertiary)]">
                                        <td className="px-6 py-4 text-sm font-semibold text-[var(--text-headings)]">{domain.hostname}</td>
                                        <td className="px-6 py-4 text-sm">{domain.category}</td>
                                        <td className="px-6 py-4 text-sm">{domain.oneTrustClassification || 'N/A'}</td>
                                        <td className={`px-6 py-4 text-sm font-medium ${text}`}>{domain.complianceStatus}</td>
                                        <td className="px-6 py-4 text-sm text-center">{domain.pagesFound.length}</td>
                                    </tr>
                                )
                            }
                             if (activeTab === 'pages') {
                                return (
                                    <tr key={item.url} className="hover:bg-[var(--bg-tertiary)]">
                                        <td className="px-6 py-4 text-sm font-semibold text-brand-blue"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></td>
                                    </tr>
                                )
                            }
                            return null;
                        })}
                    </tbody>
                </table>
                {paginatedData.length === 0 && <div className="text-center p-8 text-[var(--text-primary)]">No items found in this category.</div>}
            </div>
            {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-[var(--border-primary)]">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm font-semibold rounded-md disabled:opacity-50 bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)]">Previous</button>
                    <span className="text-sm text-[var(--text-primary)]">Page {currentPage} of {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm font-semibold rounded-md disabled:opacity-50 bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)]">Next</button>
                </div>
            )}
        </div>
      </div>
      {selectedItem && <DetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
      {isConsentModalOpen && <ConsentV2InfoModal onClose={() => setIsConsentModalOpen(false)} />}
    </>
  );
};
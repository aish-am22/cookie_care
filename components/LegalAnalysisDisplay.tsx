
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as Diff from 'diff';
import type { LegalAnalysisResult, LegalPerspective, RiskLevel, ClauseAnalysis, ChatMessage } from '../types';
import { 
    AlertOctagonIcon, CheckCircleIcon, ShieldExclamationIcon, FileTextIcon, 
    PaperAirplaneIcon, TrashIcon, WindowMinimizeIcon, ChatBubbleIcon, XMarkIcon, 
    ArrowPathIcon, ArrowDownTrayIcon 
} from './Icons';

const API_BASE_URL = (window as any).API_BASE_URL;

// --- STYLING & HELPERS ---
const getRiskStyle = (riskLevel: RiskLevel) => {
    switch (riskLevel) {
        case 'Critical': return { color: 'text-red-600 dark:text-red-400', borderColor: 'border-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20', icon: <ShieldExclamationIcon className="h-6 w-6" />, chartFill: 'hsl(0, 72%, 51%)' };
        case 'High': return { color: 'text-orange-600 dark:text-orange-400', borderColor: 'border-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-900/20', icon: <AlertOctagonIcon className="h-6 w-6" />, chartFill: 'hsl(30, 90%, 55%)' };
        case 'Medium': return { color: 'text-yellow-600 dark:text-yellow-400', borderColor: 'border-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20', icon: <AlertOctagonIcon className="h-6 w-6" />, chartFill: 'hsl(45, 90%, 55%)' };
        case 'Low': return { color: 'text-green-600 dark:text-green-400', borderColor: 'border-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20', icon: <CheckCircleIcon className="h-6 w-6" />, chartFill: 'hsl(140, 70%, 45%)' };
        default: return { color: 'text-slate-600 dark:text-slate-400', borderColor: 'border-slate-400', bgColor: 'bg-slate-100 dark:bg-slate-800/50', icon: <CheckCircleIcon className="h-6 w-6" />, chartFill: 'hsl(220, 10%, 50%)' };
    }
};

const DiffViewer: React.FC<{ oldText: string, newText: string }> = ({ oldText, newText }) => {
    const diffs = Diff.diffWords(oldText, newText);

    return (
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] max-h-80 overflow-y-auto">
            {diffs.map((part: any, index: number) => {
                const style = part.added ? 'bg-green-900/30 text-green-300' : part.removed ? 'bg-red-900/30 text-red-300 line-through' : 'opacity-80';
                return <span key={index} className={style}>{part.value}</span>;
            })}
        </pre>
    );
};

// --- SUB-COMPONENTS ---
const OverallRiskCard: React.FC<{ level: RiskLevel, summary: string }> = ({ level, summary }) => {
  const { borderColor, bgColor, chartFill } = getRiskStyle(level);
  return (
    <div className={`p-6 rounded-lg border ${borderColor} ${bgColor} shadow-sm h-full`}>
        <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: chartFill }}></span>
            <h4 className={`text-lg font-bold text-[var(--text-headings)]`}>{level} Risk Profile</h4>
        </div>
        <p className="mt-4 text-sm text-[var(--text-primary)]">{summary}</p>
    </div>
  )
}

const RiskDistributionChart: React.FC<{ data: { name: string; count: number; fill: string }[] }> = ({ data }) => (
    <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} stroke="var(--text-primary)" fontSize={12} domain={[0, dataMax => (dataMax < 5 ? 5 : Math.ceil(dataMax / 2) * 2)]} />
            <YAxis type="category" dataKey="name" width={60} stroke="var(--text-primary)" fontSize={12} axisLine={false} tickLine={false} />
            <Tooltip
                cursor={{ fill: 'var(--bg-tertiary)' }}
                contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-headings)',
                    borderRadius: '0.5rem'
                }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
            </Bar>
        </BarChart>
    </ResponsiveContainer>
);

const ClauseAnalysisCard: React.FC<{ clause: ClauseAnalysis, index: number }> = ({ clause, index }) => {
    const [isOpen, setIsOpen] = useState(true);
    const { borderColor, bgColor, color } = getRiskStyle(clause.riskLevel);
    return (
        <div className={`bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] overflow-hidden border-l-4 ${borderColor} shadow-sm transition-all duration-300`}>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left p-4" aria-expanded={isOpen}>
                <div className="flex justify-between items-center gap-4">
                    <h4 className="text-md font-bold text-[var(--text-headings)]">{`${index + 1}. ${clause.clause}`}</h4>
                    <div className="flex items-center gap-4">
                        <span className={`inline-flex flex-shrink-0 items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${bgColor} ${color}`}>
                            {clause.riskLevel} Risk
                        </span>
                        <svg className={`w-5 h-5 text-[var(--text-primary)] transform transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
            </button>
            {isOpen && (
                <div className="px-5 pb-5 pt-2 border-t border-[var(--border-primary)] space-y-4 animate-fade-in-up">
                    <div>
                        <h5 className="text-sm font-semibold text-[var(--text-headings)]">Clause Summary</h5>
                        <p className="text-sm text-[var(--text-primary)] mt-1">{clause.summary}</p>
                    </div>
                     <div className="p-3 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-500/20">
                        <h5 className="font-semibold text-orange-800 dark:text-orange-300 text-sm">Risk Analysis</h5>
                        <p className="text-orange-700 dark:text-orange-300/90 text-sm mt-1">{clause.risk}</p>
                     </div>
                     <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-500/20">
                        <h5 className="font-semibold text-green-800 dark:text-green-300 text-sm">Recommended Remediation</h5>
                        <p className="text-green-700 dark:text-green-300/90 text-sm mt-1">{clause.recommendation}</p>
                     </div>
                </div>
            )}
        </div>
    )
}

// --- MAIN COMPONENT ---
export const LegalAnalysisDisplay: React.FC<{ result: LegalAnalysisResult; perspective: LegalPerspective; documentText: string; }> = ({ result, perspective, documentText: initialDocumentText }) => {
  const [documentText, setDocumentText] = useState(initialDocumentText);
  const [isDocumentModified, setIsDocumentModified] = useState(false);
  const perspectiveText = perspective.charAt(0).toUpperCase() + perspective.slice(1);
  const [activeFilter, setActiveFilter] = useState<"All" | RiskLevel>('All');
  const [isExporting, setIsExporting] = useState(false);
  
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: 'ai', text: "Welcome! I'm your AI legal assistant. You can ask me to explain parts of this document or give me commands to edit it, like 'Rephrase the termination clause to be mutual.'" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [suggestedChange, setSuggestedChange] = useState<{ oldText: string; newText: string; } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleExportPDF = async () => {
    setIsExporting(true);
    const input = document.getElementById('pdf-export-area-dpa');
    const exportButton = document.getElementById('export-button-dpa');
    if (!input) { setIsExporting(false); return; }
    if (exportButton) exportButton.style.display = 'none';
    await new Promise(resolve => setTimeout(resolve, 50));
    const canvas = await html2canvas(input, { scale: 1.5, useCORS: true, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary') });
    if (exportButton) exportButton.style.display = 'flex';
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = imgWidth / pdfWidth;
    const imgHeightOnPdf = imgHeight / ratio;
    let heightLeft = imgHeightOnPdf, position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightOnPdf);
    heightLeft -= pdfHeight;
    while (heightLeft > 0) {
      position -= pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightOnPdf);
      heightLeft -= pdfHeight;
    }
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(16); pdf.setTextColor('#2563eb'); pdf.text('Legal Analysis Report', 15, 15);
        pdf.setFontSize(8); pdf.setTextColor(100); pdf.text(`Perspective: ${perspectiveText}`, 15, 20);
        pdf.setFontSize(8); pdf.setTextColor(150);
        pdf.text(`Page ${i} of ${pageCount}`, pdfWidth - 35, pdfHeight - 10);
        pdf.text(`Generated on ${new Date().toLocaleDateString()} by Cookie Care`, 15, pdfHeight - 10);
    }
    pdf.save('Legal-Analysis-Report.pdf');
    setIsExporting(false);
  };
  
  const handleDownloadTxt = () => {
    const blob = new Blob([documentText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'edited-document.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || isChatLoading) return;

      const newMessages: ChatMessage[] = [...chatMessages, { sender: 'user', text: chatInput }];
      setChatMessages(newMessages);
      const question = chatInput;
      setChatInput('');
      setIsChatLoading(true);

      try {
          const response = await fetch(`${API_BASE_URL}/api/chat-with-document`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documentText, question }),
          });
          if (!response.ok) throw new Error('Failed to get response from AI assistant.');
          
          const { answer, revisedText } = await response.json();
          setChatMessages(prev => [...prev, { sender: 'ai', text: answer }]);

          if (revisedText && revisedText.trim() !== documentText.trim()) {
              setSuggestedChange({ oldText: documentText, newText: revisedText });
          }
      } catch (err) {
          const errorText = err instanceof Error ? err.message : 'An unexpected error occurred.';
          setChatMessages(prev => [...prev, { sender: 'ai', text: `Sorry, I encountered an error: ${errorText}` }]);
      } finally {
          setIsChatLoading(false);
      }
  };

  const riskCounts = useMemo(() => result.analysis.reduce((acc, clause) => {
        const level = clause.riskLevel || 'Unknown';
        acc[level] = (acc[level] || 0) + 1;
        return acc;
    }, {} as Record<string, number>), [result.analysis]);

  const chartData = useMemo(() => {
    const order: RiskLevel[] = ['Critical', 'Medium', 'Low'];
    return order.map(level => ({ name: level, count: riskCounts[level] || 0, fill: getRiskStyle(level).chartFill }));
  }, [riskCounts]);
  
  const filteredClauses = useMemo(() => {
      if (activeFilter === 'All') return result.analysis;
      return result.analysis.filter(clause => clause.riskLevel === activeFilter);
  }, [result.analysis, activeFilter]);
  
  const allRiskLevels: RiskLevel[] = ['Critical', 'Medium', 'Low'];
  const filters = [ { id: 'All', label: 'All', count: result.analysis.length }, ...allRiskLevels.map(level => ({ id: level, label: level, count: riskCounts[level] || 0 })) ];
  
  return (
    <>
        <div className="max-w-7xl mx-auto animate-fade-in-up">
          <div id="pdf-export-area-dpa" className="bg-[var(--bg-primary)] p-2 sm:p-0">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-3xl font-bold text-[var(--text-headings)]">Legal Analysis Dashboard</h3>
                <p className="text-[var(--text-primary)] mt-1">
                  Analyzed from a <span className="font-semibold text-brand-blue">{perspectiveText}</span> perspective.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isDocumentModified && (
                    <button onClick={handleDownloadTxt} className="flex items-center justify-center gap-2 px-4 py-2 font-semibold text-sm text-green-600 border border-green-500 rounded-md hover:bg-green-500/10 transition-all">
                        <ArrowDownTrayIcon className="h-4 w-4" /> Download .txt
                    </button>
                )}
                <button id="export-button-dpa" onClick={handleExportPDF} disabled={isExporting} className="flex items-center justify-center gap-2 px-4 py-2 font-semibold text-sm text-brand-blue border border-brand-blue rounded-md hover:bg-brand-blue/10 focus:outline-none focus:ring-2 focus:ring-brand-blue transition-all disabled:bg-slate-400 disabled:cursor-not-allowed">
                  <FileTextIcon className="h-4 w-4" />
                  {isExporting ? 'Exporting...' : 'Export to PDF'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
                <div className="xl:col-span-2">
                    <h4 className="text-xl font-bold text-[var(--text-headings)] mb-3">Live Document</h4>
                    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] shadow-sm h-[calc(100vh-200px)] max-h-[800px] overflow-y-auto p-6">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--text-primary)] leading-relaxed">
                            {documentText}
                        </pre>
                    </div>
                </div>

                <div className="xl:col-span-3 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        <div className="md:col-span-3">
                            <OverallRiskCard level={result.overallRisk.level} summary={result.overallRisk.summary} />
                        </div>
                        <div className="md:col-span-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-5 shadow-sm">
                            <h4 className="text-md font-bold text-[var(--text-headings)] mb-2 text-center">Risk Distribution</h4>
                            {chartData.length > 0 ? <RiskDistributionChart data={chartData} /> : <div className="flex items-center justify-center h-full text-sm text-[var(--text-primary)]">No risks identified.</div> }
                        </div>
                    </div>

                    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-6 shadow-sm">
                        <h4 className="text-lg font-bold text-[var(--text-headings)] mb-4">Clause Analysis & Remediation</h4>
                        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-primary)] pb-4 mb-6">
                            {filters.map(filter => {
                                if (filter.count === 0 && filter.id !== 'All') return null;
                                const isActive = activeFilter === filter.id;
                                return ( <button key={filter.id} onClick={() => setActiveFilter(filter.id as "All" | RiskLevel)} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors duration-150 flex items-center ${ isActive ? (filter.id === 'Critical' ? 'bg-red-500 text-white' : 'bg-brand-blue text-white') : (filter.id === 'Critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border-primary)] dark:hover:bg-slate-600') }`}> {filter.label} <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-mono ${ isActive ? 'bg-white/20' : (filter.id === 'Critical' ? 'bg-red-200 dark:bg-red-800' : 'bg-slate-300 dark:bg-slate-600') }`}>{filter.count}</span> </button> )
                            })}
                        </div>

                        <div className="space-y-4">
                            {filteredClauses.map((clause, index) => <ClauseAnalysisCard key={index} clause={clause} index={result.analysis.findIndex(c => c.clause === clause.clause)} /> )}
                        </div>
                        {filteredClauses.length === 0 && activeFilter !== 'All' && ( <div className="text-center py-10 text-[var(--text-primary)]"> <p>No clauses found with a "{activeFilter}" risk level.</p> </div> )}
                    </div>
                </div>
            </div>
          </div>
        </div>
        
        {/* Chatbot UI */}
        <div className="fixed bottom-6 right-6 z-50">
            {isChatOpen ? (
                <div className="w-[400px] h-[550px] bg-[var(--bg-secondary)] rounded-xl shadow-2xl border border-[var(--border-primary)] flex flex-col animate-fade-in-up">
                    <header className="flex items-center justify-between p-3 border-b border-[var(--border-primary)]">
                        <h3 className="font-bold text-[var(--text-headings)]">AI Document Assistant</h3>
                        <div className="flex items-center gap-2">
                           <button onClick={() => setChatMessages(chatMessages.slice(0, 1))} className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]" aria-label="Clear Chat"><TrashIcon className="h-5 w-5"/></button>
                           <button onClick={() => setIsChatOpen(false)} className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]" aria-label="Minimize Chat"><WindowMinimizeIcon className="h-5 w-5"/></button>
                        </div>
                    </header>
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                        {chatMessages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs px-4 py-2 rounded-2xl ${msg.sender === 'user' ? 'bg-brand-blue text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-headings)]'}`}>
                                    <p className="text-sm">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                        {isChatLoading && ( <div className="flex justify-start"><div className="px-4 py-2 rounded-2xl bg-[var(--bg-tertiary)]"><span className="animate-pulse">...</span></div></div> )}
                        <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={handleChatSubmit} className="p-3 border-t border-[var(--border-primary)] flex items-center gap-2">
                        <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask to rephrase, explain, or edit..." className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue" />
                        <button type="submit" disabled={isChatLoading || !chatInput.trim()} className="p-2 bg-brand-blue text-white rounded-full disabled:bg-slate-400"><PaperAirplaneIcon className="h-5 w-5"/></button>
                    </form>
                </div>
            ) : (
                 <button onClick={() => setIsChatOpen(true)} className="p-4 bg-brand-blue text-white rounded-full shadow-lg hover:bg-brand-blue-light transition-transform hover:scale-110" aria-label="Open AI Assistant">
                    <ChatBubbleIcon className="h-7 w-7"/>
                 </button>
            )}
        </div>

        {/* Suggestion Modal */}
        {suggestedChange && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-up" onClick={() => setSuggestedChange(null)}>
                <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)] shadow-2xl max-w-3xl w-full" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-[var(--border-primary)] flex justify-between items-center">
                        <h3 className="text-lg font-bold text-[var(--text-headings)]">Suggested Change</h3>
                        <button onClick={() => setSuggestedChange(null)} className="p-1 rounded-full hover:bg-[var(--bg-tertiary)]"><XMarkIcon className="h-6 w-6"/></button>
                    </div>
                    <div className="p-6">
                        <DiffViewer oldText={suggestedChange.oldText} newText={suggestedChange.newText} />
                        <div className="flex justify-end gap-3 mt-5">
                            <button onClick={() => setSuggestedChange(null)} className="px-5 py-2 text-sm font-semibold bg-[var(--bg-tertiary)] rounded-md hover:bg-[var(--border-primary)]">Reject</button>
                            <button onClick={() => { setDocumentText(suggestedChange.newText); setSuggestedChange(null); setIsDocumentModified(true); }} className="px-5 py-2 text-sm font-semibold bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2">
                                <CheckCircleIcon className="h-5 w-5"/> Apply Change
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </>
  );
};

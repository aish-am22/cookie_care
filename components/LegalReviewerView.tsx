
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { LegalAnalysisResult, LegalPerspective, GeneratedContract } from '../types';
import { ScanningProgress } from './ScanningProgress';
import { AlertTriangleIcon, DocumentTextIcon, UploadCloudIcon, ScaleIcon, BookOpenIcon, RedactIcon } from './Icons';
import { LegalAnalysisDisplay } from './LegalAnalysisDisplay';
import { TemplateLibrary } from './TemplateLibrary';
import { DocumentRedactorView } from './DocumentRedactorView';
import * as mammoth from 'mammoth';
import { useTemplates } from '../hooks/useTemplates';


const legalReviewSteps = [
    { message: 'Preparing secure analysis environment...', progress: 15 },
    { message: 'Parsing document structure...', progress: 30 },
    { message: 'Identifying key legal clauses...', progress: 50 },
    { message: 'Submitting document to AI legal expert...', progress: 70 },
    { message: 'Aggregating risks and recommendations...', progress: 90 },
    { message: 'Finalizing your legal report...', progress: 99 },
];

type ViewMode = 'analyze' | 'generate' | 'templates' | 'redact';

// --- Contract Generation Form Component ---

const contractFieldsConfig: Record<string, Record<string, any>> = {
  'Non-Disclosure Agreement (NDA)': {
    disclosingParty: { label: 'Disclosing Party', type: 'text', placeholder: 'e.g., ACME Corporation' },
    receivingParty: { label: 'Receiving Party', type: 'text', placeholder: 'e.g., Beta LLC' },
    effectiveDate: { label: 'Effective Date', type: 'date' },
    term: { label: 'Term of Agreement', type: 'text', placeholder: 'e.g., 2 years from Effective Date' },
    purpose: { label: 'Purpose of Disclosure', type: 'textarea', placeholder: 'To evaluate a potential business relationship.' },
    governingLaw: { label: 'Governing Law / Regulation', type: 'select', options: ['GDPR (EU)', 'CCPA / CPRA (California)', 'DPDA (India)', 'Delaware (USA)', 'New York (USA)', 'California (USA)'] },
  },
  'Consulting Agreement': {
    consultantName: { label: 'Consultant Name', type: 'text', placeholder: 'e.g., Jane Doe' },
    clientName: { label: 'Client Name', type: 'text', placeholder: 'e.g., Innovate Inc.' },
    services: { label: 'Description of Services', type: 'textarea', placeholder: 'Provide a detailed description of the consulting services to be rendered.' },
    term: { label: 'Term of Agreement', type: 'text', placeholder: 'e.g., From Start Date until project completion' },
    compensation: { label: 'Compensation', type: 'text', placeholder: 'e.g., $150 per hour, invoiced monthly' },
    governingLaw: { label: 'Governing Law / Regulation', type: 'select', options: ['GDPR (EU)', 'CCPA / CPRA (California)', 'DPDA (India)', 'Delaware (USA)', 'New York (USA)', 'California (USA)'] },
  },
  'Service Agreement': {
    providerName: { label: 'Service Provider', type: 'text', placeholder: 'e.g., Tech Solutions LLC' },
    clientName: { label: 'Client Name', type: 'text', placeholder: 'e.g., Global Marketing Co.'},
    services: { label: 'Scope of Services', type: 'textarea', placeholder: 'Clearly define the services, deliverables, and any performance metrics.' },
    term: { label: 'Agreement Term', type: 'text', placeholder: 'e.g., 1 year, auto-renewing monthly' },
    paymentTerms: { label: 'Payment Terms', type: 'textarea', placeholder: 'e.g., Net 30 days upon receipt of monthly invoice.' },
    governingLaw: { label: 'Governing Law / Regulation', type: 'select', options: ['GDPR (EU)', 'CCPA / CPRA (California)', 'DPDA (India)', 'Delaware (USA)', 'New York (USA)', 'California (USA)'] },
  },
};


const ContractDetailsForm: React.FC<{
    contractType: string;
    onDetailsChange: (details: Record<string, any>) => void;
    isLoading: boolean;
}> = ({ contractType, onDetailsChange, isLoading }) => {
    const fields = contractFieldsConfig[contractType] || {};
    
    const getInitialState = useCallback(() => {
        return Object.keys(fields).reduce((acc, key) => {
            acc[key] = '';
            if (fields[key].type === 'date') {
                acc[key] = new Date().toISOString().split('T')[0];
            }
            return acc;
        }, {} as Record<string, string>);
    }, [fields]);

    const [details, setDetails] = useState<Record<string, string>>(getInitialState());
    const [otherGoverningLaw, setOtherGoverningLaw] = useState('');

    useEffect(() => {
        setDetails(getInitialState());
    }, [contractType, getInitialState]);

    useEffect(() => {
        const finalDetails = { ...details };
        if (details.governingLaw === 'Other') {
            finalDetails.governingLaw = otherGoverningLaw;
        }
        onDetailsChange(finalDetails);
    }, [details, otherGoverningLaw, onDetailsChange]);

    const handleChange = (fieldId: string, value: string) => {
        setDetails(prev => ({ ...prev, [fieldId]: value }));
    };

    if (Object.keys(fields).length === 0) return null;

    return (
        <div className="space-y-4 pt-4 border-t border-[var(--border-primary)]">
            <h3 className="text-md font-semibold text-[var(--text-headings)]">Key Details for {contractType}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(fields).map(([id, config]) => (
                <div key={id} className={config.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <label htmlFor={id} className="block text-sm font-medium text-[var(--text-primary)]">{config.label}</label>
                    {config.type === 'textarea' ? (
                         <textarea id={id} value={details[id] || ''} onChange={e => handleChange(id, e.target.value)} disabled={isLoading} rows={3}
                                className="mt-1 w-full text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue p-2" placeholder={config.placeholder} />
                    ) : config.type === 'select' ? (
                        <>
                         <select id={id} value={details[id] || ''} onChange={e => handleChange(id, e.target.value)} disabled={isLoading}
                                className="mt-1 block w-full py-2 px-3 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm">
                            <option value="">Select a Jurisdiction</option>
                            {config.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                            <option value="Other">Other...</option>
                        </select>
                        {details.governingLaw === 'Other' && (
                            <input type="text" value={otherGoverningLaw} onChange={e => setOtherGoverningLaw(e.target.value)} disabled={isLoading} placeholder="Specify jurisdiction"
                                className="mt-2 w-full text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue p-2" />
                        )}
                        </>
                    ) : (
                         <input id={id} type={config.type} value={details[id] || ''} onChange={e => handleChange(id, e.target.value)} disabled={isLoading} placeholder={config.placeholder}
                                className="mt-1 w-full text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue p-2" />
                    )}
                </div>
            ))}
            </div>
        </div>
    );
};


// --- Main Reviewer Component ---
export const LegalReviewerView: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('redact');
    
    // State for Analysis
    const [documentText, setDocumentText] = useState<string>('');
    const [perspective, setPerspective] = useState<LegalPerspective>('neutral');
    const [analysisResult, setAnalysisResult] = useState<LegalAnalysisResult | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // State for Generation
    const [contractType, setContractType] = useState('Non-Disclosure Agreement (NDA)');
    const [contractDetails, setContractDetails] = useState<Record<string, any>>({});
    const [generatedContract, setGeneratedContract] = useState<GeneratedContract | null>(null);
    const { templates, fetchTemplates } = useTemplates();
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('none');

    // Shared State
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isParsing, setIsParsing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (viewMode === 'generate' || viewMode === 'templates') {
            fetchTemplates();
        }
    }, [viewMode, fetchTemplates]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setError(null);
        setIsParsing(true);
        setDocumentText('');
        setFileName(file.name);

        try {
            const reader = new FileReader();
            if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                reader.onload = async (e) => {
                    const arrayBuffer = e.target?.result as ArrayBuffer;
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    setDocumentText(result.value);
                    setIsParsing(false);
                };
                reader.readAsArrayBuffer(file);
            } else {
                reader.onload = (e) => {
                  setDocumentText(e.target?.result as string);
                  setIsParsing(false);
                };
                reader.readAsText(file);
            }
        } catch (err) {
            setError("Failed to parse the uploaded file.");
            setFileName('');
            setIsParsing(false);
        } finally {
            if (event.target) event.target.value = '';
        }
    };
    
    const handleAnalyze = useCallback(async () => {
        if (!documentText.trim()) {
            setError('Please paste or upload a document before analyzing.');
            return;
        }
        setError(null);
        setIsLoading(true);
        setAnalysisResult(null);
        setGeneratedContract(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/analyze-legal-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentText, perspective }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result: LegalAnalysisResult = await response.json();
            setAnalysisResult(result);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(`Failed to analyze document. ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    }, [documentText, perspective]);

    const handleGenerate = useCallback(async () => {
        const requiredFields = Object.keys(contractFieldsConfig[contractType] || {});
        const missingField = requiredFields.find(field => !contractDetails[field]);

        if (missingField) {
            setError(`Please fill in all key details. The field "${contractFieldsConfig[contractType][missingField].label}" is missing.`);
            return;
        }
        
        setError(null);
        setIsLoading(true);
        setAnalysisResult(null);
        setGeneratedContract(null);
        
        const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

        try {
            const response = await fetch(`${API_BASE_URL}/api/generate-contract`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    contractType, 
                    details: JSON.stringify(contractDetails, null, 2),
                    templateContent: selectedTemplate ? selectedTemplate.content : undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const result: GeneratedContract = await response.json();
            setGeneratedContract(result);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(`Failed to generate contract. ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    }, [contractType, contractDetails, templates, selectedTemplateId]);
    
    const stripHtml = (html: string) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    };

    const resetViews = () => {
        setError(null);
        setAnalysisResult(null);
        setGeneratedContract(null);
        setDocumentText('');
        setFileName('');
        setContractDetails({});
    };

    const ViewModeTab: React.FC<{mode: ViewMode, label: string, icon: React.ReactNode}> = ({mode, label, icon}) => (
        <button
            onClick={() => { setViewMode(mode); resetViews(); }}
            className={`flex items-center space-x-2 px-4 py-2 text-sm font-bold rounded-md transition-colors duration-200 w-full justify-center sm:w-auto ${
                viewMode === mode ? 'bg-brand-blue text-white shadow-md' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );

    return (
        <>
            <div className="max-w-5xl mx-auto mt-6">
                <div className="flex flex-col sm:flex-row justify-center p-1.5 bg-[var(--bg-tertiary)] rounded-lg space-y-2 sm:space-y-0 sm:space-x-2 mb-6">
                    <ViewModeTab mode="redact" label="Document Redactor" icon={<RedactIcon className="h-5 w-5"/>} />
                    <ViewModeTab mode="generate" label="Generate Contract" icon={<DocumentTextIcon className="h-5 w-5"/>} />
                    <ViewModeTab mode="analyze" label="Analyze Document" icon={<ScaleIcon className="h-5 w-5"/>} />
                    <ViewModeTab mode="templates" label="Template Library" icon={<BookOpenIcon className="h-5 w-5"/>} />
                </div>
                
                {viewMode === 'redact' && <DocumentRedactorView />}

                {viewMode === 'analyze' && (
                    <div className="bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-primary)] shadow-sm animate-fade-in-up">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <label className="block text-sm font-medium text-[var(--text-primary)]">Paste Document Text or Upload</label>
                                <textarea id="dpa-text" value={documentText} onChange={(e) => { setDocumentText(e.target.value); if(fileName) setFileName(''); }}
                                    placeholder="Paste the full text from your legal document here..." disabled={isLoading || isParsing} rows={12}
                                    className="w-full text-sm bg-[var(--bg-primary)] text-[var(--text-headings)] border border-[var(--border-primary)] rounded-lg focus:ring-2 focus:ring-brand-blue p-4 font-mono"/>
                                <div className="text-center my-2 text-xs text-[var(--text-primary)] font-semibold">OR</div>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".docx,.txt" className="hidden" disabled={isLoading || isParsing}/>
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading || isParsing}
                                    className="w-full flex flex-col items-center justify-center p-4 border-2 border-dashed border-[var(--border-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50">
                                    <UploadCloudIcon className="h-8 w-8 text-brand-blue" />
                                    <span className="mt-2 text-sm font-semibold text-[var(--text-headings)]">{isParsing ? 'Parsing...' : (fileName ? `File: ${fileName}`: 'Upload Document')}</span>
                                    <span className="text-xs text-[var(--text-primary)]">DOCX or TXT supported</span>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                   <p className="block text-sm font-medium text-[var(--text-primary)]">Review Perspective</p>
                                   <p className="text-xs text-[var(--text-primary)]/80 mb-2">Select a role to tailor the risk analysis, or choose Neutral.</p>
                                </div>
                                <div className="space-y-3">
                                    {(['neutral', 'controller', 'processor'] as LegalPerspective[]).map(p => (
                                        <label key={p} className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${perspective === p ? 'bg-brand-blue/10 border-brand-blue' : 'bg-[var(--bg-primary)] border-[var(--border-primary)] hover:border-slate-400'}`}>
                                            <input type="radio" name="perspective" value={p} checked={perspective === p} onChange={() => setPerspective(p)} className="h-4 w-4 mt-0.5 text-brand-blue focus:ring-brand-blue"/>
                                            <span className="ml-3 text-sm font-bold text-[var(--text-headings)] capitalize">{p}</span>
                                        </label>
                                    ))}
                                </div>
                                 <button type="button" onClick={handleAnalyze} disabled={isLoading || isParsing || !documentText.trim()}
                                    className="w-full flex items-center justify-center gap-2 mt-6 px-6 py-3 font-semibold text-white bg-brand-blue rounded-md shadow-lg hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-brand-blue transition-all disabled:bg-slate-400 disabled:cursor-not-allowed">
                                   <ScaleIcon className="h-5 w-5" />
                                   {isLoading ? 'Analyzing...' : (isParsing ? 'Waiting...' : 'Analyze Document')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'generate' && (
                    <div className="bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-primary)] shadow-sm animate-fade-in-up">
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="template-select" className="block text-sm font-medium text-[var(--text-primary)]">Use Organizational Template</label>
                                <select id="template-select" value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} disabled={isLoading} className="mt-1 block w-full py-2 px-3 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm">
                                    <option value="none">None - Generate from Scratch</option>
                                    {templates.map(template => (
                                        <option key={template.id} value={template.id}>{template.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="contract-type" className="block text-sm font-medium text-[var(--text-primary)]">Contract Type</label>
                                <p className="text-xs text-[var(--text-primary)]/80 mb-1">
                                    {selectedTemplateId === 'none' 
                                        ? 'Select a standard contract type to generate from scratch.'
                                        : 'Classify your selected template to show relevant fields.'}
                                </p>
                                <select id="contract-type" value={contractType} onChange={e => setContractType(e.target.value)} disabled={isLoading} className="mt-1 block w-full py-2 px-3 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm">
                                    <option>Non-Disclosure Agreement (NDA)</option>
                                    <option>Consulting Agreement</option>
                                    <option>Service Agreement</option>
                                </select>
                            </div>
                            
                           <ContractDetailsForm
                                contractType={contractType}
                                onDetailsChange={setContractDetails}
                                isLoading={isLoading}
                            />

                            <button type="button" onClick={handleGenerate} disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-brand-blue rounded-md shadow-lg hover:bg-brand-blue-light focus:outline-none focus:ring-2 focus:ring-brand-blue transition-all disabled:bg-slate-400 disabled:cursor-not-allowed">
                               <DocumentTextIcon className="h-5 w-5" />
                               {isLoading ? 'Generating...' : 'Generate Contract'}
                            </button>
                        </div>
                    </div>
                )}

                {viewMode === 'templates' && (
                    <div className="animate-fade-in-up">
                        <TemplateLibrary templates={templates} onTemplatesChange={fetchTemplates} />
                    </div>
                )}
            </div>

            <div className="mt-12">
                {isLoading && <ScanningProgress logs={legalReviewSteps.map(s => s.message)} />}
                {error && (
                    <div className="max-w-4xl mx-auto bg-red-50 dark:bg-red-900/20 border border-red-500/30 text-red-700 dark:text-red-300 p-4 rounded-lg flex items-start space-x-4" role="alert">
                        <AlertTriangleIcon className="h-6 w-6 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-red-800 dark:text-red-200">Error</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    </div>
                )}
                {analysisResult && !isLoading && <LegalAnalysisDisplay result={analysisResult} perspective={perspective} documentText={documentText} />}
                {generatedContract && !isLoading && (
                    <div className="max-w-4xl mx-auto bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-primary)] shadow-sm animate-fade-in-up">
                        <h3 className="text-2xl font-bold text-[var(--text-headings)] mb-4">{generatedContract.title}</h3>
                        <div className="font-sans text-sm bg-[var(--bg-primary)] p-6 rounded-lg border border-[var(--border-primary)] max-h-[60vh] overflow-y-auto generated-content" 
                            dangerouslySetInnerHTML={{ __html: generatedContract.content }}>
                        </div>
                        <div className="flex items-center gap-4 mt-6">
                            <button onClick={() => navigator.clipboard.writeText(stripHtml(generatedContract.content))} 
                                    className="px-5 py-2 text-sm font-semibold bg-brand-blue text-white rounded-md hover:bg-brand-blue-light transition-colors">
                                Copy to Clipboard
                            </button>
                        </div>
                    </div>
                )}
                {!isLoading && !error && !analysisResult && !generatedContract && (
                    <div className="text-center text-[var(--text-primary)] mt-16 animate-fade-in-up">
                        {viewMode !== 'templates' && viewMode !== 'redact' && <p>Your legal analysis or generated document will appear here.</p>}
                    </div>
                )}
            </div>
        </>
    );
};

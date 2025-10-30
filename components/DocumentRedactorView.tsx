import React, { useState, useCallback, useRef, useMemo } from 'react';
import { UploadCloudIcon, DocumentTextIcon, CheckCircleIcon, ShieldExclamationIcon, ArrowDownTrayIcon, XMarkIcon } from './Icons';

const API_BASE_URL = (window as any).API_BASE_URL;

type BoundingBox = { x: number; y: number; w: number; h: number };

interface FoundPii {
    id: string;
    text: string;
    category: string;
    pageNum: number;
    boxes: BoundingBox[];
}

type FileStatus = 'pending' | 'finding' | 'review' | 'redacting' | 'completed' | 'error';

interface RedactorFile {
    id: string;
    file: File;
    status: FileStatus;
    error?: string;
    // PII Finding results
    foundPii?: FoundPii[];
    pagesInfo?: { imageUrl: string; width: number; height: number }[];
    // Review state
    selectedPiiIds?: Set<string>;
    // Redaction result
    redactedDataUrl?: string;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const PiiReviewModal: React.FC<{
    file: RedactorFile;
    onClose: () => void;
    onSelectionChange: (piiId: string) => void;
    onRedact: () => void;
}> = ({ file, onClose, onSelectionChange, onRedact }) => {
    const { foundPii = [], pagesInfo = [], selectedPiiIds = new Set() } = file;
    const [hoveredPiiId, setHoveredPiiId] = useState<string | null>(null);

    const groupedPii = useMemo(() => {
        return foundPii.reduce((acc, pii) => {
            (acc[pii.category] = acc[pii.category] || []).push(pii);
            return acc;
        }, {} as Record<string, FoundPii[]>);
    }, [foundPii]);

    const allPiiIds = useMemo(() => new Set(foundPii.map(p => p.id)), [foundPii]);
    const areAllSelected = selectedPiiIds.size === allPiiIds.size && allPiiIds.size > 0;

    const handleSelectAll = () => {
        if (areAllSelected) {
            allPiiIds.forEach(id => {
                if (selectedPiiIds.has(id)) onSelectionChange(id)
            }); 
        } else {
            foundPii.forEach(pii => {
                if (!selectedPiiIds.has(pii.id)) {
                    onSelectionChange(pii.id);
                }
            });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-up" onClick={onClose}>
            <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl max-w-7xl w-full h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-[var(--border-primary)] flex justify-between items-center flex-shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-[var(--text-headings)]">Review & Redact PII</h3>
                        <p className="text-sm text-[var(--text-primary)]">Found {foundPii.length} items in <span className="font-semibold">{file.file.name}</span></p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]"><XMarkIcon className="h-6 w-6"/></button>
                </header>
                <div className="flex-1 flex overflow-hidden">
                    {/* Left: PII List */}
                    <aside className="w-1/3 border-r border-[var(--border-primary)] flex flex-col">
                        <div className="p-4 border-b border-[var(--border-primary)]">
                            <label className="flex items-center space-x-3 w-full p-2 rounded-md bg-[var(--bg-tertiary)]">
                                <input type="checkbox" checked={areAllSelected} onChange={handleSelectAll} className="h-4 w-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
                                <span className="font-semibold text-sm text-[var(--text-headings)]">Select All ({selectedPiiIds.size} / {foundPii.length})</span>
                            </label>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {Object.entries(groupedPii).map(([category, piiList]) => (
                                <div key={category}>
                                    <h4 className="font-bold text-md text-[var(--text-headings)] mb-2">{category}</h4>
                                    <div className="space-y-2">
                                        {piiList.map(pii => (
                                            <label key={pii.id} onMouseEnter={() => setHoveredPiiId(pii.id)} onMouseLeave={() => setHoveredPiiId(null)} className="flex items-start space-x-3 p-2 rounded-md hover:bg-[var(--bg-tertiary)] cursor-pointer">
                                                <input type="checkbox" checked={selectedPiiIds.has(pii.id)} onChange={() => onSelectionChange(pii.id)} className="h-4 w-4 mt-1 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-[var(--text-primary)] leading-tight">{pii.text}</p>
                                                    <p className="text-xs text-slate-400">Page {pii.pageNum}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                    {/* Right: Page Previews */}
                    <main className="w-2/3 overflow-y-auto bg-[var(--bg-tertiary)] p-6">
                        <div className="space-y-6">
                        {pagesInfo.map(({ imageUrl, width, height }, index) => {
                            const pageNum = index + 1;
                            const piiOnPage = foundPii.filter(p => p.pageNum === pageNum);
                            if (piiOnPage.length === 0) return null;

                            return (
                                <div key={pageNum} className="relative shadow-lg border border-[var(--border-primary)]">
                                    <img src={imageUrl} alt={`Page ${pageNum}`} className="w-full" />
                                    {piiOnPage.map(pii => {
                                        const isSelected = selectedPiiIds.has(pii.id);
                                        const isHovered = hoveredPiiId === pii.id;
                                        return pii.boxes.map((box, boxIndex) => (
                                            <div key={`${pii.id}-${boxIndex}`}
                                                style={{
                                                    left: `${(box.x / width) * 100}%`,
                                                    top: `${(box.y / height) * 100}%`,
                                                    width: `${(box.w / width) * 100}%`,
                                                    height: `${(box.h / height) * 100}%`
                                                }}
                                                className={`absolute transition-all duration-150 pointer-events-none ${
                                                    isSelected ? 'bg-black/80' : 
                                                    isHovered ? 'bg-brand-blue/50 border-2 border-brand-blue' : 'bg-brand-blue/20'
                                                }`}
                                            ></div>
                                        ));
                                    })}
                                    <div className="absolute top-1 right-1 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full">Page {pageNum}</div>
                                </div>
                            );
                        })}
                        </div>
                    </main>
                </div>
                <footer className="p-4 border-t border-[var(--border-primary)] flex justify-end items-center flex-shrink-0">
                    <button onClick={onRedact} disabled={selectedPiiIds.size === 0} className="px-6 py-2.5 font-semibold text-white bg-brand-blue rounded-md shadow-sm hover:bg-brand-blue-light disabled:bg-slate-400 disabled:cursor-not-allowed">
                        Redact Selected ({selectedPiiIds.size})
                    </button>
                </footer>
            </div>
        </div>
    );
};

export const DocumentRedactorView: React.FC = () => {
    const [files, setFiles] = useState<RedactorFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeReviewFileId, setActiveReviewFileId] = useState<string | null>(null);

    const hasCompletedFiles = useMemo(() => files.some(f => f.status === 'completed'), [files]);

    const handleFiles = (selectedFiles: FileList | null) => {
        if (!selectedFiles) return;
        const newFiles: RedactorFile[] = Array.from(selectedFiles)
            .filter(file => file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            .map(file => ({
                id: `${file.name}-${file.lastModified}-${file.size}`,
                file,
                status: 'pending',
                foundPii: [],
                pagesInfo: [],
                selectedPiiIds: new Set(),
            }));
        
        setFiles(prev => {
            const existingIds = new Set(prev.map(f => f.id));
            return [...prev, ...newFiles.filter(f => !existingIds.has(f.id))];
        });
    };

    const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(e.type === 'dragenter' || e.type === 'dragover'); };
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files?.length) { handleFiles(e.dataTransfer.files); } };
    const removeFile = (id: string) => setFiles(files => files.filter(f => f.id !== id));
    
    const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });

    const updateFileState = (id: string, updates: Partial<RedactorFile>) => {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const handleFindPii = async (fileId: string) => {
        const fileToProcess = files.find(f => f.id === fileId);
        if (!fileToProcess) return;

        updateFileState(fileId, { status: 'finding' });
        try {
            const fileData = await fileToBase64(fileToProcess.file);
            const response = await fetch(`${API_BASE_URL}/api/find-pii`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: fileToProcess.file.name, fileData, mimeType: fileToProcess.file.type }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server responded with status ${response.status}`);
            }
            const { piiFound, pagesInfo } = await response.json();
            updateFileState(fileId, {
                status: 'review',
                foundPii: piiFound,
                pagesInfo: pagesInfo,
                selectedPiiIds: new Set(piiFound.filter((p: FoundPii) => (p.category === 'Address' && p.text.toLowerCase().includes('work from address')) || (p.category === 'Id' && p.text.toLowerCase().includes('signer'))).map((p: FoundPii) => p.id))
            });
            setActiveReviewFileId(fileId); // Open review modal automatically
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An unknown error occurred';
            updateFileState(fileId, { status: 'error', error: message.substring(0, 150) });
        }
    };
    
    const handleRedact = async (fileId: string) => {
        const fileToProcess = files.find(f => f.id === fileId);
        if (!fileToProcess || !fileToProcess.foundPii) return;

        setActiveReviewFileId(null);
        updateFileState(fileId, { status: 'redacting' });
        
        const redactions: Record<number, BoundingBox[]> = {};
        fileToProcess.foundPii.forEach(pii => {
            if (fileToProcess.selectedPiiIds?.has(pii.id)) {
                if (!redactions[pii.pageNum]) redactions[pii.pageNum] = [];
                redactions[pii.pageNum].push(...pii.boxes);
            }
        });

        try {
            const fileData = await fileToBase64(fileToProcess.file);
            const response = await fetch(`${API_BASE_URL}/api/redact-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: fileToProcess.file.name, fileData, mimeType: fileToProcess.file.type, redactions
                }),
            });
            if (!response.ok) throw new Error('Failed to redact document');
            const result = await response.json();
            updateFileState(fileId, { status: 'completed', redactedDataUrl: `data:application/pdf;base64,${result.redactedFileData}` });
        } catch(err) {
            updateFileState(fileId, { status: 'error', error: 'Redaction process failed.' });
        }
    };
    
    const handleSelectionChange = (fileId: string, piiId: string) => {
        setFiles(prev => prev.map(f => {
            if (f.id === fileId) {
                const newSelectedIds = new Set(f.selectedPiiIds);
                if (newSelectedIds.has(piiId)) {
                    newSelectedIds.delete(piiId);
                } else {
                    newSelectedIds.add(piiId);
                }
                return { ...f, selectedPiiIds: newSelectedIds };
            }
            return f;
        }));
    };
    
    const downloadFile = (dataUrl: string, fileName: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        const name = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        link.download = `${name}-redacted.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadAll = () => {
        files.forEach(f => {
            if (f.status === 'completed' && f.redactedDataUrl) {
                downloadFile(f.redactedDataUrl, f.file.name);
            }
        });
    };

    const reviewingFile = files.find(f => f.id === activeReviewFileId);

    return (
        <div className="animate-fade-in-up space-y-6">
            <div
                onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${ isDragging ? 'border-brand-blue bg-brand-blue/10' : 'border-[var(--border-primary)] hover:border-brand-blue'}`}>
                <input ref={fileInputRef} type="file" multiple onChange={e => handleFiles(e.target.files)} accept=".docx,.pdf" className="hidden" />
                <div className="flex flex-col items-center justify-center text-center">
                    <UploadCloudIcon className="h-12 w-12 text-brand-blue" />
                    <p className="mt-4 text-lg font-semibold text-[var(--text-headings)]">Drop files here or click to upload</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">Supports batch uploading of DOCX and PDF files.</p>
                </div>
            </div>

            {files.length > 0 && (
                <div className="bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-primary)] shadow-sm">
                    <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                        <h3 className="text-lg font-bold text-[var(--text-headings)]">Uploaded Files ({files.length})</h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleDownloadAll}
                                disabled={!hasCompletedFiles}
                                className="px-4 py-2 text-sm font-semibold text-green-600 border border-green-500 rounded-md hover:bg-green-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent"
                            >
                                Download All Redacted
                            </button>
                            <button onClick={() => setFiles([])} className="px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md">Clear All</button>
                        </div>
                    </div>
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                        {files.map(f => (
                            <div key={f.id} className="bg-[var(--bg-primary)] p-3 rounded-lg border border-[var(--border-primary)]">
                                <div className="flex items-center gap-4">
                                    <div className="flex-shrink-0">
                                        {f.status === 'completed' && <CheckCircleIcon className="h-6 w-6 text-green-500" />}
                                        {f.status === 'error' && <ShieldExclamationIcon className="h-6 w-6 text-red-500" />}
                                        {['pending', 'review'].includes(f.status) && <DocumentTextIcon className="h-6 w-6 text-brand-blue" />}
                                        {['finding', 'redacting'].includes(f.status) && <div className="w-6 h-6 border-2 border-[var(--border-primary)] border-t-brand-blue rounded-full animate-spin"></div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-[var(--text-headings)] truncate">{f.file.name}</p>
                                        <p className="text-xs text-[var(--text-primary)]">{formatBytes(f.file.size)} &middot; <span className="capitalize font-medium">{f.status}</span></p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {f.status === 'pending' && <button onClick={() => handleFindPii(f.id)} className="px-3 py-1 text-xs font-semibold text-white bg-brand-blue rounded-md hover:bg-brand-blue-light">Find PII</button>}
                                        {f.status === 'review' && <button onClick={() => setActiveReviewFileId(f.id)} className="px-3 py-1 text-xs font-semibold text-white bg-orange-500 rounded-md hover:bg-orange-600">Review PII</button>}
                                        {f.status === 'completed' && <button onClick={() => downloadFile(f.redactedDataUrl!, f.file.name)} className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700">Download</button>}
                                        <button onClick={() => removeFile(f.id)} className="p-1.5 rounded-full text-slate-500 hover:bg-[var(--bg-tertiary)]"><XMarkIcon className="h-5 w-5"/></button>
                                    </div>
                                </div>
                                {f.status === 'error' && <p className="mt-2 text-xs text-red-500">Error: {f.error}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {reviewingFile && (
                <PiiReviewModal
                    file={reviewingFile}
                    onClose={() => setActiveReviewFileId(null)}
                    onSelectionChange={(piiId) => handleSelectionChange(reviewingFile.id, piiId)}
                    onRedact={() => handleRedact(reviewingFile.id)}
                />
            )}
        </div>
    );
};

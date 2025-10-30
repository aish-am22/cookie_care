
import React, { useState, useRef } from 'react';
import type { ContractTemplate } from '../types';
import { AlertTriangleIcon, UploadCloudIcon, TrashIcon, BookOpenIcon } from './Icons';
import * as mammoth from 'mammoth';

const API_BASE_URL = (window as any).API_BASE_URL;

interface TemplateLibraryProps {
    templates: ContractTemplate[];
    onTemplatesChange: () => void;
}

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({ templates, onTemplatesChange }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setError(null);
        setIsUploading(true);
        setFileName(file.name);

        try {
            let fileContent = '';
            const reader = new FileReader();
            
            if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                fileContent = result.value;
            } else {
                 fileContent = await file.text();
            }

            const response = await fetch(`${API_BASE_URL}/api/templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: file.name, content: fileContent }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to upload template.');
            }
            onTemplatesChange(); // Refresh the list
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred during upload.');
        } finally {
            setIsUploading(false);
            setFileName(null);
            if(fileInputRef.current) fileInputRef.current.value = ''; // Reset file input
        }
    };
    
    const handleDelete = async (templateId: string) => {
        if (!window.confirm("Are you sure you want to delete this template?")) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/templates/${templateId}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete template.');
            onTemplatesChange();
        } catch (err) {
             setError(err instanceof Error ? err.message : 'An unknown error occurred during deletion.');
        }
    }


    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
                <div className="bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-primary)] shadow-sm">
                    <h3 className="text-lg font-bold text-[var(--text-headings)] mb-4">Add New Template</h3>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".docx,.txt" className="hidden" disabled={isUploading}/>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                        className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-[var(--border-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50">
                        <UploadCloudIcon className="h-10 w-10 text-brand-blue" />
                        <span className="mt-2 text-sm font-semibold text-[var(--text-headings)]">
                           {isUploading ? `Uploading ${fileName}...` : 'Upload Template'}
                        </span>
                        <span className="text-xs text-[var(--text-primary)]">DOCX or TXT supported</span>
                    </button>
                    {error && (
                        <div className="mt-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 rounded-lg flex items-start space-x-2 text-sm" role="alert">
                            <AlertTriangleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="md:col-span-2">
                 <div className="bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-primary)] shadow-sm">
                    <h3 className="text-lg font-bold text-[var(--text-headings)] mb-4">Available Templates ({templates.length})</h3>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                        {templates.length > 0 ? templates.map(template => (
                           <div key={template.id} className="flex items-center justify-between bg-[var(--bg-primary)] p-3 rounded-lg border border-[var(--border-primary)]">
                               <div className="flex items-center gap-3">
                                   <BookOpenIcon className="h-5 w-5 text-brand-blue" />
                                   <p className="text-sm font-medium text-[var(--text-headings)]">{template.name}</p>
                               </div>
                               <button onClick={() => handleDelete(template.id)} className="p-1.5 rounded-full text-slate-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/50 transition-colors" aria-label="Delete template">
                                   <TrashIcon className="h-5 w-5" />
                               </button>
                           </div>
                        )) : (
                            <div className="text-center py-10 border-2 border-dashed border-[var(--border-primary)] rounded-lg">
                                <p className="text-[var(--text-primary)]">No templates uploaded yet.</p>
                                <p className="text-sm text-[var(--text-primary)]/80 mt-1">Upload a template to get started.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

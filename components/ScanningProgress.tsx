
import React, { useRef, useEffect } from 'react';

interface ScanningProgressProps {
    logs: string[];
}

export const ScanningProgress: React.FC<ScanningProgressProps> = ({ logs }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="max-w-4xl mx-auto animate-fade-in-up" aria-live="polite">
            <div className="bg-white rounded-2xl shadow-sm border border-[var(--border-primary)] font-mono text-sm text-[var(--text-primary)]">
                <div className="p-3 border-b border-[var(--border-primary)] flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-300"></span>
                    <span className="h-3 w-3 rounded-full bg-amber-300"></span>
                    <span className="h-3 w-3 rounded-full bg-emerald-300"></span>
                    <span className="ml-auto font-sans font-bold text-[var(--text-primary)] uppercase tracking-wider text-xs">Live Scan Log</span>
                </div>
                <div ref={logContainerRef} className="p-4 h-72 overflow-y-auto">
                    {logs.map((log, index) => (
                        <div key={index} className="flex items-start mb-1">
                            <span className="text-brand-blue mr-3 animate-pulse">»</span>
                            <p className="flex-1 whitespace-pre-wrap break-words">{log}</p>
                        </div>
                    ))}
                    <div className="flex items-start">
                        <span className="text-emerald-500 mr-3">✔</span>
                        <p className="flex-1 animate-pulse text-emerald-500">Awaiting next step...</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

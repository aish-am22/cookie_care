
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
            <div className="bg-slate-800 dark:bg-slate-900/70 rounded-xl shadow-2xl border border-slate-700/50 font-mono text-sm text-slate-300">
                <div className="p-3 border-b border-slate-700/50 flex items-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-red-500/50"></span>
                    <span className="h-3.5 w-3.5 rounded-full bg-yellow-500 border-2 border-yellow-500/50"></span>
                    <span className="h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-green-500/50"></span>
                    <span className="ml-auto font-sans font-bold text-slate-400 uppercase tracking-wider">Live Scan Log</span>
                </div>
                <div ref={logContainerRef} className="p-4 h-72 overflow-y-auto">
                    {logs.map((log, index) => (
                        <div key={index} className="flex items-start mb-1">
                            <span className="text-slate-500 mr-3 animate-pulse">»</span>
                            <p className="flex-1 whitespace-pre-wrap break-words">{log}</p>
                        </div>
                    ))}
                    <div className="flex items-start">
                        <span className="text-green-400 mr-3">✔</span>
                        <p className="flex-1 animate-pulse text-green-400">Awaiting next step...</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

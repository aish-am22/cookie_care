

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { URLInputForm } from './URLInputForm';
import { ScanResultDisplay } from './ScanResultDisplay';
import { ScanningProgress } from './ScanningProgress';
import { AlertTriangleIcon } from './Icons';
import type { ScanResultData } from '../types';

const API_BASE_URL = (window as any).API_BASE_URL;

type ScanDepth = 'lite' | 'medium' | 'deep' | 'enterprise';

export const CookieScannerView: React.FC = () => {
  const [url, setUrl] = useState<string>('');
  const [scanDepth, setScanDepth] = useState<ScanDepth>('lite');
  const [scanResult, setScanResult] = useState<ScanResultData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleScan = useCallback(() => {
    if (!url) {
      setError('Please enter a valid website URL.');
      return;
    }
    setError(null);
    setIsLoading(true);
    setScanResult(null);
    setScanLogs([]);

    const scanUrl = new URL(`${API_BASE_URL}/api/scan`);
    scanUrl.searchParams.append('url', url);
    scanUrl.searchParams.append('depth', scanDepth);

    eventSourceRef.current = new EventSource(scanUrl.toString());

    eventSourceRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          setScanLogs(prev => [...prev, data.message]);
        } else if (data.type === 'result') {
          setScanResult(data.payload);
          setIsLoading(false);
          eventSourceRef.current?.close();
        } else if (data.type === 'error') {
          setError(data.message);
          setIsLoading(false);
          eventSourceRef.current?.close();
        }
      } catch (e) {
        console.error("Failed to parse SSE message:", event.data);
      }
    };

    eventSourceRef.current.onerror = () => {
      setError('A connection error occurred with the scanner service. The server might be down or busy.');
      setIsLoading(false);
      eventSourceRef.current?.close();
    };

  }, [url, scanDepth]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);
  
  return (
    <>
      <div className="max-w-3xl mx-auto mt-6 space-y-6">
        <URLInputForm
          url={url}
          setUrl={setUrl}
          onScan={handleScan}
          isLoading={isLoading}
        />
        <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-primary)] shadow-sm">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">Scan Depth</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(['lite', 'medium', 'deep', 'enterprise'] as ScanDepth[]).map(depth => {
                    const depthConfig = {
                        lite: { label: 'Lite Scan', pages: 10 },
                        medium: { label: 'Medium Scan', pages: 50 },
                        deep: { label: 'Deep Scan', pages: 100 },
                        enterprise: { label: 'Enterprise Scan', pages: 500 },
                    };
                    return (
                        <button
                            key={depth}
                            onClick={() => setScanDepth(depth)}
                            disabled={isLoading}
                            className={`flex-1 px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-200 text-center disabled:cursor-not-allowed ${
                                scanDepth === depth
                                    ? 'bg-brand-blue text-white shadow-sm'
                                    : 'text-[var(--text-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] disabled:text-slate-500'
                            }`}
                            aria-pressed={scanDepth === depth}
                        >
                            {depthConfig[depth].label} <span className="text-xs opacity-80">({depthConfig[depth].pages} pages)</span>
                        </button>
                    )
                })}
            </div>
        </div>
      </div>

      <div className="mt-12">
        {isLoading && <ScanningProgress logs={scanLogs} />}
        {error && (
          <div className="max-w-4xl mx-auto bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 p-4 rounded-lg flex items-start space-x-4" role="alert">
            <AlertTriangleIcon className="h-6 w-6 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-800 dark:text-red-200">Scan Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
        {scanResult && !isLoading && <ScanResultDisplay result={scanResult} scannedUrl={url} />}
        {!isLoading && !error && !scanResult && (
           <div className="text-center text-[var(--text-primary)] mt-16 animate-fade-in-up">
            <p>Your comprehensive compliance report will appear here.</p>
          </div>
        )}
      </div>
    </>
  );
};
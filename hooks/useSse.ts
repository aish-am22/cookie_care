import { useEffect, useRef, useState } from 'react';

export type SseStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface UseSseOptions {
  /** Whether to open the connection immediately (default: false). */
  autoConnect?: boolean;
  /** Called for each incoming SSE message event. */
  onMessage?: (event: MessageEvent) => void;
  /** Called when the connection encounters an error. */
  onError?: (event: Event) => void;
}

export interface UseSseResult {
  status: SseStatus;
  /** Open (or re-open) the SSE connection to the given URL. */
  connect: (url: string) => void;
  /** Close the current SSE connection. */
  disconnect: () => void;
}

/**
 * Reusable SSE (Server-Sent Events) hook placeholder.
 * TODO: Wire up to real streaming endpoints (e.g. /api/scan, /api/chat).
 */
export function useSse(options: UseSseOptions = {}): UseSseResult {
  const { autoConnect = false, onMessage, onError } = options;
  const [status, setStatus] = useState<SseStatus>('idle');
  const esRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);

  // Keep refs in sync without re-subscribing
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const disconnect = useCallback((): void => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
      setStatus('closed');
    }
  }, []);

  const connect = (url: string): void => {
    disconnect();
    setStatus('connecting');
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setStatus('open');

    es.onmessage = (event: MessageEvent) => {
      onMessageRef.current?.(event);
    };

    es.onerror = (event: Event) => {
      setStatus('error');
      onErrorRef.current?.(event);
      es.close();
    };
  };

  // Auto-connect support is intentionally left as a TODO so the hook
  // does not fire without an explicit URL at mount time.
  useEffect(() => {
    if (autoConnect) {
      // TODO: call connect(url) once a URL prop is accepted
    }
    return () => { disconnect(); };
  }, [autoConnect, disconnect]);

  return { status, connect, disconnect };
}

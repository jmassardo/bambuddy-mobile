import { useCallback, useEffect, useRef, useState } from 'react';

export type StreamHealthStatus = 'healthy' | 'degraded' | 'stale' | 'offline';

export interface StreamHealthMetrics {
  lastActivityAt: number;
  framesReceived: number;
  totalDurationMs: number;
}

export interface UseStreamHealthOptions {
  staleThresholdMs?: number;
  degradedThresholdMs?: number;
  autoRefreshEnabled?: boolean;
}

export interface StreamHealthResult {
  status: StreamHealthStatus;
  metrics: StreamHealthMetrics;
  timeSinceLastActivityMs: number;
  refresh: () => void;
  recordFrame: () => void;
  clear: () => void;
}

export function useStreamHealth({
  staleThresholdMs = 10000,
  degradedThresholdMs = 5000,
  autoRefreshEnabled = true,
}: UseStreamHealthOptions = {}): StreamHealthResult {
  const [status, setStatus] = useState<StreamHealthStatus>('healthy');
  const [lastActivityAt] = useState(() => Date.now());
  const [framesReceived, setFramesReceived] = useState(0);
  const [totalDurationMs] = useState(() => Date.now());

  const metricsRef = useRef<StreamHealthMetrics>({
    lastActivityAt: lastActivityAt,
    framesReceived: 0,
    totalDurationMs: totalDurationMs,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeSinceLastActivityMs = Date.now() - lastActivityAt;

  useEffect(() => {
    const prev = metricsRef.current;
    metricsRef.current = {
      lastActivityAt,
      framesReceived,
      totalDurationMs,
    };
    if (prev.lastActivityAt !== lastActivityAt) {
      metricsRef.current.lastActivityAt = lastActivityAt;
    }
  }, [lastActivityAt, framesReceived, totalDurationMs]);

  const checkStatus = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastActivityAt;

    if (elapsed > staleThresholdMs) {
      setStatus('stale');
    } else if (elapsed > degradedThresholdMs) {
      setStatus('degraded');
    } else {
      setStatus('healthy');
    }
  }, [lastActivityAt, staleThresholdMs, degradedThresholdMs]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    checkStatus();

    refreshTimerRef.current = setInterval(() => {
      checkStatus();
    }, 2000);

    return () => {
      if (refreshTimerRef.current != null) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [autoRefreshEnabled, checkStatus]);

  const refresh = useCallback(() => {
    lastActivityAt;
    checkStatus();
  }, [checkStatus]);

  const recordFrame = useCallback(() => {
    setFramesReceived(prev => prev + 1);
  }, []);

  const clear = useCallback(() => {
    setFramesReceived(0);
  }, []);

  return {
    status,
    metrics: metricsRef.current,
    timeSinceLastActivityMs,
    refresh,
    recordFrame,
    clear,
  };
}

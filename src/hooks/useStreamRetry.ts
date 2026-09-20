import { useCallback, useEffect, useRef, useState } from 'react';

export type RetryState = 'idle' | 'retrying' | 'failed' | 'recovered';

export interface UseStreamRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  enabled?: boolean;
}

export interface StreamRetryResult {
  retryCount: number;
  maxRetries: number;
  currentState: RetryState;
  nextRetryDelayMs: number;
  retry: () => void;
  recover: () => void;
  reset: () => void;
}

function calculateBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
): number {
  return Math.min(
    initialDelayMs * Math.pow(backoffMultiplier, attempt),
    maxDelayMs,
  );
}

export function useStreamRetry({
  maxRetries = 3,
  initialDelayMs = 1000,
  maxDelayMs = 15000,
  backoffMultiplier = 2,
  enabled = true,
}: UseStreamRetryOptions = {}): StreamRetryResult {
  const [retryCount, setRetryCount] = useState(0);
  const [currentState, setCurrentState] = useState<RetryState>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef(0);
  const stateRef = useRef<RetryState>('idle');

  useEffect(() => {
    countRef.current = retryCount;
  }, [retryCount]);

  useEffect(() => {
    stateRef.current = currentState;
  }, [currentState]);

  const currentDelay = useCallback(() => {
    return calculateBackoff(
      countRef.current,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
    );
  }, [initialDelayMs, maxDelayMs, backoffMultiplier]);

  const clearScheduledRetry = useCallback(() => {
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearScheduledRetry;
  }, [clearScheduledRetry]);

  const retry = useCallback(() => {
    if (!enabled) return;

    clearScheduledRetry();

    if (countRef.current >= maxRetries) {
      setCurrentState('failed');
      stateRef.current = 'failed';
      return;
    }

    const delay = currentDelay();
    setCurrentState('retrying');
    stateRef.current = 'retrying';

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setRetryCount(prev => {
        const next = prev + 1;
        if (next >= maxRetries) {
          stateRef.current = 'failed';
          setCurrentState('failed');
        } else {
          stateRef.current = 'retrying';
          setCurrentState('retrying');
        }
        return next;
      });
    }, delay);
  }, [enabled, clearScheduledRetry, maxRetries, currentDelay]);

  const recover = useCallback(() => {
    clearScheduledRetry();
    setRetryCount(0);
    countRef.current = 0;
    setCurrentState('recovered');
    stateRef.current = 'recovered';
  }, [clearScheduledRetry]);

  const reset = useCallback(() => {
    clearScheduledRetry();
    setRetryCount(0);
    countRef.current = 0;
    setCurrentState('idle');
    stateRef.current = 'idle';
  }, [clearScheduledRetry]);

  return {
    retryCount,
    maxRetries,
    currentState,
    nextRetryDelayMs: enabled ? currentDelay() : 0,
    retry,
    recover,
    reset,
  };
}

// WebSocket hook for real-time printer status updates
// Ported from the web frontend's useWebSocket.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, getAuthToken } from '../api/client';
import { useServerStore, wsUrl } from '../api/server';
import { useToast } from '../contexts/ToastContext';

const WS_CLOSE_UNAUTHORIZED = 4401;
const MAX_RECONNECT_ATTEMPTS = 15;
const MAX_PARSE_ERRORS = 5;
const MAX_TOKEN_MINT_RETRIES = 3;

export interface WebSocketError {
  timestamp: number;
  message: string;
  attempt?: number;
  code?: number;
}

export interface UseWebSocketOptions {
  onReconnect?: (attempt: number) => void;
  onError?: (error: WebSocketError) => void;
}

interface WebSocketMessage {
  type: string;
  printer_id?: number;
  data?: Record<string, unknown>;
  printer_name?: string;
  missing_slots?: Array<{ slot?: string }>;
  run?: { pipeline_id?: number | null };
}

export function useWebSocket(options?: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const disposedRef = useRef(false);
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isLiveUpdatesAvailable, setIsLiveUpdatesAvailable] = useState(true);
  const [errors, setErrors] = useState<WebSocketError[]>([]);
  const { showToast } = useToast();
  const serverUrl = useServerStore((s) => s.serverUrl);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Parse error tracking — close and reconnect after threshold
  const parseErrorCountRef = useRef(0);
  // Token mint failure tracking
  const tokenMintFailuresRef = useRef(0);
  const tokenMintShutdownRef = useRef(false);

  // Debounced invalidation
  const pendingInvalidations = useRef<Set<string>>(new Set());
  const invalidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const debouncedInvalidate = useCallback(
    (queryKey: string) => {
      pendingInvalidations.current.add(queryKey);
      if (invalidationTimeoutRef.current) clearTimeout(invalidationTimeoutRef.current);

      invalidationTimeoutRef.current = setTimeout(() => {
        const keys = Array.from(pendingInvalidations.current);
        pendingInvalidations.current.clear();
        invalidationTimeoutRef.current = null;

        keys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
      }, 2000);
    },
    [queryClient],
  );

  // Throttled printer status updates
  const pendingPrinterStatus = useRef<Map<number, Record<string, unknown>>>(new Map());
  const printerStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledPrinterStatusUpdate = useCallback(
    (printerId: number, data: Record<string, unknown>) => {
      const existing = pendingPrinterStatus.current.get(printerId) || {};
      pendingPrinterStatus.current.set(printerId, { ...existing, ...data });

      if (!printerStatusTimeoutRef.current) {
        printerStatusTimeoutRef.current = setTimeout(() => {
          const updates = new Map(pendingPrinterStatus.current);
          pendingPrinterStatus.current.clear();
          printerStatusTimeoutRef.current = null;

          updates.forEach((statusData, id) => {
            queryClient.setQueryData(
              ['printerStatus', id],
              (old: Record<string, unknown> | undefined) => ({ ...old, ...statusData }),
            );
          });
        }, 100);
      }
    },
    [queryClient],
  );

  const addError = useCallback(
    (message: string, attempt?: number, code?: number) => {
      const error: WebSocketError = {
        timestamp: Date.now(),
        message,
        attempt,
        code,
      };
      setErrors((prev) => {
        const next = [...prev, error];
        return next.slice(-50);
      });
      optionsRef.current?.onError?.(error);
    },
    [],
  );

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case 'printer_status':
          if (message.printer_id !== undefined && message.data) {
            throttledPrinterStatusUpdate(message.printer_id, message.data);
          }
          break;

        case 'print_start': {
          if (message.printer_id !== undefined) {
            queryClient.invalidateQueries({ queryKey: ['printerStatus', message.printer_id] });
          }
          if (message.printer_name || message.printer_id !== undefined) {
            const printer = message.printer_name || `Printer ${message.printer_id}`;
            showToast(`${printer}: Print started`, 'info', 4000);
          }
          break;
        }

        case 'missing_spool_assignment': {
          const slots = message.missing_slots
            ?.map((s) => s.slot || 'Unknown')
            .filter(Boolean);
          if (slots?.length) {
            const printer = message.printer_name || `Printer ${message.printer_id}`;
            showToast(`${printer}: Missing spool assignment for ${slots.join(', ')}`, 'warning');
          }
          break;
        }

        case 'print_complete': {
          debouncedInvalidate('archives');
          debouncedInvalidate('archiveStats');
          if (message.printer_name || message.printer_id !== undefined) {
            const printer = message.printer_name || `Printer ${message.printer_id}`;
            showToast(`${printer}: Print completed`, 'success', 5000);
          }
          break;
        }

        case 'print_failed': {
          if (message.printer_id !== undefined) {
            queryClient.invalidateQueries({ queryKey: ['printerStatus', message.printer_id] });
          }
          const printer = message.printer_name || `Printer ${message.printer_id}`;
          const extra = message.data?.error_message
            ? ` — ${String(message.data.error_message)}`
            : message.data?.hms_errors
              ? ' — HMS errors detected'
              : '';
          showToast(`${printer}: Print failed${extra}`, 'error', 5000);
          break;
        }

        case 'printer_offline': {
          const printer = message.printer_name || `Printer ${message.printer_id}`;
          showToast(`${printer}: Printer offline`, 'warning', 6000);
          break;
        }

        case 'archive_created':
        case 'archive_updated':
          debouncedInvalidate('archives');
          if (message.type === 'archive_created') debouncedInvalidate('archiveStats');
          break;

        case 'inventory_changed':
          debouncedInvalidate('inventory-spools');
          debouncedInvalidate('spoolman-inventory-spools');
          debouncedInvalidate('inventory-locations');
          break;

        case 'spool_assignment_changed':
          debouncedInvalidate('spool-assignments');
          debouncedInvalidate('slotPresets');
          break;

        case 'spool_auto_assigned':
          debouncedInvalidate('inventory-spools');
          debouncedInvalidate('spool-assignments');
          break;

        case 'spool_usage_logged':
          debouncedInvalidate('inventory-spools');
          break;

        case 'pipeline_run_updated':
          queryClient.invalidateQueries({ queryKey: ['pipeline-runs-all'] });
          if (message.run?.pipeline_id) {
            queryClient.invalidateQueries({ queryKey: ['pipeline-runs', message.run.pipeline_id] });
          }
          break;

        case 'pong':
          break;
      }
    },
    [queryClient, debouncedInvalidate, throttledPrinterStatusUpdate, showToast],
  );

  const handleMessageRef = useRef(handleMessage);
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  const connect = useCallback(async () => {
    if (disposedRef.current || !serverUrl) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    let token: string | undefined;
    let mintSuccess = false;
    try {
      const resp = await api.getWebSocketToken();
      token = resp.token;
      mintSuccess = true;
    } catch {
      const authTok = getAuthToken();
      if (authTok) {
        tokenMintFailuresRef.current += 1;
        if (tokenMintFailuresRef.current >= MAX_TOKEN_MINT_RETRIES) {
          tokenMintShutdownRef.current = true;
          setIsLiveUpdatesAvailable(false);
          addError('WebSocket: unable to mint auth token — live updates unavailable');
        }
        return;
      }
      // Auth-disabled deployment — connect without token
      mintSuccess = true;
    }

    if (disposedRef.current) return;
    if (tokenMintShutdownRef.current && !mintSuccess) return;

    const ws = new WebSocket(wsUrl(serverUrl, token));

    ws.onopen = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttemptRef.current = 0;
      parseErrorCountRef.current = 0;
      setIsLiveUpdatesAvailable(true);
      tokenMintFailuresRef.current = 0;
      tokenMintShutdownRef.current = false;
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      let parsed: WebSocketMessage | null = null;
      try {
        parsed = JSON.parse(event.data as string);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown parse error';
        parseErrorCountRef.current += 1;

        const rawType = (() => {
          if (event.data != null && typeof event.data === 'string') {
            const match = event.data.match(/"type"\s*:\s*"([^"]*)"/);
            return match ? match[1] : (event.data.length > 30 ? `truncated: ${event.data.slice(0, 30)}...` : 'unknown');
          }
          return 'unknown';
        })();

        __DEV__ && console.warn('[WebSocket] Parse error, type:', rawType, 'message:', message);

        addError(`WebSocket message parse error (type: ${rawType}): ${message}`);

        if (parseErrorCountRef.current >= MAX_PARSE_ERRORS) {
          addError(`WebSocket: ${MAX_PARSE_ERRORS} consecutive parse errors — reconnecting`);
          wsRef.current?.close();
        }

        return;
      }

      if (parsed) {
        parseErrorCountRef.current = 0;
        handleMessageRef.current(parsed);
      }
    };

    ws.onerror = () => {
      const attempt = reconnectAttemptRef.current;
      addError(`WebSocket error on attempt ${attempt + 1}`, attempt);
      ws.close();
    };

    ws.onclose = (event) => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      setIsConnected(false);
      wsRef.current = null;

      if (disposedRef.current) return;

      if (event.code === WS_CLOSE_UNAUTHORIZED) {
        addError(`WebSocket closed: unauthorized (code ${event.code})`, undefined, event.code);
        return;
      }

      if (event.code !== 1000 && event.code !== 1001) {
        addError(
          `WebSocket closed unexpectedly (code ${event.code}, reason: ${event.reason || 'no reason'})`,
          undefined,
          event.code,
        );
      }

      setIsReconnecting(true);
      const attempt = reconnectAttemptRef.current++;

      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        addError(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
        setIsReconnecting(false);
        return;
      }

      optionsRef.current?.onReconnect?.(attempt);

      const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
      const jitter = baseDelay * 0.3 * Math.random();
      reconnectTimeoutRef.current = setTimeout(() => connect(), baseDelay + jitter);
    };

    wsRef.current = ws;
  }, [serverUrl, addError]);

  // App state handling — disconnect when backgrounded, reconnect when foregrounded
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        reconnectAttemptRef.current = 0;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        }
      } else if (state === 'background') {
        wsRef.current?.close();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [connect]);

  // Initial connection
  useEffect(() => {
    disposedRef.current = false;
    if (serverUrl) connect();

    return () => {
      disposedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (invalidationTimeoutRef.current) clearTimeout(invalidationTimeoutRef.current);
      if (printerStatusTimeoutRef.current) clearTimeout(printerStatusTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      wsRef.current?.close();
    };
  }, [connect, serverUrl]);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return { isConnected, isReconnecting, isLiveUpdatesAvailable, errors, sendMessage, clearErrors };
}

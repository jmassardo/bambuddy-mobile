// WebSocket hook for real-time printer status updates
// Ported from the web frontend's useWebSocket.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, getAuthToken } from '../api/client';
import { useServerStore, wsUrl } from '../api/server';
import { useToast } from '../contexts/ToastContext';

const WS_CLOSE_UNAUTHORIZED = 4401;

interface WebSocketMessage {
  type: string;
  printer_id?: number;
  data?: Record<string, unknown>;
  printer_name?: string;
  missing_slots?: Array<{ slot?: string }>;
  run?: { pipeline_id?: number | null };
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const { showToast } = useToast();
  const serverUrl = useServerStore((s) => s.serverUrl);

  // Debounced invalidation
  const pendingInvalidations = useRef<Set<string>>(new Set());
  const invalidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case 'printer_status':
          if (message.printer_id !== undefined && message.data) {
            throttledPrinterStatusUpdate(message.printer_id, message.data);
          }
          break;

        case 'print_start':
          if (message.printer_id !== undefined) {
            queryClient.invalidateQueries({ queryKey: ['printerStatus', message.printer_id] });
          }
          break;

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

        case 'print_complete':
          debouncedInvalidate('archives');
          debouncedInvalidate('archiveStats');
          break;

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
    try {
      const resp = await api.getWebSocketToken();
      token = resp.token;
    } catch {
      // Auth-disabled deployments may not support ws-token — connect without
      const authTok = getAuthToken();
      if (authTok) return; // Auth enabled but token mint failed — don't retry
    }

    if (disposedRef.current) return;

    const ws = new WebSocket(wsUrl(serverUrl, token));

    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      setIsConnected(true);
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data as string);
        handleMessageRef.current(message);
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = (event) => {
      if (pingInterval) clearInterval(pingInterval);
      setIsConnected(false);
      wsRef.current = null;

      if (disposedRef.current || event.code === WS_CLOSE_UNAUTHORIZED) return;

      reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
    };

    ws.onerror = () => ws.close();

    wsRef.current = ws;
  }, [serverUrl]);

  // App state handling — disconnect when backgrounded, reconnect when foregrounded
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
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
      wsRef.current?.close();
    };
  }, [connect, serverUrl]);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { isConnected, sendMessage };
}

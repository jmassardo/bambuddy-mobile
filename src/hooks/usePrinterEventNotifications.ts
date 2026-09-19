import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePushNotification } from '@/contexts/PushNotificationContext';

interface PrinterEventMessage {
  type: string;
  printer_id?: number;
  printer_name?: string;
  data?: Record<string, unknown>;
  missing_slots?: Array<{ slot?: string }>;
}

interface UsePrinterEventNotificationsOptions {
  onEvent?: (event: { type: string; printerId?: number; printerName?: string; data?: Record<string, unknown> }) => void;
}

export function usePrinterEventNotifications(options?: UsePrinterEventNotificationsOptions) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { state: pushState } = usePushNotification();
  const queryClient = useQueryClient();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handlePrintStart = useCallback(
    (msg: PrinterEventMessage) => {
      const printerName = msg.printer_name || `Printer ${msg.printer_id}`;

      showToast(`${printerName}: Print started`, 'info', 4000);

      queryClient.invalidateQueries({ queryKey: ['printerStatus', msg.printer_id] });

      optionsRef.current?.onEvent?.({
        type: msg.type,
        printerId: msg.printer_id,
        printerName,
        data: msg.data,
      });
    },
    [showToast, queryClient],
  );

  const handlePrintComplete = useCallback(
    (msg: PrinterEventMessage) => {
      const printerName = msg.printer_name || `Printer ${msg.printer_id}`;

      showToast(`${printerName}: Print completed`, 'success', 5000);

      queryClient.invalidateQueries({ queryKey: ['archives'] });
      queryClient.invalidateQueries({ queryKey: ['archiveStats'] });

      optionsRef.current?.onEvent?.({
        type: msg.type,
        printerId: msg.printer_id,
        printerName,
        data: msg.data,
      });
    },
    [showToast, queryClient],
  );

  const handlePrintFailed = useCallback(
    (msg: PrinterEventMessage) => {
      const printerName = msg.printer_name || `Printer ${msg.printer_id}`;
      const extra = msg.data?.error_message
        ? ` — ${String(msg.data.error_message)}`
        : msg.data?.hms_errors
          ? ' — HMS errors detected'
          : '';

      showToast(`${printerName}: Print failed${extra}`, 'error', 5000);

      queryClient.invalidateQueries({ queryKey: ['printerStatus', msg.printer_id] });

      optionsRef.current?.onEvent?.({
        type: msg.type,
        printerId: msg.printer_id,
        printerName,
        data: msg.data,
      });
    },
    [showToast, queryClient],
  );

  const handlePrinterOffline = useCallback(
    (msg: PrinterEventMessage) => {
      const printerName = msg.printer_name || `Printer ${msg.printer_id}`;

      showToast(`${printerName}: Printer offline`, 'warning', 6000);

      optionsRef.current?.onEvent?.({
        type: msg.type,
        printerId: msg.printer_id,
        printerName,
        data: msg.data,
      });
    },
    [showToast],
  );

  const handlePrintStopped = useCallback(
    (msg: PrinterEventMessage) => {
      const printerName = msg.printer_name || `Printer ${msg.printer_id}`;

      showToast(`${printerName}: Print stopped`, 'warning', 4000);

      queryClient.invalidateQueries({ queryKey: ['printerStatus', msg.printer_id] });

      optionsRef.current?.onEvent?.({
        type: msg.type,
        printerId: msg.printer_id,
        printerName,
        data: msg.data,
      });
    },
    [showToast, queryClient],
  );

  const handleMessage = useCallback(
    (message: PrinterEventMessage) => {
      switch (message.type) {
        case 'print_start':
          handlePrintStart(message);
          break;
        case 'print_complete':
          handlePrintComplete(message);
          break;
        case 'print_failed':
          handlePrintFailed(message);
          break;
        case 'print_stopped':
          handlePrintStopped(message);
          break;
        case 'printer_offline':
          handlePrinterOffline(message);
          break;
        case 'missing_spool_assignment': {
          const slots = message.missing_slots
            ?.map((s) => s.slot || 'Unknown')
            .filter(Boolean) as string[];
          if (slots?.length) {
            const printer = message.printer_name || `Printer ${message.printer_id}`;
            showToast(`${printer}: Missing spool assignment for ${slots.join(', ')}`, 'warning', 5000);
          }
          break;
        }
        case 'hms_event': {
          if (message.data) {
            const hmsCode = message.data.hms_code as string | undefined;
            if (hmsCode) {
              const printer = message.printer_name || `Printer ${message.printer_id}`;
              showToast(`${printer}: HMS warning — ${String(hmsCode)}`, 'warning', 6000);
            }
          }
          break;
        }
      }
    },
    [handlePrintStart, handlePrintComplete, handlePrintFailed, handlePrinterOffline, handlePrintStopped, showToast],
  );

  useEffect(() => {
    const pushEnabled = pushState.status === 'enabled' || pushState.enabled;
    if (pushEnabled && user) {
      // Track that push notifications are active for this user
      console.log(`[PushNotifications] Push enabled for user ${user.id}, status: ${pushState.status}`);
    }
  }, [pushState.status, pushState.enabled, user]);

  return { handleMessage };
}

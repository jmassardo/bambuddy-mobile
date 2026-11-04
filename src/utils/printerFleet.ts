import type { Printer, PrinterStatus } from '@/types/api';
import { filterKnownHMSErrors } from '@/components/printers/hmsErrorCatalog';

export type PrinterFleetState =
  | 'printing'
  | 'paused'
  | 'finished'
  | 'queued'
  | 'idle'
  | 'offline'
  | 'issues';

interface FleetPrinter {
  printer?: Pick<Printer, 'is_active'>;
  status?: PrinterStatus;
  maintenance?: { dueCount: number };
  queueCount?: number;
}

function hasPrinterIssues({
  printer,
  status,
  maintenance,
}: FleetPrinter): boolean {
  return (
    printer?.is_active === false ||
    (maintenance?.dueCount ?? 0) > 0 ||
    !!status?.connected && (
      filterKnownHMSErrors(status.hms_errors ?? []).length > 0 ||
      status.state === 'FAILED'
    )
  );
}

function getPrinterOperatingState({
  status,
  queueCount = 0,
}: FleetPrinter): PrinterFleetState {
  if (!status?.connected) return 'offline';
  if (status.state === 'FAILED') return 'issues';
  if (status.state === 'RUNNING') return 'printing';
  if (status.state === 'PAUSE') return 'paused';
  if (status.awaiting_plate_clear ?? (status.state === 'FINISH')) return 'finished';
  return queueCount > 0 ? 'queued' : 'idle';
}

export function getPrinterFleetState(printer: FleetPrinter): PrinterFleetState {
  if (printer.printer?.is_active === false) return 'issues';
  if (!printer.status?.connected) return 'offline';
  if (hasPrinterIssues(printer)) return 'issues';
  return getPrinterOperatingState(printer);
}

export function matchesPrinterFleetState(
  printer: FleetPrinter,
  state: PrinterFleetState,
): boolean {
  return state === 'issues'
    ? hasPrinterIssues(printer)
    : getPrinterOperatingState(printer) === state;
}

export type FleetBulkAction =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'light-on'
  | 'light-off'
  | 'clear-hms'
  | 'clear-plate';

export function isBulkApplicable(
  action: FleetBulkAction,
  status?: PrinterStatus,
) {
  if (!status?.connected) return false;
  if (action === 'pause') return status.state === 'RUNNING';
  if (action === 'resume') return status.state === 'PAUSE';
  if (action === 'stop')
    return status.state === 'RUNNING' || status.state === 'PAUSE';
  if (action === 'clear-hms')
    return filterKnownHMSErrors(status.hms_errors ?? []).length > 0;
  if (action === 'clear-plate')
    return (
      !!status.awaiting_plate_clear &&
      status.state !== 'RUNNING' &&
      status.state !== 'PAUSE'
    );
  return true;
}

export function countFleetStates(printers: FleetPrinter[]) {
  const counts = {
    printing: 0,
    paused: 0,
    finished: 0,
    queued: 0,
    idle: 0,
    offline: 0,
    issues: 0,
    loading: 0,
  };
  for (const printer of printers) {
    if (!printer.status) {
      counts.loading++;
      continue;
    }
    const state = getPrinterOperatingState(printer);
    counts[state]++;
    if (state !== 'issues' && hasPrinterIssues(printer)) counts.issues++;
  }
  return counts;
}

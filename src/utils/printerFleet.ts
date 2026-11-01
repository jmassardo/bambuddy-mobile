import type { PrinterStatus } from '@/types/api';
import { filterKnownHMSErrors } from '@/components/printers/hmsErrorCatalog';

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

export function countFleetStates(statuses: (PrinterStatus | undefined)[]) {
  const counts = {
    printing: 0,
    paused: 0,
    finished: 0,
    idle: 0,
    offline: 0,
    issues: 0,
    loading: 0,
  };
  for (const status of statuses) {
    if (!status) {
      counts.loading++;
      continue;
    }
    if (!status.connected) {
      counts.offline++;
      continue;
    }
    const hasHms = filterKnownHMSErrors(status.hms_errors ?? []).length > 0;
    if (hasHms) counts.issues++;
    if (status.state === 'RUNNING') counts.printing++;
    else if (status.state === 'PAUSE') counts.paused++;
    else if (
      status.state === 'FINISH' ||
      (status.state === 'FAILED' && !hasHms)
    )
      counts.finished++;
    else if (status.state !== 'FAILED') counts.idle++;
  }
  return counts;
}

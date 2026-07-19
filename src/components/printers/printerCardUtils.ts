// Utility functions extracted from PrinterCard.tsx for readability

import type { useTheme } from '@/theme';
import type { AMSTray, AMSUnit, HMSError, NozzleRackSlot, Printer, PrinterStatus, SpoolAssignment } from '@/types/api';
import { statusColor } from '@/utils/data';

type ThemeColors = ReturnType<typeof useTheme>['colors'];

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function getStatusLabel(status?: PrinterStatus) {
  if (!status?.connected) return 'Offline';
  if (status.stg_cur_name) return status.stg_cur_name;

  switch (status.state) {
    case 'RUNNING':
      return 'Printing';
    case 'PAUSE':
      return 'Paused';
    case 'FINISH':
      return 'Finished';
    case 'FAILED':
      return 'Failed';
    case 'IDLE':
      return 'Idle';
    default:
      return status.state
        ? status.state.charAt(0) + status.state.slice(1).toLowerCase()
        : 'Idle';
  }
}

export function getSeverityColor(errors: HMSError[], colors: ThemeColors) {
  if (!errors.length) return colors.success;
  if (errors.some(error => error.severity <= 2)) return colors.error;
  return colors.warning;
}

export function getBadgeColor(
  printer: Printer,
  status: PrinterStatus | undefined,
  colors: ThemeColors,
  hmsErrors: HMSError[],
) {
  if (printer.is_active === false) return colors.warning;
  if (!status?.connected) return colors.statusOffline;
  if (hmsErrors.length) return getSeverityColor(hmsErrors, colors);
  return statusColor(status.state ?? 'idle', colors);
}

export function getWifiTone(signal: number, colors: ThemeColors) {
  if (signal >= -60) return colors.success;
  if (signal >= -70) return colors.warning;
  return colors.error;
}

export function formatEta(minutes: number | null | undefined) {
  if (minutes == null || minutes <= 0) return '—';
  const eta = new Date(Date.now() + minutes * 60 * 1000);
  return eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function estimateElapsedSeconds(
  progress: number,
  remainingMinutes: number | null | undefined,
) {
  if (!remainingMinutes || remainingMinutes <= 0) return null;
  if (progress <= 0 || progress >= 100) return null;
  const remainingSeconds = remainingMinutes * 60;
  const totalSeconds = remainingSeconds / (1 - progress / 100);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= remainingSeconds) {
    return null;
  }
  return Math.round(totalSeconds - remainingSeconds);
}

export function temperatureTone(
  current: number | null | undefined,
  target: number | null | undefined,
  colors: ThemeColors,
) {
  if (target != null && target > 0 && (current ?? 0) + 2 < target) {
    return colors.warning;
  }
  if ((current ?? 0) >= 200) return colors.error;
  if ((current ?? 0) >= 50) return colors.info;
  return colors.textTertiary;
}

export function formatTemperature(
  current: number | null | undefined,
  target: number | null | undefined,
) {
  const currentValue = `${Math.round(current ?? 0)}°`;
  if (target != null && target > 0) {
    return `${currentValue} / ${Math.round(target)}°`;
  }
  return currentValue;
}

export function formatDualNozzleTemperature(status: PrinterStatus) {
  const primary = formatTemperature(
    status.temperatures?.nozzle,
    status.temperatures?.nozzle_target,
  );
  const secondary = formatTemperature(
    status.temperatures?.nozzle_2,
    status.temperatures?.nozzle_2_target,
  );
  return `L ${primary} • R ${secondary}`;
}

export function parseFilamentColor(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace('#', '').trim();
  if (!normalized || /^0+$/.test(normalized)) return null;
  if (normalized.length >= 6) return `#${normalized.slice(0, 6)}`;
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

export function isLightColor(hex: string | null | undefined) {
  const parsed = parseFilamentColor(hex);
  if (!parsed) return false;
  const raw = parsed.slice(1);
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 180;
}

export function getFillColor(percent: number | null | undefined, colors: ThemeColors) {
  if (percent == null) return colors.surfaceHover;
  if (percent >= 60) return colors.success;
  if (percent >= 25) return colors.warning;
  return colors.error;
}

export function getAmsStatusLabel(ams: AMSUnit) {
  if (ams.dry_time > 0) return `${Math.ceil(ams.dry_time / 60)}h drying`;
  if (ams.is_ams_ht || ams.module_type === 'n3s') return 'AMS HT';
  if (ams.module_type === 'n3f') return 'AMS Pro';
  return 'AMS';
}

export function getAmsTitle(ams: AMSUnit) {
  return `AMS ${String.fromCharCode(65 + ((ams.id >= 128 ? ams.id - 128 : ams.id) % 26))}`;
}

export function getTrayLabel(tray: AMSTray) {
  return tray.tray_sub_brands || tray.tray_type || 'Empty';
}

export function getEffectiveTrayFill(
  tray: AMSTray,
  printerId: number,
  amsId: number,
  slotIdx: number,
  assignments?: SpoolAssignment[],
): number | null {
  if (!tray.tray_type) return null;
  const hasFillLevel = tray.remain >= 0;

  const assignment = assignments?.find(
    a => a.printer_id === printerId && a.ams_id === amsId && a.tray_id === slotIdx,
  );
  const sp = assignment?.spool;
  const inventoryFill =
    sp && sp.label_weight > 0 && sp.weight_used != null
      ? Math.round(Math.max(0, sp.label_weight - sp.weight_used) / sp.label_weight * 100)
      : null;

  const resolvedInventoryFill =
    inventoryFill === 0 && hasFillLevel && tray.remain > 0 ? null : inventoryFill;

  return resolvedInventoryFill ?? (hasFillLevel ? clamp(tray.remain) : null);
}

export function getTrayStateLabel(tray: AMSTray) {
  if (tray.tray_type) return tray.tray_type;
  if (tray.state === 9 || tray.state === 10) return 'Empty';
  return 'Unset';
}

export function getTrayGlobalId(amsId: number, trayId: number) {
  return amsId >= 255 ? trayId : amsId * 4 + trayId;
}

export function getNozzleName(slot: NozzleRackSlot) {
  const diameter = slot.nozzle_diameter ? `${slot.nozzle_diameter}mm` : 'Nozzle';
  const type = slot.nozzle_type ? slot.nozzle_type.replace(/_/g, ' ') : '';
  return type ? `${diameter} ${type}` : diameter;
}

export function stripExtension(name: string | null | undefined) {
  if (!name) return 'No active job';
  return name.replace(/\.(gcode|3mf)$/i, '');
}

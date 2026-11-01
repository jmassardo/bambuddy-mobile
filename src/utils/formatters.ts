import { translateNative } from '@/i18n';
// Utility functions for formatting values in the app
import { formatPreferredCurrency, formatPreferredDate, formatPreferredDateTime, getFormattingPreferences } from './preferences';

export function formatWeekday(day: number): string {
  if (!Number.isInteger(day) || day < 0 || day > 6) return '—';
  return new Intl.DateTimeFormat(getFormattingPreferences().locale, {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2023, 0, day + 1)));
}

/** Format seconds as "Xh Ym" or "Ym Zs" */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return translateNative('native.a4a25eac430cdce6', { value0: String(h), value1: String(m) });
  if (m > 0) return translateNative('native.e073d118fbeefc64', { value0: String(m), value1: String(s) });
  return translateNative('native.37a0e64429ed9063', { value0: String(s) });
}

/** Format remaining time as "~Xh Ym" */
export function formatETA(remainingMinutes: number): string {
  if (!remainingMinutes || remainingMinutes <= 0) return '—';
  const h = Math.floor(remainingMinutes / 60);
  const m = Math.round(remainingMinutes % 60);

  if (h > 0) return translateNative('native.eb19f1833be5676c', { value0: String(h), value1: String(m) });
  return translateNative('native.1b755c30b7a794af', { value0: String(m) });
}

/** Format grams to a readable string */
export function formatWeight(grams: number): string {
  if (!grams && grams !== 0) return '—';
  if (grams >= 1000) return translateNative('native.aaa320ab6ecaf04f', { value0: String((grams / 1000).toFixed(1)) });
  return translateNative('native.9c765a3ca5313e91', { value0: String(Math.round(grams)) });
}

/** Format cost with currency symbol */
export function formatCost(cost: number, currency?: string): string {
  if (!Number.isFinite(cost)) return '—';
  if (currency && !/^[a-z]{3}$/i.test(currency)) return `${currency}${cost.toFixed(2)}`;
  return formatPreferredCurrency(cost, currency);
}

/** Format percentage */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Format a date string to a readable format */
export function formatDate(dateStr: string): string {
  return formatPreferredDate(dateStr);
}

/** Format a date string with full date and time */
export function formatDateTime(dateStr: string): string {
  return formatPreferredDateTime(dateStr);
}

/** Format file size in bytes to human readable */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

/** Truncate a filename for display */
export function truncateFilename(filename: string, maxLength: number = 30): string {
  if (filename.length <= maxLength) return filename;
  const ext = filename.lastIndexOf('.');
  if (ext > 0) {
    const extension = filename.substring(ext);
    const name = filename.substring(0, ext);
    const truncated = name.substring(0, maxLength - extension.length - 3);
    return `${truncated}...${extension}`;
  }
  return filename.substring(0, maxLength - 3) + '...';
}

/** Get status color key from print status string */
export function getStatusColorKey(
  status: string,
): 'success' | 'error' | 'warning' | 'info' | 'textTertiary' {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'success':
    case 'done':
      return 'success';
    case 'failed':
    case 'error':
    case 'cancelled':
      return 'error';
    case 'printing':
    case 'in_progress':
    case 'running':
      return 'info';
    case 'queued':
    case 'pending':
    case 'waiting':
    case 'paused':
      return 'warning';
    default:
      return 'textTertiary';
  }
}

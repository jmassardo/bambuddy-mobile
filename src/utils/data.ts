import type { ThemeColors } from '../theme';

export type ApiRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getValue(source: unknown, path: string): unknown {
  if (!path) return source;

  return path.split('.').reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isFinite(index) ? current[index] : undefined;
    }

    if (isRecord(current)) {
      return current[segment];
    }

    return undefined;
  }, source);
}

function firstValue(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = getValue(source, path);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

export function pickString(source: unknown, paths: string[], fallback = ''): string {
  const value = firstValue(source, paths);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function pickNumber(source: unknown, paths: string[], fallback = 0): number {
  const value = firstValue(source, paths);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function pickBoolean(source: unknown, paths: string[], fallback = false): boolean {
  const value = firstValue(source, paths);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on', 'enabled'].includes(value.toLowerCase());
  }
  return fallback;
}

export function pickArray(source: unknown, paths: string[]): unknown[] {
  const value = firstValue(source, paths);
  return Array.isArray(value) ? value : [];
}

export function pickRecord(source: unknown, paths: string[]): ApiRecord | null {
  const value = firstValue(source, paths);
  return isRecord(value) ? value : null;
}

export function pickRecordArray(source: unknown, paths: string[]): ApiRecord[] {
  return pickArray(source, paths).filter(isRecord);
}

export function pickId(source: unknown, paths: string[] = ['id']): string {
  const value = firstValue(source, paths);
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

export function normalizeStatus(status: string): string {
  return status
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Unknown';
}

export function statusColor(status: string, colors: ThemeColors): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('print')) return colors.statusPrinting;
  if (normalized.includes('pause') || normalized.includes('hold')) return colors.statusPaused;
  if (normalized.includes('error') || normalized.includes('fail') || normalized.includes('cancel')) return colors.statusError;
  if (normalized.includes('offline') || normalized.includes('disconnect')) return colors.statusOffline;
  if (normalized.includes('idle') || normalized.includes('ready') || normalized.includes('complete') || normalized.includes('success')) return colors.statusIdle;
  return colors.info;
}

export function formatDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

export function formatDateTime(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function formatDuration(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return '—';
    return formatDuration(parsed);
  }
  const seconds = typeof value === 'number' ? value : 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

export function formatPercent(value: unknown, digits = 0): string {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  if (!Number.isFinite(numeric)) return '0%';
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return `${normalized.toFixed(digits)}%`;
}

export function formatWeight(value: unknown): string {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  return numeric >= 1000 ? `${(numeric / 1000).toFixed(2)} kg` : `${numeric.toFixed(0)} g`;
}

export function formatCurrency(value: unknown): string {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function extensionFromName(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() ?? '' : '';
}

export function fileIconName(name: string, isFolder: boolean): string {
  if (isFolder) return 'folder';
  const extension = extensionFromName(name);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return 'image';
  if (['mp4', 'mov', 'mkv'].includes(extension)) return 'video';
  if (['txt', 'log', 'md'].includes(extension)) return 'file-text';
  return 'file';
}

export function withCacheBuster(url: string, seed: number | string): string {
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(String(seed))}`;
}

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

export function getPrinterModelImagePath(model: string | null | undefined): string {
  if (!model) return '/img/printers/default.png';
  const m = model.toLowerCase().replace(/\s+/g, '');
  if (m.includes('x1e')) return '/img/printers/x1e.png';
  if (m.includes('x1c') || m.includes('x1carbon')) return '/img/printers/x1c.png';
  if (m.includes('x1')) return '/img/printers/x1c.png';
  if (m.includes('x2d') || m === 'n6') return '/img/printers/x2d.png';
  if (m.includes('h2dpro') || m.includes('h2d-pro')) return '/img/printers/h2dpro.png';
  if (m.includes('h2d')) return '/img/printers/h2d.png';
  if (m.includes('h2c')) return '/img/printers/h2c.png';
  if (m.includes('h2s')) return '/img/printers/h2d.png';
  if (m.includes('p2s')) return '/img/printers/p1s.png';
  if (m.includes('p1s')) return '/img/printers/p1s.png';
  if (m.includes('p1p')) return '/img/printers/p1p.png';
  if (m.includes('a2l') || m === 'n9') return '/img/printers/a2l.png';
  if (m.includes('a1mini')) return '/img/printers/a1mini.png';
  if (m.includes('a1f')) return '/img/printers/a1f.png';
  if (m.includes('a1')) return '/img/printers/a1.png';
  return '/img/printers/default.png';
}

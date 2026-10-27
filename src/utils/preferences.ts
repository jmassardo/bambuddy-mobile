export type DateFormat = 'system' | 'us' | 'eu' | 'iso';
export type TimeFormat = 'system' | '12h' | '24h';
export interface FormattingPreferences {
  locale?: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  currency: string;
}
let preferences: FormattingPreferences = { dateFormat: 'system', timeFormat: 'system', currency: 'USD' };
export function setFormattingPreferences(value: Partial<FormattingPreferences>) {
  preferences = { ...preferences, ...value };
}
export function getFormattingPreferences(): Readonly<FormattingPreferences> { return preferences; }

export function parseServerDate(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  // Only timestamps are UTC; calendar-only dates keep their local calendar day.
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
      return new Date(`${value.replace(' ', 'T')}Z`);
    }
  }
  return new Date(value);
}

export function formatPreferredDate(value: unknown): string {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return '—';
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatDateInput(date);
}

export function formatDateInput(date: Date, format = preferences.dateFormat): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  if (format === 'us') return `${month}/${day}/${year}`;
  if (format === 'eu') return `${day}/${month}/${year}`;
  if (format === 'iso') return `${year}-${month}-${day}`;
  return date.toLocaleDateString(preferences.locale);
}

export function formatPreferredTime(value: Date, format = preferences.timeFormat): string {
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleTimeString(preferences.locale, {
    hour: '2-digit', minute: '2-digit',
    ...(format === 'system' ? {} : { hour12: format === '12h' }),
  });
}
export const formatTimeInput = formatPreferredTime;

export function formatPreferredDateTime(value: unknown): string {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return '—';
  const date = parseServerDate(value);
  return Number.isNaN(date.getTime()) ? String(value) : `${formatDateInput(date)} ${formatPreferredTime(date)}`;
}

export function parseDateInput(value: string, format = preferences.dateFormat): Date | null {
  let resolved = format;
  if (resolved === 'system') {
    const parts = new Intl.DateTimeFormat(preferences.locale).formatToParts(new Date(2000, 10, 22));
    const first = parts.find(part => ['day', 'month', 'year'].includes(part.type))?.type;
    resolved = first === 'year' ? 'iso' : first === 'day' ? 'eu' : 'us';
  }
  const parts = value.trim().split(/[./-]/).map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) return null;
  const [year, month, day] = resolved === 'iso' ? parts : resolved === 'eu' ? [parts[2], parts[1], parts[0]] : [parts[2], parts[0], parts[1]];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function parseTimeInput(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > (match[3] ? 12 : 23) || (match[3] && hours < 1)) return null;
  if (match[3]) hours = hours % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return { hours, minutes };
}

export function formatPreferredCurrency(value: unknown, currency = preferences.currency): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return '—';
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return `${currency || '—'} ${numeric.toFixed(2)}`;
  try {
    return new Intl.NumberFormat(preferences.locale, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(numeric);
  } catch {
    return `${code} ${numeric.toFixed(2)}`;
  }
}

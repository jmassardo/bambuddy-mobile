import { translateNative, type Translate } from '@/i18n';
import type { Archive } from '@/types/api';

import { parseServerDate } from '@/utils/preferences';

export function mergeArchiveTags(
  existing: string | null | undefined,
  changes: string,
  mode: 'add' | 'remove',
) {
  const parse = (value: string) =>
    value
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  const current = parse(existing ?? '');
  const selected = parse(changes);
  return (
    mode === 'add'
      ? [...new Set([...current, ...selected])]
      : current.filter(tag => !selected.includes(tag))
  ).join(', ');
}

export interface ArchiveBrowseOptions {
  collection: string;
  fileType: string;
  unconfirmed: boolean;
  hideDuplicates: boolean;
  colors: string[];
  colorMode: 'any' | 'all';
  sort: string;
  day: string;
}

export function browseArchives(
  archives: Archive[],
  options: ArchiveBrowseOptions,
): Archive[] {
  const now = new Date();
  return archives
    .filter(archive => {
      const record = archive as unknown as Record<string, unknown>;
      const stamp = parseServerDate(archive.created_at);
      const colors = [
        ...(archive.filament_color?.split(',') ?? []),
        ...(Array.isArray(record.filament_colors)
          ? record.filament_colors
          : []),
      ]
        .filter((color): color is string => typeof color === 'string')
        .map(color => color.trim().toLowerCase());
      if (options.colors.length) {
        const matches = options.colors.map(color =>
          colors.includes(color.toLowerCase()),
        );
        if (
          options.colorMode === 'all'
            ? matches.some(match => !match)
            : !matches.some(Boolean)
        )
          return false;
      }
      const sliced = Boolean(
        archive.total_layers ||
          archive.print_time_seconds ||
          archive.filename?.toLowerCase().endsWith('.gcode') ||
          archive.filename?.toLowerCase().includes('.gcode.'),
      );
      if (options.fileType === 'gcode' && !sliced) return false;
      if (options.fileType === 'source' && sliced) return false;
      if (
        options.unconfirmed &&
        !(
          archive.status === 'completed' &&
          archive.confirm_requested &&
          record.user_verdict == null
        )
      )
        return false;
      if (
        options.hideDuplicates &&
        options.collection !== 'duplicates' &&
        archive.duplicate_sequence > 0
      )
        return false;
      if (
        options.day &&
        localArchiveDay(
          parseServerDate(archive.completed_at ?? archive.created_at),
        ) !== options.day
      )
        return false;
      switch (options.collection) {
        case 'favorites':
          return Boolean(archive.is_favorite);
        case 'not-printed':
          return archive.status === 'archived';
        case 'printed':
          return [
            'completed',
            'failed',
            'aborted',
            'cancelled',
            'stopped',
          ].includes(archive.status);
        case 'failed':
          return ['failed', 'aborted'].includes(archive.status);
        case 'duplicates':
          return archive.duplicate_count > 0;
        case 'recent':
          return now.getTime() - stamp.getTime() <= 86400000;
        case 'this-week':
          return now.getTime() - stamp.getTime() < 7 * 86400000;
        case 'this-month':
          return (
            stamp.getMonth() === now.getMonth() &&
            stamp.getFullYear() === now.getFullYear()
          );
        default:
          return true;
      }
    })
    .sort((a, b) => {
      let order = 0;
      switch (options.sort) {
        case 'oldest':
          order = Date.parse(a.created_at) - Date.parse(b.created_at);
          break;
        case 'name':
          order = (a.print_name || a.filename).localeCompare(
            b.print_name || b.filename,
          );
          break;
        case 'name-desc':
          order = (b.print_name || b.filename).localeCompare(
            a.print_name || a.filename,
          );
          break;
        case 'time':
          order = (b.print_time_seconds ?? 0) - (a.print_time_seconds ?? 0);
          break;
        case 'filament':
          order = (b.filament_used_grams ?? 0) - (a.filament_used_grams ?? 0);
          break;
        case 'size-desc':
          order = b.file_size - a.file_size;
          break;
        case 'size-asc':
          order = a.file_size - b.file_size;
          break;
        default:
          order = Date.parse(b.created_at) - Date.parse(a.created_at);
      }
      return order || b.id - a.id;
    });
}

export function localArchiveDay(date: Date) {
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validateArchiveQuantities(
  quantity: string,
  grams: string,
  t?: Translate,
) {
  const count = Number(quantity);
  const filament = grams.trim() === '' ? null : Number(grams);
  if (
    !quantity.trim() ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 10000
  )
    throw new Error(
      t?.('archives.invalidQuantity', {
        defaultValue: 'Quantity must be a whole number from 0 to 10,000.',
      }) ?? translateNative('native.087fab4049fd3651'),
    );
  if (
    filament !== null &&
    (!Number.isFinite(filament) || filament < 0 || filament > 100000)
  )
    throw new Error(
      t?.('archives.invalidFilament', {
        defaultValue:
          'Filament must be from 0 to 100,000 grams, or empty to clear.',
      }) ?? translateNative('native.bc126ad7115b11fd'),
    );
  return { quantity: count, filament_used_grams: filament };
}

export function isIsoArchiveDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1)
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

import {
  extensionFromName,
  fileIconName,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatFileSize,
  formatPercent,
  formatWeight,
  getPrinterModelImagePath,
  getValue,
  isRecord,
  normalizeStatus,
  pickArray,
  pickBoolean,
  pickId,
  pickNumber,
  pickRecord,
  pickRecordArray,
  pickString,
  statusColor,
  withCacheBuster,
} from '@/utils/data';
import { colors } from '@/theme';

describe('data utilities', () => {
  // ── isRecord ──
  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });
    it('returns false for non-objects', () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord('string')).toBe(false);
      expect(isRecord([1, 2])).toBe(false);
    });
  });

  // ── getValue ──
  describe('getValue', () => {
    const source = { a: { b: { c: 'deep' } }, items: [10, 20, 30] };

    it('traverses nested paths', () => {
      expect(getValue(source, 'a.b.c')).toBe('deep');
    });
    it('returns undefined for missing paths', () => {
      expect(getValue(source, 'a.b.x')).toBeUndefined();
    });
    it('indexes into arrays', () => {
      expect(getValue(source, 'items.1')).toBe(20);
    });
    it('returns source when path is empty', () => {
      expect(getValue(source, '')).toBe(source);
    });
    it('returns undefined from non-traversable values', () => {
      expect(getValue(42, 'x')).toBeUndefined();
      expect(getValue(null, 'x')).toBeUndefined();
    });
  });

  // ── pickString ──
  describe('pickString', () => {
    it('extracts values from nested key paths', () => {
      const source = { user: { profile: { name: 'Jenna' } }, aliases: ['jam'], enabled: true };
      expect(pickString(source, ['user.profile.name'])).toBe('Jenna');
      expect(pickString(source, ['aliases.0'])).toBe('jam');
      expect(pickString(source, ['missing', 'enabled'])).toBe('true');
    });
    it('returns fallback for missing paths', () => {
      expect(pickString({}, ['x'], 'default')).toBe('default');
    });
    it('converts numbers to strings', () => {
      expect(pickString({ n: 42 }, ['n'])).toBe('42');
    });
  });

  // ── pickNumber ──
  describe('pickNumber', () => {
    it('handles missing and null values safely', () => {
      const source = { stats: { weight: '123.4', empty: null } };
      expect(pickNumber(source, ['stats.weight'])).toBe(123.4);
      expect(pickNumber(source, ['stats.empty', 'stats.missing'], 9)).toBe(9);
      expect(pickNumber(source, ['stats.missing'], 3)).toBe(3);
    });
    it('returns number values directly', () => {
      expect(pickNumber({ v: 7 }, ['v'])).toBe(7);
    });
    it('returns fallback for non-numeric strings', () => {
      expect(pickNumber({ v: 'abc' }, ['v'], 0)).toBe(0);
    });
    it('rejects NaN and Infinity', () => {
      expect(pickNumber({ v: NaN }, ['v'], -1)).toBe(-1);
      expect(pickNumber({ v: Infinity }, ['v'], -1)).toBe(-1);
    });
  });

  // ── pickBoolean ──
  describe('pickBoolean', () => {
    it('returns correct defaults and truthy parsing', () => {
      const source = { flags: { active: 'yes', hidden: 0 } };
      expect(pickBoolean(source, ['flags.active'])).toBe(true);
      expect(pickBoolean(source, ['flags.hidden'], true)).toBe(false);
      expect(pickBoolean(source, ['flags.missing'], true)).toBe(true);
    });
    it('recognizes truthy strings', () => {
      expect(pickBoolean({ v: 'true' }, ['v'])).toBe(true);
      expect(pickBoolean({ v: '1' }, ['v'])).toBe(true);
      expect(pickBoolean({ v: 'on' }, ['v'])).toBe(true);
      expect(pickBoolean({ v: 'enabled' }, ['v'])).toBe(true);
    });
    it('treats non-truthy strings as false', () => {
      expect(pickBoolean({ v: 'no' }, ['v'])).toBe(false);
      expect(pickBoolean({ v: 'false' }, ['v'])).toBe(false);
    });
  });

  // ── pickArray ──
  describe('pickArray', () => {
    it('returns array when found', () => {
      expect(pickArray({ items: [1, 2, 3] }, ['items'])).toEqual([1, 2, 3]);
    });
    it('returns empty array for missing or non-array values', () => {
      expect(pickArray({}, ['items'])).toEqual([]);
      expect(pickArray({ items: 'not-array' }, ['items'])).toEqual([]);
    });
  });

  // ── pickRecord ──
  describe('pickRecord', () => {
    it('returns object when found', () => {
      expect(pickRecord({ data: { a: 1 } }, ['data'])).toEqual({ a: 1 });
    });
    it('returns null for non-objects', () => {
      expect(pickRecord({ data: 'string' }, ['data'])).toBeNull();
      expect(pickRecord({}, ['missing'])).toBeNull();
    });
  });

  // ── pickRecordArray ──
  describe('pickRecordArray', () => {
    it('filters non-record items from array', () => {
      const source = { items: [{ id: 1 }, 'bad', null, { id: 2 }] };
      expect(pickRecordArray(source, ['items'])).toEqual([{ id: 1 }, { id: 2 }]);
    });
    it('returns empty array when source is not array', () => {
      expect(pickRecordArray({}, ['items'])).toEqual([]);
    });
  });

  // ── pickId ──
  describe('pickId', () => {
    it('extracts id as string', () => {
      expect(pickId({ id: 42 })).toBe('42');
      expect(pickId({ id: 'abc' })).toBe('abc');
    });
    it('returns empty string for missing id', () => {
      expect(pickId({})).toBe('');
      expect(pickId({ id: null })).toBe('');
    });
    it('supports custom paths', () => {
      expect(pickId({ pk: 7 }, ['pk'])).toBe('7');
    });
  });

  // ── normalizeStatus ──
  describe('normalizeStatus', () => {
    it('capitalizes and replaces underscores/hyphens', () => {
      expect(normalizeStatus('in_progress')).toBe('In Progress');
      expect(normalizeStatus('waiting-for-review')).toBe('Waiting For Review');
    });
    it('returns Unknown for empty string', () => {
      expect(normalizeStatus('')).toBe('Unknown');
    });
  });

  // ── statusColor ──
  describe('statusColor', () => {
    const c = colors.dark;

    it('maps printing statuses', () => {
      expect(statusColor('printing', c)).toBe(c.statusPrinting);
    });
    it('maps paused statuses', () => {
      expect(statusColor('paused', c)).toBe(c.statusPaused);
      expect(statusColor('on_hold', c)).toBe(c.statusPaused);
    });
    it('maps error statuses', () => {
      expect(statusColor('failed', c)).toBe(c.statusError);
      expect(statusColor('error', c)).toBe(c.statusError);
      expect(statusColor('cancelled', c)).toBe(c.statusError);
    });
    it('maps offline statuses', () => {
      expect(statusColor('offline', c)).toBe(c.statusOffline);
      expect(statusColor('disconnected', c)).toBe(c.statusOffline);
    });
    it('maps idle/ready/complete statuses', () => {
      expect(statusColor('idle', c)).toBe(c.statusIdle);
      expect(statusColor('ready', c)).toBe(c.statusIdle);
      expect(statusColor('complete', c)).toBe(c.statusIdle);
      expect(statusColor('success', c)).toBe(c.statusIdle);
    });
    it('returns info color for unknown statuses', () => {
      expect(statusColor('whatever', c)).toBe(c.info);
    });
  });

  // ── formatDate / formatDateTime ──
  describe('formatDate', () => {
    it('formats valid date strings', () => {
      expect(formatDate('2026-01-15')).toBeTruthy();
      expect(formatDate('2026-01-15')).not.toBe('—');
    });
    it('returns — for non-date inputs', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate({})).toBe('—');
    });
    it('passes through invalid date strings', () => {
      expect(formatDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('formatDateTime', () => {
    it('formats valid date-time strings', () => {
      expect(formatDateTime('2026-01-15T10:30:00Z')).toBeTruthy();
      expect(formatDateTime('2026-01-15T10:30:00Z')).not.toBe('—');
    });
    it('returns — for non-date inputs', () => {
      expect(formatDateTime(null)).toBe('—');
      expect(formatDateTime(undefined)).toBe('—');
    });
  });

  // ── formatDuration ──
  describe('formatDuration', () => {
    it('formats seconds into human readable output', () => {
      expect(formatDuration(45)).toBe('45s');
      expect(formatDuration(90)).toBe('1m 30s');
      expect(formatDuration(3665)).toBe('1h 1m');
      expect(formatDuration(0)).toBe('—');
    });
    it('handles string input', () => {
      expect(formatDuration('120')).toBe('2m 0s');
      expect(formatDuration('bad')).toBe('—');
    });
    it('handles negative and Infinity', () => {
      expect(formatDuration(-10)).toBe('—');
      expect(formatDuration(Infinity)).toBe('—');
    });
  });

  // ── formatPercent ──
  describe('formatPercent', () => {
    it('formats whole percentages', () => {
      expect(formatPercent(75)).toBe('75%');
    });
    it('normalizes 0-1 range to 0-100', () => {
      expect(formatPercent(0.5)).toBe('50%');
      expect(formatPercent(1)).toBe('100%');
    });
    it('supports decimal digits', () => {
      expect(formatPercent(0.756, 1)).toBe('75.6%');
    });
    it('handles non-finite values', () => {
      expect(formatPercent(NaN)).toBe('0%');
      expect(formatPercent('bad')).toBe('0%');
    });
    it('handles string number input', () => {
      expect(formatPercent('85')).toBe('85%');
    });
  });

  // ── formatWeight ──
  describe('formatWeight', () => {
    it('formats gram and kilogram values', () => {
      expect(formatWeight(850)).toBe('850 g');
      expect(formatWeight(1250)).toBe('1.25 kg');
      expect(formatWeight('0')).toBe('—');
    });
    it('handles negative values', () => {
      expect(formatWeight(-100)).toBe('—');
    });
  });

  // ── formatCurrency ──
  describe('formatCurrency', () => {
    it('handles valid and invalid numeric values', () => {
      expect(formatCurrency(12)).toContain('12');
      expect(formatCurrency('19.99')).toContain('19.99');
      expect(formatCurrency('not-a-number')).toBe('—');
    });
  });

  // ── extensionFromName ──
  describe('extensionFromName', () => {
    it('extracts file extension', () => {
      expect(extensionFromName('model.3mf')).toBe('3mf');
      expect(extensionFromName('photo.JPG')).toBe('jpg');
    });
    it('returns empty for no extension', () => {
      expect(extensionFromName('README')).toBe('');
    });
    it('gets last segment for multiple dots', () => {
      expect(extensionFromName('archive.tar.gz')).toBe('gz');
    });
  });

  // ── fileIconName ──
  describe('fileIconName', () => {
    it('returns folder for folders', () => {
      expect(fileIconName('My Folder', true)).toBe('folder');
    });
    it('returns image for image extensions', () => {
      expect(fileIconName('pic.png', false)).toBe('image');
      expect(fileIconName('photo.jpg', false)).toBe('image');
    });
    it('returns video for video extensions', () => {
      expect(fileIconName('clip.mp4', false)).toBe('video');
    });
    it('returns file-text for text files', () => {
      expect(fileIconName('notes.txt', false)).toBe('file-text');
      expect(fileIconName('readme.md', false)).toBe('file-text');
    });
    it('returns file for unknown extensions', () => {
      expect(fileIconName('model.3mf', false)).toBe('file');
    });
  });

  // ── withCacheBuster ──
  describe('withCacheBuster', () => {
    it('appends ?t= to clean URLs', () => {
      expect(withCacheBuster('https://example.com/img.png', 123)).toBe(
        'https://example.com/img.png?t=123',
      );
    });
    it('appends &t= to URLs with existing params', () => {
      expect(withCacheBuster('https://example.com/img.png?w=100', 'abc')).toBe(
        'https://example.com/img.png?w=100&t=abc',
      );
    });
  });

  // ── formatFileSize ──
  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });
    it('formats kilobytes', () => {
      expect(formatFileSize(2048)).toBe('2.0 KB');
    });
    it('formats megabytes', () => {
      expect(formatFileSize(1_500_000)).toBe('1.4 MB');
    });
    it('formats gigabytes', () => {
      expect(formatFileSize(2_000_000_000)).toBe('1.9 GB');
    });
    it('returns 0 B for zero', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });
  });

  // ── getPrinterModelImagePath ──
  describe('getPrinterModelImagePath', () => {
    it('returns default for null/undefined', () => {
      expect(getPrinterModelImagePath(null)).toBe('/img/printers/default.png');
      expect(getPrinterModelImagePath(undefined)).toBe('/img/printers/default.png');
    });
    it('maps known models correctly', () => {
      expect(getPrinterModelImagePath('X1E')).toBe('/img/printers/x1e.png');
      expect(getPrinterModelImagePath('X1 Carbon')).toBe('/img/printers/x1c.png');
      expect(getPrinterModelImagePath('P1S')).toBe('/img/printers/p1s.png');
      expect(getPrinterModelImagePath('A1 Mini')).toBe('/img/printers/a1mini.png');
      expect(getPrinterModelImagePath('A1')).toBe('/img/printers/a1.png');
      expect(getPrinterModelImagePath('H2D Pro')).toBe('/img/printers/h2dpro.png');
      expect(getPrinterModelImagePath('H2D')).toBe('/img/printers/h2d.png');
    });
    it('returns default for unknown model', () => {
      expect(getPrinterModelImagePath('FuturePrinter9000')).toBe('/img/printers/default.png');
    });
  });
});

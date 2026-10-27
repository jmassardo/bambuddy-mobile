import {
  browseArchives,
  mergeArchiveTags,
  validateArchiveQuantities,
} from '@/utils/archiveWorkflows';
import { timelapseRange } from '@/utils/timelapseEditor';
import type { Archive } from '@/types/api';

const options = {
  collection: 'all',
  fileType: 'all',
  unconfirmed: false,
  hideDuplicates: false,
  colors: [],
  colorMode: 'any' as const,
  sort: 'newest',
  day: '',
};
const archive = (patch: Partial<Archive>) =>
  ({
    id: 1,
    filename: 'model.3mf',
    created_at: '2026-01-03T12:00:00',
    status: 'completed',
    filament_color: '#ff0000,#00ff00',
    duplicate_sequence: 0,
    duplicate_count: 0,
    user_verdict: null,
    confirm_requested: true,
    file_size: 100,
    ...patch,
  } as Archive);

describe('archive collection workflows', () => {
  it('adds and removes tags without destroying unrelated tags on different archives', () => {
    expect(mergeArchiveTags('customer, PLA', 'new,PLA', 'add')).toBe(
      'customer, PLA, new',
    );
    expect(mergeArchiveTags('other, PLA, new', 'PLA', 'remove')).toBe(
      'other, new',
    );
    expect(mergeArchiveTags(null, '  new,,new ', 'add')).toBe('new');
  });

  it('accepts zero produced parts and zero filament but preserves explicit clearing', () => {
    expect(validateArchiveQuantities('0', '0')).toEqual({
      quantity: 0,
      filament_used_grams: 0,
    });
    expect(validateArchiveQuantities('2', '')).toEqual({
      quantity: 2,
      filament_used_grams: null,
    });
    for (const [quantity, grams] of [
      ['-1', ''],
      ['1.5', ''],
      ['', ''],
      ['1', '-5'],
      ['1', '100001'],
    ]) {
      expect(() => validateArchiveQuantities(quantity, grams)).toThrow();
    }
  });

  it('matches comma-delimited colors with ANY and ALL while retaining collection filters', () => {
    const records = [
      archive({ id: 1, is_favorite: true }),
      archive({ id: 2, filament_color: '#ff0000', is_favorite: true }),
      archive({ id: 3, is_favorite: false }),
    ];
    const filter = {
      ...options,
      collection: 'favorites',
      colors: ['#ff0000', '#00ff00'],
    };
    expect(browseArchives(records, filter).map(item => item.id)).toEqual([
      2, 1,
    ]);
    expect(
      browseArchives(records, { ...filter, colorMode: 'all' }).map(
        item => item.id,
      ),
    ).toEqual([1]);
    expect(
      browseArchives(records, { ...filter, colors: [] }).map(item => item.id),
    ).toEqual([2, 1]);
  });

  it('includes only requested, unreviewed completed outcomes and distinguishes print status from quality', () => {
    const records = [
      archive({ id: 1 }),
      archive({ id: 2, user_verdict: 'reject' }),
      archive({ id: 3, confirm_requested: false }),
      archive({ id: 4, status: 'failed' }),
    ];
    expect(
      browseArchives(records, { ...options, unconfirmed: true }).map(
        item => item.id,
      ),
    ).toEqual([1]);
    expect(
      browseArchives(records, { ...options, collection: 'failed' }).map(
        item => item.id,
      ),
    ).toEqual([4]);
    expect(
      browseArchives(records, { ...options, collection: 'printed' }),
    ).toHaveLength(4);
  });

  it('identifies sliced 3MF by metadata and source-only projects without relying on filename extensions', () => {
    const records = [
      archive({ id: 1 }),
      archive({ id: 2, total_layers: 100 }),
      archive({ id: 3, filename: 'job.gcode.3mf' }),
    ];
    expect(
      browseArchives(records, { ...options, fileType: 'source' }).map(
        item => item.id,
      ),
    ).toEqual([1]);
    expect(
      browseArchives(records, { ...options, fileType: 'gcode' }).map(
        item => item.id,
      ),
    ).toEqual([3, 2]);
  });

  it('retains the original when hiding duplicates but keeps the duplicates collection independent', () => {
    const records = [
      archive({ id: 1, duplicate_count: 1 }),
      archive({ id: 2, duplicate_sequence: 1, duplicate_count: 1 }),
    ];
    expect(
      browseArchives(records, { ...options, hideDuplicates: true }).map(
        item => item.id,
      ),
    ).toEqual([1]);
    expect(
      browseArchives(records, {
        ...options,
        hideDuplicates: true,
        collection: 'duplicates',
      }),
    ).toHaveLength(2);
  });

  it('chooses local calendar days and stable size sorting without discarding records', () => {
    const records = [
      archive({ id: 1, file_size: 400 }),
      archive({ id: 2, file_size: 200 }),
      archive({ id: 3, created_at: '2026-01-04T12:00:00' }),
    ];
    expect(
      browseArchives(records, {
        ...options,
        day: '2026-01-03',
        sort: 'size-desc',
      }).map(item => item.id),
    ).toEqual([1, 2]);
    expect(
      browseArchives(records, { ...options, day: '2026-01-04' }).map(
        item => item.id,
      ),
    ).toEqual([3]);
  });

  it('uses the finish day consistently for overnight prints in the calendar', () => {
    const record = archive({
      created_at: '2026-01-03T12:00:00Z',
      completed_at: '2026-01-04T12:00:00Z',
    });
    expect(browseArchives([record], { ...options, day: '2026-01-04' })).toEqual(
      [record],
    );
    expect(browseArchives([record], { ...options, day: '2026-01-03' })).toEqual(
      [],
    );
  });
});

describe('timelapse time range', () => {
  it('uses precise video seconds and computes transformed duration', () => {
    expect(timelapseRange('1.125', '8.625', 10, 2)).toEqual({
      trimStart: 1.125,
      trimEnd: 8.625,
      speed: 2,
      outputDuration: 3.75,
    });
  });
  it.each([
    ['-1', '5', 1],
    ['3', '3', 1],
    ['0', '11', 1],
    ['0', '5', 0],
    ['x', '5', 1],
  ])('rejects invalid processing ranges %s %s %s', (start, end, speed) => {
    expect(() =>
      timelapseRange(String(start), String(end), 10, Number(speed)),
    ).toThrow();
  });
});

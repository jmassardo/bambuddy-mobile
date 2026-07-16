import {
  formatCurrency,
  formatDuration,
  formatWeight,
  pickBoolean,
  pickNumber,
  pickString,
} from '@/utils/data';

describe('data utilities', () => {
  it('pickString extracts values from nested key paths', () => {
    const source = {
      user: {
        profile: {
          name: 'Jenna',
        },
      },
      aliases: ['jam'],
      enabled: true,
    };

    expect(pickString(source, ['user.profile.name'])).toBe('Jenna');
    expect(pickString(source, ['aliases.0'])).toBe('jam');
    expect(pickString(source, ['missing', 'enabled'])).toBe('true');
  });

  it('pickNumber handles missing and null values safely', () => {
    const source = {
      stats: {
        weight: '123.4',
        empty: null,
      },
    };

    expect(pickNumber(source, ['stats.weight'])).toBe(123.4);
    expect(pickNumber(source, ['stats.empty', 'stats.missing'], 9)).toBe(9);
    expect(pickNumber(source, ['stats.missing'], 3)).toBe(3);
  });

  it('pickBoolean returns correct defaults and truthy parsing', () => {
    const source = {
      flags: {
        active: 'yes',
        hidden: 0,
      },
    };

    expect(pickBoolean(source, ['flags.active'])).toBe(true);
    expect(pickBoolean(source, ['flags.hidden'], true)).toBe(false);
    expect(pickBoolean(source, ['flags.missing'], true)).toBe(true);
  });

  it('formatDuration formats seconds into human readable output', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(3665)).toBe('1h 1m');
    expect(formatDuration(0)).toBe('—');
  });

  it('formatWeight formats gram and kilogram values', () => {
    expect(formatWeight(850)).toBe('850 g');
    expect(formatWeight(1250)).toBe('1.25 kg');
    expect(formatWeight('0')).toBe('—');
  });

  it('formatCurrency handles valid and invalid numeric values', () => {
    expect(formatCurrency(12)).toContain('12');
    expect(formatCurrency('19.99')).toContain('19.99');
    expect(formatCurrency('not-a-number')).toBe('—');
  });
});

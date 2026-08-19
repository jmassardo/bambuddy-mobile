'use strict';

const {
  compareSemVer,
  normalizeTag,
  parseStrictSemVer,
} = require('../../scripts/release/semver');

describe('strict release SemVer', () => {
  test.each([
    ['0.0.0', { major: 0, minor: 0, patch: 0, version: '0.0.0' }],
    ['1.2.3', { major: 1, minor: 2, patch: 3, version: '1.2.3' }],
    [
      '9007199254740991.0.1',
      {
        major: Number.MAX_SAFE_INTEGER,
        minor: 0,
        patch: 1,
        version: '9007199254740991.0.1',
      },
    ],
  ])('parses %s', (value, expected) => {
    expect(parseStrictSemVer(value)).toEqual(expected);
    expect(Object.isFrozen(parseStrictSemVer(value))).toBe(true);
  });

  test.each([
    undefined,
    '',
    'v1.2.3',
    ' 1.2.3',
    '1.2.3 ',
    '01.2.3',
    '1.02.3',
    '1.2.03',
    '1.2',
    '1.2.3.4',
    '1.2.3-alpha',
    '1.2.3+build',
    '9007199254740992.0.0',
  ])('rejects non-strict value %p', value => {
    expect(() => parseStrictSemVer(value)).toThrow(
      expect.objectContaining({ code: expect.stringMatching(/^SEMVER_/) }),
    );
  });

  test('normalizes tags and compares every component', () => {
    expect(normalizeTag('1.2.3')).toBe('v1.2.3');
    expect(compareSemVer('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemVer('0.9.9', '1.0.0')).toBe(-1);
    expect(compareSemVer('1.1.9', '1.2.0')).toBe(-1);
    expect(compareSemVer('1.2.4', '1.2.3')).toBe(1);
    expect(
      compareSemVer(parseStrictSemVer('2.0.0'), parseStrictSemVer('1.9.9')),
    ).toBe(1);
  });
});

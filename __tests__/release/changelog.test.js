'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  extractReleaseNotes,
  parseChangelog,
  promoteUnreleased,
  validateReleaseDate,
} = require('../../scripts/release/changelog');

const fixtures = path.join(__dirname, 'fixtures', 'metadata');
const fixture = name =>
  fs.readFileSync(path.join(fixtures, name, 'CHANGELOG.md'), 'utf8');

describe('Keep a Changelog release handling', () => {
  test('promotes Unreleased and rewrites comparison links deterministically', () => {
    const source = fixture('valid');
    const rendered = promoteUnreleased(source, '1.3.0', '2026-08-19');
    expect(rendered).toContain('## [Unreleased]\n\n## [1.3.0] - 2026-08-19');
    expect(rendered).toContain(
      '[Unreleased]: https://github.com/example/fixture/compare/v1.3.0...HEAD',
    );
    expect(rendered).toContain(
      '[1.3.0]: https://github.com/example/fixture/compare/v1.2.3...v1.3.0',
    );
    expect(extractReleaseNotes(rendered, '1.3.0')).toBe(
      '### Added\n\n- A releasable change.',
    );
    expect(
      promoteUnreleased(Buffer.from(source), '1.3.0', '2026-08-19'),
    ).toBeInstanceOf(Buffer);
  });

  test.each([
    ['empty-unreleased', 'CHANGELOG_UNRELEASED_EMPTY'],
    ['duplicate-unreleased', 'CHANGELOG_UNRELEASED_COUNT_INVALID'],
  ])('rejects the %s named fixture', (name, code) => {
    expect(() => parseChangelog(fixture(name))).toThrow(
      expect.objectContaining({ code }),
    );
  });

  test.each([
    ['empty-release', 'CHANGELOG_RELEASE_EMPTY'],
    ['duplicate-release', 'CHANGELOG_RELEASE_COUNT_INVALID'],
  ])('rejects release extraction for the %s named fixture', (name, code) => {
    expect(() => extractReleaseNotes(fixture(name), '1.2.3')).toThrow(
      expect.objectContaining({ code }),
    );
  });

  test('rejects invalid dates and preexisting requested headings or links', () => {
    for (const date of ['2026-02-29', '2026-13-01', '19-08-2026']) {
      expect(() =>
        promoteUnreleased(fixture('valid'), '1.3.0', date),
      ).toThrow(expect.objectContaining({ code: 'CHANGELOG_DATE_INVALID' }));
    }
    expect(() =>
      promoteUnreleased(fixture('valid'), '1.2.3', '2026-08-19'),
    ).toThrow(
      expect.objectContaining({
        code: 'CHANGELOG_RELEASE_ALREADY_EXISTS',
        details: expect.objectContaining({
          actual: expect.arrayContaining([
            expect.stringContaining('## [1.2.3]'),
            expect.stringContaining('[1.2.3]:'),
          ]),
        }),
      }),
    );
  });

  test('rejects malformed and duplicate Unreleased links with actual diagnostics', () => {
    const valid = fixture('valid');
    const malformed = valid.replace('compare/v1.2.3...HEAD', 'releases/v1.2.3');
    expect(() => parseChangelog(malformed)).toThrow(
      expect.objectContaining({ code: 'CHANGELOG_UNRELEASED_LINK_INVALID' }),
    );
    expect(() =>
      parseChangelog(valid.replace('[1.2.3]:', '[Unreleased]:')),
    ).toThrow(
      expect.objectContaining({
        code: 'CHANGELOG_UNRELEASED_LINK_COUNT_INVALID',
        details: expect.objectContaining({ actual: expect.any(Array) }),
      }),
    );
  });

  test('rejects conflicting release link identities with actual values', () => {
    const source = fixture('valid').replace(
      'compare/v1.2.2...v1.2.3',
      'compare/v9.9.8...v9.9.9',
    );
    expect(() => parseChangelog(source)).toThrow(
      expect.objectContaining({
        code: 'CHANGELOG_RELEASE_LINK_INVALID',
        details: expect.objectContaining({
          actual: expect.objectContaining({
            heading: expect.stringContaining('## [1.2.3]'),
            link: expect.stringContaining('v9.9.8...v9.9.9'),
            fromTag: 'v9.9.8',
            toTag: 'v9.9.9',
          }),
        }),
      }),
    );
  });

  test('accepts canonical release-tag links and rejects mismatched tags', () => {
    const source = fixture('valid').replace(
      'compare/v1.2.2...v1.2.3',
      'releases/tag/v1.2.3',
    );
    expect(parseChangelog(source).links[1].url).toContain(
      '/releases/tag/v1.2.3',
    );
    expect(() =>
      parseChangelog(source.replace('/tag/v1.2.3', '/tag/v9.9.9')),
    ).toThrow(
      expect.objectContaining({
        code: 'CHANGELOG_RELEASE_LINK_INVALID',
        details: expect.objectContaining({
          actual: expect.objectContaining({
            fromTag: null,
            toTag: 'v9.9.9',
          }),
        }),
      }),
    );
  });

  test('rejects non-text, missing links, invalid release names, and missing releases', () => {
    expect(() => parseChangelog({})).toThrow(
      expect.objectContaining({ code: 'CHANGELOG_SOURCE_INVALID' }),
    );
    expect(() =>
      parseChangelog(fixture('valid').replace(/^\[Unreleased\]:.*\n/m, '')),
    ).toThrow(
      expect.objectContaining({
        code: 'CHANGELOG_UNRELEASED_LINK_COUNT_INVALID',
      }),
    );
    expect(() =>
      parseChangelog(
        fixture('valid')
          .replace('## [1.2.3]', '## [candidate]')
          .replace('[1.2.3]:', '[candidate]:'),
      ),
    ).toThrow(expect.objectContaining({ code: 'SEMVER_INVALID' }));
    expect(() => extractReleaseNotes(fixture('valid'), '9.9.9')).toThrow(
      expect.objectContaining({ code: 'CHANGELOG_RELEASE_COUNT_INVALID' }),
    );
    const undated = fixture('valid').replace(
      '## [1.2.3] - 2026-01-01',
      '## [1.2.3]',
    );
    expect(parseChangelog(Buffer.from(undated)).headings[1].date).toBeNull();
    expect(() =>
      promoteUnreleased(fixture('valid'), '1.3.0', '2024-02-29'),
    ).not.toThrow();
    const windowsSource = fixture('valid').replaceAll('\n', '\r\n');
    expect(
      promoteUnreleased(windowsSource, '1.3.0', '2026-08-19'),
    ).toContain('\r\n\r\n## [1.3.0]');
  });

  test('exports contract APIs under their architecture names', () => {
    expect(validateReleaseDate('2024-02-29')).toBe('2024-02-29');
    expect(() => validateReleaseDate('2025-02-29')).toThrow(
      expect.objectContaining({ code: 'CHANGELOG_DATE_INVALID' }),
    );
  });
});

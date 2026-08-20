'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { promoteUnreleased } = require('../../scripts/release/changelog.js');

const RELEASE_VERSION = '1.1.1';
const PRERELEASE_VERSION = '1.1.0';
const FIXTURE_DATE = '2026-08-19';
const REPOSITORY_URL = 'https://github.com/jmassardo/bambuddy-mobile';
const CAMERA_NOTE =
  '- Restore authenticated iOS camera streams in the mobile app (#139, #142, #144)';
const SECURITY_NOTE =
  '- Update vulnerable dependencies identified by the repository security audit (#145)';
const ISSUE_REFERENCES = ['#139', '#142', '#144', '#145'];

const repositoryRoot = path.resolve(__dirname, '..', '..');
const fixtureRoot = path.resolve(__dirname, 'fixtures', 'changelog-regression');

function readUtf8(...segments) {
  return fs.readFileSync(path.resolve(...segments), 'utf8');
}

const actualChangelog = readUtf8(repositoryRoot, 'CHANGELOG.md');
const actualPackage = readUtf8(repositoryRoot, 'package.json');
const prereleaseFixture = readUtf8(
  fixtureRoot,
  'v1.1.1-prerelease',
  'CHANGELOG.md',
);
const releasedFixture = readUtf8(
  fixtureRoot,
  'v1.1.1-released',
  'CHANGELOG.md',
);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function parseSections(changelog) {
  const headings = [
    ...changelog.matchAll(/^## \[([^\]\r\n]+)\](?: - ([^\r\n]+))?\r?$/gm),
  ];

  return headings.map((match, index) => {
    const start = match.index + match[0].length;
    const end = headings[index + 1]?.index ?? changelog.length;
    return {
      body: changelog
        .slice(start, end)
        .replace(/^\[[^\]\r\n]+\]: https?:\/\/\S+\r?\n?/gm, '')
        .trim(),
      date: match[2] ?? null,
      heading: match[0],
      name: match[1],
    };
  });
}

function parseLinks(changelog) {
  return [
    ...changelog.matchAll(/^\[([^\]\r\n]+)\]: (https?:\/\/\S+)\r?$/gm),
  ].map(match => ({
    definition: match[0],
    name: match[1],
    url: match[2],
  }));
}

function namedSections(changelog, name) {
  return parseSections(changelog).filter(section => section.name === name);
}

function namedLinks(changelog, name) {
  return parseLinks(changelog).filter(link => link.name === name);
}

function categoryEntries(sectionBody, heading) {
  const categories = [...sectionBody.matchAll(/^### ([^\r\n]+)\r?$/gm)];
  const matching = categories.filter(match => match[1] === heading);
  invariant(
    matching.length === 1,
    `${heading} category must exist exactly once in the owning section`,
  );
  const category = matching[0];
  const categoryIndex = categories.indexOf(category);
  const start = category.index + category[0].length;
  const end = categories[categoryIndex + 1]?.index ?? sectionBody.length;
  return sectionBody
    .slice(start, end)
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function assertSingleSection(changelog, name) {
  const sections = namedSections(changelog, name);
  invariant(sections.length === 1, `${name} heading must exist exactly once`);
  return sections[0];
}

function assertSingleLink(changelog, name, expectedUrl) {
  const links = namedLinks(changelog, name);
  invariant(links.length === 1, `${name} link must exist exactly once`);
  invariant(
    links[0].url === expectedUrl,
    `${name} link must use the exact comparison endpoints`,
  );
}

function assertReleaseNotes(changelog, ownerName) {
  const sections = parseSections(changelog);
  const owner = assertSingleSection(changelog, ownerName);
  const otherBodies = sections
    .filter(section => section.name !== ownerName)
    .map(section => section.body)
    .join('\n');
  const allNoteBodies = sections.map(section => section.body).join('\n');

  invariant(
    categoryEntries(owner.body, 'Fixed').filter(entry => entry === CAMERA_NOTE)
      .length === 1,
    'camera note must exist exactly once in the Fixed category',
  );
  invariant(
    categoryEntries(owner.body, 'Security').filter(
      entry => entry === SECURITY_NOTE,
    ).length === 1,
    'security note must exist exactly once in the Security category',
  );

  for (const note of [CAMERA_NOTE, SECURITY_NOTE]) {
    invariant(
      countOccurrences(allNoteBodies, note) === 1,
      `${note} must occur exactly once across note sections`,
    );
    invariant(
      !otherBodies.includes(note),
      `${note} must belong exclusively to ${ownerName}`,
    );
  }
  for (const reference of ISSUE_REFERENCES) {
    invariant(
      countOccurrences(allNoteBodies, reference) === 1,
      `${reference} must occur exactly once across note sections`,
    );
    invariant(
      !otherBodies.includes(reference),
      `${reference} must belong exclusively to ${ownerName}`,
    );
  }
}

function assertPrerelease(changelog) {
  assertSingleSection(changelog, 'Unreleased');
  invariant(
    namedSections(changelog, RELEASE_VERSION).length === 0,
    `${RELEASE_VERSION} heading must not exist before release`,
  );
  invariant(
    namedLinks(changelog, RELEASE_VERSION).length === 0,
    `${RELEASE_VERSION} link must not exist before release`,
  );
  assertSingleLink(
    changelog,
    'Unreleased',
    `${REPOSITORY_URL}/compare/v1.1.0...HEAD`,
  );
  assertReleaseNotes(changelog, 'Unreleased');
}

function assertReleased(changelog) {
  const unreleased = assertSingleSection(changelog, 'Unreleased');
  const release = assertSingleSection(changelog, RELEASE_VERSION);
  invariant(
    unreleased.body === '',
    'released-state Unreleased section must be empty',
  );
  invariant(
    release.date === FIXTURE_DATE,
    `${RELEASE_VERSION} heading must have the fixed release date`,
  );
  invariant(
    changelog.includes(
      `## [Unreleased]\n\n## [${RELEASE_VERSION}] - ${FIXTURE_DATE}\n`,
    ),
    'released-state Unreleased scaffold must be adjacent to the release heading',
  );
  assertSingleLink(
    changelog,
    'Unreleased',
    `${REPOSITORY_URL}/compare/v1.1.1...HEAD`,
  );
  assertSingleLink(
    changelog,
    RELEASE_VERSION,
    `${REPOSITORY_URL}/compare/v1.1.0...v1.1.1`,
  );
  assertReleaseNotes(changelog, RELEASE_VERSION);
}

function compareVersions(left, right) {
  const strictVersion = /^\d+\.\d+\.\d+$/;
  invariant(strictVersion.test(left), `package version is invalid: ${left}`);
  invariant(
    strictVersion.test(right),
    `comparison version is invalid: ${right}`,
  );
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function assertCheckout(packageText, changelog) {
  let packageMetadata;
  try {
    packageMetadata = JSON.parse(packageText);
  } catch {
    throw new Error('package metadata must be valid JSON');
  }
  const packageVersion = packageMetadata.version;
  invariant(
    typeof packageVersion === 'string',
    'package metadata must contain a version',
  );

  const releaseHeadings = namedSections(changelog, RELEASE_VERSION);
  const releaseLinks = namedLinks(changelog, RELEASE_VERSION);
  const hasNoReleaseEvidence =
    releaseHeadings.length === 0 && releaseLinks.length === 0;
  const hasCanonicalReleaseEvidence =
    releaseHeadings.length === 1 && releaseLinks.length === 1;

  if (packageVersion === PRERELEASE_VERSION && hasNoReleaseEvidence) {
    assertPrerelease(changelog);
    return 'prerelease';
  }
  if (
    compareVersions(packageVersion, RELEASE_VERSION) >= 0 &&
    hasCanonicalReleaseEvidence
  ) {
    assertReleased(changelog);
    return 'released';
  }
  throw new Error('package/changelog release state is contradictory');
}

describe('release-aware camera and security changelog contract', () => {
  test('protects the canonical prerelease fixture', () => {
    expect(() => assertPrerelease(prereleaseFixture)).not.toThrow();
  });

  test('protects the canonical released fixture and deterministic promotion', () => {
    expect(
      promoteUnreleased(prereleaseFixture, RELEASE_VERSION, FIXTURE_DATE),
    ).toBe(releasedFixture);
    expect(() => assertReleased(releasedFixture)).not.toThrow();
  });

  test('selects and validates the actual checkout state without mutation', () => {
    expect(['prerelease', 'released']).toContain(
      assertCheckout(actualPackage, actualChangelog),
    );
  });

  test.each([
    [
      'prerelease',
      JSON.stringify({ version: PRERELEASE_VERSION }),
      prereleaseFixture,
    ],
    ['released', JSON.stringify({ version: RELEASE_VERSION }), releasedFixture],
  ])(
    'applies the complete %s assertions to matching actual-checkout inputs',
    (expectedState, packageText, changelog) => {
      expect(assertCheckout(packageText, changelog)).toBe(expectedState);
      expect(() =>
        assertCheckout(
          packageText,
          changelog.replace('Restore authenticated', 'Restore secure'),
        ),
      ).toThrow('camera note must exist exactly once in the Fixed category');
    },
  );

  test('rejects a duplicate release heading appended after link definitions', () => {
    const malformed = `${releasedFixture}
## [${RELEASE_VERSION}] - ${FIXTURE_DATE}
`;
    expect(() => assertReleased(malformed)).toThrow(
      `${RELEASE_VERSION} heading must exist exactly once`,
    );
  });

  test('rejects a duplicate note appended after link definitions', () => {
    const malformed = `${releasedFixture}
## [Post-release]

### Fixed

${CAMERA_NOTE}
`;
    expect(() => assertReleased(malformed)).toThrow(
      `${CAMERA_NOTE} must occur exactly once across note sections`,
    );
  });

  test('rejects a duplicate issue reference appended after link definitions', () => {
    const malformed = `${releasedFixture}
## [Post-release]

### Added

- Follow-up entry (#145)
`;
    expect(() => assertReleased(malformed)).toThrow(
      '#145 must occur exactly once across note sections',
    );
  });

  test('validates an isolated in-memory deterministic release-cut state', () => {
    const promoted = promoteUnreleased(
      prereleaseFixture,
      RELEASE_VERSION,
      FIXTURE_DATE,
    );
    expect(assertCheckout(JSON.stringify({ version: '1.1.1' }), promoted)).toBe(
      'released',
    );
  });

  test.each([
    [
      'a note copied into Unreleased after release',
      releasedFixture.replace(
        '## [Unreleased]\n',
        `## [Unreleased]\n\n### Fixed\n\n${CAMERA_NOTE}\n`,
      ),
      'released-state Unreleased section must be empty',
    ],
    [
      'an issue reference duplicated in another note section',
      releasedFixture.replace(
        '- Establish the release baseline.',
        '- Establish the release baseline (#145).',
      ),
      '#145 must occur exactly once across note sections',
    ],
    [
      'a missing release heading',
      releasedFixture.replace(
        `## [${RELEASE_VERSION}] - ${FIXTURE_DATE}\n\n`,
        '',
      ),
      `${RELEASE_VERSION} heading must exist exactly once`,
    ],
    [
      'a duplicate release heading',
      releasedFixture.replace(
        `## [${RELEASE_VERSION}] - ${FIXTURE_DATE}`,
        `## [${RELEASE_VERSION}] - ${FIXTURE_DATE}\n\n## [${RELEASE_VERSION}] - ${FIXTURE_DATE}`,
      ),
      `${RELEASE_VERSION} heading must exist exactly once`,
    ],
    [
      'a missing release link',
      releasedFixture.replace(
        `[${RELEASE_VERSION}]: ${REPOSITORY_URL}/compare/v1.1.0...v1.1.1\n`,
        '',
      ),
      `${RELEASE_VERSION} link must exist exactly once`,
    ],
    [
      'a duplicate release link',
      releasedFixture.replace(
        `[${RELEASE_VERSION}]: ${REPOSITORY_URL}/compare/v1.1.0...v1.1.1`,
        `[${RELEASE_VERSION}]: ${REPOSITORY_URL}/compare/v1.1.0...v1.1.1\n[${RELEASE_VERSION}]: ${REPOSITORY_URL}/compare/v1.1.0...v1.1.1`,
      ),
      `${RELEASE_VERSION} link must exist exactly once`,
    ],
    [
      'an altered camera note',
      releasedFixture.replace('Restore authenticated', 'Restore secure'),
      'camera note must exist exactly once in the Fixed category',
    ],
    [
      'invalid release comparison endpoints',
      releasedFixture.replace(
        '/compare/v1.1.0...v1.1.1',
        '/compare/v1.0.1...v1.1.1',
      ),
      `${RELEASE_VERSION} link must use the exact comparison endpoints`,
    ],
  ])('rejects %s', (_caseName, malformed, expectedMessage) => {
    expect(() => assertReleased(malformed)).toThrow(expectedMessage);
  });

  test.each([
    ['1.1.0', releasedFixture],
    ['1.1.1', prereleaseFixture],
    ['1.2.0', prereleaseFixture],
  ])(
    'fails closed for package version %s with contradictory changelog evidence',
    (version, changelog) => {
      expect(() =>
        assertCheckout(JSON.stringify({ version }), changelog),
      ).toThrow('package/changelog release state is contradictory');
    },
  );
});

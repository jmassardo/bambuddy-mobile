'use strict';

const { normalizeTag, parseStrictSemVer } = require('./semver');

class ChangelogError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ChangelogError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function asText(source) {
  return Buffer.isBuffer(source) ? source.toString('utf8') : source;
}

function validateReleaseDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ChangelogError(
      'CHANGELOG_DATE_INVALID',
      'Release date is invalid',
      {
        actual: date,
      },
    );
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ChangelogError(
      'CHANGELOG_DATE_INVALID',
      'Release date is invalid',
      {
        actual: date,
      },
    );
  }
  return date;
}

function collectMatches(text, pattern) {
  return [...text.matchAll(pattern)];
}

function parseChangelog(source, options = {}) {
  const text = asText(source);
  if (typeof text !== 'string') {
    throw new ChangelogError(
      'CHANGELOG_SOURCE_INVALID',
      'Changelog must be text',
      { actual: typeof text },
    );
  }
  const headings = collectMatches(
    text,
    /^## \[([^\]]+)\](?: - ([^\r\n]+))?\r?$/gm,
  );
  const unreleased = headings.filter(match => match[1] === 'Unreleased');
  if (unreleased.length !== 1) {
    throw new ChangelogError(
      'CHANGELOG_UNRELEASED_COUNT_INVALID',
      'Changelog must contain exactly one Unreleased section',
      { actual: unreleased.map(match => match[0]) },
    );
  }
  const links = collectMatches(
    text,
    /^\[([^\]]+)\]: (https?:\/\/[^\s]+)\r?$/gm,
  );
  const unreleasedLinks = links.filter(match => match[1] === 'Unreleased');
  if (unreleasedLinks.length !== 1) {
    throw new ChangelogError(
      'CHANGELOG_UNRELEASED_LINK_COUNT_INVALID',
      'Changelog must contain exactly one Unreleased comparison link',
      { actual: unreleasedLinks.map(match => match[0]) },
    );
  }
  const comparison =
    /^(https?:\/\/.+)\/compare\/(v[^.]+\.[^.]+\.[^.]+)\.\.\.HEAD$/.exec(
      unreleasedLinks[0][2],
    );
  if (!comparison) {
    throw new ChangelogError(
      'CHANGELOG_UNRELEASED_LINK_INVALID',
      'Unreleased link must compare a version tag to HEAD',
      { actual: unreleasedLinks[0][0] },
    );
  }
  const priorVersion = comparison[2].slice(1);
  parseStrictSemVer(priorVersion);
  const releaseNames = new Set([
    ...headings
      .filter(match => match[1] !== 'Unreleased')
      .map(match => match[1]),
    ...links.filter(match => match[1] !== 'Unreleased').map(match => match[1]),
  ]);
  for (const releaseName of releaseNames) {
    parseStrictSemVer(releaseName);
    const releaseHeadings = headings.filter(match => match[1] === releaseName);
    const releaseLinks = links.filter(match => match[1] === releaseName);
    if (releaseHeadings.length !== 1 || releaseLinks.length !== 1) {
      throw new ChangelogError(
        'CHANGELOG_RELEASE_COUNT_INVALID',
        'Each release must have exactly one heading and link',
        {
          actual: [
            ...releaseHeadings.map(match => match[0]),
            ...releaseLinks.map(match => match[0]),
          ],
        },
      );
    }
    const releaseComparison =
      /^(https?:\/\/.+)\/compare\/(v[^.]+\.[^.]+\.[^.]+)\.\.\.(v[^.]+\.[^.]+\.[^.]+)$/.exec(
        releaseLinks[0][2],
      );
    const releaseTag =
      /^(https?:\/\/.+)\/releases\/tag\/(v[^.]+\.[^.]+\.[^.]+)$/.exec(
        releaseLinks[0][2],
      );
    const expectedTag = normalizeTag(releaseName);
    const actualRepositoryBase = releaseComparison?.[1] ?? releaseTag?.[1];
    const actualFromTag = releaseComparison?.[2] ?? null;
    const actualToTag = releaseComparison?.[3] ?? releaseTag?.[2];
    if (
      (!releaseComparison && !releaseTag) ||
      actualRepositoryBase !== comparison[1] ||
      actualToTag !== expectedTag
    ) {
      throw new ChangelogError(
        'CHANGELOG_RELEASE_LINK_INVALID',
        'Release comparison link does not match its heading',
        {
          actual: {
            heading: releaseHeadings[0][0],
            link: releaseLinks[0][0],
            repositoryBase: actualRepositoryBase,
            fromTag: actualFromTag,
            toTag: actualToTag,
          },
          expected: {
            repositoryBase: comparison[1],
            toTag: expectedTag,
          },
        },
      );
    }
    if (actualFromTag) {
      parseStrictSemVer(actualFromTag.slice(1));
    }
    parseStrictSemVer(actualToTag.slice(1));
    const releaseHeading = releaseHeadings[0];
    const nextHeading = headings.find(
      match => match.index > releaseHeading.index,
    );
    const firstLinkIndex = links[0].index;
    const releaseEnd = Math.min(
      nextHeading ? nextHeading.index : firstLinkIndex,
      firstLinkIndex > releaseHeading.index ? firstLinkIndex : text.length,
    );
    const releaseBody = text
      .slice(releaseHeading.index + releaseHeading[0].length, releaseEnd)
      .trim();
    if (!releaseBody) {
      throw new ChangelogError(
        'CHANGELOG_RELEASE_EMPTY',
        'Release section must not be empty',
        { actual: releaseHeading[0] },
      );
    }
  }
  const sectionEnd =
    headings.find(match => match.index > unreleased[0].index)?.index ??
    links[0].index;
  const bodyStart = unreleased[0].index + unreleased[0][0].length;
  const unreleasedBody = text.slice(bodyStart, sectionEnd).trim();
  if (!unreleasedBody && !options.allowEmptyUnreleased) {
    throw new ChangelogError(
      'CHANGELOG_UNRELEASED_EMPTY',
      'Unreleased section must not be empty',
      { actual: unreleased[0][0] },
    );
  }
  return Object.freeze({
    headings: Object.freeze(
      headings.map(match =>
        Object.freeze({
          heading: match[0],
          name: match[1],
          date: match[2] ?? null,
        }),
      ),
    ),
    links: Object.freeze(
      links.map(match =>
        Object.freeze({ name: match[1], url: match[2], definition: match[0] }),
      ),
    ),
    priorVersion,
    repositoryBase: comparison[1],
    unreleasedBody,
  });
}

function promoteUnreleased(source, version, date) {
  parseStrictSemVer(version);
  validateReleaseDate(date);
  const text = asText(source);
  const parsed = parseChangelog(text);
  const headingMatches = collectMatches(
    text,
    new RegExp(
      `^## \\[${version.replaceAll('.', '\\.')}\\](?: - .+)?\\r?$`,
      'gm',
    ),
  );
  const linkMatches = collectMatches(
    text,
    new RegExp(`^\\[${version.replaceAll('.', '\\.')}\\]: .+\\r?$`, 'gm'),
  );
  if (headingMatches.length || linkMatches.length) {
    throw new ChangelogError(
      'CHANGELOG_RELEASE_ALREADY_EXISTS',
      'Requested release already exists',
      {
        actual: [
          ...headingMatches.map(match => match[0]),
          ...linkMatches.map(match => match[0]),
        ],
      },
    );
  }
  const tag = normalizeTag(version);
  const priorTag = normalizeTag(parsed.priorVersion);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  let rendered = text.replace(
    /^## \[Unreleased\]\r?$/m,
    `## [Unreleased]${newline}${newline}## [${version}] - ${date}`,
  );
  rendered = rendered.replace(
    /^\[Unreleased\]: .+\r?$/m,
    `[Unreleased]: ${parsed.repositoryBase}/compare/${tag}...HEAD${newline}[${version}]: ${parsed.repositoryBase}/compare/${priorTag}...${tag}`,
  );
  parseChangelog(rendered, { allowEmptyUnreleased: true });
  return Buffer.isBuffer(source) ? Buffer.from(rendered) : rendered;
}

function extractReleaseNotes(source, version) {
  parseStrictSemVer(version);
  const text = asText(source);
  parseChangelog(text, { allowEmptyUnreleased: true });
  const escaped = version.replaceAll('.', '\\.');
  const headings = collectMatches(
    text,
    new RegExp(`^## \\[${escaped}\\](?: - ([^\\r\\n]+))?\\r?$`, 'gm'),
  );
  if (headings.length !== 1) {
    throw new ChangelogError(
      'CHANGELOG_RELEASE_COUNT_INVALID',
      'Release must exist exactly once',
      { actual: version },
    );
  }
  const following = /^## \[/gm;
  following.lastIndex = headings[0].index + headings[0][0].length;
  const next = following.exec(text);
  const linkStart = text.search(/^\[[^\]]+\]: /m);
  const end = Math.min(next ? next.index : linkStart, linkStart);
  const body = text
    .slice(headings[0].index + headings[0][0].length, end)
    .trim();
  return body;
}

module.exports = Object.freeze({
  ChangelogError,
  extractReleaseNotes,
  parseChangelog,
  promoteUnreleased,
  validateReleaseDate,
});

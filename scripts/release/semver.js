'use strict';

const STRICT_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

class SemVerError extends Error {
  constructor(code, actual) {
    super(`Invalid semantic version: ${JSON.stringify(actual)}`);
    this.name = 'SemVerError';
    this.code = code;
    this.details = Object.freeze({ actual });
  }
}

function parseStrictSemVer(value) {
  if (typeof value !== 'string') {
    throw new SemVerError('SEMVER_TYPE_INVALID', value);
  }
  const match = STRICT_SEMVER_PATTERN.exec(value);
  if (!match) {
    throw new SemVerError('SEMVER_INVALID', value);
  }
  const parsed = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    version: value,
  };
  if (
    !Number.isSafeInteger(parsed.major) ||
    !Number.isSafeInteger(parsed.minor) ||
    !Number.isSafeInteger(parsed.patch)
  ) {
    throw new SemVerError('SEMVER_COMPONENT_OVERFLOW', value);
  }
  return Object.freeze(parsed);
}

function normalizeTag(value) {
  return `v${parseStrictSemVer(value).version}`;
}

function compareSemVer(left, right) {
  const leftVersion = typeof left === 'string' ? parseStrictSemVer(left) : left;
  const rightVersion =
    typeof right === 'string' ? parseStrictSemVer(right) : right;
  for (const key of ['major', 'minor', 'patch']) {
    if (leftVersion[key] < rightVersion[key]) {
      return -1;
    }
    if (leftVersion[key] > rightVersion[key]) {
      return 1;
    }
  }
  return 0;
}

module.exports = Object.freeze({
  compareSemVer,
  normalizeTag,
  parseStrictSemVer,
  SemVerError,
});

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseChangelog,
  promoteUnreleased,
  validateReleaseDate,
} = require('./changelog');
const { compareSemVer, parseStrictSemVer } = require('./semver');

const IOS_BUILD_MAX = 2147483647;
const ANDROID_VERSION_CODE_MAX = 2100000000;
const RELEASE_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'android/app/build.gradle',
  'ios/Bambuddy.xcodeproj/project.pbxproj',
  'CHANGELOG.md',
]);

class ReleaseMetadataError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ReleaseMetadataError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function sourceText(source, sourcePath) {
  if (Buffer.isBuffer(source)) {
    return source.toString('utf8');
  }
  if (typeof source !== 'string') {
    throw new ReleaseMetadataError(
      'METADATA_SOURCE_INVALID',
      'Metadata source must be a string or Buffer',
      { path: sourcePath, actual: typeof source },
    );
  }
  return source;
}

function parseJson(source, sourcePath) {
  const text = sourceText(source, sourcePath);
  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    throw new ReleaseMetadataError('JSON_MALFORMED', 'JSON is malformed', {
      path: sourcePath,
      actual: error.message,
    });
  }
}

function parsePackageMetadata(source, sourcePath = 'package.json') {
  const { value } = parseJson(source, sourcePath);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.version !== 'string'
  ) {
    throw new ReleaseMetadataError(
      'PACKAGE_VERSION_MISSING',
      'Root package version is missing',
      { path: sourcePath, actual: value?.version },
    );
  }
  parseStrictSemVer(value.version);
  return Object.freeze({ version: value.version });
}

function parsePackageLockMetadata(source, sourcePath = 'package-lock.json') {
  const { value } = parseJson(source, sourcePath);
  const rootPackage = value?.packages?.[''];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.version !== 'string' ||
    !rootPackage ||
    typeof rootPackage !== 'object' ||
    typeof rootPackage.version !== 'string'
  ) {
    throw new ReleaseMetadataError(
      'PACKAGE_LOCK_ROOT_VERSION_MISSING',
      'Package lock root versions are missing',
      {
        path: sourcePath,
        actual: {
          version: value?.version,
          packageVersion: rootPackage?.version,
        },
      },
    );
  }
  parseStrictSemVer(value.version);
  parseStrictSemVer(rootPackage.version);
  if (value.version !== rootPackage.version) {
    throw new ReleaseMetadataError(
      'PACKAGE_LOCK_ROOT_VERSION_MISMATCH',
      'Package lock root versions differ',
      {
        path: sourcePath,
        actual: [value.version, rootPackage.version],
      },
    );
  }
  return Object.freeze({ version: value.version });
}

function maskGradle(text) {
  const output = [...text];
  let state = 'code';
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (state === 'code') {
      if (character === '/' && next === '/') {
        output[index] = output[index + 1] = ' ';
        index += 1;
        state = 'line';
      } else if (character === '/' && next === '*') {
        output[index] = output[index + 1] = ' ';
        index += 1;
        state = 'block';
      } else if (character === '"' || character === "'") {
        quote = character;
        state = 'string';
      }
    } else if (state === 'line') {
      if (character !== '\n' && character !== '\r') {
        output[index] = ' ';
      } else {
        state = 'code';
      }
    } else if (state === 'block') {
      if (character === '*' && next === '/') {
        output[index] = output[index + 1] = ' ';
        index += 1;
        state = 'code';
      } else if (character !== '\n' && character !== '\r') {
        output[index] = ' ';
      }
    } else {
      if (character === '\\') {
        output[index] = ' ';
        if (index + 1 < text.length) {
          output[index + 1] = ' ';
          index += 1;
        }
      } else if (character === quote) {
        state = 'code';
      } else if (character !== '\n' && character !== '\r') {
        output[index] = ' ';
      }
    }
  }
  if (state === 'block' || state === 'string') {
    throw new ReleaseMetadataError(
      'ANDROID_SOURCE_MALFORMED',
      'Android Gradle source has an unterminated token',
      { actual: state },
    );
  }
  return output.join('');
}

function findBraceBlock(masked, name, start = 0, end = masked.length) {
  const matches = [];
  const pattern = new RegExp(`\\b${name}\\s*\\{`, 'g');
  pattern.lastIndex = start;
  let match;
  while ((match = pattern.exec(masked)) && match.index < end) {
    const open = masked.indexOf('{', match.index);
    let depth = 1;
    let cursor = open + 1;
    for (; cursor < end && depth; cursor += 1) {
      if (masked[cursor] === '{') {
        depth += 1;
      } else if (masked[cursor] === '}') {
        depth -= 1;
      }
    }
    if (depth) {
      throw new ReleaseMetadataError(
        'ANDROID_SOURCE_MALFORMED',
        `Android ${name} block is unclosed`,
        { actual: name },
      );
    }
    matches.push({ start: match.index, open, end: cursor });
    pattern.lastIndex = cursor;
  }
  if (matches.length !== 1) {
    throw new ReleaseMetadataError(
      'ANDROID_BLOCK_COUNT_INVALID',
      `Expected exactly one Android ${name} block`,
      { actual: matches.length },
    );
  }
  return matches[0];
}

function androidLocations(source, sourcePath) {
  const text = sourceText(source, sourcePath);
  const masked = maskGradle(text);
  const android = findBraceBlock(masked, 'android');
  const defaultConfig = findBraceBlock(
    masked,
    'defaultConfig',
    android.open + 1,
    android.end - 1,
  );
  let depth = 0;
  const direct = [...masked];
  for (
    let index = defaultConfig.open + 1;
    index < defaultConfig.end - 1;
    index += 1
  ) {
    if (masked[index] === '{') {
      depth += 1;
    } else if (masked[index] === '}') {
      depth -= 1;
    } else if (depth > 0 && masked[index] !== '\n' && masked[index] !== '\r') {
      direct[index] = ' ';
    }
  }
  const directText = direct
    .join('')
    .slice(defaultConfig.open + 1, defaultConfig.end - 1);
  const offset = defaultConfig.open + 1;
  const codeMatches = [
    ...directText.matchAll(/\bversionCode\s+([^\s;}\r\n]+)/g),
  ];
  const maskedNameMatches = [
    ...directText.matchAll(/\bversionName\s+"([^"\r\n]*)"/g),
  ];
  if (codeMatches.length !== 1 || maskedNameMatches.length !== 1) {
    throw new ReleaseMetadataError(
      'ANDROID_VERSION_SETTING_COUNT_INVALID',
      'Android defaultConfig must contain one literal versionCode and versionName',
      {
        path: sourcePath,
        actual: {
          versionCode: codeMatches.length,
          versionName: maskedNameMatches.length,
        },
      },
    );
  }
  const versionCode = Number(codeMatches[0][1]);
  const nameMatch = maskedNameMatches[0];
  const nameValueStart =
    offset + nameMatch.index + nameMatch[0].indexOf('"') + 1;
  const nameValueEnd = offset + nameMatch.index + nameMatch[0].lastIndexOf('"');
  const versionName = text.slice(nameValueStart, nameValueEnd);
  if (
    !/^(0|[1-9]\d*)$/.test(codeMatches[0][1]) ||
    !Number.isSafeInteger(versionCode)
  ) {
    throw new ReleaseMetadataError(
      'ANDROID_VERSION_CODE_INVALID',
      'Android versionCode must be an integer literal',
      { path: sourcePath, actual: codeMatches[0][1] },
    );
  }
  validateCounter(
    versionCode,
    ANDROID_VERSION_CODE_MAX,
    'ANDROID_VERSION_CODE_RANGE_INVALID',
    'Android versionCode',
  );
  parseStrictSemVer(versionName);
  return {
    text,
    versionCode,
    versionName,
    codeLocation: {
      start:
        offset +
        codeMatches[0].index +
        codeMatches[0][0].lastIndexOf(codeMatches[0][1]),
      end:
        offset +
        codeMatches[0].index +
        codeMatches[0][0].lastIndexOf(codeMatches[0][1]) +
        codeMatches[0][1].length,
    },
    nameLocation: {
      start: nameValueStart,
      end: nameValueEnd,
    },
  };
}

function parseAndroidMetadata(source, sourcePath = 'android/app/build.gradle') {
  const parsed = androidLocations(source, sourcePath);
  return Object.freeze({
    versionCode: parsed.versionCode,
    versionName: parsed.versionName,
  });
}

function extractPbxObject(text, identifier) {
  const pattern = new RegExp(
    `^[\\t ]*${identifier}(?: /\\*[^\\r\\n]*\\*/)? = \\{`,
    'm',
  );
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }
  const open = text.indexOf('{', match.index);
  let depth = 1;
  let quote = false;
  for (let index = open + 1; index < text.length; index += 1) {
    if (text[index] === '"' && text[index - 1] !== '\\') {
      quote = !quote;
    } else if (!quote && text[index] === '{') {
      depth += 1;
    } else if (!quote && text[index] === '}') {
      depth -= 1;
      if (!depth) {
        return {
          start: match.index,
          open,
          end: index + 1,
          text: text.slice(open + 1, index),
        };
      }
    }
  }
  return null;
}

function extractNamedPbxDictionary(object, name, sourcePath) {
  const matches = [
    ...object.text.matchAll(new RegExp(`\\b${name}\\s*=\\s*\\{`, 'g')),
  ];
  if (matches.length !== 1) {
    throw new ReleaseMetadataError(
      'XCODE_BUILD_SETTINGS_COUNT_INVALID',
      'Target configuration must contain exactly one buildSettings dictionary',
      { path: sourcePath, actual: matches.length },
    );
  }
  const open = object.text.indexOf('{', matches[0].index);
  let depth = 1;
  let quote = false;
  for (let index = open + 1; index < object.text.length; index += 1) {
    if (object.text[index] === '"' && object.text[index - 1] !== '\\') {
      quote = !quote;
    } else if (!quote && object.text[index] === '{') {
      depth += 1;
    } else if (!quote && object.text[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          offset: object.open + 1 + open + 1,
          text: object.text.slice(open + 1, index),
        };
      }
    }
  }
  throw new ReleaseMetadataError(
    'XCODE_BUILD_SETTINGS_COUNT_INVALID',
    'Target buildSettings dictionary is malformed',
    { path: sourcePath, actual: 0 },
  );
}

function xcodeLocations(source, sourcePath) {
  const text = sourceText(source, sourcePath);
  const objectIdentifiers = [
    ...new Set(
      [
        ...text.matchAll(/^[\t ]*([A-F0-9]{24})(?: \/\*[^\r\n]*\*\/)? = \{/gm),
      ].map(match => match[1]),
    ),
  ];
  const nativeTargets = objectIdentifiers
    .map(identifier => ({
      identifier,
      object: extractPbxObject(text, identifier),
    }))
    .filter(
      candidate =>
        candidate.object &&
        /\bisa = PBXNativeTarget;/.test(candidate.object.text) &&
        /\bname = "?Bambuddy"?;/.test(candidate.object.text),
    );
  if (nativeTargets.length !== 1) {
    throw new ReleaseMetadataError(
      'XCODE_TARGET_COUNT_INVALID',
      'Expected exactly one Bambuddy native target',
      { path: sourcePath, actual: nativeTargets.length },
    );
  }
  const listMatch = /\bbuildConfigurationList = ([A-F0-9]{24})\b/.exec(
    nativeTargets[0].object.text,
  );
  const listObject = listMatch && extractPbxObject(text, listMatch[1]);
  if (!listObject) {
    throw new ReleaseMetadataError(
      'XCODE_CONFIGURATION_LIST_INVALID',
      'Bambuddy target configuration list is missing',
      { path: sourcePath, actual: listMatch?.[1] },
    );
  }
  const configurationsMatch = /\bbuildConfigurations = \(([^]*?)\);/.exec(
    listObject.text,
  );
  const identifiers = configurationsMatch
    ? [...configurationsMatch[1].matchAll(/([A-F0-9]{24})/g)].map(
        match => match[1],
      )
    : [];
  const configurations = identifiers.map(identifier => {
    const object = extractPbxObject(text, identifier);
    if (!object || !/\bisa = XCBuildConfiguration;/.test(object.text)) {
      return null;
    }
    const name = /\bname = "?([^";]+)"?;/.exec(object.text)?.[1];
    const buildSettings = extractNamedPbxDictionary(
      object,
      'buildSettings',
      sourcePath,
    );
    const marketing = [
      ...buildSettings.text.matchAll(/\bMARKETING_VERSION = ([^;\s]+);/g),
    ];
    const build = [
      ...buildSettings.text.matchAll(
        /\bCURRENT_PROJECT_VERSION = ([^;\s]+);/g,
      ),
    ];
    return {
      identifier,
      name,
      object,
      buildSettings,
      marketing,
      build,
    };
  });
  if (configurations.some(configuration => !configuration)) {
    throw new ReleaseMetadataError(
      'XCODE_CONFIGURATION_INVALID',
      'Target configuration reference is malformed',
      { path: sourcePath, actual: identifiers },
    );
  }
  const selected = ['Debug', 'Release'].map(name => {
    const matches = configurations.filter(
      configuration => configuration.name === name,
    );
    if (
      matches.length !== 1 ||
      matches[0].marketing.length !== 1 ||
      matches[0].build.length !== 1
    ) {
      throw new ReleaseMetadataError(
        'XCODE_VERSION_SETTING_COUNT_INVALID',
        `Target ${name} must have exact version settings`,
        {
          path: sourcePath,
          actual: {
            configuration: name,
            matches: matches.length,
            marketing: matches[0]?.marketing.map(match => match[1]) ?? [],
            build: matches[0]?.build.map(match => match[1]) ?? [],
          },
        },
      );
    }
    return matches[0];
  });
  const values = selected.map(configuration => {
    const marketing = configuration.marketing[0];
    const buildSetting = configuration.build[0];
    parseStrictSemVer(marketing[1]);
    const build = Number(buildSetting[1]);
    if (
      !/^(0|[1-9]\d*)$/.test(buildSetting[1]) ||
      !Number.isSafeInteger(build)
    ) {
      throw new ReleaseMetadataError(
        'XCODE_BUILD_INVALID',
        'Xcode build number must be an integer literal',
        { path: sourcePath, actual: buildSetting[1] },
      );
    }
    validateCounter(
      build,
      IOS_BUILD_MAX,
      'IOS_BUILD_RANGE_INVALID',
      'iOS build',
    );
    return {
      name: configuration.name,
      marketingVersion: marketing[1],
      build,
      marketingLocation: {
        start:
          configuration.buildSettings.offset +
          marketing.index +
          marketing[0].lastIndexOf(marketing[1]),
        end:
          configuration.buildSettings.offset +
          marketing.index +
          marketing[0].lastIndexOf(marketing[1]) +
          marketing[1].length,
      },
      buildLocation: {
        start:
          configuration.buildSettings.offset +
          buildSetting.index +
          buildSetting[0].lastIndexOf(buildSetting[1]),
        end:
          configuration.buildSettings.offset +
          buildSetting.index +
          buildSetting[0].lastIndexOf(buildSetting[1]) +
          buildSetting[1].length,
      },
    };
  });
  return { text, values };
}

function parseXcodeMetadata(
  source,
  sourcePath = 'ios/Bambuddy.xcodeproj/project.pbxproj',
) {
  const { values } = xcodeLocations(source, sourcePath);
  return Object.freeze({
    configurations: Object.freeze(
      values.map(value =>
        Object.freeze({
          name: value.name,
          marketingVersion: value.marketingVersion,
          build: value.build,
        }),
      ),
    ),
    marketingVersion: values[0].marketingVersion,
    build: values[0].build,
  });
}

function replaceLocations(text, replacements) {
  let rendered = text;
  for (const replacement of [...replacements].sort(
    (left, right) => right.start - left.start,
  )) {
    rendered =
      rendered.slice(0, replacement.start) +
      replacement.value +
      rendered.slice(replacement.end);
  }
  return rendered;
}

function preserveSourceType(source, rendered) {
  return Buffer.isBuffer(source) ? Buffer.from(rendered) : rendered;
}

function jsonStringEnd(text, start, sourcePath) {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    if (!escaped && text[index] === '"') {
      return index + 1;
    }
    if (!escaped && text[index] === '\\') {
      escaped = true;
    } else {
      escaped = false;
    }
  }
  throw new ReleaseMetadataError('JSON_MALFORMED', 'JSON is malformed', {
    path: sourcePath,
    actual: 'Unterminated JSON string',
  });
}

function locateJsonStringValues(text, sourcePath, wantedPaths) {
  let cursor = 0;
  const found = new Map();
  const whitespace = () => {
    while (/\s/.test(text[cursor] ?? '')) cursor += 1;
  };
  const value = currentPath => {
    whitespace();
    if (text[cursor] === '"') {
      const end = jsonStringEnd(text, cursor, sourcePath);
      const key = currentPath.join('.');
      if (wantedPaths.has(key)) {
        const locations = found.get(key) ?? [];
        locations.push({ start: cursor + 1, end: end - 1 });
        found.set(key, locations);
      }
      cursor = end;
      return;
    }
    if (text[cursor] === '{') {
      object(currentPath);
      return;
    }
    if (text[cursor] === '[') {
      array(currentPath);
      return;
    }
    const primitive = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(
      text.slice(cursor),
    );
    if (!primitive) throw new SyntaxError('Invalid JSON value');
    cursor += primitive[0].length;
  };
  const object = currentPath => {
    cursor += 1;
    whitespace();
    if (text[cursor] === '}') {
      cursor += 1;
      return;
    }
    while (cursor < text.length) {
      whitespace();
      const end = jsonStringEnd(text, cursor, sourcePath);
      const key = JSON.parse(text.slice(cursor, end));
      cursor = end;
      whitespace();
      if (text[cursor] !== ':') throw new SyntaxError('Missing colon');
      cursor += 1;
      value([...currentPath, key]);
      whitespace();
      if (text[cursor] === '}') {
        cursor += 1;
        return;
      }
      if (text[cursor] !== ',') throw new SyntaxError('Missing comma');
      cursor += 1;
    }
  };
  const array = currentPath => {
    cursor += 1;
    whitespace();
    let index = 0;
    if (text[cursor] === ']') {
      cursor += 1;
      return;
    }
    while (cursor < text.length) {
      value([...currentPath, String(index)]);
      index += 1;
      whitespace();
      if (text[cursor] === ']') {
        cursor += 1;
        return;
      }
      if (text[cursor] !== ',') throw new SyntaxError('Missing comma');
      cursor += 1;
    }
  };
  value([]);
  return found;
}

function renderJsonStringSpans(source, sourcePath, paths, version) {
  const { text } = parseJson(source, sourcePath);
  const found = locateJsonStringValues(text, sourcePath, new Set(paths));
  const replacements = paths.map(pathName => {
    const matches = found.get(pathName) ?? [];
    if (matches.length !== 1) {
      throw new ReleaseMetadataError(
        'JSON_VERSION_SPAN_INVALID',
        'Expected exactly one JSON version string',
        { path: `${sourcePath}:${pathName}`, actual: matches.length },
      );
    }
    return { ...matches[0], value: version };
  });
  return preserveSourceType(source, replaceLocations(text, replacements));
}

function renderPackageVersion(source, version) {
  parseStrictSemVer(version);
  parsePackageMetadata(source);
  return renderJsonStringSpans(source, 'package.json', ['version'], version);
}

function renderPackageLockVersion(source, version) {
  parseStrictSemVer(version);
  parsePackageLockMetadata(source);
  return renderJsonStringSpans(
    source,
    'package-lock.json',
    ['version', 'packages..version'],
    version,
  );
}

function validateCounter(value, maximum, code, name) {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new ReleaseMetadataError(
      code,
      `${name} is outside the supported range`,
      {
        expected: `integer 1..${maximum}`,
        actual: value,
      },
    );
  }
}

function renderAndroidVersion(source, version, versionCode) {
  parseStrictSemVer(version);
  validateCounter(
    versionCode,
    ANDROID_VERSION_CODE_MAX,
    'ANDROID_VERSION_CODE_RANGE_INVALID',
    'Android versionCode',
  );
  const parsed = androidLocations(source, 'android/app/build.gradle');
  return preserveSourceType(
    source,
    replaceLocations(parsed.text, [
      { ...parsed.nameLocation, value: version },
      { ...parsed.codeLocation, value: String(versionCode) },
    ]),
  );
}

function renderXcodeVersion(source, version, build) {
  parseStrictSemVer(version);
  validateCounter(build, IOS_BUILD_MAX, 'IOS_BUILD_RANGE_INVALID', 'iOS build');
  const parsed = xcodeLocations(
    source,
    'ios/Bambuddy.xcodeproj/project.pbxproj',
  );
  return preserveSourceType(
    source,
    replaceLocations(
      parsed.text,
      parsed.values.flatMap(value => [
        { ...value.marketingLocation, value: version },
        { ...value.buildLocation, value: String(build) },
      ]),
    ),
  );
}

function metadataFromBuffers(buffers, options = {}) {
  const packageMetadata = parsePackageMetadata(buffers['package.json']);
  const packageLockMetadata = parsePackageLockMetadata(
    buffers['package-lock.json'],
  );
  const android = parseAndroidMetadata(buffers['android/app/build.gradle']);
  const xcode = parseXcodeMetadata(
    buffers['ios/Bambuddy.xcodeproj/project.pbxproj'],
  );
  const changelog = parseChangelog(buffers['CHANGELOG.md'], {
    allowEmptyUnreleased: options.allowEmptyUnreleased,
  });
  const versions = {
    package: packageMetadata.version,
    packageLock: packageLockMetadata.version,
    android: android.versionName,
    xcodeDebug: xcode.configurations[0].marketingVersion,
    xcodeRelease: xcode.configurations[1].marketingVersion,
    changelog: changelog.priorVersion,
  };
  const uniqueVersions = new Set(Object.values(versions));
  const iosBuilds = xcode.configurations.map(
    configuration => configuration.build,
  );
  if (uniqueVersions.size !== 1 || new Set(iosBuilds).size !== 1) {
    throw new ReleaseMetadataError(
      'RELEASE_METADATA_INCONSISTENT',
      'Release metadata values are inconsistent',
      {
        actual: {
          versions,
          changelog: {
            releaseHeading: {
              path: 'CHANGELOG.md:releaseHeading',
              value:
                changelog.headings.find(
                  heading => heading.name !== 'Unreleased',
                )?.name ?? null,
            },
            unreleasedComparison: {
              path: 'CHANGELOG.md:links.Unreleased',
              value: changelog.priorVersion,
              url:
                changelog.links.find(link => link.name === 'Unreleased')
                  ?.url ?? null,
            },
            releaseComparison: {
              path: `CHANGELOG.md:links.${changelog.priorVersion}`,
              value:
                changelog.links.find(
                  link => link.name === changelog.priorVersion,
                )?.name ?? null,
              url:
                changelog.links.find(
                  link => link.name === changelog.priorVersion,
                )?.url ?? null,
            },
          },
          iosBuilds,
          androidVersionCode: android.versionCode,
        },
      },
    );
  }
  return Object.freeze({
    version: packageMetadata.version,
    iosBuild: xcode.build,
    androidVersionCode: android.versionCode,
    changelog,
  });
}

function secureFiles(rootDirectory, fileSystem = fs) {
  const root = fileSystem.realpathSync(rootDirectory);
  const seen = new Set();
  const files = {};
  for (const relativePath of RELEASE_PATHS) {
    const target = path.resolve(root, relativePath);
    if (
      path.relative(root, target).startsWith('..') ||
      path.isAbsolute(path.relative(root, target))
    ) {
      throw new ReleaseMetadataError(
        'RELEASE_PATH_OUTSIDE_ROOT',
        'Release path escapes root',
        {
          path: relativePath,
        },
      );
    }
    const stat = fileSystem.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new ReleaseMetadataError(
        'RELEASE_FILE_UNSAFE',
        'Release source must be a regular non-symlink file',
        {
          path: relativePath,
        },
      );
    }
    const real = fileSystem.realpathSync(target);
    if (real !== target) {
      throw new ReleaseMetadataError(
        'RELEASE_FILE_UNSAFE',
        'Release source resolves unexpectedly',
        {
          path: relativePath,
          actual: real,
        },
      );
    }
    const inode = `${stat.dev}:${stat.ino}`;
    if (seen.has(inode)) {
      throw new ReleaseMetadataError(
        'RELEASE_FILE_DUPLICATE_INODE',
        'Release files share an inode',
        {
          path: relativePath,
          actual: inode,
        },
      );
    }
    seen.add(inode);
    const buffer = fileSystem.readFileSync(target);
    files[relativePath] = {
      target,
      stat,
      buffer,
      hash: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
  }
  return { root, files };
}

function readReleaseMetadata(rootDirectory) {
  const secured = secureFiles(rootDirectory);
  return metadataFromBuffers(
    Object.fromEntries(
      RELEASE_PATHS.map(relativePath => [
        relativePath,
        secured.files[relativePath].buffer,
      ]),
    ),
  );
}

function planReleaseMetadataUpdate(rootDirectory, update) {
  const version = update?.version;
  parseStrictSemVer(version);
  validateReleaseDate(update?.date);
  validateCounter(
    update?.iosBuild,
    IOS_BUILD_MAX,
    'IOS_BUILD_RANGE_INVALID',
    'iOS build',
  );
  validateCounter(
    update?.androidVersionCode,
    ANDROID_VERSION_CODE_MAX,
    'ANDROID_VERSION_CODE_RANGE_INVALID',
    'Android versionCode',
  );
  const secured = secureFiles(rootDirectory);
  const currentBuffers = Object.fromEntries(
    RELEASE_PATHS.map(relativePath => [
      relativePath,
      secured.files[relativePath].buffer,
    ]),
  );
  const current = metadataFromBuffers(currentBuffers);
  if (compareSemVer(version, current.version) <= 0) {
    throw new ReleaseMetadataError(
      'RELEASE_VERSION_NOT_GREATER',
      'Release version must be greater than current version',
      { expected: `>${current.version}`, actual: version },
    );
  }
  const planned = {
    'package.json': renderPackageVersion(
      currentBuffers['package.json'],
      version,
    ),
    'package-lock.json': renderPackageLockVersion(
      currentBuffers['package-lock.json'],
      version,
    ),
    'android/app/build.gradle': renderAndroidVersion(
      currentBuffers['android/app/build.gradle'],
      version,
      update.androidVersionCode,
    ),
    'ios/Bambuddy.xcodeproj/project.pbxproj': renderXcodeVersion(
      currentBuffers['ios/Bambuddy.xcodeproj/project.pbxproj'],
      version,
      update.iosBuild,
    ),
    'CHANGELOG.md': promoteUnreleased(
      currentBuffers['CHANGELOG.md'],
      version,
      update.date,
    ),
  };
  const reparsed = metadataFromBuffers(planned, { allowEmptyUnreleased: true });
  if (
    reparsed.version !== version ||
    reparsed.iosBuild !== update.iosBuild ||
    reparsed.androidVersionCode !== update.androidVersionCode
  ) {
    throw new ReleaseMetadataError(
      'RELEASE_PLAN_VALIDATION_FAILED',
      'Rendered release metadata failed validation',
      {
        expected: update,
        actual: reparsed,
      },
    );
  }
  return Object.freeze({
    files: Object.freeze(
      Object.fromEntries(
        RELEASE_PATHS.map(relativePath => [
          relativePath,
          Buffer.from(planned[relativePath]),
        ]),
      ),
    ),
    current,
    next: reparsed,
  });
}

function exclusiveWrite(fileSystem, filename, buffer) {
  const descriptor = fileSystem.openSync(filename, 'wx', 0o600);
  try {
    fileSystem.writeFileSync(descriptor, buffer);
    fileSystem.fsyncSync(descriptor);
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

function assertUnchanged(fileSystem, relativePath, file) {
  let descriptor;
  let actual = null;
  try {
    const pathStat = fileSystem.lstatSync(file.target);
    const constants = fileSystem.constants ?? fs.constants;
    const noFollow = constants.O_NOFOLLOW ?? 0;
    descriptor = fileSystem.openSync(
      file.target,
      constants.O_RDONLY | noFollow,
    );
    const beforeRead = fileSystem.fstatSync(descriptor);
    const buffer = fileSystem.readFileSync(descriptor);
    const afterRead = fileSystem.fstatSync(descriptor);
    actual = {
      pathStat,
      beforeRead,
      afterRead,
      hash: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
  } catch (error) {
    actual = { error: error.code ?? error.message };
  } finally {
    if (descriptor !== undefined) {
      fileSystem.closeSync(descriptor);
    }
  }
  const unchangedStat = stat =>
    stat?.isFile() &&
    !stat.isSymbolicLink() &&
    stat.dev === file.stat.dev &&
    stat.ino === file.stat.ino &&
    stat.size === file.stat.size &&
    stat.mtimeMs === file.stat.mtimeMs;
  if (
    !actual.pathStat ||
    !unchangedStat(actual.pathStat) ||
    !unchangedStat(actual.beforeRead) ||
    !unchangedStat(actual.afterRead) ||
    actual.hash !== file.hash
  ) {
    throw new ReleaseMetadataError(
      'RELEASE_FILE_CHANGED',
      'Release source changed before commit',
      {
        path: relativePath,
        expected: file.hash,
        actual: actual.hash ?? actual.error,
      },
    );
  }
}

function applyReleaseMetadataUpdate(rootDirectory, update, options = {}) {
  const fileSystem = options.fileSystem ?? fs;
  const secured = secureFiles(rootDirectory, fileSystem);
  const plan = planReleaseMetadataUpdate(rootDirectory, update);
  const nonce = crypto.randomBytes(16).toString('hex');
  const transaction = RELEASE_PATHS.map((relativePath, index) => {
    const file = secured.files[relativePath];
    return {
      ...file,
      relativePath,
      stage: path.join(
        path.dirname(file.target),
        `.${path.basename(file.target)}.${nonce}.${index}.stage`,
      ),
      backup: path.join(
        path.dirname(file.target),
        `.${path.basename(file.target)}.${nonce}.${index}.backup`,
      ),
      state: 'initial',
    };
  });
  try {
    for (const entry of transaction) {
      exclusiveWrite(fileSystem, entry.stage, plan.files[entry.relativePath]);
      exclusiveWrite(fileSystem, entry.backup, entry.buffer);
    }
    if (typeof options.beforeCommit === 'function') {
      options.beforeCommit();
    }
    for (const entry of transaction) {
      assertUnchanged(fileSystem, entry.relativePath, entry);
    }
    for (const [index, entry] of transaction.entries()) {
      if (typeof options.beforeCommitEntry === 'function') {
        options.beforeCommitEntry(entry.relativePath, index);
      }
      assertUnchanged(fileSystem, entry.relativePath, entry);
      fileSystem.renameSync(entry.stage, entry.target);
      entry.state = 'replaced';
    }
  } catch (error) {
    const rollbackFailures = [];
    for (const entry of [...transaction].reverse()) {
      try {
        if (fileSystem.existsSync(entry.backup)) {
          fileSystem.renameSync(entry.backup, entry.target);
        }
        const restored = fileSystem.readFileSync(entry.target);
        if (!restored.equals(entry.buffer)) {
          rollbackFailures.push(entry.relativePath);
        }
      } catch (rollbackError) {
        rollbackFailures.push(
          `${entry.relativePath}: ${rollbackError.message}`,
        );
      }
    }
    if (rollbackFailures.length) {
      throw new ReleaseMetadataError(
        'RELEASE_ROLLBACK_FAILED',
        'Release rollback could not restore every file',
        {
          actual: rollbackFailures,
          cause: error.message,
        },
      );
    }
    throw error;
  } finally {
    for (const entry of transaction) {
      for (const temporary of [
        entry.stage,
        entry.backup,
      ]) {
        if (fileSystem.existsSync(temporary)) {
          fileSystem.unlinkSync(temporary);
        }
      }
    }
  }
  return plan.next;
}

module.exports = Object.freeze({
  ANDROID_VERSION_CODE_MAX,
  IOS_BUILD_MAX,
  ReleaseMetadataError,
  applyReleaseMetadataUpdate,
  parseAndroidMetadata,
  parsePackageLockMetadata,
  parsePackageMetadata,
  parseXcodeMetadata,
  planReleaseMetadataUpdate,
  readReleaseMetadata,
  renderAndroidVersion,
  renderPackageLockVersion,
  renderPackageVersion,
  renderXcodeVersion,
});

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  ANDROID_VERSION_CODE_MAX,
  IOS_BUILD_MAX,
} = require('./metadata');
const { normalizeTag, parseStrictSemVer } = require('./semver');

const TOP_LEVEL_KEYS = Object.freeze([
  'tag',
  'commit',
  'marketingVersion',
  'iosBuild',
  'androidVersionCode',
  'artifacts',
  'workflow',
]);
const ARTIFACT_KEYS = Object.freeze(['ios', 'android']);
const ARTIFACT_VALUE_KEYS = Object.freeze(['filename', 'sha256']);
const WORKFLOW_KEYS = Object.freeze(['name', 'ref', 'runId', 'runAttempt']);

class ReleaseManifestError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ReleaseManifestError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function stableObjectKeys(value, expected, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReleaseManifestError(
      'MANIFEST_SCHEMA_INVALID',
      'Manifest object is missing',
      { path: location, expected, actual: value },
    );
  }
  const actual = Object.keys(value);
  const missing = expected.filter(key => !actual.includes(key));
  const extra = actual.filter(key => !expected.includes(key));
  if (missing.length || extra.length) {
    throw new ReleaseManifestError(
      'MANIFEST_SCHEMA_CLOSED',
      'Manifest has missing or extra fields',
      { path: location, expected, actual, missing, extra },
    );
  }
}

function artifactChanged(filename, expected, actual) {
  return new ReleaseManifestError(
    'MANIFEST_ARTIFACT_CHANGED',
    'Artifact changed while its checksum was computed',
    {
      path: filename,
      expected,
      actual,
    },
  );
}

function statIdentity(stat) {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    mode: stat.mode,
  };
}

function sameArtifactStat(left, right) {
  return (
    left.isFile() &&
    right.isFile() &&
    !left.isSymbolicLink() &&
    !right.isSymbolicLink() &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.mode === right.mode
  );
}

function computeSha256(filename, options = {}, expectedStat) {
  return new Promise((resolve, reject) => {
    const resolved = path.resolve(filename);
    let descriptor;
    let before;
    try {
      const pathStat = fs.lstatSync(resolved);
      const noFollow = fs.constants.O_NOFOLLOW ?? 0;
      descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | noFollow);
      before = fs.fstatSync(descriptor);
      if (
        (expectedStat && !sameArtifactStat(expectedStat, pathStat)) ||
        (expectedStat && !sameArtifactStat(expectedStat, before)) ||
        !sameArtifactStat(pathStat, before)
      ) {
        throw artifactChanged(
          filename,
          statIdentity(expectedStat ?? pathStat),
          {
            path: statIdentity(pathStat),
            descriptor: statIdentity(before),
          },
        );
      }
      options.afterOpen?.(resolved);
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      reject(
        error instanceof ReleaseManifestError
          ? error
          : new ReleaseManifestError(
              'MANIFEST_ARTIFACT_READ_FAILED',
              'Artifact checksum could not be computed',
              { path: filename, actual: error.message },
            ),
      );
      return;
    }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(resolved, {
      autoClose: false,
      fd: descriptor,
      start: 0,
    });
    const close = () => {
      if (descriptor !== undefined) {
        fs.closeSync(descriptor);
        descriptor = undefined;
      }
    };
    stream.on('error', error => {
      close();
      reject(
        new ReleaseManifestError(
          'MANIFEST_ARTIFACT_READ_FAILED',
          'Artifact checksum could not be computed',
          { path: filename, actual: error.message },
        ),
      );
    });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => {
      try {
        options.beforePostRead?.(resolved);
        const descriptorStat = fs.fstatSync(descriptor);
        const pathStat = fs.lstatSync(resolved);
        if (
          (expectedStat && !sameArtifactStat(expectedStat, descriptorStat)) ||
          (expectedStat && !sameArtifactStat(expectedStat, pathStat)) ||
          !sameArtifactStat(before, descriptorStat) ||
          !sameArtifactStat(before, pathStat)
        ) {
          throw artifactChanged(
            filename,
            statIdentity(expectedStat ?? before),
            {
              descriptor: statIdentity(descriptorStat),
              path: statIdentity(pathStat),
            },
          );
        }
        const digest = hash.digest('hex');
        close();
        resolve(digest);
      } catch (error) {
        close();
        reject(
          error instanceof ReleaseManifestError
            ? error
            : new ReleaseManifestError(
                'MANIFEST_ARTIFACT_READ_FAILED',
                'Artifact checksum could not be computed',
                { path: filename, actual: error.message },
              ),
        );
      }
    });
  });
}

function validateInteger(value, name, maximum) {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new ReleaseManifestError(
      'MANIFEST_COUNTER_INVALID',
      `${name} is outside the supported range`,
      { path: name, expected: `integer 1..${maximum}`, actual: value },
    );
  }
}

function validateShape(manifest) {
  stableObjectKeys(manifest, TOP_LEVEL_KEYS, '$');
  stableObjectKeys(manifest.artifacts, ARTIFACT_KEYS, '$.artifacts');
  stableObjectKeys(manifest.workflow, WORKFLOW_KEYS, '$.workflow');
  for (const platform of ARTIFACT_KEYS) {
    stableObjectKeys(
      manifest.artifacts[platform],
      ARTIFACT_VALUE_KEYS,
      `$.artifacts.${platform}`,
    );
  }
  parseStrictSemVer(manifest.marketingVersion);
  if (manifest.tag !== normalizeTag(manifest.marketingVersion)) {
    throw new ReleaseManifestError(
      'MANIFEST_TAG_MISMATCH',
      'Manifest tag does not match marketing version',
      {
        path: 'tag',
        expected: normalizeTag(manifest.marketingVersion),
        actual: manifest.tag,
      },
    );
  }
  if (
    typeof manifest.commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(manifest.commit)
  ) {
    throw new ReleaseManifestError(
      'MANIFEST_COMMIT_INVALID',
      'Manifest commit must be 40 lowercase hexadecimal characters',
      { path: 'commit', expected: '40 lowercase hex', actual: manifest.commit },
    );
  }
  validateInteger(manifest.iosBuild, 'iosBuild', IOS_BUILD_MAX);
  validateInteger(
    manifest.androidVersionCode,
    'androidVersionCode',
    ANDROID_VERSION_CODE_MAX,
  );
  const extensions = { ios: '.ipa', android: '.aab' };
  for (const platform of ARTIFACT_KEYS) {
    const artifact = manifest.artifacts[platform];
    if (
      typeof artifact.filename !== 'string' ||
      path.basename(artifact.filename) !== artifact.filename ||
      !artifact.filename.endsWith(extensions[platform])
    ) {
      throw new ReleaseManifestError(
        'MANIFEST_ARTIFACT_FILENAME_INVALID',
        `Manifest ${platform} artifact filename is invalid`,
        {
          path: `artifacts.${platform}.filename`,
          expected: `basename ending in ${extensions[platform]}`,
          actual: artifact.filename,
        },
      );
    }
    if (
      typeof artifact.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    ) {
      throw new ReleaseManifestError(
        'MANIFEST_CHECKSUM_INVALID',
        `Manifest ${platform} checksum is invalid`,
        {
          path: `artifacts.${platform}.sha256`,
          expected: '64 lowercase hex',
          actual: artifact.sha256,
        },
      );
    }
  }
  for (const key of ['name', 'ref', 'runId', 'runAttempt']) {
    if (
      (key === 'runId' || key === 'runAttempt') &&
      (!Number.isInteger(manifest.workflow[key]) || manifest.workflow[key] <= 0)
    ) {
      throw new ReleaseManifestError(
        'MANIFEST_WORKFLOW_INVALID',
        `Workflow ${key} is invalid`,
        { path: `workflow.${key}`, actual: manifest.workflow[key] },
      );
    }
    if (
      (key === 'name' || key === 'ref') &&
      (typeof manifest.workflow[key] !== 'string' ||
        !manifest.workflow[key].length)
    ) {
      throw new ReleaseManifestError(
        'MANIFEST_WORKFLOW_INVALID',
        `Workflow ${key} is invalid`,
        { path: `workflow.${key}`, actual: manifest.workflow[key] },
      );
    }
  }
  if (manifest.artifacts.ios.filename === manifest.artifacts.android.filename) {
    throw new ReleaseManifestError(
      'MANIFEST_ARTIFACT_DUPLICATE',
      'Artifact filenames must be distinct',
      { actual: manifest.artifacts.ios.filename },
    );
  }
  return manifest;
}

function serializeReleaseManifest(manifest) {
  validateShape(manifest);
  const ordered = {
    tag: manifest.tag,
    commit: manifest.commit,
    marketingVersion: manifest.marketingVersion,
    iosBuild: manifest.iosBuild,
    androidVersionCode: manifest.androidVersionCode,
    artifacts: {
      ios: {
        filename: manifest.artifacts.ios.filename,
        sha256: manifest.artifacts.ios.sha256,
      },
      android: {
        filename: manifest.artifacts.android.filename,
        sha256: manifest.artifacts.android.sha256,
      },
    },
    workflow: {
      name: manifest.workflow.name,
      ref: manifest.workflow.ref,
      runId: manifest.workflow.runId,
      runAttempt: manifest.workflow.runAttempt,
    },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function parseReleaseManifest(source) {
  const text = Buffer.isBuffer(source) ? source.toString('utf8') : source;
  if (typeof text !== 'string') {
    throw new ReleaseManifestError(
      'MANIFEST_SOURCE_INVALID',
      'Manifest source must be text',
      { actual: typeof text },
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new ReleaseManifestError(
      'MANIFEST_JSON_MALFORMED',
      'Manifest JSON is malformed',
      { actual: error.message },
    );
  }
  validateShape(manifest);
  return Object.freeze({
    ...manifest,
    artifacts: Object.freeze({
      ios: Object.freeze({ ...manifest.artifacts.ios }),
      android: Object.freeze({ ...manifest.artifacts.android }),
    }),
    workflow: Object.freeze({ ...manifest.workflow }),
  });
}

function inspectArtifact(filename, expectedExtension) {
  const resolved = path.resolve(filename);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    throw new ReleaseManifestError(
      'MANIFEST_ARTIFACT_READ_FAILED',
      'Artifact metadata could not be read',
      { path: filename, actual: error.code },
    );
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    path.extname(resolved) !== expectedExtension
  ) {
    throw new ReleaseManifestError(
      'MANIFEST_ARTIFACT_UNSAFE',
      'Artifact must be a regular non-symlink file',
      { path: filename, expected: expectedExtension, actual: stat.mode },
    );
  }
  return { resolved, stat };
}

async function createReleaseManifest(input, options = {}) {
  const ios = inspectArtifact(input.iosArtifact, '.ipa');
  const android = inspectArtifact(input.androidArtifact, '.aab');
  if (
    ios.resolved === android.resolved ||
    (ios.stat.dev === android.stat.dev && ios.stat.ino === android.stat.ino)
  ) {
    throw new ReleaseManifestError(
      'MANIFEST_ARTIFACT_DUPLICATE',
      'Artifacts must be distinct files',
      { actual: [ios.resolved, android.resolved] },
    );
  }
  const [iosChecksum, androidChecksum] = await Promise.all([
    computeSha256(ios.resolved, options.artifactHooks?.ios, ios.stat),
    computeSha256(
      android.resolved,
      options.artifactHooks?.android,
      android.stat,
    ),
  ]);
  return parseReleaseManifest(
    serializeReleaseManifest({
      tag: input.tag,
      commit: input.commit,
      marketingVersion: input.marketingVersion,
      iosBuild: input.iosBuild,
      androidVersionCode: input.androidVersionCode,
      artifacts: {
        ios: { filename: path.basename(ios.resolved), sha256: iosChecksum },
        android: {
          filename: path.basename(android.resolved),
          sha256: androidChecksum,
        },
      },
      workflow: { ...input.workflow },
    }),
  );
}

function assertIdentity(actual, expected, pathName) {
  if (actual !== expected) {
    throw new ReleaseManifestError(
      'MANIFEST_IDENTITY_MISMATCH',
      'Manifest identity does not match expected value',
      { path: pathName, expected, actual },
    );
  }
}

async function validateReleaseManifest(manifestSource, expected, options = {}) {
  const manifest =
    typeof manifestSource === 'string' || Buffer.isBuffer(manifestSource)
      ? parseReleaseManifest(manifestSource)
      : parseReleaseManifest(serializeReleaseManifest(manifestSource));
  for (const key of [
    'tag',
    'commit',
    'marketingVersion',
    'iosBuild',
    'androidVersionCode',
  ]) {
    assertIdentity(manifest[key], expected[key], key);
  }
  for (const key of WORKFLOW_KEYS) {
    assertIdentity(
      manifest.workflow[key],
      expected.workflow[key],
      `workflow.${key}`,
    );
  }
  const artifacts = {
    ios: inspectArtifact(expected.iosArtifact, '.ipa'),
    android: inspectArtifact(expected.androidArtifact, '.aab'),
  };
  if (
    artifacts.ios.stat.dev === artifacts.android.stat.dev &&
    artifacts.ios.stat.ino === artifacts.android.stat.ino
  ) {
    throw new ReleaseManifestError(
      'MANIFEST_ARTIFACT_DUPLICATE',
      'Artifacts must be distinct files',
    );
  }
  for (const platform of ARTIFACT_KEYS) {
    const artifact = artifacts[platform];
    assertIdentity(
      manifest.artifacts[platform].filename,
      path.basename(artifact.resolved),
      `artifacts.${platform}.filename`,
    );
    const checksum = await computeSha256(
      artifact.resolved,
      options.artifactHooks?.[platform],
      artifact.stat,
    );
    assertIdentity(
      manifest.artifacts[platform].sha256,
      checksum,
      `artifacts.${platform}.sha256`,
    );
  }
  return manifest;
}

module.exports = Object.freeze({
  ReleaseManifestError,
  computeSha256,
  createReleaseManifest,
  parseReleaseManifest,
  serializeReleaseManifest,
  validateReleaseManifest,
});

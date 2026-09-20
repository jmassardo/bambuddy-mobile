'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ReleaseManifestError,
  computeSha256,
  createReleaseManifest,
  parseReleaseManifest,
  serializeReleaseManifest,
  validateReleaseManifest,
} = require('../../scripts/release/manifest');
const {
  ANDROID_VERSION_CODE_MAX,
  IOS_BUILD_MAX,
} = require('../../scripts/release/metadata');

const identity = {
  tag: 'v1.2.3',
  commit: 'a'.repeat(40),
  marketingVersion: '1.2.3',
  iosBuild: 12,
  androidVersionCode: 12,
  workflow: {
    name: 'Release',
    ref: 'refs/tags/v1.2.3',
    runId: 123,
    runAttempt: 1,
  },
};

function artifacts() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bambuddy-manifest-'));
  const iosArtifact = path.join(root, 'Bambuddy.ipa');
  const androidArtifact = path.join(root, 'Bambuddy.aab');
  fs.writeFileSync(iosArtifact, 'ios artifact');
  fs.writeFileSync(androidArtifact, 'android artifact');
  return { root, iosArtifact, androidArtifact };
}

describe('release manifest', () => {
  test('streams checksums and deterministically serializes the closed schema', async () => {
    const files = artifacts();
    expect(await computeSha256(files.iosArtifact)).toMatch(/^[a-f0-9]{64}$/);
    const manifest = await createReleaseManifest({ ...identity, ...files });
    const first = serializeReleaseManifest(manifest);
    expect(first).toBe(serializeReleaseManifest(parseReleaseManifest(first)));
    expect(parseReleaseManifest(Buffer.from(first))).toEqual(manifest);
    expect(first.endsWith('\n')).toBe(true);
    expect(first).toContain('\n  "tag": "v1.2.3"');
    await expect(
      validateReleaseManifest(first, { ...identity, ...files }),
    ).resolves.toEqual(manifest);
  });

  test.each([
    ['missing', value => delete value.commit, 'MANIFEST_SCHEMA_CLOSED'],
    ['extra', value => (value.extra = true), 'MANIFEST_SCHEMA_CLOSED'],
    ['tag identity', value => (value.tag = 'v1.2.4'), 'MANIFEST_TAG_MISMATCH'],
    [
      'commit',
      value => (value.commit = 'A'.repeat(40)),
      'MANIFEST_COMMIT_INVALID',
    ],
    [
      'checksum',
      value => (value.artifacts.ios.sha256 = 'A'.repeat(64)),
      'MANIFEST_CHECKSUM_INVALID',
    ],
    [
      'filename',
      value => (value.artifacts.ios.filename = '../x.ipa'),
      'MANIFEST_ARTIFACT_FILENAME_INVALID',
    ],
  ])('rejects %s schema violation', async (_name, mutate, code) => {
    const files = artifacts();
    const manifest = await createReleaseManifest({ ...identity, ...files });
    const value = JSON.parse(serializeReleaseManifest(manifest));
    mutate(value);
    expect(() => parseReleaseManifest(JSON.stringify(value))).toThrow(
      expect.objectContaining({ code }),
    );
  });

  test('rejects expected identity and checksum mismatches with safe diagnostics', async () => {
    const files = artifacts();
    const manifest = await createReleaseManifest({ ...identity, ...files });
    await expect(
      validateReleaseManifest(manifest, {
        ...identity,
        ...files,
        commit: 'b'.repeat(40),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'MANIFEST_IDENTITY_MISMATCH',
        details: {
          path: 'commit',
          expected: 'b'.repeat(40),
          actual: 'a'.repeat(40),
        },
      }),
    );
    fs.writeFileSync(files.iosArtifact, 'changed');
    await expect(
      validateReleaseManifest(manifest, { ...identity, ...files }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'MANIFEST_IDENTITY_MISMATCH',
        details: expect.objectContaining({ path: 'artifacts.ios.sha256' }),
      }),
    );
  });

  test('rejects symlink and duplicate-inode artifacts', async () => {
    const files = artifacts();
    const symlink = path.join(files.root, 'linked.ipa');
    fs.symlinkSync(files.iosArtifact, symlink);
    await expect(
      createReleaseManifest({ ...identity, ...files, iosArtifact: symlink }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_UNSAFE' }),
    );
    const hardlink = path.join(files.root, 'duplicate.aab');
    fs.linkSync(files.iosArtifact, hardlink);
    await expect(
      createReleaseManifest({
        ...identity,
        iosArtifact: files.iosArtifact,
        androidArtifact: hardlink,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_DUPLICATE' }),
    );
  });

  test('rejects malformed JSON, artifact extension, and workflow values', () => {
    expect(() => parseReleaseManifest('{')).toThrow(
      expect.objectContaining({ code: 'MANIFEST_JSON_MALFORMED' }),
    );
    const files = artifacts();
    expect(() =>
      fs.renameSync(files.iosArtifact, path.join(files.root, 'Bambuddy.zip')),
    ).not.toThrow();
    expect(() =>
      serializeReleaseManifest({
        ...identity,
        artifacts: {
          ios: { filename: 'Bambuddy.zip', sha256: 'a'.repeat(64) },
          android: { filename: 'Bambuddy.aab', sha256: 'b'.repeat(64) },
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_FILENAME_INVALID' }),
    );
  });

  test('rejects non-object sources, counters, workflow fields, and duplicate names', () => {
    expect(() => parseReleaseManifest('null')).toThrow(
      expect.objectContaining({ code: 'MANIFEST_SCHEMA_INVALID' }),
    );
    expect(() => parseReleaseManifest(42)).toThrow(
      expect.objectContaining({ code: 'MANIFEST_SOURCE_INVALID' }),
    );
    const base = {
      ...identity,
      artifacts: {
        ios: { filename: 'Bambuddy.ipa', sha256: 'a'.repeat(64) },
        android: { filename: 'Bambuddy.aab', sha256: 'b'.repeat(64) },
      },
    };
    for (const mutate of [
      value => (value.iosBuild = 0),
      value => (value.iosBuild = IOS_BUILD_MAX + 1),
      value => (value.androidVersionCode = 1.5),
      value =>
        (value.androidVersionCode = ANDROID_VERSION_CODE_MAX + 1),
      value => (value.workflow.name = ''),
      value => (value.workflow.runId = 0),
    ]) {
      const value = JSON.parse(JSON.stringify(base));
      mutate(value);
      expect(() => serializeReleaseManifest(value)).toThrow(
        expect.objectContaining({
          code: expect.stringMatching(/^MANIFEST_/),
        }),
      );
    }
    const duplicate = JSON.parse(JSON.stringify(base));
    duplicate.artifacts.android.filename = 'Bambuddy.ipa';
    expect(() => serializeReleaseManifest(duplicate)).toThrow(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_FILENAME_INVALID' }),
    );
  });

  test('returns stable read errors for missing artifacts and checksum streams', async () => {
    const files = artifacts();
    const missing = path.join(files.root, 'missing.ipa');
    await expect(
      createReleaseManifest({ ...identity, ...files, iosArtifact: missing }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_READ_FAILED' }),
    );
    await expect(computeSha256(missing)).rejects.toEqual(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_READ_FAILED' }),
    );
  });

  test('rejects path replacement after descriptor hashing begins', async () => {
    const files = artifacts();
    await expect(
      computeSha256(files.iosArtifact, {
        beforePostRead(filename) {
          const replacement = path.join(files.root, 'replacement.ipa');
          fs.writeFileSync(replacement, 'replacement artifact');
          fs.renameSync(replacement, filename);
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_CHANGED' }),
    );
    await expect(
      computeSha256(files.androidArtifact, {
        afterOpen() {
          throw new Error('injected open-window failure');
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_READ_FAILED' }),
    );
    expect(new ReleaseManifestError('TEST', 'test').details).toEqual({});
  });

  test('rejects cross-artifact replacement after artifact inspection', async () => {
    const createFiles = artifacts();
    await expect(
      createReleaseManifest(
        { ...identity, ...createFiles },
        {
          artifactHooks: {
            ios: {
              afterOpen() {
                const replacement = path.join(
                  createFiles.root,
                  'replacement.aab',
                );
                fs.writeFileSync(replacement, 'replacement data');
                fs.renameSync(replacement, createFiles.androidArtifact);
              },
            },
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_CHANGED' }),
    );

    const validateFiles = artifacts();
    const manifest = await createReleaseManifest({
      ...identity,
      ...validateFiles,
    });
    await expect(
      validateReleaseManifest(
        manifest,
        { ...identity, ...validateFiles },
        {
          artifactHooks: {
            ios: {
              beforePostRead() {
                const replacement = path.join(
                  validateFiles.root,
                  'replacement.aab',
                );
                fs.writeFileSync(replacement, 'replacement data');
                fs.renameSync(replacement, validateFiles.androidArtifact);
              },
            },
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'MANIFEST_ARTIFACT_CHANGED' }),
    );
  });
});

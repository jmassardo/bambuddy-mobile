'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
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
} = require('../../scripts/release/metadata');

const fixtures = path.join(__dirname, 'fixtures', 'metadata');
const releasePaths = [
  'package.json',
  'package-lock.json',
  'android/app/build.gradle',
  'ios/Bambuddy.xcodeproj/project.pbxproj',
  'CHANGELOG.md',
];
const update = {
  version: '1.3.0',
  date: '2026-08-19',
  iosBuild: 13,
  androidVersionCode: 13,
};

function makeCheckout(name = 'valid') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bambuddy-release-'));
  fs.cpSync(path.join(fixtures, name), root, { recursive: true });
  return root;
}

function snapshot(root) {
  return Object.fromEntries(
    releasePaths.map(relativePath => [
      relativePath,
      fs.readFileSync(path.join(root, relativePath)),
    ]),
  );
}

function expectSnapshot(root, before) {
  for (const relativePath of releasePaths) {
    expect(fs.readFileSync(path.join(root, relativePath))).toEqual(
      before[relativePath],
    );
  }
}

describe('release metadata parsing and rendering', () => {
  test('uses stable empty diagnostics when metadata error details are omitted', () => {
    expect(new ReleaseMetadataError('TEST', 'test').details).toEqual({});
  });

  test('reads all valid fixture formats and target-level Xcode configurations', () => {
    const root = makeCheckout();
    expect(readReleaseMetadata(root)).toEqual(
      expect.objectContaining({
        version: '1.2.3',
        iosBuild: 12,
        androidVersionCode: 12,
      }),
    );
    expect(
      parsePackageMetadata(fs.readFileSync(path.join(root, 'package.json'))),
    ).toEqual({
      version: '1.2.3',
    });
    expect(
      parsePackageLockMetadata(
        fs.readFileSync(path.join(root, 'package-lock.json')),
      ),
    ).toEqual({ version: '1.2.3' });
    expect(
      parseAndroidMetadata(
        fs.readFileSync(path.join(root, 'android/app/build.gradle')),
      ),
    ).toEqual({ versionName: '1.2.3', versionCode: 12 });
    const xcode = parseXcodeMetadata(
      fs.readFileSync(
        path.join(root, 'ios/Bambuddy.xcodeproj/project.pbxproj'),
      ),
    );
    expect(
      xcode.configurations.map(item => [
        item.name,
        item.marketingVersion,
        item.build,
      ]),
    ).toEqual([
      ['Debug', '1.2.3', 12],
      ['Release', '1.2.3', 12],
    ]);
  });

  test('plans five buffers, reparses them, and preserves dependency lock collisions', () => {
    const root = makeCheckout();
    const plan = planReleaseMetadataUpdate(root, update);
    expect(Object.keys(plan.files)).toEqual(releasePaths);
    expect(plan.next).toEqual(
      expect.objectContaining({
        version: '1.3.0',
        iosBuild: 13,
        androidVersionCode: 13,
      }),
    );
    const lock = JSON.parse(plan.files['package-lock.json']);
    expect(lock.version).toBe('1.3.0');
    expect(lock.packages[''].version).toBe('1.3.0');
    expect(lock.packages['node_modules/release-collision'].version).toBe(
      '1.2.3',
    );
    expect(lock.dependencies['release-collision'].version).toBe('1.2.3');
    expect(
      plan.files['ios/Bambuddy.xcodeproj/project.pbxproj'].toString(),
    ).toContain('MARKETING_VERSION = 9.9.9');
  });

  test('individual renderers preserve source type and update only release fields', () => {
    const root = makeCheckout();
    const packageSource = fs.readFileSync(
      path.join(root, 'package.json'),
      'utf8',
    );
    expect(renderPackageVersion(packageSource, '1.3.0')).toContain(
      '"version": "1.3.0"',
    );
    expect(
      renderPackageLockVersion(
        fs.readFileSync(path.join(root, 'package-lock.json')),
        '1.3.0',
      ),
    ).toBeInstanceOf(Buffer);
    expect(
      parseAndroidMetadata(
        renderAndroidVersion(
          fs.readFileSync(path.join(root, 'android/app/build.gradle')),
          '1.3.0',
          ANDROID_VERSION_CODE_MAX,
        ),
      ),
    ).toEqual({ versionName: '1.3.0', versionCode: ANDROID_VERSION_CODE_MAX });
    expect(
      parseXcodeMetadata(
        renderXcodeVersion(
          fs.readFileSync(
            path.join(root, 'ios/Bambuddy.xcodeproj/project.pbxproj'),
          ),
          '1.3.0',
          IOS_BUILD_MAX,
        ),
      ).build,
    ).toBe(IOS_BUILD_MAX);
  });

  test('JSON renderers replace only validated version string spans', () => {
    const packageSource =
      '{"name":"B\\u0061mbuddy","version":"1.2.3","note":"1.2.3"}';
    expect(renderPackageVersion(packageSource, '1.3.0')).toBe(
      '{"name":"B\\u0061mbuddy","version":"1.3.0","note":"1.2.3"}',
    );
    const lockSource =
      '{"name":"x","version":"1.2.3","packages":{"":{"version":"1.2.3"},"node_modules/equal":{"version":"1.3.0"}},"dependencies":{"equal":{"version":"1.3.0"}}}';
    expect(renderPackageLockVersion(lockSource, '1.3.0')).toBe(
      '{"name":"x","version":"1.3.0","packages":{"":{"version":"1.3.0"},"node_modules/equal":{"version":"1.3.0"}},"dependencies":{"equal":{"version":"1.3.0"}}}',
    );
    const structured =
      '{"version":"1.2.3","empty":{},"values":["text",{},[],1,true,false,null]}';
    expect(renderPackageVersion(structured, '1.3.0')).toBe(
      '{"version":"1.3.0","empty":{},"values":["text",{},[],1,true,false,null]}',
    );
    expect(() =>
      renderPackageVersion(
        '{"version":"1.2.2","version":"1.2.3"}',
        '1.3.0',
      ),
    ).toThrow(expect.objectContaining({ code: 'JSON_VERSION_SPAN_INVALID' }));
  });

  test.each([
    ['iosBuild', 0, 'IOS_BUILD_RANGE_INVALID'],
    ['iosBuild', IOS_BUILD_MAX + 1, 'IOS_BUILD_RANGE_INVALID'],
    ['iosBuild', 1.5, 'IOS_BUILD_RANGE_INVALID'],
    ['androidVersionCode', 0, 'ANDROID_VERSION_CODE_RANGE_INVALID'],
    [
      'androidVersionCode',
      ANDROID_VERSION_CODE_MAX + 1,
      'ANDROID_VERSION_CODE_RANGE_INVALID',
    ],
  ])('rejects %s=%p before writing', (field, value, code) => {
    const root = makeCheckout();
    const before = snapshot(root);
    expect(() =>
      applyReleaseMetadataUpdate(root, { ...update, [field]: value }),
    ).toThrow(expect.objectContaining({ code }));
    expectSnapshot(root, before);
  });

  test('aggregates actual version and build inconsistencies from the named fixture', () => {
    const root = makeCheckout('version-mismatch');
    expect(() => readReleaseMetadata(root)).toThrow(
      expect.objectContaining({
        code: 'RELEASE_METADATA_INCONSISTENT',
        details: expect.objectContaining({
          actual: expect.objectContaining({
            versions: expect.objectContaining({
              package: '1.2.3',
              android: '1.2.5',
              xcodeRelease: '1.2.7',
            }),
            iosBuilds: [15, 16],
            changelog: {
              releaseHeading: {
                path: 'CHANGELOG.md:releaseHeading',
                value: '1.2.8',
              },
              unreleasedComparison: {
                path: 'CHANGELOG.md:links.Unreleased',
                value: '1.2.8',
                url: 'https://github.com/example/fixture/compare/v1.2.8...HEAD',
              },
              releaseComparison: {
                path: 'CHANGELOG.md:links.1.2.8',
                value: '1.2.8',
                url: 'https://github.com/example/fixture/compare/v1.2.7...v1.2.8',
              },
            },
          }),
        }),
      }),
    );
  });

  test('rejects both malformed source named fixtures', () => {
    expect(() =>
      parseAndroidMetadata(
        fs.readFileSync(
          path.join(fixtures, 'malformed-android/android/app/build.gradle'),
        ),
      ),
    ).toThrow(
      expect.objectContaining({ code: 'ANDROID_VERSION_CODE_INVALID' }),
    );
    expect(() =>
      parseXcodeMetadata(
        fs.readFileSync(
          path.join(
            fixtures,
            'malformed-ios/ios/Bambuddy.xcodeproj/project.pbxproj',
          ),
        ),
      ),
    ).toThrow(
      expect.objectContaining({ code: 'XCODE_VERSION_SETTING_COUNT_INVALID' }),
    );
  });

  test('returns stable errors for malformed JSON and missing root fields', () => {
    expect(() => parsePackageMetadata('{')).toThrow(
      expect.objectContaining({ code: 'JSON_MALFORMED' }),
    );
    expect(() => parsePackageMetadata('{}')).toThrow(
      expect.objectContaining({ code: 'PACKAGE_VERSION_MISSING' }),
    );
    expect(() => parsePackageMetadata(42)).toThrow(
      expect.objectContaining({ code: 'METADATA_SOURCE_INVALID' }),
    );
    expect(() => parsePackageLockMetadata('{"version":"1.2.3"}')).toThrow(
      expect.objectContaining({ code: 'PACKAGE_LOCK_ROOT_VERSION_MISSING' }),
    );
    expect(() =>
      parsePackageLockMetadata(
        '{"version":"1.2.3","packages":{"":{"version":"1.2.4"}}}',
      ),
    ).toThrow(
      expect.objectContaining({ code: 'PACKAGE_LOCK_ROOT_VERSION_MISMATCH' }),
    );
    expect(() => renderPackageVersion('{}', '1.3.0')).toThrow(
      expect.objectContaining({ code: 'PACKAGE_VERSION_MISSING' }),
    );
    expect(() => renderPackageLockVersion('{}', '1.3.0')).toThrow(
      expect.objectContaining({ code: 'PACKAGE_LOCK_ROOT_VERSION_MISSING' }),
    );
  });

  test('rejects malformed Gradle structure and token boundaries', () => {
    for (const source of [
      'defaultConfig { versionCode 1; versionName "1.2.3" }',
      'android { defaultConfig { versionCode 1; versionName "1.2.3" }',
      'android { defaultConfig { versionCode 1; versionName "1.2.3" } defaultConfig { versionCode 2; versionName "1.2.3" } }',
      'android { defaultConfig { versionCode 1; versionName "1.2.3 } }',
      'android { /* unterminated',
    ]) {
      expect(() => parseAndroidMetadata(source)).toThrow(
        expect.objectContaining({
          code: expect.stringMatching(/^ANDROID_/),
        }),
      );
    }
    const comments =
      '/* versionCode 8 */\nandroid { defaultConfig { versionCode 1; versionName "1.2.3" } }\n// done';
    expect(parseAndroidMetadata(comments)).toEqual({
      versionCode: 1,
      versionName: '1.2.3',
    });
  });

  test('rejects malformed Xcode relationships and settings', () => {
    const valid = fs.readFileSync(
      path.join(fixtures, 'valid/ios/Bambuddy.xcodeproj/project.pbxproj'),
      'utf8',
    );
    const cases = [
      [
        valid.replace('name = Bambuddy;', 'name = Other;'),
        'XCODE_TARGET_COUNT_INVALID',
      ],
      [
        valid.replace(
          'buildConfigurationList = A00000000000000000000002;',
          'buildConfigurationList = FFFFFFFFFFFFFFFFFFFFFFFF;',
        ),
        'XCODE_CONFIGURATION_LIST_INVALID',
      ],
      [
        valid.replace('A00000000000000000000004,', 'FFFFFFFFFFFFFFFFFFFFFFFF,'),
        'XCODE_CONFIGURATION_INVALID',
      ],
      [
        valid.replace(
          'CURRENT_PROJECT_VERSION = 12;',
          'CURRENT_PROJECT_VERSION = value;',
        ),
        'XCODE_BUILD_INVALID',
      ],
      [
        valid.replace('MARKETING_VERSION = 1.2.3;', ''),
        'XCODE_VERSION_SETTING_COUNT_INVALID',
      ],
      [
        valid.replace(
          'MARKETING_VERSION = 1.2.3;',
          'MARKETING_VERSION = 1.2.3;\n\t\t\t\tMARKETING_VERSION = 7.7.7;',
        ),
        'XCODE_VERSION_SETTING_COUNT_INVALID',
      ],
      [
        valid.replace(
          'CURRENT_PROJECT_VERSION = 12;',
          'CURRENT_PROJECT_VERSION = 12;\n\t\t\t\tCURRENT_PROJECT_VERSION = 77;',
        ),
        'XCODE_VERSION_SETTING_COUNT_INVALID',
      ],
    ];
    for (const [source, code] of cases) {
      expect(() => parseXcodeMetadata(source)).toThrow(
        expect.objectContaining({ code }),
      );
    }
  });

  test('requires version keys inside each relationship-resolved buildSettings dictionary', () => {
    const valid = fs.readFileSync(
      path.join(fixtures, 'valid/ios/Bambuddy.xcodeproj/project.pbxproj'),
      'utf8',
    );
    const moved = valid.replaceAll(
      'buildSettings = {',
      'notBuildSettings = {',
    );
    expect(() => parseXcodeMetadata(moved)).toThrow(
      expect.objectContaining({ code: 'XCODE_BUILD_SETTINGS_COUNT_INVALID' }),
    );
    expect(
      parseXcodeMetadata(
        valid
          .replaceAll('name = Debug;', 'name = "Debug";')
          .replace('name = Release;', 'name = "Release";'),
      ).configurations.map(configuration => configuration.name),
    ).toEqual(['Debug', 'Release']);
  });

  test('rejects parsed platform counters outside store bounds', () => {
    const android = fs
      .readFileSync(
        path.join(fixtures, 'valid/android/app/build.gradle'),
        'utf8',
      )
      .replace('versionCode 12', `versionCode ${ANDROID_VERSION_CODE_MAX + 1}`);
    expect(() => parseAndroidMetadata(android)).toThrow(
      expect.objectContaining({ code: 'ANDROID_VERSION_CODE_RANGE_INVALID' }),
    );

    const xcode = fs
      .readFileSync(
        path.join(
          fixtures,
          'valid/ios/Bambuddy.xcodeproj/project.pbxproj',
        ),
        'utf8',
      )
      .replaceAll(
        'CURRENT_PROJECT_VERSION = 12;',
        `CURRENT_PROJECT_VERSION = ${IOS_BUILD_MAX + 1};`,
      );
    expect(() => parseXcodeMetadata(xcode)).toThrow(
      expect.objectContaining({ code: 'IOS_BUILD_RANGE_INVALID' }),
    );
  });

  test('rejects non-increasing versions and invalid release dates without writes', () => {
    const root = makeCheckout();
    const before = snapshot(root);
    expect(() =>
      planReleaseMetadataUpdate(root, { ...update, version: '1.2.3' }),
    ).toThrow(expect.objectContaining({ code: 'RELEASE_VERSION_NOT_GREATER' }));
    expect(() =>
      planReleaseMetadataUpdate(root, { ...update, date: '2025-02-29' }),
    ).toThrow(expect.objectContaining({ code: 'CHANGELOG_DATE_INVALID' }));
    expectSnapshot(root, before);
  });

  test('rejects symlink and duplicate-inode release sources', () => {
    const symlinkRoot = makeCheckout();
    const packagePath = path.join(symlinkRoot, 'package.json');
    const realPackage = path.join(symlinkRoot, 'real-package.json');
    fs.renameSync(packagePath, realPackage);
    fs.symlinkSync(realPackage, packagePath);
    expect(() => readReleaseMetadata(symlinkRoot)).toThrow(
      expect.objectContaining({ code: 'RELEASE_FILE_UNSAFE' }),
    );

    const linkedRoot = makeCheckout();
    const lockPath = path.join(linkedRoot, 'package-lock.json');
    fs.unlinkSync(lockPath);
    fs.linkSync(path.join(linkedRoot, 'package.json'), lockPath);
    expect(() => readReleaseMetadata(linkedRoot)).toThrow(
      expect.objectContaining({ code: 'RELEASE_FILE_DUPLICATE_INODE' }),
    );
  });
});

describe('atomic release metadata application', () => {
  test('updates all five files successfully', () => {
    const root = makeCheckout();
    expect(applyReleaseMetadataUpdate(root, update).version).toBe('1.3.0');
    expect(
      JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
    ).toBe('1.3.0');
  });

  test.each([4, 5])(
    'rolls back byte-identically when later rename call %i fails',
    failureCall => {
      const root = makeCheckout();
      const before = snapshot(root);
      let calls = 0;
      const fileSystem = Object.create(fs);
      fileSystem.renameSync = (...arguments_) => {
        calls += 1;
        if (calls === failureCall) {
          throw new Error('injected rename failure');
        }
        return fs.renameSync(...arguments_);
      };
      expect(() =>
        applyReleaseMetadataUpdate(root, update, { fileSystem }),
      ).toThrow('injected rename failure');
      expectSnapshot(root, before);
    },
  );

  test('detects concurrent modification and leaves all other files unchanged', () => {
    const root = makeCheckout();
    const before = snapshot(root);
    expect(() =>
      applyReleaseMetadataUpdate(root, update, {
        beforeCommit() {
          fs.appendFileSync(path.join(root, 'CHANGELOG.md'), '\nchanged\n');
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'RELEASE_FILE_CHANGED' }));
    expectSnapshot(root, before);
  });

  test('detects a later-target commit-window change and rolls back replaced targets', () => {
    const root = makeCheckout();
    const before = snapshot(root);
    expect(() =>
      applyReleaseMetadataUpdate(root, update, {
        beforeCommitEntry(relativePath) {
          if (relativePath === 'CHANGELOG.md') {
            fs.appendFileSync(path.join(root, relativePath), '\nchanged\n');
          }
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'RELEASE_FILE_CHANGED' }));
    expectSnapshot(root, before);
  });

  test('turns commit-point descriptor failures into stable change errors', () => {
    const root = makeCheckout();
    const before = snapshot(root);
    const fileSystem = {
      ...fs,
      openSync(filename, ...arguments_) {
        if (path.basename(filename) === 'package.json') {
          throw new Error('injected descriptor failure');
        }
        return fs.openSync(filename, ...arguments_);
      },
    };
    expect(() =>
      applyReleaseMetadataUpdate(root, update, { fileSystem }),
    ).toThrow(
      expect.objectContaining({
        code: 'RELEASE_FILE_CHANGED',
        details: expect.objectContaining({
          path: 'package.json',
          actual: 'injected descriptor failure',
        }),
      }),
    );
    expectSnapshot(root, before);
  });
});

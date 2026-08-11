'use strict';

const {spawnSync} = require('node:child_process');
const {
  EXPECTED_IMAGE_SIZE_VERSION,
  EXPECTED_PATCH_SHA256,
  validateAuditReport,
} = require('../../scripts/verify-dependency-audit');
const imageSize = require('image-size');

const validPatchEvidence = {
  imageSizeVersion: EXPECTED_IMAGE_SIZE_VERSION,
  patchExists: true,
  patchSha256: EXPECTED_PATCH_SHA256,
};

function advisory(source) {
  return {
    dependency: 'image-size',
    name: 'image-size',
    severity: 'high',
    source,
  };
}

function patchedAuditReport() {
  return {
    vulnerabilities: {
      'image-size': {
        severity: 'high',
        via: [advisory(1138808), advisory(1138809)],
      },
      metro: {
        severity: 'high',
        via: ['image-size', 'metro-config'],
      },
      'metro-config': {
        severity: 'high',
        via: ['metro'],
      },
      'react-native': {
        severity: 'high',
        via: ['metro'],
      },
    },
  };
}

function runDangerousParserFixture(source) {
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: process.cwd(),
    encoding: 'utf8',
    killSignal: 'SIGKILL',
    timeout: 2000,
  });

  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

describe('dependency audit verifier', () => {
  test('accepts a clean report without patch evidence', () => {
    expect(validateAuditReport({vulnerabilities: {}}, {})).toEqual([]);
  });

  test('accepts only the patched image-size advisories and their Metro chain', () => {
    expect(
      validateAuditReport(patchedAuditReport(), validPatchEvidence),
    ).toEqual([]);
  });

  test('rejects an unknown advisory', () => {
    const report = patchedAuditReport();
    report.vulnerabilities['image-size'].via.push(advisory(9999999));

    expect(validateAuditReport(report, validPatchEvidence)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('image-size: high vulnerability'),
      ]),
    );
  });

  test('rejects a changed installed image-size version', () => {
    const evidence = {...validPatchEvidence, imageSizeVersion: '2.0.2'};

    expect(validateAuditReport(patchedAuditReport(), evidence)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('installed image-size version must be 1.2.1'),
      ]),
    );
  });

  test('rejects a missing local patch', () => {
    const evidence = {
      ...validPatchEvidence,
      patchExists: false,
      patchSha256: undefined,
    };

    expect(validateAuditReport(patchedAuditReport(), evidence)).toEqual(
      expect.arrayContaining([expect.stringContaining('required patch is missing')]),
    );
  });

  test('rejects altered local patch contents', () => {
    const evidence = {
      ...validPatchEvidence,
      patchSha256: '0'.repeat(64),
    };

    expect(validateAuditReport(patchedAuditReport(), evidence)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'image-size patch content does not match the reviewed patch',
        ),
      ]),
    );
  });

  test('rejects an unrelated high finding', () => {
    const report = patchedAuditReport();
    report.vulnerabilities.nanoid = {
      severity: 'high',
      via: [{dependency: 'nanoid', name: 'nanoid', source: 1138813}],
    };

    expect(validateAuditReport(report, validPatchEvidence)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('nanoid: high vulnerability'),
      ]),
    );
  });
});

describe('patched image-size parser progress', () => {
  test('rejects a zero-length ICNS entry without looping', () => {
    const output = runDangerousParserFixture(`
      const {ICNS} = require('image-size/dist/types/icns');
      const input = Buffer.alloc(16);
      input.write('icns', 0, 'ascii');
      input.writeUInt32BE(input.length, 4);
      input.write('ic07', 8, 'ascii');
      try {
        ICNS.calculate(input);
        process.exitCode = 2;
      } catch (error) {
        console.log(error.name + ':' + error.message);
      }
    `);

    expect(output).toBe('TypeError:Invalid ICNS entry length');
  });

  test('rejects a zero-length JXL partial stream without looping', () => {
    const output = runDangerousParserFixture(`
      const {JXL} = require('image-size/dist/types/jxl');
      const input = Buffer.alloc(32);
      input.writeUInt32BE(20, 0);
      input.write('ftyp', 4, 4, 'ascii');
      input.write('jxl ', 8, 4, 'ascii');
      input.writeUInt32BE(0, 20);
      input.write('jxlp', 24, 4, 'ascii');
      try {
        JXL.calculate(input);
        process.exitCode = 2;
      } catch (error) {
        console.log(error.name + ':' + error.message);
      }
    `);

    expect(output).toMatch(/Error:/);
  });

  test('rejects a zero-length HEIF size box', () => {
    const output = runDangerousParserFixture(`
      const {HEIF} = require('image-size/dist/types/heif');
      const input = Buffer.alloc(48);
      const writeBox = (offset, size, type) => {
        input.writeUInt32BE(size, offset);
        input.write(type, offset + 4, 4, 'ascii');
      };
      writeBox(0, 48, 'meta');
      writeBox(12, 36, 'iprp');
      writeBox(20, 28, 'ipco');
      writeBox(28, 0, 'ispe');
      try {
        HEIF.calculate(input);
        process.exitCode = 2;
      } catch (error) {
        console.log(error.name + ':' + error.message);
      }
    `);

    expect(output).toBe('TypeError:Invalid HEIF, no size found');
  });

  test('preserves valid PNG and JPEG dimensions', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAQAAABWKLW/AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
      'base64',
    );

    expect(imageSize(png)).toEqual(expect.objectContaining({height: 3, width: 2}));
    expect(imageSize(jpeg)).toEqual(
      expect.objectContaining({height: 3, width: 2}),
    );
  });
});

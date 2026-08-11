'use strict';

const {
  EXPECTED_IMAGE_SIZE_VERSION,
  EXPECTED_PATCH_SHA256,
  validateAuditReport,
} = require('../../scripts/verify-dependency-audit');
const {HEIF} = require('image-size/dist/types/heif');
const {ICNS} = require('image-size/dist/types/icns');
const {JXL} = require('image-size/dist/types/jxl');
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

function writeBoxHeader(input, offset, size, type) {
  input.writeUInt32BE(size, offset);
  input.write(type, offset + 4, 4, 'ascii');
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
    const input = Buffer.alloc(16);
    input.write('icns', 0, 'ascii');
    input.writeUInt32BE(input.length, 4);
    input.write('ic07', 8, 'ascii');

    expect(() => ICNS.calculate(input)).toThrow('Invalid ICNS entry length');
  });

  test('rejects a zero-length JXL partial stream without looping', () => {
    const input = Buffer.alloc(32);
    writeBoxHeader(input, 0, 20, 'ftyp');
    input.write('jxl ', 8, 'ascii');
    writeBoxHeader(input, 20, 0, 'jxlp');

    expect(() => JXL.calculate(input)).toThrow();
  });

  test('rejects a zero-length HEIF size box', () => {
    const input = Buffer.alloc(48);
    writeBoxHeader(input, 0, 48, 'meta');
    writeBoxHeader(input, 12, 36, 'iprp');
    writeBoxHeader(input, 20, 28, 'ipco');
    writeBoxHeader(input, 28, 0, 'ispe');

    expect(() => HEIF.calculate(input)).toThrow('Invalid HEIF, no size found');
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

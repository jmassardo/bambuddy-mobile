'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const ALLOWED_IMAGE_SIZE_SOURCES = new Set([1138808, 1138809]);
const EXPECTED_IMAGE_SIZE_VERSION = '1.2.1';
const EXPECTED_PATCH_SHA256 =
  'c583d0c791fa3ed354d449a14098241e24a4327c4bad6ec39d8b88b08921dc1f';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PATCH_PATH = path.join(
  PROJECT_ROOT,
  'patches',
  'image-size+1.2.1.patch',
);

function inspectPatchEvidence(projectRoot = PROJECT_ROOT) {
  const patchPath = path.join(
    projectRoot,
    'patches',
    'image-size+1.2.1.patch',
  );
  const packagePath = path.join(
    projectRoot,
    'node_modules',
    'image-size',
    'package.json',
  );

  return {
    imageSizeVersion: fs.existsSync(packagePath)
      ? JSON.parse(fs.readFileSync(packagePath, 'utf8')).version
      : undefined,
    patchExists: fs.existsSync(patchPath),
    patchSha256: fs.existsSync(patchPath)
      ? crypto
          .createHash('sha256')
          .update(fs.readFileSync(patchPath))
          .digest('hex')
      : undefined,
  };
}

function validatePatchEvidence(evidence) {
  const errors = [];
  if (!evidence.patchExists) {
    errors.push(`required patch is missing: ${PATCH_PATH}`);
  }
  if (evidence.patchSha256 !== EXPECTED_PATCH_SHA256) {
    errors.push('image-size patch content does not match the reviewed patch');
  }
  if (evidence.imageSizeVersion !== EXPECTED_IMAGE_SIZE_VERSION) {
    errors.push(
      `installed image-size version must be ${EXPECTED_IMAGE_SIZE_VERSION}, ` +
        `found ${evidence.imageSizeVersion ?? 'missing'}`,
    );
  }
  return errors;
}

function collectAdvisorySources(packageName, vulnerabilities, visiting) {
  if (visiting.has(packageName)) {
    return {invalid: false, sources: new Set()};
  }

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || !Array.isArray(vulnerability.via)) {
    return {invalid: true, sources: new Set()};
  }

  visiting.add(packageName);
  const result = {invalid: vulnerability.via.length === 0, sources: new Set()};
  for (const cause of vulnerability.via) {
    if (typeof cause === 'string') {
      const nested = collectAdvisorySources(
        cause,
        vulnerabilities,
        visiting,
      );
      result.invalid ||= nested.invalid;
      for (const source of nested.sources) {
        result.sources.add(source);
      }
    } else if (
      cause &&
      typeof cause === 'object' &&
      Number.isInteger(cause.source)
    ) {
      if (
        packageName !== 'image-size' ||
        cause.name !== 'image-size' ||
        cause.dependency !== 'image-size'
      ) {
        result.invalid = true;
      }
      result.sources.add(cause.source);
    } else {
      result.invalid = true;
    }
  }
  visiting.delete(packageName);
  return result;
}

function validateAuditReport(report, evidence) {
  const vulnerabilities = report && report.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') {
    return ['audit report does not contain a vulnerabilities object'];
  }

  const errors = [];
  const allowedFindings = [];
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (vulnerability.severity === 'critical') {
      errors.push(`${packageName}: critical vulnerability is not permitted`);
      continue;
    }
    if (vulnerability.severity !== 'high') {
      continue;
    }

    const causes = collectAdvisorySources(
      packageName,
      vulnerabilities,
      new Set(),
    );
    const hasOnlyAllowedSources =
      !causes.invalid &&
      causes.sources.size > 0 &&
      [...causes.sources].every(source =>
        ALLOWED_IMAGE_SIZE_SOURCES.has(source),
      );
    if (!hasOnlyAllowedSources) {
      errors.push(
        `${packageName}: high vulnerability is not solely caused by the ` +
          'locally patched image-size advisories',
      );
    } else {
      allowedFindings.push(packageName);
    }
  }

  if (allowedFindings.length > 0) {
    const imageSizeSources = collectAdvisorySources(
      'image-size',
      vulnerabilities,
      new Set(),
    ).sources;
    const hasExactSources =
      imageSizeSources.size === ALLOWED_IMAGE_SIZE_SOURCES.size &&
      [...ALLOWED_IMAGE_SIZE_SOURCES].every(source =>
        imageSizeSources.has(source),
      );
    if (!hasExactSources) {
      errors.push(
        'image-size exception must contain exactly advisory sources ' +
          [...ALLOWED_IMAGE_SIZE_SOURCES].join(' and '),
      );
    }
    errors.push(...validatePatchEvidence(evidence));
  }

  return errors;
}

function runAudit(args) {
  const result = spawnSync('npm', ['audit', ...args, '--json'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `npm audit ${args.join(' ')} failed with status ${result.status}: ` +
        result.stderr.trim(),
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`npm audit returned invalid JSON: ${error.message}`);
  }
}

function main() {
  const evidence = inspectPatchEvidence();
  const reports = [
    ['full', runAudit([])],
    ['production', runAudit(['--omit=dev'])],
  ];
  const errors = reports.flatMap(([name, report]) =>
    validateAuditReport(report, evidence).map(error => `${name}: ${error}`),
  );
  if (errors.length > 0) {
    throw new Error(`Dependency audit verification failed:\n- ${errors.join('\n- ')}`);
  }
  console.log(
    'Dependency audit verification passed; remaining high findings are ' +
      'limited to the reviewed local image-size patch.',
  );
}

module.exports = {
  EXPECTED_IMAGE_SIZE_VERSION,
  EXPECTED_PATCH_SHA256,
  inspectPatchEvidence,
  validateAuditReport,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

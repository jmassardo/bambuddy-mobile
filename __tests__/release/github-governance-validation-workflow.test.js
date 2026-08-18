'use strict';

const {
  buildWorkflowScan,
  snapshotGraph,
} = require('../../test-support/release/github-governance-validation-fixtures');
const {
  STRUCTURAL_MESSAGES,
  validateRoot,
} = require('../../scripts/release/github-governance-validation-runtime');
const {
  validateWorkflowScan,
  validateWorkflowScanInContext,
} = require('../../scripts/release/github-governance-validation-workflow');

const WORKFLOW_BUDGET = 2015003;
const NORMALIZED_BUDGET = 2592031;
const CONTEXT_KEYS = [
  'ownKeySlots', 'visitedValues', 'stringCodeUnits', 'maxContainerDepth',
  'diagnosticCount',
];
const pad = (value, width) => String(value).padStart(width, '0');
const scannedFile = index => `.github/workflows/f${pad(index, 5)}.yml`;
const findingFile = index => `.github/workflows/g${pad(index, 5)}.yml`;
const issue = (path, message) => ({code: 'SCHEMA_INVALID', path, message});
const singleton = message => [issue('', message)];

function bucket(template, size) {
  return Array.from({length: size}, (unused, index) => ({
    ...template, name: `fixture-${pad(index, 6)}`,
  }));
}

function findingAt(template, index, evidenceSize) {
  return {
    ...template,
    path: findingFile(index),
    location: template.location === null ? null : {...template.location},
    evidence: {
      expected: bucket(template.evidence.expected[0], evidenceSize),
      observed: bucket(template.evidence.observed[0], evidenceSize),
      related: bucket(template.evidence.related[0], evidenceSize),
    },
  };
}

function buildScan(fileCount, findingCount, evidenceSize) {
  const template = buildWorkflowScan();
  const finding = template.findings[0];
  return {
    schemaVersion: template.schemaVersion,
    scannedFiles: Array.from({length: fileCount},
      (unused, index) => scannedFile(index)),
    findings: Array.from({length: findingCount},
      (unused, index) => findingAt(finding, index, evidenceSize)),
  };
}

function inspect(value, budget, path) {
  const observed = {clone: null, context: null, returned: 'unset'};
  const result = validateRoot(value, budget, (clone, context) => {
    const target = path === '' ? clone : clone.workflowScan;
    observed.clone = target;
    observed.context = context;
    observed.returned = validateWorkflowScanInContext(target, context, path);
    return undefined;
  });
  return {...observed, result};
}

describe('governance V2 workflow scan validation', () => {
  test('accepts the canonical fixture scan without mutating the input', () => {
    const scan = buildWorkflowScan();
    const before = snapshotGraph(scan);
    expect(validateWorkflowScan(scan)).toEqual({ok: true, value: expect.anything()});
    expect(snapshotGraph(scan)).toEqual(before);
  });

  test('derives the simultaneous maximum context scalars deterministically', () => {
    const scan = buildScan(10000, 5000, 32);
    const probe = inspect(scan, WORKFLOW_BUDGET, '');

    expect(probe.result.ok).toBe(true);
    expect(probe.returned).toBeUndefined();
    expect(Object.keys(probe.context)).toEqual(CONTEXT_KEYS);
    expect(probe.context.ownKeySlots).toBe(2015003);
    expect(probe.context.visitedValues).toBe(2015004);
    expect(probe.context.diagnosticCount).toBe(0);
    expect(Object.isFrozen(probe.context)).toBe(true);

    const repeat = validateWorkflowScan(scan);
    expect(repeat.ok).toBe(true);
    expect(repeat).not.toBe(probe.result);
    expect(repeat.value).not.toBe(probe.result.value);

    expect(scan.scannedFiles).toHaveLength(10000);
    expect(scan.findings).toHaveLength(5000);
    expect(scan.scannedFiles[0]).toBe(scannedFile(0));
    expect(scan.findings[4999].path).toBe(findingFile(4999));
    expect(Object.isFrozen(scan)).toBe(false);
  }, 180000);

  test('satisfies the runtime cap at all 15,000 repository path occurrences',
    () => {
      const scan = buildScan(10000, 5000, 1);
      const occurrences = scan.scannedFiles.length +
        scan.findings.filter(finding => finding.path !== null).length;

      expect(occurrences).toBe(15000);
      expect(validateWorkflowScan(scan).ok).toBe(true);
    }, 120000);

  test('never restarts the shared repository path occurrence counter', () => {
    const scan = buildScan(10000, 0, 1);

    expect(validateWorkflowScan(scan).ok).toBe(true);
    expect(validateRoot(scan, WORKFLOW_BUDGET, (clone, context) => {
      validateWorkflowScanInContext(clone, context, '');
      validateWorkflowScanInContext(clone, context, '');
      return undefined;
    })).toEqual({
      ok: false, errors: singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED),
    });
  }, 120000);

  test('accepts 5,000 minimal unique findings without sorting or mutation',
    () => {
      const scan = buildScan(1, 5000, 1);
      const before = snapshotGraph(scan);
      const result = validateWorkflowScan(scan);

      expect(result.ok).toBe(true);
      expect(scan.findings.map(finding => finding.path)).toEqual(
        Array.from({length: 5000}, (unused, index) => findingFile(index)),
      );
      expect(snapshotGraph(scan)).toEqual(before);
    }, 120000);

  test('rejects one structural extra key at the simultaneous maximum', () => {
    const scan = buildScan(10000, 5000, 32);
    scan.extra = 'STRUCTURAL_FIXTURE_VALUE';

    expect(validateWorkflowScan(scan)).toEqual({
      ok: false, errors: singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED),
    });
  }, 180000);

  test('reports each limit+1 collection and extra key as its exact result',
    () => {
      const files = buildScan(10001, 0, 1);
      const findings = buildScan(1, 5001, 1);
      const extra = buildWorkflowScan();
      extra.extra = 'STRUCTURAL_FIXTURE_VALUE';

      expect(validateWorkflowScan(files).errors)
        .toEqual(singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED));
      expect(validateWorkflowScan(findings).errors)
        .toEqual(singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED));
      expect(validateWorkflowScan(extra).errors)
        .toEqual([issue('', STRUCTURAL_MESSAGES.OBJECT_SHAPE)]);
    }, 120000);

  test('enforces the V2 schema version literal and its primitive type', () => {
    const wrongLiteral = buildWorkflowScan();
    wrongLiteral.schemaVersion = '1.0.0';
    const wrongType = buildWorkflowScan();
    wrongType.schemaVersion = 2;

    expect(validateWorkflowScan(wrongLiteral).errors).toEqual([
      issue('/schemaVersion', STRUCTURAL_MESSAGES.REQUIRED_LITERAL),
    ]);
    expect(validateWorkflowScan(wrongType).errors).toEqual([
      issue('/schemaVersion', STRUCTURAL_MESSAGES.EXPECTED_STRING),
    ]);
  });

  test('validates every W-A01 scannedFiles descriptor without mutation', () => {
    const duplicate = buildWorkflowScan({
      arrayCase: 'W-A01', variant: 'duplicate',
    });
    const injected = buildWorkflowScan({arrayCase: 'W-A01', variant: 'inject'});
    const before = snapshotGraph(duplicate);
    const invalid = buildWorkflowScan();
    invalid.scannedFiles = ['../escape.yml', 5];

    expect(validateWorkflowScan(duplicate).errors).toEqual([
      issue('/scannedFiles/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY),
    ]);
    expect(snapshotGraph(duplicate)).toEqual(before);
    expect(validateWorkflowScan(injected).ok).toBe(true);
    expect(validateWorkflowScan(invalid).errors).toEqual([
      issue('/scannedFiles/0', STRUCTURAL_MESSAGES.REPOSITORY_PATH),
      issue('/scannedFiles/1', STRUCTURAL_MESSAGES.EXPECTED_STRING),
    ]);
  });

  test('rejects reordered scannedFiles without reordering the input', () => {
    const scan = buildScan(3, 0, 1);
    [scan.scannedFiles[0], scan.scannedFiles[1]] =
      [scan.scannedFiles[1], scan.scannedFiles[0]];
    const before = snapshotGraph(scan);

    expect(validateWorkflowScan(scan).errors).toEqual([
      issue('/scannedFiles/1', STRUCTURAL_MESSAGES.CANONICAL_ORDER),
    ]);
    expect(snapshotGraph(scan)).toEqual(before);
  });

  test('detects a nonadjacent case-fold duplicate scanned file path', () => {
    const separated = buildWorkflowScan();
    separated.scannedFiles = [
      '.github/workflows/A.yml',
      '.github/workflows/B.yml',
      '.github/workflows/a.yml',
    ];
    const before = snapshotGraph(separated);
    const adjacent = buildWorkflowScan();
    adjacent.scannedFiles = [
      '.github/workflows/X.yml',
      '.github/workflows/x.yml',
      '.github/workflows/y.yml',
    ];

    expect(validateWorkflowScan(separated).errors).toEqual([
      issue('/scannedFiles/2', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY),
    ]);
    expect(snapshotGraph(separated)).toEqual(before);
    expect(validateWorkflowScan(adjacent).errors).toEqual([
      issue('/scannedFiles/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY),
    ]);
  });

  test('validates every W-A02 findings descriptor without mutation', () => {
    const duplicate = buildWorkflowScan({
      arrayCase: 'W-A02', variant: 'duplicate',
    });
    const injected = buildWorkflowScan({arrayCase: 'W-A02', variant: 'inject'});
    const before = snapshotGraph(duplicate);

    expect(validateWorkflowScan(duplicate).errors).toEqual([
      issue('/findings/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY),
    ]);
    expect(snapshotGraph(duplicate)).toEqual(before);
    expect(validateWorkflowScan(injected).errors).toEqual([
      issue('/findings/1', STRUCTURAL_MESSAGES.CANONICAL_ORDER),
    ]);
  });

  test('reports one swapped pair inside 5,000 findings as an order error',
    () => {
      const scan = buildScan(1, 5000, 1);
      [scan.findings[2500], scan.findings[2501]] =
        [scan.findings[2501], scan.findings[2500]];

      expect(validateWorkflowScan(scan).errors).toEqual([
        issue('/findings/2501', STRUCTURAL_MESSAGES.CANONICAL_ORDER),
      ]);
    }, 120000);

  test('separates exact duplicate identity from cross-bucket distinctness',
    () => {
      const duplicate = buildScan(1, 2, 1);
      duplicate.findings[1] = findingAt(duplicate.findings[0], 0, 1);
      const distinct = buildScan(1, 2, 1);
      distinct.findings[1] = findingAt(distinct.findings[0], 0, 1);
      distinct.findings[1].evidence.observed = [
        {...distinct.findings[1].evidence.expected[0], name: 'fixture-000001'},
      ];

      expect(validateWorkflowScan(duplicate).errors).toEqual([
        issue('/findings/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY),
      ]);
      expect(validateWorkflowScan(distinct).ok).toBe(true);
    });

  test('detects a nonadjacent duplicate finding identity', () => {
    const scan = buildScan(1, 3, 1);
    scan.findings[1] = findingAt(scan.findings[0], 0, 1);
    scan.findings[2] = findingAt(scan.findings[0], 0, 1);
    scan.findings[1].evidence.observed = [
      {...scan.findings[1].evidence.expected[0], name: 'fixture-000001'},
    ];
    const before = snapshotGraph(scan);

    expect(scan.findings.map(finding => finding.path)).toEqual(
      Array.from({length: 3}, () => findingFile(0)),
    );
    expect(validateWorkflowScan(scan).errors).toEqual([
      issue('/findings/2', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY),
    ]);
    expect(snapshotGraph(scan)).toEqual(before);
  });

  test('delegates aggregate evidence and finding schema errors in place', () => {
    const scan = buildScan(1, 2, 1);
    scan.findings[0].evidence = null;
    scan.findings[1].severity = 'warning';

    expect(validateWorkflowScan(scan).errors).toEqual([
      issue('/findings/0/evidence', STRUCTURAL_MESSAGES.EXPECTED_OBJECT),
      issue('/findings/1/severity', STRUCTURAL_MESSAGES.REQUIRED_LITERAL),
    ]);
  });

  test('rejects non-object scans, collections and elements', () => {
    const notArrays = buildWorkflowScan();
    notArrays.scannedFiles = null;
    notArrays.findings = null;

    expect(validateWorkflowScan(null).errors).toEqual(
      [issue('', STRUCTURAL_MESSAGES.EXPECTED_OBJECT)],
    );
    expect(validateWorkflowScan(notArrays).errors).toEqual([
      issue('/findings', STRUCTURAL_MESSAGES.EXPECTED_ARRAY),
      issue('/scannedFiles', STRUCTURAL_MESSAGES.EXPECTED_ARRAY),
    ]);
    expect(validateWorkflowScan({
      schemaVersion: buildWorkflowScan().schemaVersion,
      scannedFiles: [], findings: [],
    }).ok).toBe(true);
  });

  test('keeps budget 2,015,003 root-only and shares nested finding state',
    () => {
      const scan = buildScan(1, 2, 1);
      scan.findings[0].severity = 'warning';
      scan.findings[1].scope = 'branch';
      const probe = inspect({workflowScan: scan}, NORMALIZED_BUDGET,
        '/workflowScan');

      expect(probe.returned).toBeUndefined();
      expect(probe.context.ownKeySlots).toBeLessThan(WORKFLOW_BUDGET);
      expect(probe.result.errors).toEqual([
        issue('/workflowScan/findings/0/severity',
          STRUCTURAL_MESSAGES.REQUIRED_LITERAL),
        issue('/workflowScan/findings/1/scope',
          STRUCTURAL_MESSAGES.REQUIRED_LITERAL),
      ]);
    });

  test('treats the detached clone as read-only and never retains context',
    () => {
      const scan = buildScan(2, 2, 2);
      const seen = {before: null, context: null};
      const result = validateRoot(scan, WORKFLOW_BUDGET, (clone, context) => {
        seen.before = snapshotGraph(clone);
        seen.context = context;
        validateWorkflowScanInContext(clone, context, '');
        seen.clone = clone;
        return undefined;
      });

      expect(result.ok).toBe(true);
      expect(snapshotGraph(seen.clone)).toEqual(seen.before);
      expect(Object.isFrozen(seen.clone)).toBe(false);
      expect(Object.isFrozen(seen.clone.scannedFiles)).toBe(false);
      expect(inspect(scan, WORKFLOW_BUDGET, '').context)
        .toEqual({...seen.context});
      expect(inspect(scan, WORKFLOW_BUDGET, '').context).not.toBe(seen.context);
    });

  test('shallow-freezes success and recursively freezes failure results', () => {
    const success = validateWorkflowScan(buildScan(2, 1, 1));
    const invalid = buildWorkflowScan();
    invalid.scannedFiles = ['../escape.yml'];
    const failure = validateWorkflowScan(invalid);

    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(success.value)).toBe(false);
    expect(Object.isFrozen(success.value.scannedFiles)).toBe(false);
    success.value.scannedFiles.push('mutable');
    expect(success.value.scannedFiles).toHaveLength(3);

    expect(Object.isFrozen(failure)).toBe(true);
    expect(Object.isFrozen(failure.errors)).toBe(true);
    expect(Object.isFrozen(failure.errors[0])).toBe(true);
  });

  test('exports exactly the frozen public workflow validators', () => {
    const exported = require(
      '../../scripts/release/github-governance-validation-workflow');

    expect(Object.keys(exported)).toEqual([
      'validateWorkflowScan', 'validateWorkflowScanInContext',
    ]);
    expect(Object.isFrozen(exported)).toBe(true);
    expect(validateWorkflowScanInContext).toHaveLength(3);
    expect(validateWorkflowScan).toHaveLength(1);
  });
});

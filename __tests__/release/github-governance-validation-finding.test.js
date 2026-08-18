'use strict';

const fs = require('fs');
const {
  buildFinding,
  cloneWithDescriptors,
  snapshotGraph,
} = require("../../test-support/release/github-governance-validation-fixtures");
const {
  GOVERNANCE_CONTRACT,
  SCANNER_FINDING_CODES,
  POLICY_FINDING_CODES,
} = require('../../scripts/release/github-governance-contract');
const {
  STRUCTURAL_MESSAGES,
  validateRoot,
} = require('../../scripts/release/github-governance-validation-runtime');
const modulePath =
  '../../scripts/release/github-governance-validation-finding';
const {
  validateGovernanceFinding,
  validateGovernanceFindingInContext,
  findingIdentity,
} = require(modulePath);

const failure = message => ({
  ok: false,
  errors: [{code: 'SCHEMA_INVALID', path: '', message}],
});
const shapeMessage = STRUCTURAL_MESSAGES.OBJECT_SHAPE;

function errorPairs(result) {
  return result.errors.map(error => [error.path, error.message]);
}

function evidenceItem(index, state = 'present') {
  const item = {namespace: 'action', name: `item-${String(index).padStart(3, '0')}`};
  if (state !== null) item.state = state;
  return item;
}

function findingWithItems(count, state = 'present') {
  const finding = buildFinding({evidenceShape:
    state === null ? 'two-key' : 'three-key'});
  finding.evidence.expected =
    Array.from({length: count}, (_, index) => evidenceItem(index, state));
  finding.evidence.observed =
    Array.from({length: count}, (_, index) => evidenceItem(100 + index, state));
  finding.evidence.related =
    Array.from({length: count}, (_, index) => evidenceItem(200 + index, state));
  return finding;
}

function expectFrozenFailure(result) {
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.errors)).toBe(true);
  for (const error of result.errors) expect(Object.isFrozen(error)).toBe(true);
}

describe('governance finding validation surface and boundaries', () => {
  test('exports exactly three frozen functions with required arities', () => {
    const exported = require(modulePath);
    expect(Object.keys(exported)).toEqual([
      'validateGovernanceFinding',
      'validateGovernanceFindingInContext',
      'findingIdentity',
    ]);
    expect(Object.values(exported).map(value => [
      Object.isFrozen(value), value.length,
    ])).toEqual([[true, 1], [true, 3], [true, 1]]);
    expect(Object.isFrozen(exported)).toBe(true);
    expect(exported.default).toBeUndefined();
  });

  test.each(['three-key', 'two-key'])(
    'accepts a fresh detached mutable canonical %s finding', evidenceShape => {
      const source = buildFinding({evidenceShape});
      const before = snapshotGraph(source);
      const first = validateGovernanceFinding(source);
      const second = validateGovernanceFinding(source);
      expect([first.ok, second.ok]).toEqual([true, true]);
      expect([Object.isFrozen(first), Object.isFrozen(first.value),
        Object.isFrozen(first.value.evidence)]).toEqual([true, false, false]);
      expect(first).not.toBe(second);
      expect(first.value).not.toBe(source);
      expect(first.value).not.toBe(second.value);
      first.value.subject = 'caller mutation';
      first.value.evidence.expected[0].name = 'caller-local';
      expect(snapshotGraph(source)).toEqual(before);
      expect(second.value.subject).toBe('fixture-subject');
    },
  );

  test('measures the exact 400/401 maximum without clone recounting', () => {
    const source = buildFinding({boundary: 'max'});
    const before = snapshotGraph(source);
    let observed;
    let cloneBefore;
    const result = validateRoot(source, 400, (clone, context) => {
      observed = {...context};
      cloneBefore = snapshotGraph(clone);
      expect(validateGovernanceFindingInContext(clone, context, '')).toBeUndefined();
      expect(snapshotGraph(clone)).toEqual(cloneBefore);
    });
    expect(result.ok).toBe(true);
    expect(observed).toEqual({
      ownKeySlots: 400,
      visitedValues: 401,
      stringCodeUnits: expect.any(Number),
      maxContainerDepth: expect.any(Number),
      diagnosticCount: 0,
    });
    expect(Object.keys(observed)).toEqual([
      'ownKeySlots', 'visitedValues', 'stringCodeUnits',
      'maxContainerDepth', 'diagnosticCount',
    ]);
    expect(snapshotGraph(source)).toEqual(before);
  });

  test('accepts 32 two-key items per bucket without a three-key assumption', () => {
    const result = validateGovernanceFinding(findingWithItems(32, null));
    expect(result.ok).toBe(true);
    expect(result.value.evidence.expected.every(
      item => Object.keys(item).join(',') === 'namespace,name',
    )).toBe(true);
  });

  test.each(['expected', 'observed', 'related'])(
    'returns the budget singleton for 33 items in %s', bucket => {
      const source = buildFinding();
      source.evidence[bucket] =
        Array.from({length: 33}, (_, index) => evidenceItem(index));
      const result = validateGovernanceFinding(source);
      expect(result).toEqual(failure(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED));
      expectFrozenFailure(result);
    },
  );

  test('the 401st visited value fails before the callback', () => {
    const result = validateGovernanceFinding(
      buildFinding({boundary: 'maxPlusOne'}),
    );
    expect(result).toEqual(failure(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED));
    expectFrozenFailure(result);
  });
});

describe('finding mappings, structure, and prose', () => {
  const policyScopes = [
    ['RULESET_', 'ruleset'],
    ['LEGACY_BRANCH_PROTECTION_PRESENT', 'branch'],
    ['GOVERNED_BRANCH_METADATA_INVALID', 'branch'],
    ['ENVIRONMENT_MISSING', 'environment'],
    ['ENVIRONMENT_ADMIN_BYPASS_MISMATCH', 'environment'],
    ['ENVIRONMENT_SELF_REVIEW_MISMATCH', 'environment'],
    ['ENVIRONMENT_DEPLOYMENT_POLICY_MISMATCH', 'environment'],
    ['ENVIRONMENT_REVIEWER_MISMATCH', 'environment'],
    ['ENVIRONMENT_SECRET_INVENTORY_MISMATCH', 'environment-secret'],
    ['COPILOT_FORBIDDEN_SECRET', 'environment-secret'],
    ['ENVIRONMENT_VARIABLE_SHADOW', 'environment-variable'],
    ['REPOSITORY_DEMO_SECRET_MISSING', 'repo-secret'],
    ['REPOSITORY_RELEASE_SECRET_MISSCOPED', 'repo-secret'],
    ['REPOSITORY_VARIABLE_MISSING', 'repo-variable'],
    ['ACTIONS_', 'actions'],
    ['REPOSITORY_MERGE_COMMIT_DISABLED', 'actions'],
    ['PRODUCTION_PARTICIPANT_TOPOLOGY_BLOCKED', 'production'],
  ];
  function scopeForPolicy(code) {
    return policyScopes.find(([prefix]) => code.startsWith(prefix))[1];
  }

  test('accepts every scanner code only with its exact mapping', () => {
    for (const code of SCANNER_FINDING_CODES) {
      const finding = buildFinding();
      finding.code = code;
      finding.scope = code === 'TRACKED_FILE_LIST_FAILED' ? 'workflow' :
        ['TRACKED_FILE_READ_FAILED', 'SCHEMA_INVALID'].includes(code) ?
          'collection' : 'workflow-file';
      if (code === 'SCHEMA_INVALID') {
        finding.path = null;
        finding.location = null;
      }
      expect(validateGovernanceFinding(finding).ok).toBe(true);
      finding.scope = 'branch';
      expect(errorPairs(validateGovernanceFinding(finding))).toContainEqual([
        '/scope', STRUCTURAL_MESSAGES.REQUIRED_LITERAL,
      ]);
    }
  });

  test('accepts every policy code only with exact scope/severity/null location', () => {
    for (const code of POLICY_FINDING_CODES) {
      const finding = buildFinding();
      finding.kind = 'policy';
      finding.code = code;
      finding.scope = scopeForPolicy(code);
      finding.severity =
        code === 'PRODUCTION_PARTICIPANT_TOPOLOGY_BLOCKED' ? 'warning' : 'error';
      finding.path = null;
      finding.location = null;
      expect(validateGovernanceFinding(finding).ok).toBe(true);
      finding.path = 'policy/path';
      expect(errorPairs(validateGovernanceFinding(finding))).toContainEqual([
        '/path', STRUCTURAL_MESSAGES.REQUIRED_LITERAL,
      ]);
    }
  });

  test.each([
    ['subject', '', STRUCTURAL_MESSAGES.EXPECTED_STRING],
    ['subject', ` ${'a'.repeat(2)}`, STRUCTURAL_MESSAGES.EXPECTED_STRING],
    ['subject', 'e\u0301', STRUCTURAL_MESSAGES.EXPECTED_STRING],
    ['message', 'line\nbreak', STRUCTURAL_MESSAGES.EXPECTED_STRING],
    ['message', '\ud800', STRUCTURAL_MESSAGES.EXPECTED_STRING],
    ['remediation', `a\u2066b`, STRUCTURAL_MESSAGES.EXPECTED_STRING],
    ['remediation', 'a'.repeat(501), STRUCTURAL_MESSAGES.EXPECTED_STRING],
    ['message', 7, STRUCTURAL_MESSAGES.EXPECTED_STRING],
  ])('rejects invalid structural prose at /%s', (field, value, message) => {
    const finding = buildFinding();
    finding[field] = value;
    expect(errorPairs(validateGovernanceFinding(finding))).toEqual([
      [`/${field}`, message],
    ]);
  });

  test('validates location and the non-null location/path relationship', () => {
    const finding = buildFinding();
    finding.path = null;
    expect(errorPairs(validateGovernanceFinding(finding))).toEqual([
      ['/location', STRUCTURAL_MESSAGES.REQUIRED_LITERAL],
      ['/path', STRUCTURAL_MESSAGES.REQUIRED_LITERAL],
    ]);
    finding.path = 'valid/path';
    finding.location = {column: 1, line: 1};
    expect(errorPairs(validateGovernanceFinding(finding))).toEqual([
      ['/location', shapeMessage],
    ]);
    finding.location = {line: 0, column: 1};
    expect(errorPairs(validateGovernanceFinding(finding))).toEqual([
      ['/location/line', STRUCTURAL_MESSAGES.EXPECTED_INTEGER],
    ]);
  });
});

describe('typed evidence ordering, identity, and mutation safety', () => {
  test.each(['expected', 'observed', 'related'])(
    'rejects reordered and duplicate %s evidence without mutation', bucket => {
      for (const items of [
        [evidenceItem(2), evidenceItem(1)],
        [evidenceItem(1), evidenceItem(1, 'protected')],
      ]) {
        const finding = buildFinding();
        finding.evidence[bucket] = items;
        const before = snapshotGraph(finding);
        const result = validateGovernanceFinding(finding);
        expect(errorPairs(result)).toEqual([[
          `/evidence/${bucket}/1`,
          items[0].name === items[1].name ?
            STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY :
            STRUCTURAL_MESSAGES.CANONICAL_ORDER,
        ]]);
        expect(snapshotGraph(finding)).toEqual(before);
      }
    },
  );

  test.each([
    [{name: 'x', namespace: 'action'}, shapeMessage],
    [{namespace: 'action', name: 'x', extra: true}, shapeMessage],
    [{type: 'action', value: 'x'}, shapeMessage],
    [{namespace: 'unknown', name: 'x'}, STRUCTURAL_MESSAGES.EXPECTED_ENUM],
    [{namespace: 'action'}, shapeMessage],
    [{namespace: 'action', name: 'x', state: 'unknown'},
      STRUCTURAL_MESSAGES.EXPECTED_ENUM],
  ])('rejects malformed evidence records structurally', (item, message) => {
    const finding = buildFinding();
    finding.evidence.expected = [item];
    expect(errorPairs(validateGovernanceFinding(finding))).toContainEqual([
      message === shapeMessage ? '/evidence/expected/0' :
        item.state === 'unknown' ? '/evidence/expected/0/state' :
          '/evidence/expected/0/namespace',
      message,
    ]);
  });

  test('accepts both inventories and keeps equal cross-bucket items distinct', () => {
    const finding = buildFinding({evidenceShape: 'two-key'});
    const shared = {namespace:
      GOVERNANCE_CONTRACT.evidence.identifierNamespaces[0], name: 'same'};
    finding.evidence.expected = [cloneWithDescriptors(shared)];
    finding.evidence.observed = [cloneWithDescriptors(shared)];
    finding.evidence.related = [cloneWithDescriptors(shared)];
    expect(validateGovernanceFinding(finding).ok).toBe(true);
    const identity = findingIdentity(finding);
    expect(identity.slice(13)).toEqual([
      identity[13], identity[13], identity[13],
    ]);
  });

  test('returns exact fresh primitive identity with state and bucket boundaries', () => {
    const finding = buildFinding();
    const first = findingIdentity(finding);
    const second = findingIdentity(finding);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(false);
    expect(first).toHaveLength(16);
    expect(first.slice(0, 13)).toEqual([
      2, 'scanner', 'TRACKED_FILE_LIST_FAILED', 'error', 'workflow',
      'fixture-subject', 'STRUCTURAL_FIXTURE_MESSAGE',
      'STRUCTURAL_FIXTURE_REMEDIATION', 1, '.github/workflows/fixture.yml',
      1, 1, 1,
    ]);
    expect(first.every(value =>
      typeof value === 'string' || typeof value === 'number')).toBe(true);
    const changedState = cloneWithDescriptors(finding);
    changedState.evidence.expected[0].state = 'active';
    const changedBucket = cloneWithDescriptors(finding);
    [changedBucket.evidence.expected, changedBucket.evidence.observed] =
      [changedBucket.evidence.observed, changedBucket.evidence.expected];
    expect(findingIdentity(changedState)).not.toEqual(first);
    expect(findingIdentity(changedBucket)).not.toEqual(first);
    expect(snapshotGraph(finding)).toEqual(snapshotGraph(buildFinding()));
  });

  test('shares branded context and prefixes in-context errors exactly', () => {
    const finding = buildFinding();
    finding.evidence.expected[0] = {name: 'x', namespace: 'action'};
    let contextKeys;
    const result = validateRoot(finding, 400, (clone, context) => {
      contextKeys = Object.keys(context);
      expect(validateGovernanceFindingInContext(
        clone, context, '/findings/0',
      )).toBeUndefined();
    });
    expect(contextKeys).toEqual([
      'ownKeySlots', 'visitedValues', 'stringCodeUnits',
      'maxContainerDepth', 'diagnosticCount',
    ]);
    expect(errorPairs(result)).toEqual([
      ['/findings/0/evidence/expected/0', shapeMessage],
    ]);
    expectFrozenFailure(result);
  });

  test('uses only declared dependencies and contains no mutation shortcuts', () => {
    const source = fs.readFileSync(require.resolve(modulePath), 'utf8');
    expect(source.match(/require\('[^']+'\)/g)).toEqual([
      "require('./github-governance-contract')",
      "require('./github-governance-validation-runtime')",
      "require('./github-governance-validation-ordering')",
    ]);
    expect(source).not.toMatch(
      /test-support|runtime-policy|\.sort\(|JSON\.|structuredClone|TODO|FIXME|HACK|\/tmp|\/var\/tmp/,
    );
    expect(source).not.toMatch(
      /Object\.(?:defineProperty|preventExtensions|seal)|\bconsole\.|\bprocess\./,
    );
  });
});

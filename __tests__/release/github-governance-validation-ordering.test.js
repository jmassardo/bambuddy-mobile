'use strict';

const fs = require('fs');
const orderingPath = '../../scripts/release/github-governance-validation-ordering';
const runtimePath = '../../scripts/release/github-governance-validation-runtime';
const {
  buildContract,
  buildFinding,
  buildWorkflowScan,
  buildNormalizedGovernanceState,
  snapshotGraph,
} = require("../../test-support/release/github-governance-validation-fixtures");

const {
  comparePrimitive,
  compareTuples,
  foldAsciiCase,
  identityTuple,
  requireCanonicalArray,
  requireCanonicalStrings,
} = require(orderingPath);
const {STRUCTURAL_MESSAGES, validateRoot} = require(runtimePath);

function assertUnchanged(source, budget, validate) {
  const sourceSnapshot = snapshotGraph(source);
  let cloneSnapshot;
  let observedContext;
  const result = validateRoot(source, budget, (clone, context) => {
    cloneSnapshot = snapshotGraph(clone);
    observedContext = {...context};
    expect(Object.isFrozen(context)).toBe(true);
    expect(validate(clone, context)).toBeUndefined();
    expect(snapshotGraph(clone)).toEqual(cloneSnapshot);
    expect({...context}).toEqual(observedContext);
  });
  expect(snapshotGraph(source)).toEqual(sourceSnapshot);
  return {result, observedContext};
}

function messages(result) {
  return result.errors.map(error => [error.path, error.message]);
}

describe('github governance validation ordering', () => {
  test('publishes the exact frozen ordering surface and deterministic primitives', () => {
    const ordering = require(orderingPath);
    expect(Object.keys(ordering)).toEqual([
      'comparePrimitive',
      'compareTuples',
      'foldAsciiCase',
      'identityTuple',
      'requireCanonicalArray',
      'requireCanonicalStrings',
    ]);
    expect(Object.isFrozen(ordering)).toBe(true);
    expect(Object.values(ordering).every(Object.isFrozen)).toBe(true);
    expect([
      comparePrimitive('a', 'b'),
      comparePrimitive('\ud83d\ude00', '\ue000'),
      comparePrimitive(null, 0),
      comparePrimitive(-1, null),
      comparePrimitive(4, 4),
      compareTuples(['a', null], ['a', 0]),
      compareTuples(['a', 1], ['a', 2]),
      foldAsciiCase('AbC-\u00c4'),
      identityTuple(['ALICE', 7, null]),
    ]).toEqual([-1, -1, 0, -1, 0, 0, -1, 'abc-\u00c4', ['alice', 7, null]]);
  });

  test('accepts canonical fixture collections without sorting or mutating', () => {
    const contract = buildContract();
    contract.requiredChecks = ['alpha', 'beta'];
    const finding = buildFinding();
    finding.evidence.expected = [
      {namespace: 'action', name: 'alpha', state: 'protected'},
      {namespace: 'action', name: 'beta', state: 'protected'},
    ];
    const workflow = buildWorkflowScan();
    workflow.scannedFiles = ['a.yml', 'b.yml'];
    const normalized = buildNormalizedGovernanceState();
    normalized.collaborators = [
      {login: 'alpha', id: 1, permission: 'read'},
      {login: 'beta', id: 2, permission: 'read'},
    ];
    const cases = [
      [contract, 311, (clone, context) =>
        requireCanonicalStrings(context, clone.requiredChecks, '/requiredChecks')],
      [finding, 400, (clone, context) => requireCanonicalArray(
        context, clone.evidence.expected, '/evidence/expected',
        item => [item.namespace, item.name, item.state],
        item => [item.namespace, item.name],
      )],
      [workflow, 2015003, (clone, context) =>
        requireCanonicalStrings(context, clone.scannedFiles, '/scannedFiles')],
      [normalized, 2592031, (clone, context) =>
        requireCanonicalArray(
          context, clone.collaborators, '/collaborators',
          item => [item.login, item.id],
          item => [item.login],
        )],
    ];
    for (const [source, budget, validate] of cases) {
      const attempt = assertUnchanged(source, budget, validate);
      expect(attempt.result).toEqual({ok: true, value: attempt.result.value});
      expect(Object.keys(attempt.observedContext)).toEqual([
        'ownKeySlots', 'visitedValues', 'stringCodeUnits',
        'maxContainerDepth', 'diagnosticCount',
      ]);
    }
  });

  test.each([
    ['swapped strings', ['beta', 'alpha'], [
      ['/requiredChecks/1', STRUCTURAL_MESSAGES.CANONICAL_ORDER],
    ]],
    ['equal string duplicate', ['alpha', 'alpha'], [
      ['/requiredChecks/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ]],
    ['case-fold collision', ['ALPHA', 'alpha'], [
      ['/requiredChecks/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ]],
  ])('reports deterministic errors without changing every negative fixture: %s',
    (_name, requiredChecks, expected) => {
      const source = buildContract();
      source.requiredChecks = requiredChecks;
      const first = assertUnchanged(source, 311, (clone, context) =>
        requireCanonicalStrings(context, clone.requiredChecks, '/requiredChecks'));
      const second = assertUnchanged(source, 311, (clone, context) =>
        requireCanonicalStrings(context, clone.requiredChecks, '/requiredChecks'));
      expect(messages(first.result)).toEqual(expected);
      expect(messages(second.result)).toEqual(expected);
    });

  test('detects ASCII-folded login identity separately from numeric ordering', () => {
    const source = buildNormalizedGovernanceState();
    source.collaborators = [
      {login: 'ALICE', id: 100, permission: 'read'},
      {login: 'alice', id: 101, permission: 'read'},
    ];
    const attempt = assertUnchanged(source, 2592031, (clone, context) =>
      requireCanonicalArray(
        context, clone.collaborators, '/collaborators',
        item => [item.id],
        item => [item.login],
      ));
    expect(messages(attempt.result)).toEqual([
      ['/collaborators/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ]);
  });

  test('reports equal identity tuples and preserves the detached clone contract', () => {
    const source = buildNormalizedGovernanceState();
    source.collaborators = [
      {login: 'same', id: 100, permission: 'read'},
      {login: 'same', id: 100, permission: 'read'},
    ];
    let calls;
    let attempt;
    attempt = assertUnchanged(source, 2592031, (clone, context) => {
      const sort = jest.spyOn(Array.prototype, 'sort');
      const freeze = jest.spyOn(Object, 'freeze');
      const define = jest.spyOn(Object, 'defineProperty');
      try {
        return requireCanonicalArray(
          context, clone.collaborators, '/collaborators',
          item => [item.id, item.login],
          item => [item.login, item.id],
        );
      } finally {
        calls = [sort, freeze, define].map(spy => spy.mock.calls);
        sort.mockRestore();
        freeze.mockRestore();
        define.mockRestore();
      }
    });
    expect(calls).toEqual([[], [], []]);
    expect(messages(attempt.result)).toEqual([
      ['/collaborators/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ]);
  });

  test('rejects hostile direct helper values without locale comparison or coercion', () => {
    const hook = jest.fn(() => {
      throw new Error('must not invoke caller hook');
    });
    const hostile = {
      [Symbol.toPrimitive]: hook,
      toString: hook,
      valueOf: hook,
    };
    const localeCompare = jest.spyOn(String.prototype, 'localeCompare');
    const localeLower = jest.spyOn(String.prototype, 'toLocaleLowerCase');
    const localeUpper = jest.spyOn(String.prototype, 'toLocaleUpperCase');
    try {
      expect(() => comparePrimitive(hostile, 'a')).toThrow(TypeError);
      expect(() => compareTuples([hostile], ['a'])).toThrow(TypeError);
      expect(() => foldAsciiCase(hostile)).toThrow(TypeError);
      expect(() => identityTuple([hostile])).toThrow(TypeError);
      expect(hook).not.toHaveBeenCalled();
      expect([localeCompare, localeLower, localeUpper].every(
        spy => spy.mock.calls.length === 0,
      )).toBe(true);
    } finally {
      localeCompare.mockRestore();
      localeLower.mockRestore();
      localeUpper.mockRestore();
    }
  });

  test('has exact runtime-only imports and no mutation, public error, or context state', () => {
    const source = fs.readFileSync(require.resolve(orderingPath), 'utf8');
    expect(source.match(/require\('[^']+'\)/g)).toEqual([
      "require('./github-governance-validation-runtime')",
    ]);
    expect(source).toContain(
      'const {STRUCTURAL_MESSAGES, addError, childPath} =\n' +
      "  require('./github-governance-validation-runtime');",
    );
    expect(source).not.toMatch(
      /test-support|localeCompare|toLocale|\.sort\(|compareErrors|ordinal|WeakMap|\bMap\b|\bSet\b|JSON\.|structuredClone|TODO|FIXME|HACK/,
    );
    expect(source).not.toMatch(
      /Object\.(?:defineProperty|preventExtensions|seal)|context\s*=/,
    );
  });
});

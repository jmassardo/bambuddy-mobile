'use strict';
const runtimePath = '../../scripts/release/github-governance-validation-runtime',
  policyPath = '../../scripts/release/github-governance-validation-runtime-policy',
  walkPath = '../../scripts/release/github-governance-validation-walk';
const {buildFinding, buildNormalizedGovernanceState, snapshotGraph} = require('../../test-support/release/github-governance-validation-fixtures');
const messages = {
  REFLECTION_FAILURE: 'Input could not be inspected safely.',
  BUDGET_EXCEEDED: 'Validation budget exceeded.',
  ACCESSOR_PROPERTY: 'Accessor properties are forbidden.',
  SYMBOL_KEY: 'Symbol keys are forbidden.',
  WRONG_PRIMITIVE_TYPE: 'Value has the wrong primitive type.',
  UNSAFE_KEY: 'Unsafe key is forbidden.',
  PLAIN_OBJECT: 'Expected a plain data object.',
  DENSE_ARRAY: 'Expected a dense array.',
  REPEATED_REFERENCE: 'Repeated or cyclic references are forbidden.',
  EXPECTED_ARRAY: 'Expected an array.',
  EXPECTED_BOOLEAN: 'Expected a boolean.',
  EXPECTED_ENUM: 'Expected an allowed value.',
  EXPECTED_INTEGER: 'Expected an integer in the allowed range.',
  EXPECTED_OBJECT: 'Expected a plain data object.',
  EXPECTED_STRING: 'Expected a string.',
  COLLECTION_LENGTH: 'Collection length exceeds its limit.',
  OBJECT_SHAPE: 'Object keys do not match the required shape and insertion order.',
  REQUIRED_LITERAL: 'Value does not match the required literal.',
  CANONICAL_ORDER: 'Collection is not in canonical order.',
  DUPLICATE_IDENTITY: 'Collection contains a duplicate identity.',
  REPOSITORY_PATH: 'Repository path format is invalid.',
};
const failure = message => ({
  ok: false, errors: [{code: 'SCHEMA_INVALID', path: '', message}],
});
function policy(budget = 311, overrides = {}) {
  return {
    ownKeySlotBudget: budget,
    limits: {
      maxDepth: 32, maxEntries: budget + 1, maxStringCodeUnits: 16777216,
      maxDiagnostics: 100, ...overrides,
    },
  };
}
function okResult(overrides = {}) {
  return {
    status: 'ok', value: Object.create(null),
    counters: {
      entries: 1, stringCodeUnits: 0, maxContainerDepth: 1, diagnostics: 0,
    },
    diagnostics: [], error: null, ...overrides,
  };
}
function load({result = okResult(), selected = policy(), walker} = {}) {
  jest.resetModules();
  const selectRootPolicy = jest.fn(() => selected);
  const walkBoundedData = walker || jest.fn(() => result);
  jest.doMock(policyPath, () => ({selectRootPolicy}));
  jest.doMock(walkPath, () => ({walkBoundedData}));
  return {
    runtime: require(runtimePath), selectRootPolicy, walkBoundedData,
  };
}
function expectFrozenFailure(result, message = messages.BUDGET_EXCEEDED) {
  expect(result).toEqual(failure(message));
  expect(Object.keys(result)).toEqual(['ok', 'errors']);
  expect(Object.keys(result.errors[0])).toEqual(['code', 'path', 'message']);
  for (const value of [result, result.errors, result.errors[0]])
    expect(Object.isFrozen(value)).toBe(true);
}
describe('governance validation runtime', () => {
  test('publishes the exact recursively frozen surface and messages', () => {
    const {runtime} = load();
    expect(Object.keys(runtime)).toEqual([
      'STRUCTURAL_MESSAGES', 'validateRoot', 'addError', 'childPath',
      'expectArray', 'expectBoolean', 'expectEnum', 'expectInteger',
      'expectNullable', 'expectObject', 'expectString',
      'validateCollectionLength', 'validateRepositoryPath',
    ]);
    expect(runtime.STRUCTURAL_MESSAGES).toEqual(messages);
    expect(Object.keys(runtime.STRUCTURAL_MESSAGES)).toEqual(Object.keys(messages));
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(Object.isFrozen(runtime.STRUCTURAL_MESSAGES)).toBe(true);
    for (const key of Object.keys(runtime).slice(1))
      expect(Object.isFrozen(runtime[key])).toBe(true);
  });
  test.each([
    [1, 311, 0], [312, 311, 311], [401, 400, 400],
    [2015004, 2015003, 2015003], [2592032, 2592031, 2592031],
  ])('derives entries %i for budget %i without touching the clone',
    (entries, budget, ownKeySlots) => {
      const clone = new Proxy({}, {
        get: () => { throw new Error('clone read'); },
        ownKeys: () => { throw new Error('clone keys'); },
        getPrototypeOf: () => { throw new Error('clone prototype'); },
        getOwnPropertyDescriptor: () => { throw new Error('clone descriptor'); },
      });
      const result = okResult({
        value: clone, counters: {
          entries, stringCodeUnits: 7, maxContainerDepth: 8, diagnostics: 0,
        },
      });
      const selected = policy(budget);
      const {runtime, selectRootPolicy, walkBoundedData} =
        load({result, selected});
      let seen;
      const output = runtime.validateRoot('original', budget,
        (value, context) => {
          seen = context;
          expect(value).toBe(clone);
          expect(Object.keys(context)).toEqual([
            'ownKeySlots', 'visitedValues', 'stringCodeUnits',
            'maxContainerDepth', 'diagnosticCount',
          ]);
          expect(context).toEqual({
            ownKeySlots, visitedValues: entries, stringCodeUnits: 7,
            maxContainerDepth: 8, diagnosticCount: 0,
          });
          expect(Object.isFrozen(context)).toBe(true);
        });
      expect(selectRootPolicy).toHaveBeenCalledTimes(1);
      expect(walkBoundedData).toHaveBeenCalledWith(
        'original', selected.limits);
      expect(output.value).toBe(clone);
      expect(Object.isFrozen(output)).toBe(true);
      expect(Object.isFrozen(clone)).toBe(false);
      expect(() => runtime.addError({}, '', messages.EXPECTED_STRING)).toThrow('Validation helper arguments are invalid.');
      expect(seen).toBeDefined();
    });
  test.each([
    ['missing entries', {}, {}],
    ['zero entries', {entries: 0}, {}],
    ['negative entries', {entries: -1}, {}],
    ['fractional entries', {entries: 1.5}, {}],
    ['infinite entries', {entries: Infinity}, {}],
    ['unsafe entries', {entries: Number.MAX_SAFE_INTEGER + 1}, {}],
    ['entries over policy', {entries: 313}, {}],
    ['negative strings', {stringCodeUnits: -1}, {}],
    ['strings over policy', {stringCodeUnits: 11}, {maxStringCodeUnits: 10}],
    ['negative depth', {maxContainerDepth: -1}, {}],
    ['depth over walker limit', {maxContainerDepth: 33}, {}],
    ['negative diagnostics', {diagnostics: -1}, {}],
    ['diagnostic mismatch', {diagnostics: 1}, {}],
  ])('fails closed for malformed metadata: %s',
    (_name, changedCounters, changedLimits) => {
      const clone = new Proxy({}, {get: () => { throw new Error('touched'); }});
      const counters = {
        entries: 1, stringCodeUnits: 0, maxContainerDepth: 1, diagnostics: 0,
        ...changedCounters,
      };
      if (_name === 'missing entries') delete counters.entries;
      const callback = jest.fn();
      const {runtime} = load({
        result: okResult({value: clone, counters}),
        selected: policy(311, changedLimits),
      });
      expectFrozenFailure(runtime.validateRoot({}, 311, callback));
      expect(callback).not.toHaveBeenCalled();
    });
  test('rejects inconsistent policies and obsolete normalized budget', () => {
    for (const selected of [
      policy(311, {maxEntries: 311}), policy(312), policy(311, {maxDiagnostics: 99}),
    ]) {
      const callback = jest.fn();
      const {runtime} = load({selected});
      expectFrozenFailure(runtime.validateRoot({}, 311, callback));
      expect(callback).not.toHaveBeenCalled();
    }
    const {runtime, walkBoundedData} = load({selected: null});
    expectFrozenFailure(runtime.validateRoot({}, 2594433, () => undefined));
    expect(walkBoundedData).not.toHaveBeenCalled();
  });
  test.each([
    ['inspection-fatal', messages.REFLECTION_FAILURE],
    ['budget-fatal', messages.BUDGET_EXCEEDED],
    ['configuration-fatal', messages.BUDGET_EXCEEDED],
    ['unknown', messages.BUDGET_EXCEEDED],
  ])('maps %s to its singleton', (status, message) => {
    const {runtime} = load({result: {status}});
    const first = runtime.validateRoot({}, 311, () => undefined);
    const second = runtime.validateRoot({}, 311, () => undefined);
    expectFrozenFailure(first, message);
    expectFrozenFailure(second, message);
    expect(first).not.toBe(second);
    expect(first.errors).not.toBe(second.errors);
  });
  test('maps diagnostics, preserves ordinals, and sorts by UTF-16 fields', () => {
    const diagnostics = [
      {code: 'SYMBOL_KEY', path: '/z'},
      {code: 'ACCESSOR_GETTER', path: '/a'},
      {code: 'REPEATED_REFERENCE', path: '/a'},
    ];
    const result = okResult({
      diagnostics,
      counters: {
        entries: 1, stringCodeUnits: 0, maxContainerDepth: 1,
        diagnostics: diagnostics.length,
      },
    });
    const {runtime} = load({result});
    const output = runtime.validateRoot({}, 311, (_clone, context) => {
      runtime.addError(context, '/a', messages.ACCESSOR_PROPERTY);
      runtime.addError(context, '/a/~0/~1', messages.EXPECTED_STRING);
    });
    expect(output.errors.map(({path, message}) => [path, message])).toEqual([
      ['/a', messages.ACCESSOR_PROPERTY],
      ['/a', messages.ACCESSOR_PROPERTY],
      ['/a', messages.REPEATED_REFERENCE],
      ['/a/~0/~1', messages.EXPECTED_STRING],
      ['/z', messages.SYMBOL_KEY],
    ]);
    expect(output.errors.every(error => Object.isFrozen(error))).toBe(true);
  });
  test.each([
    [[{code: 'UNKNOWN', path: ''}], 1],
    [[{code: 'SYMBOL_KEY', path: 'bad'}], 1],
    [[{path: ''}], 1],
    [[{code: 'SYMBOL_KEY', path: '', extra: true}], 1],
    [new Array(1), 1],
  ])('rejects malformed diagnostics before callback', (diagnostics, count) => {
    const callback = jest.fn();
    const {runtime} = load({result: okResult({
      diagnostics,
      counters: {
        entries: 1, stringCodeUnits: 0, maxContainerDepth: 1,
        diagnostics: count,
      },
    })});
    expectFrozenFailure(runtime.validateRoot({}, 311, callback));
    expect(callback).not.toHaveBeenCalled();
  });
  test('shares the exact 100/101 cap across diagnostics and callback', () => {
    const diagnostics = Array.from({length: 100},
      (_, index) => ({code: 'SYMBOL_KEY', path: `/${index}`}));
    const result = okResult({
      diagnostics,
      counters: {
        entries: 1, stringCodeUnits: 0, maxContainerDepth: 1,
        diagnostics: 100,
      },
    });
    let {runtime} = load({result});
    let callbackCalls = 0;
    const hundred = runtime.validateRoot({}, 311, () => { callbackCalls += 1; });
    expect(callbackCalls).toBe(1);
    expect(hundred.errors).toHaveLength(100);
    ({runtime} = load({result}));
    expectFrozenFailure(runtime.validateRoot({}, 311, (_clone, context) => {
      expect(runtime.addError(context, '/overflow', messages.EXPECTED_STRING))
        .toBe(false);
    }));
  });
  test.each([[() => 1], [() => Promise.resolve()], [() => ({then() {}})],
    [() => { throw new Error('secret'); }]])(
    'fails closed for an invalid callback completion', callback => {
    const {runtime} = load();
    expectFrozenFailure(runtime.validateRoot({}, 311, callback));
  });
  test('passes a detached mutable clone once with undefined this', () => {
    const original = buildFinding();
    const before = snapshotGraph(original);
    jest.resetModules();
    jest.dontMock(policyPath);
    jest.dontMock(walkPath);
    const runtime = require(runtimePath);
    let callbackClone;
    const output = runtime.validateRoot(original, 400, function (clone) {
      expect(this).toBeUndefined();
      callbackClone = clone;
      clone.subject = 'callback-local';
    });
    expect(output).toEqual(expect.objectContaining({ok: true}));
    expect(output.value).toBe(callbackClone);
    expect(output.value.subject).toBe('callback-local');
    expect(snapshotGraph(original)).toEqual(before);
    const second = runtime.validateRoot(original, 400, () => undefined);
    expect(second.value).not.toBe(output.value);
    expect(second.value.subject).not.toBe('callback-local');
  });
  test('implements helper contracts and canonical child paths', () => {
    const {runtime} = load();
    const output = runtime.validateRoot({}, 311, (_clone, context) => {
      expect(runtime.childPath('', '')).toBe('/');
      expect(runtime.childPath('/a~0b', 'x~/y')).toBe('/a~0b/x~0~1y');
      expect(runtime.expectArray(context, [], '/a')).toEqual([]);
      expect(runtime.expectBoolean(context, false, '/b')).toBe(false);
      expect(runtime.expectEnum(
        context, 0, '/e', Object.freeze([null, 0, 'x', true]))).toBe(0);
      expect(runtime.expectInteger(context, 2, '/i', 1, 2)).toBe(2);
      const present = function (inner, value, path) {
        expect(inner).toBe(context);
        expect(path).toBe('/n');
        return value;
      };
      expect(runtime.expectNullable(context, null, '/n', present)).toBeNull();
      expect(runtime.expectNullable(context, 'x', '/n', present)).toBe('x');
      expect(runtime.expectObject(context, {}, '/o')).toEqual({});
      expect(runtime.expectString(context, '', '/s')).toBe('');
      expect(runtime.validateCollectionLength(context, [], '/c', 0)).toBe(true);
      expect(runtime.expectString(context, 1, '/bad')).toBeNull();
    });
    expect(output.errors).toEqual([
      {code: 'SCHEMA_INVALID', path: '/bad', message: messages.EXPECTED_STRING},
    ]);
    for (const call of [
      () => runtime.childPath('bad', 'x'),
      () => runtime.expectEnum({}, 1, '', Object.freeze([1])),
    ]) expect(call).toThrow(new TypeError('Validation helper arguments are invalid.'));
  });
  test('collection overflow is fatal and depth nine skips callback', () => {
    let {runtime} = load();
    expectFrozenFailure(runtime.validateRoot({}, 311, (_clone, context) => {
      expect(runtime.validateCollectionLength(context, [1], '/items', 0))
        .toBe(false);
    }));
    const callback = jest.fn();
    ({runtime} = load({result: okResult({counters: {
      entries: 1, stringCodeUnits: 0, maxContainerDepth: 9, diagnostics: 0,
    }})}));
    expectFrozenFailure(runtime.validateRoot({}, 311, callback));
    expect(callback).not.toHaveBeenCalled();
  });
  test('accepts exact RepositoryPath boundaries and rejects the grammar', () => {
    const valid = [
      'a', 'a%20b', '#fragment', 'é/😀', `${'a/'.repeat(119)}a`,
      'a'.repeat(240),
    ];
    const invalid = [
      '', 1, '/a', 'a/', 'a//b', 'a\\b', '.', '..', 'a/.', 'a/..',
      'a ', 'a.', 'CON', 'con.txt', 'COM9.x', 'LPT1', 'a:b', 'a?b',
      'a*b', 'a|b', 'a\u0000b', '\ud800', '\udc00', 'a'.repeat(241),
      `${'a/'.repeat(120)}a`,
    ];
    const {runtime} = load();
    const output = runtime.validateRoot({}, 311, (_clone, context) => {
      for (const path of valid)
        expect(runtime.validateRepositoryPath(context, path, '/path')).toBe(true);
      for (const path of invalid)
        expect(runtime.validateRepositoryPath(context, path, '/path')).toBe(false);
    });
    expect(output.errors).toHaveLength(invalid.length);
    expect(new Set(output.errors.map(error => error.message)))
      .toEqual(new Set([messages.REPOSITORY_PATH]));
  });
  test('the 15001st RepositoryPath occurrence fails without reading value', () => {
    const {runtime} = load();
    const output = runtime.validateRoot({}, 311, (_clone, context) => {
      for (let index = 0; index < 15000; index += 1)
        expect(runtime.validateRepositoryPath(context, 'a', '/path')).toBe(true);
      const unreadable = new Proxy({}, {get: () => { throw new Error('read'); }});
      expect(runtime.validateRepositoryPath(context, unreadable, '/path'))
        .toBe(false);
    });
    expectFrozenFailure(output);
  });
  test('keeps production free of forbidden imports and graph revisits', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require.resolve(runtimePath), 'utf8');
    expect(source).not.toMatch(/test-support|compareGovernanceFindings|localeCompare/);
    expect(source).not.toMatch(/TODO|FIXME|HACK|console\.|JSON\.stringify/);
    expect(buildNormalizedGovernanceState).toEqual(expect.any(Function));
  });
});

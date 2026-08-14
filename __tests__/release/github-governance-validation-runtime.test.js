'use strict';
const runtimePath = '../../scripts/release/github-governance-validation-runtime', policyPath =
  '../../scripts/release/github-governance-validation-runtime-policy',
  walkPath = '../../scripts/release/github-governance-validation-walk';
const {buildFinding, buildNormalizedGovernanceState, snapshotGraph} = require('../../test-support/release/github-governance-validation-fixtures');
const messages = Object.fromEntries([
  ['REFLECTION_FAILURE', 'Input could not be inspected safely.'], ['BUDGET_EXCEEDED', 'Validation budget exceeded.'],
  ['ACCESSOR_PROPERTY', 'Accessor properties are forbidden.'], ['SYMBOL_KEY', 'Symbol keys are forbidden.'],
  ['WRONG_PRIMITIVE_TYPE', 'Value has the wrong primitive type.'], ['UNSAFE_KEY', 'Unsafe key is forbidden.'],
  ['PLAIN_OBJECT', 'Expected a plain data object.'], ['DENSE_ARRAY', 'Expected a dense array.'],
  ['REPEATED_REFERENCE', 'Repeated or cyclic references are forbidden.'], ['EXPECTED_ARRAY', 'Expected an array.'],
  ['EXPECTED_BOOLEAN', 'Expected a boolean.'], ['EXPECTED_ENUM', 'Expected an allowed value.'],
  ['EXPECTED_INTEGER', 'Expected an integer in the allowed range.'], ['EXPECTED_OBJECT', 'Expected a plain data object.'],
  ['EXPECTED_STRING', 'Expected a string.'], ['COLLECTION_LENGTH', 'Collection length exceeds its limit.'],
  ['OBJECT_SHAPE', 'Object keys do not match the required shape and insertion order.'],
  ['REQUIRED_LITERAL', 'Value does not match the required literal.'], ['CANONICAL_ORDER', 'Collection is not in canonical order.'],
  ['DUPLICATE_IDENTITY', 'Collection contains a duplicate identity.'], ['REPOSITORY_PATH', 'Repository path format is invalid.'],
]);
const helperError = 'Validation helper arguments are invalid.';
const failure = message => ({ok: false, errors: [{code: 'SCHEMA_INVALID', path: '', message}]});
function policy(budget = 311, overrides = {}) {
  return {ownKeySlotBudget: budget, limits: {maxDepth: 32, maxEntries: budget + 1,
    maxStringCodeUnits: 16777216, maxDiagnostics: 100, ...overrides}};
}
function okResult(overrides = {}) {
  return {status: 'ok', value: Object.create(null), counters: {entries: 1, stringCodeUnits: 0,
    maxContainerDepth: 1, diagnostics: 0}, diagnostics: [], error: null, ...overrides};
}
function load({result = okResult(), selected = policy(), walker} = {}) {
  jest.resetModules();
  const selectRootPolicy = jest.fn(() => selected),
    walkBoundedData = walker || jest.fn(() => result);
  jest.doMock(policyPath, () => ({selectRootPolicy}));
  jest.doMock(walkPath, () => ({walkBoundedData}));
  return {runtime: require(runtimePath), selectRootPolicy, walkBoundedData};
}
function frozenFailure(result, message = messages.BUDGET_EXCEEDED) {
  expect(result).toEqual(failure(message));
  expect([Object.keys(result), Object.keys(result.errors[0])])
    .toEqual([['ok', 'errors'], ['code', 'path', 'message']]);
  expect(['value', 'counters', 'context', 'ordinal'].some(key => key in result)).toBe(false);
  for (const item of [result, result.errors, result.errors[0]]) expect(Object.isFrozen(item)).toBe(true);
}
function trapClone() {
  const touched = jest.fn(), fail = () => { touched(); throw new Error('clone trap'); };
  const clone = new Proxy({}, {get: fail, set: fail, has: fail, ownKeys: fail,
    getPrototypeOf: fail, getOwnPropertyDescriptor: fail, defineProperty: fail,
    deleteProperty: fail, preventExtensions: fail, isExtensible: fail});
  return {clone, touched};
}
describe('governance validation runtime', () => {
  test('publishes the exact frozen surface, messages, and arities', () => {
    const {runtime} = load();
    expect(Object.keys(runtime)).toEqual([
      'STRUCTURAL_MESSAGES', 'validateRoot', 'addError', 'childPath',
      'expectArray', 'expectBoolean', 'expectEnum', 'expectInteger',
      'expectNullable', 'expectObject', 'expectString', 'validateCollectionLength',
      'validateRepositoryPath']);
    expect(runtime.STRUCTURAL_MESSAGES).toEqual(messages);
    expect(Object.keys(runtime.STRUCTURAL_MESSAGES)).toEqual(Object.keys(messages));
    expect(Object.isFrozen(runtime)).toBe(true);
    for (const value of Object.values(runtime)) expect(Object.isFrozen(value)).toBe(true);
    expect(Object.values(runtime).slice(1).map(fn => fn.length)).toEqual(
      [3, 3, 2, 3, 3, 4, 5, 4, 3, 3, 4, 3]);
  });
  test.each([
    [1, 311, 0], [312, 311, 311], [401, 400, 400],
    [2015004, 2015003, 2015003], [2592032, 2592031, 2592031],
  ])('derives entry metadata %i/%i without clone access',
    (entries, budget, ownKeySlots) => {
      const {clone, touched} = trapClone();
      const selected = policy(budget);
      const result = okResult({value: clone, counters: {entries,
        stringCodeUnits: 7, maxContainerDepth: 8, diagnostics: 0}});
      const {runtime, selectRootPolicy, walkBoundedData} = load({result, selected});
      const {clone: original, touched: originalTouched} = trapClone();
      const callback = jest.fn((value, context) => {
        expect(value).toBe(clone);
        expect(Object.keys(context)).toEqual(['ownKeySlots', 'visitedValues',
          'stringCodeUnits', 'maxContainerDepth', 'diagnosticCount']);
        expect(context).toEqual({ownKeySlots, visitedValues: entries,
          stringCodeUnits: 7, maxContainerDepth: 8, diagnosticCount: 0});
        expect(Object.isFrozen(context)).toBe(true);
      });
      const output = runtime.validateRoot(original, budget, callback);
      expect(selectRootPolicy.mock.calls).toEqual([[budget]]);
      expect(walkBoundedData).toHaveBeenCalledTimes(1);
      expect(walkBoundedData.mock.calls[0][0]).toBe(original); expect(walkBoundedData.mock.calls[0][1]).toBe(selected.limits);
      expect(callback).toHaveBeenCalledTimes(1); expect(callback.mock.calls[0]).toHaveLength(2);
      expect(output.value).toBe(clone);
      expect([Object.keys(output), Object.isFrozen(output)]).toEqual([['ok', 'value'], true]);
      expect([touched, originalTouched].every(mock => mock.mock.calls.length === 0)).toBe(true);
    });
  test('fails closed for every malformed scalar without clone access', () => {
    const common = [undefined, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1];
    const cases = [
      ...[undefined, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, 313]
        .map(value => ['entries', value]),
      ...['stringCodeUnits', 'maxContainerDepth'].flatMap(key =>
        common.map(value => [key, value])),
      ...[...common, 1].map(value => ['diagnostics', value]),
    ];
    for (const [key, invalid] of cases) {
      const {clone, touched} = trapClone(),
        counters = {...okResult().counters, [key]: invalid}, callback = jest.fn();
      const {runtime} = load({result: okResult({value: clone, counters})});
      frozenFailure(runtime.validateRoot({}, 311, callback));
      expect(callback).not.toHaveBeenCalled();
      expect(touched).not.toHaveBeenCalled();
    }
  });
  test('rejects impossible diagnostics and inconsistent policy relations', () => {
    const impossible = Array.from({length: 101}, (_, index) => ({code: 'SYMBOL_KEY', path: `/${index}`}));
    for (const [result, selected] of [
      [okResult({diagnostics: impossible, counters: {entries: 1,
        stringCodeUnits: 0, maxContainerDepth: 1, diagnostics: 101}}), policy()],
      [okResult(), policy(311, {maxEntries: 311})], [okResult(), policy(312)],
      [okResult(), policy(311, {maxDiagnostics: 99})],
      [okResult({counters: {entries: 1, stringCodeUnits: 11,
        maxContainerDepth: 1, diagnostics: 0}}),
      policy(311, {maxStringCodeUnits: 10})],
      [okResult({counters: {entries: 1, stringCodeUnits: 0,
        maxContainerDepth: 33, diagnostics: 0}}), policy()],
    ]) {
      const callback = jest.fn(), {runtime} = load({result, selected});
      frozenFailure(runtime.validateRoot({}, 311, callback));
      expect(callback).not.toHaveBeenCalled();
    }
  });
  test('uses integrated amended budget and rejects obsolete budget before input', () => {
    jest.resetModules();
    jest.dontMock(policyPath); jest.dontMock(walkPath);
    const runtime = require(runtimePath);
    expect(runtime.validateRoot(buildNormalizedGovernanceState(), 2592031,
      () => undefined).ok).toBe(true);
    const {clone: hostile, touched} = trapClone();
    frozenFailure(runtime.validateRoot(hostile, 2594433, () => undefined));
    expect(touched).not.toHaveBeenCalled();
  });
  test('invalid callback performs no walker or input access', () => {
    const {clone: hostile, touched} = trapClone(),
      {runtime, walkBoundedData, selectRootPolicy} = load();
    frozenFailure(runtime.validateRoot(hostile, 311, null));
    expect(selectRootPolicy).toHaveBeenCalledWith(311);
    expect([walkBoundedData, touched].every(mock => mock.mock.calls.length === 0))
      .toBe(true);
  });
  test.each([['inspection-fatal', messages.REFLECTION_FAILURE],
    ['budget-fatal', messages.BUDGET_EXCEEDED],
    ['configuration-fatal', messages.BUDGET_EXCEEDED],
    ['unknown', messages.BUDGET_EXCEEDED]])(
    'maps %s to fresh frozen singleton', (status, message) => {
    const {runtime} = load({result: {status}});
    const first = runtime.validateRoot({}, 311, () => undefined),
      second = runtime.validateRoot({}, 311, () => undefined);
    frozenFailure(first, message); frozenFailure(second, message);
    expect(first).not.toBe(second); expect(first.errors).not.toBe(second.errors);
  });
  test('maps all diagnostics and rejects every malformed shape before callback', () => {
    const mapping = [
      ['ACCESSOR_GETTER', messages.ACCESSOR_PROPERTY], ['ACCESSOR_SETTER', messages.ACCESSOR_PROPERTY],
      ['ACCESSOR_GETTER_SETTER', messages.ACCESSOR_PROPERTY], ['SYMBOL_KEY', messages.SYMBOL_KEY],
      ['SYMBOL_VALUE', messages.WRONG_PRIMITIVE_TYPE], ['UNSUPPORTED_FUNCTION', messages.WRONG_PRIMITIVE_TYPE],
      ['UNSAFE_KEY', messages.UNSAFE_KEY], ['NONPLAIN_PROTOTYPE', messages.PLAIN_OBJECT],
      ['SPARSE_ARRAY', messages.DENSE_ARRAY], ['ARRAY_NON_INDEX_KEY', messages.DENSE_ARRAY],
      ['CIRCULAR_REFERENCE', messages.REPEATED_REFERENCE],
      ['REPEATED_REFERENCE', messages.REPEATED_REFERENCE]];
    const diagnostics = mapping.map(([code], index) => ({code, path: `/${index}`}));
    let {runtime} = load({result: okResult({diagnostics, counters: {entries: 1,
      stringCodeUnits: 0, maxContainerDepth: 1, diagnostics: diagnostics.length}})});
    const output = runtime.validateRoot({}, 311, () => undefined);
    expect(new Map(output.errors.map(error => [error.path, error.message])))
      .toEqual(new Map(mapping.map(([, message], index) => [`/${index}`, message])));
    for (const malformed of [
      [{code: 'UNKNOWN', path: ''}], [{code: 'SYMBOL_KEY', path: 'bad'}],
      [{path: ''}], [{code: 'SYMBOL_KEY', path: '', extra: true}], new Array(1),
    ]) {
      const callback = jest.fn();
      ({runtime} = load({result: okResult({diagnostics: malformed, counters: {
        entries: 1, stringCodeUnits: 0, maxContainerDepth: 1, diagnostics: 1}})}));
      frozenFailure(runtime.validateRoot({}, 311, callback));
      expect(callback).not.toHaveBeenCalled();
    }
  });
  test('sorts by UTF-16 path, message, code, then numeric ordinal', () => {
    const {runtime} = load(), nativeSort = Array.prototype.sort;
    let compare;
    const sortSpy = jest.spyOn(Array.prototype, 'sort').mockImplementation(
      function (callback) { compare = callback; return nativeSort.call(this, callback); });
    const output = runtime.validateRoot({}, 311, (_clone, context) => {
      for (const item of [['/b', messages.EXPECTED_ARRAY], ['/a', messages.EXPECTED_STRING],
        ['/a', messages.EXPECTED_ARRAY], ['/a', messages.EXPECTED_ARRAY]]) runtime.addError(context, ...item);
    });
    sortSpy.mockRestore();
    expect(output.errors.map(error => [error.path, error.message])).toEqual([
      ['/a', messages.EXPECTED_STRING], ['/a', messages.EXPECTED_ARRAY],
      ['/a', messages.EXPECTED_ARRAY], ['/b', messages.EXPECTED_ARRAY]]);
    const record = overrides => ({code: 'same', path: '/same', message: 'same', ordinal: 5, ...overrides});
    const dimensions = [[{path: '/😀'}, {path: '/\ue000'}], [{message: '😀'}, {message: '\ue000'}],
      [{code: '😀'}, {code: '\ue000'}], [{ordinal: 4}, {ordinal: 5}]];
    expect([...dimensions.flatMap(([left, right]) => [
      compare(record(left), record(right)), compare(record(right), record(left))]),
    compare(record(), record())]).toEqual([-1, 1, -1, 1, -1, 1, -1, 1, 0]);
    expect([Object.keys(output), ...[output, output.errors, ...output.errors].map(Object.isFrozen)])
      .toEqual([['ok', 'errors'], true, true, true, true, true, true]);
    expect(output.errors.every(error => Object.keys(error).join(',') === 'code,path,message')).toBe(true);
  });
  test('shares the 100/101 cap and direct addError return contract', () => {
    const run = (sourceCount, additions) => {
      const diagnostics = Array.from({length: sourceCount}, (_, index) => ({code: 'SYMBOL_KEY', path: `/source/${index}`}));
      const counters = {entries: 1, stringCodeUnits: 0, maxContainerDepth: 1, diagnostics: sourceCount};
      const {runtime} = load({result: okResult({diagnostics, counters})});
      let returns;
      const callback = jest.fn((_clone, context) => { returns = Array.from(
        {length: additions}, (_, index) => runtime.addError(context,
          `/callback/${index}`, messages.EXPECTED_STRING)); });
      return {output: runtime.validateRoot({}, 311, callback), returns, callback};
    };
    let attempt = run(0, 102);
    expect(attempt.returns).toEqual([...Array(100).fill(true), false, false]); frozenFailure(attempt.output);
    attempt = run(100, 0);
    expect([attempt.output.errors.length, attempt.callback.mock.calls.length]).toEqual([100, 1]);
    attempt = run(2, 98);
    expect([attempt.returns.every(Boolean), attempt.output.errors.length,
      attempt.output.errors.filter(error => error.message === messages.SYMBOL_KEY).length])
      .toEqual([true, 100, 2]);
    attempt = run(2, 99);
    expect(attempt.returns).toEqual([...Array(98).fill(true), false]); frozenFailure(attempt.output);
  });
  test('covers every helper result and precondition with fresh TypeErrors', () => {
    const {runtime} = load();
    const output = runtime.validateRoot({}, 311, (_clone, context) => {
      expect(runtime.childPath('', '')).toBe('/'); expect(runtime.childPath('/a~0b', 'x~/y')).toBe('/a~0b/x~0~1y');
      const success = [
        runtime.expectArray(context, [], '/a'), runtime.expectBoolean(context, false, '/b'),
        runtime.expectEnum(context, 0, '/e', Object.freeze([null, 0, 'x', true])),
        runtime.expectInteger(context, 2, '/i', 1, 2), runtime.expectObject(context, {}, '/o'),
        runtime.expectString(context, '', '/s')];
      expect(success).toEqual([[], false, 0, 2, {}, '']);
      const present = function (inner, value, path) {
        expect([inner, path]).toEqual([context, '/n']); return value;
      };
      expect(runtime.expectNullable(context, null, '/n', present)).toBeNull();
      expect(runtime.expectNullable(context, 'x', '/n', present)).toBe('x');
      expect(runtime.validateCollectionLength(context, [], '/c', 0)).toBe(true);
      const failures = [
        runtime.expectArray(context, {}, '/fa'), runtime.expectBoolean(context, 0, '/fb'),
        runtime.expectEnum(context, 'z', '/fe', Object.freeze(['x'])),
        runtime.expectInteger(context, 3, '/fi', 1, 2), runtime.expectObject(context, [], '/fo'),
        runtime.expectString(context, 1, '/fs')];
      expect(failures).toEqual([null, null, null, null, null, null]);
      const invalid = [
        () => runtime.addError(context, '', 'other'), () => runtime.childPath('bad', 'x'),
        () => runtime.childPath('/~2', 'x'), () => runtime.childPath('', 1),
        () => runtime.expectString({}, '', ''), () => runtime.expectEnum(context, 1, '', [1]),
        () => runtime.expectEnum(context, 1, '', Object.freeze([1, 1])),
        () => runtime.expectEnum(context, 1, '', Object.freeze([{}])),
        () => runtime.expectEnum(context, 1, '', Object.freeze(new Array(1))),
        () => runtime.expectInteger(context, 1, '', 2, 1),
        () => runtime.expectInteger(context, 1, '', 0.5, 1),
        () => runtime.expectInteger(context, 1, '', 0, Number.MAX_SAFE_INTEGER + 1),
        () => runtime.expectNullable(context, 1, '', () => 1),
        () => runtime.validateCollectionLength(context, {}, '', 1),
        () => runtime.validateCollectionLength(context, [], '', -1),
        () => runtime.validateCollectionLength(context, [], '', 0.5)];
      let prior;
      for (const call of invalid) {
        let thrown;
        try { call(); } catch (error) { thrown = error; }
        expect(thrown).toEqual(new TypeError(helperError));
        expect(thrown).not.toBe(prior); prior = thrown;
      }
    });
    expect(output.errors.map(error => error.message)).toEqual([
      messages.EXPECTED_ARRAY, messages.EXPECTED_BOOLEAN, messages.EXPECTED_ENUM,
      messages.EXPECTED_INTEGER, messages.EXPECTED_OBJECT, messages.EXPECTED_STRING,
    ]);
    frozenFailure(runtime.validateRoot({}, 311, (_clone, context) =>
      runtime.expectNullable(context, 1, '', function () { throw new Error('x'); })));
  });
  test('collection overflow and depth nine fail before finalization', () => {
    let {runtime} = load();
    frozenFailure(runtime.validateRoot({}, 311, (_clone, context) => {
      expect(runtime.validateCollectionLength(context, [1], '/items', 0)).toBe(false);
    }));
    const callback = jest.fn();
    ({runtime} = load({result: okResult({counters: {entries: 1,
      stringCodeUnits: 0, maxContainerDepth: 9, diagnostics: 0}})}));
    frozenFailure(runtime.validateRoot({}, 311, callback));
    expect(callback).not.toHaveBeenCalled();
  });
  test.each([() => 1, () => Promise.resolve(), () => ({then() {
    throw new Error('must not inspect'); }}), () => { throw new Error('secret'); }])(
    'does not inspect or echo invalid callback completion', callback => {
      const {runtime} = load();
      frozenFailure(runtime.validateRoot({}, 311, callback));
    });
  test('preserves detached mutable clone identity and original isolation', () => {
    const original = buildFinding(), before = snapshotGraph(original);
    jest.resetModules();
    jest.dontMock(policyPath); jest.dontMock(walkPath);
    const runtime = require(runtimePath);
    let callbackClone;
    const output = runtime.validateRoot(original, 400, function (clone) {
      expect(this).toBeUndefined();
      callbackClone = clone;
      clone.subject = 'callback-local';
      clone.evidence.expected[0].name = 'nested-local';
    });
    expect(output.value).toBe(callbackClone);
    expect([Object.isFrozen(output), Object.isFrozen(output.value),
      Object.isFrozen(output.value.evidence)]).toEqual([true, false, false]);
    output.value.evidence.expected[0].name = 'caller-local';
    expect(snapshotGraph(original)).toEqual(before);
    const second = runtime.validateRoot(original, 400, () => undefined);
    expect(second.value).not.toBe(output.value);
    expect(second.value.evidence).not.toBe(output.value.evidence);
    expect(second.value.evidence.expected[0].name).not.toBe('caller-local');
  });
  test('accepts RepositoryPath boundaries and rejects every grammar class', () => {
    const valid = ['a', 'a%20b', '#fragment', 'é/😀',
      `${'a/'.repeat(119)}a`, 'a'.repeat(240)];
    const controls = [...Array.from({length: 32}, (_, unit) => `a${String.fromCharCode(unit)}b`), 'a\x7fb'];
    const reserved = ['CON', 'PRN', 'AUX', 'NUL',
      ...Array.from({length: 9}, (_, index) => `COM${index + 1}.x`), ...Array.from({length: 9}, (_, index) => `lpt${index + 1}`)];
    const invalid = ['', 1, '/a', 'a/', 'a//b', 'a\\b', '.', '..', 'a/.',
      'a/..', 'a ', 'a.', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b',
      '\ud800', '\udc00', 'a'.repeat(241), `${'a/'.repeat(120)}a`,
      ...controls, ...reserved];
    const {runtime} = load();
    const output = runtime.validateRoot({}, 311, (_clone, context) => {
      for (const value of valid)
        expect(runtime.validateRepositoryPath(context, value, '/path')).toBe(true);
      for (const value of invalid)
        expect(runtime.validateRepositoryPath(context, value, '/path')).toBe(false);
    });
    expect(output.errors).toHaveLength(invalid.length);
    expect(new Set(output.errors.map(error => error.message))).toEqual(new Set([messages.REPOSITORY_PATH]));
  });
  test('the 15001st path occurrence fails without reading value', () => {
    const {runtime} = load();
    const output = runtime.validateRoot({}, 311, (_clone, context) => {
      for (let index = 0; index < 15000; index += 1)
        expect(runtime.validateRepositoryPath(context, 'a', '/path')).toBe(true);
      const {clone, touched} = trapClone();
      expect(runtime.validateRepositoryPath(context, clone, '/path')).toBe(false);
      expect(touched).not.toHaveBeenCalled();
    });
    frozenFailure(output);
  });
  test('has exact imports and no policy copy, graph revisit, or rejected source', () => {
    const source = require('fs').readFileSync(require.resolve(runtimePath), 'utf8');
    expect(source.match(/require\('[^']+'\)/g)).toEqual([
      "require('./github-governance-validation-runtime-policy')", "require('./github-governance-validation-walk')"]);
    expect(source).not.toMatch(/test-support|ROOT_POLICIES|DECLARED_PATH_GROUPS|COLLECTION_LIMIT_ROWS/);
    expect(source).not.toMatch(/snapshotGraph|freezeDeep|walkGraph|countGraph|cloneGraph|compareGovernanceFindings/);
    expect(source).not.toMatch(/localeCompare|JSON\.stringify|console\.|TODO|FIXME|HACK|e70c8c16|b4f98865|e6e12f9d|#(?:185|167|159)/);
    expect(source).toMatch(/for \(const key of \['path', 'message', 'code'\]\)[\s\S]*left\.ordinal < right\.ordinal/);
  });
});

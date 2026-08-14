'use strict';
const fs = require('fs'), path = require('path');
const {cloneWithDescriptors, snapshotGraph} =
  require('../../test-support/release/github-governance-validation-fixtures');
const modulePath = '../../scripts/release/github-governance-validation-walk';
const walkerModule = require(modulePath);
const {walkBoundedData} = walkerModule;
function limits(overrides = {}) {
  return {maxDepth: 32, maxEntries: 100, maxStringCodeUnits: 100,
    maxOwnKeysCalls: 50, maxDescriptorCalls: 100, maxPrototypeCalls: 50,
    maxDiagnostics: 20, declaredPaths: [], collectionLimits: [], ...overrides};
}
function counters(overrides = {}) {
  return {entries: 1, stringCodeUnits: 0, ownKeysCalls: 0, descriptorCalls: 0,
    prototypeCalls: 0, maxContainerDepth: 0, diagnostics: 0, ...overrides};
}
function fatal(status, actualCounters) {
  const [code, message] = {
    'configuration-fatal': ['WALK_CONFIGURATION_INVALID', 'Walker limits are invalid.'],
    'inspection-fatal': ['WALK_INSPECTION_FAILED', 'Data inspection failed.'],
    'budget-fatal': ['WALK_BUDGET_EXCEEDED', 'Data inspection budget exceeded.'],
  }[status];
  return {status, value: null, counters: actualCounters, diagnostics: [],
    error: {code, message}};
}
const configurationFatal = fatal('configuration-fatal', counters({entries: 0}));
function accessorAt(target, key, value) {
  Object.defineProperty(target, key, {get() { return value; }}); return target;
}
const collection = record => limits({collectionLimits: [record]});
function throwingProxy(target, operation = 'ownKeys') {
  return new Proxy(target, {[operation]() { throw Error('LIMIT_SECRET'); }}); }
describe('walkBoundedData contract', () => {
  test('exports only the frozen function and preserves result key order', () => {
    expect(Object.keys(walkerModule)).toEqual(['walkBoundedData']);
    for (const exported of [walkerModule, walkBoundedData])
      expect(Object.isFrozen(exported)).toBe(true);
    const output = walkBoundedData(null, limits());
    expect(Object.keys(output)).toEqual(['status', 'value', 'counters', 'diagnostics', 'error']);
    expect(Object.keys(output.counters)).toEqual([
      'entries', 'stringCodeUnits', 'ownKeysCalls', 'descriptorCalls',
      'prototypeCalls', 'maxContainerDepth', 'diagnostics',
    ]);
    expect(output).toEqual({status: 'ok', value: null, counters: counters(),
      diagnostics: [], error: null});
  });
  test.each([
    ['undefined record', undefined], ['null record', null], ['missing keys', {}],
    ['extra key', {...limits(), extra: 1}], ['zero depth', {...limits(), maxDepth: 0}],
    ['fractional entries', {...limits(), maxEntries: 1.5}], ['negative diagnostics', {...limits(), maxDiagnostics: -1}],
    ['infinite own-key limit', limits({maxOwnKeysCalls: Infinity})], ['negative descriptor limit', limits({maxDescriptorCalls: -1})],
    ['fractional prototype limit', limits({maxPrototypeCalls: 1.1})], ['bigint string limit', limits({maxStringCodeUnits: 9n})],
    ['non-array paths', limits({declaredPaths: {}})], ['non-array path', limits({declaredPaths: [{}]})],
    ['non-string path segment', limits({declaredPaths: [[1]]})], ['unsafe segment', limits({declaredPaths: [['constructor']]})],
    ['sparse paths', limits({declaredPaths: [, ['safe']]})], ['sparse path', limits({declaredPaths: [[, 'safe']]})],
    ['symbol path key', limits({declaredPaths: [Object.assign([], {[Symbol()]: 1})]})], ['extra path key', limits({declaredPaths: [Object.assign([], {extra: 1})]})],
    ['overlapping paths', limits({declaredPaths: [['items', '*'], ['items', '0']]})],
    ['non-array collections', limits({collectionLimits: {}})], ['sparse collections', limits({collectionLimits: [, {path: [], maxLength: 1}]})],
    ['symbol collection key', limits({collectionLimits: Object.assign([], {[Symbol()]: 1})})], ['extra collection key', limits({collectionLimits: Object.assign([], {extra: 1})})],
    ['non-record collection', collection(null)], ['missing collection max', collection({path: []})], ['missing collection path', collection({maxLength: 1})],
    ['collection accessor', collection(accessorAt({path: []}, 'maxLength', 1))], ['trapped collection', collection(throwingProxy({path: [], maxLength: 1}))], ['trapped collection field', collection(throwingProxy({path: [], maxLength: 1}, 'getOwnPropertyDescriptor'))],
    ['non-array collection path', collection({path: {}, maxLength: 1})], ['non-string collection segment', collection({path: [1], maxLength: 1})],
    ['sparse collection path', collection({path: [, 'safe'], maxLength: 1})], ['collection path accessor', collection({path: accessorAt([], '0', 'safe'), maxLength: 1})],
    ['trapped collection path', collection({path: throwingProxy(['safe'], 'getOwnPropertyDescriptor'), maxLength: 1})], ['collection path symbol', collection({path: Object.assign([], {[Symbol()]: 1}), maxLength: 1})],
    ['collection path extra key', collection({path: Object.assign([], {extra: 1}), maxLength: 1})],
    ['negative collection max', collection({path: ['items'], maxLength: -1})], ['fractional collection max', collection({path: [], maxLength: 1.5})],
    ['infinite collection max', collection({path: [], maxLength: Infinity})], ['bigint collection max', collection({path: [], maxLength: 1n})], ['string collection max', collection({path: [], maxLength: '1'})],
    ['overlapping collections', limits({collectionLimits: [
      {path: ['*'], maxLength: 1}, {path: ['0'], maxLength: 2}]})],
    ['trapped root', throwingProxy(limits())], ['root accessor', accessorAt(limits(), 'maxDepth', 32)],
    ['root prototype', Object.create(limits())], ['root symbol', Object.assign(limits(), {[Symbol('hidden')]: 1})],
    ['path-list prototype', limits({declaredPaths: Object.create([])})], ['path prototype', limits({declaredPaths: [Object.create(['safe'])]})],
    ['path-list accessor', limits({declaredPaths: accessorAt([], '0', ['safe'])})], ['path accessor', limits({declaredPaths: [accessorAt([], '0', 'safe')]})],
    ['path trap', limits({declaredPaths: [throwingProxy(['safe'], 'getOwnPropertyDescriptor')]})],
    ['duplicate path', limits({declaredPaths: [['safe'], ['safe']]})], ['collection-list prototype', limits({collectionLimits: Object.create([])})],
    ['collection prototype', collection(Object.create({path: [], maxLength: 1}))], ['collection path prototype', collection({path: Object.create([]), maxLength: 1})],
    ['collection symbol', collection({path: [], maxLength: 1, [Symbol()]: 1})], ['collection extra key', collection({path: [], maxLength: 1, extra: true})],
  ])('rejects hostile limits before source access: %s', (_label, badLimits) => {
    let sourceCalls = 0;
    const source = new Proxy({}, {getPrototypeOf() {
      sourceCalls += 1; throw Error('SOURCE_MUST_NOT_RUN');
    }});
    expect(walkBoundedData(source, badLimits)).toEqual(configurationFatal);
    expect(sourceCalls).toBe(0);
  });
  test('accepts reordered reflection keys for otherwise dense limits', () => {
    const paths = new Proxy([['safe']], {ownKeys: target => Reflect.ownKeys(target).reverse()});
    expect(walkBoundedData({safe: 1}, limits({declaredPaths: paths})).status).toBe('ok');
  });
  test.each([undefined, true, -0, NaN, Infinity, 9n])(
    'clones supported non-string scalar exactly: %p', scalar => {
    const output = walkBoundedData(scalar, limits());
    expect([output.status, Object.is(output.value, scalar)]).toEqual(['ok', true]);
  });
  test('counts UTF-16 units and leaves an attempted excess uncharged', () => {
    expect(walkBoundedData('😀', limits({maxStringCodeUnits: 2}))).toEqual({
      status: 'ok', value: '😀', counters: counters({stringCodeUnits: 2}),
      diagnostics: [], error: null});
    expect(walkBoundedData('😀', limits({maxStringCodeUnits: 1}))).toEqual(fatal('budget-fatal', counters()));
  });
  test('normalizes objects and arrays to independent ordinary data clones', () => {
    const source = cloneWithDescriptors({
      fixed: Object.defineProperty({nested: 1}, 'hidden', {
        value: 2, writable: false, enumerable: false, configurable: false,
      }),
      list: [1, 2],
    });
    const policy = limits({declaredPaths: [
      ['fixed'], ['fixed', 'nested'], ['fixed', 'hidden'], ['list']]});
    const [beforeSource, beforePolicy] = [snapshotGraph(source), snapshotGraph(policy)];
    const [first, second] = [walkBoundedData(source, policy), walkBoundedData(source, policy)];
    expect(first.status).toBe('ok');
    expect([snapshotGraph(source), snapshotGraph(policy)]).toEqual([beforeSource, beforePolicy]);
    expect(first.value).not.toBe(source);
    expect(first.value).not.toBe(second.value);
    expect(Object.getPrototypeOf(first.value)).toBeNull();
    expect(Array.isArray(first.value.list)).toBe(true);
    const descriptor = Object.getOwnPropertyDescriptor(first.value.fixed, 'hidden');
    expect(descriptor).toMatchObject({value: 2, writable: true, enumerable: true, configurable: true});
    first.value.fixed.nested = 8;
    expect(source.fixed.nested).toBe(1);
  });
  test('returns wholly fresh mutable result graphs on every call', () => {
    const source = {nested: {value: Symbol()}};
    const policy = limits({declaredPaths: [['nested'], ['nested', 'value']]});
    const first = walkBoundedData(source, policy);
    const second = walkBoundedData(source, policy);
    const [badFirst, badSecond] = [walkBoundedData(source, {}), walkBoundedData(source, {})];
    const freshPairs = [[first, second], [first.value, second.value],
      [first.value.nested, second.value.nested],
      [first.counters, second.counters], [first.diagnostics, second.diagnostics],
      [first.diagnostics[0], second.diagnostics[0]], [badFirst, badSecond],
      [badFirst.counters, badSecond.counters], [badFirst.diagnostics, badSecond.diagnostics],
      [badFirst.error, badSecond.error]];
    for (const pair of freshPairs) {
      expect(pair[0]).not.toBe(pair[1]);
      expect(Object.isFrozen(pair[0])).toBe(false);
    }
    badFirst.error.message = 'mutable';
    badFirst.counters.entries = 7;
    badFirst.diagnostics.push({code: 'SYMBOL_VALUE', path: ''});
    first.diagnostics[0].path = '/changed';
    expect(badSecond).toEqual(configurationFatal);
    expect(second.diagnostics[0].path).toBe('/nested/value');
  });
  test('array length is reflected but consumes no entry or string unit', () => {
    const output = walkBoundedData([1], limits({maxEntries: 2}));
    expect(output.status).toBe('ok');
    expect(output.counters).toEqual(counters({
      entries: 2, ownKeysCalls: 1, descriptorCalls: 2,
      prototypeCalls: 1, maxContainerDepth: 1}));
    expect(walkBoundedData([1], limits({maxEntries: 1}))).toEqual(fatal('budget-fatal',
      counters({ownKeysCalls: 1, descriptorCalls: 1, prototypeCalls: 1, maxContainerDepth: 1})));
  });
  test.each([
    ['maxPrototypeCalls', {}, counters({maxContainerDepth: 1}), 'getPrototypeOf'],
    ['maxOwnKeysCalls', {}, counters(
      {prototypeCalls: 1, maxContainerDepth: 1}), 'ownKeys'],
    ['maxDescriptorCalls', {key: 1}, counters({entries: 2, ownKeysCalls: 1,
      prototypeCalls: 1, maxContainerDepth: 1, stringCodeUnits: 3}),
    'getOwnPropertyDescriptor'],
  ])('fails before an exhausted %s operation', (name, source, expected, trap) => {
    let calls = 0;
    const hostile = new Proxy(source, {[trap]() {
      calls += 1; throw Error('MASKED_TRAP_SECRET');
    }});
    expect(walkBoundedData(hostile, limits({[name]: 0}))).toEqual(fatal('budget-fatal', expected));
    expect(calls).toBe(0);
  });
  test.each(['maxPrototypeCalls', 'maxOwnKeysCalls', 'maxDescriptorCalls'])(
    'allows exact equality for %s', name => {
    expect(walkBoundedData({key: 1}, limits({[name]: 1})).status).toBe('ok');
  });
  test('enforces collection length before ownKeys and element traps', () => {
    const calls = [];
    const source = new Proxy([1, 2], {getOwnPropertyDescriptor(target, key) {
        calls.push(`descriptor:${String(key)}`);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      ownKeys() { calls.push('ownKeys'); throw new Error('ELEMENT_TRAP'); },
    });
    const output = walkBoundedData(source, limits({collectionLimits: [{path: [], maxLength: 1}]}));
    expect(output).toEqual(fatal('budget-fatal', counters({
      descriptorCalls: 1, prototypeCalls: 1, maxContainerDepth: 1})));
    expect(calls).toEqual(['descriptor:length']);
    expect(walkBoundedData([1, 2], limits({collectionLimits: [
      {path: [], maxLength: 2}]})).status).toBe('ok');
  });
  test('depth 32 succeeds and depth 33 is rejected before its traps', () => {
    let root = {};
    let cursor = root;
    const declaredPaths = [];
    for (let index = 0; index < 31; index += 1) {
      declaredPaths.push(new Array(index + 1).fill('next'));
      cursor.next = {};
      cursor = cursor.next;
    }
    expect(walkBoundedData(root, limits({
      maxDepth: 32, maxEntries: 40, declaredPaths})).status).toBe('ok');
    let touched = false;
    cursor.next = new Proxy({}, {getPrototypeOf() {
      touched = true; throw new Error('DEPTH_TRAP');
    }});
    declaredPaths.push(new Array(32).fill('next'));
    const output = walkBoundedData(root, limits({maxDepth: 32, maxEntries: 40, declaredPaths}));
    expect([output.status, output.counters.maxContainerDepth, touched]).toEqual(['budget-fatal', 32, false]);
  });
});
describe('hostile reflection, diagnostics, and order', () => {
  test('omits every accessor form without invoking it', () => {
    let calls = 0;
    const source = {};
    Object.defineProperties(source, {
      getter: {get() { calls += 1; return 1; }, enumerable: true},
      setter: {set() { calls += 1; }, enumerable: true},
      both: {get() { calls += 1; return 1; },
        set() { calls += 1; }, enumerable: true},
    });
    const output = walkBoundedData(source, limits({declaredPaths: [
      ['getter'], ['setter'], ['both']]}));
    expect(calls).toBe(0);
    expect(output.diagnostics.map(item => item.code)).toEqual([
      'ACCESSOR_GETTER', 'ACCESSOR_SETTER', 'ACCESSOR_GETTER_SETTER',
    ]);
    expect(Reflect.ownKeys(output.value)).toEqual([]);
  });
  test('emits all structural diagnostics in deterministic DFS order', () => {
    const symbol = Symbol('CALLER_SECRET');
    const source = {plain: {}, fn() {}};
    source.plain.self = source.plain;
    source.alias = source.plain;
    source.symbolValue = symbol;
    Object.defineProperty(source, '__proto__', {value: 1, enumerable: true});
    source[symbol] = 1;
    const sparse = new Array(2);
    sparse[1] = 1;
    sparse.extra = 2;
    Object.assign(source, {sparse, nonplain: Object.create({hidden: 1})});
    const output = walkBoundedData(source, limits({maxEntries: 30,
      declaredPaths: [
        ['plain'], ['plain', 'self'], ['alias'], ['symbolValue'], ['fn'],
        ['sparse'], ['nonplain']]}));
    expect(output.status).toBe('ok');
    expect(output.diagnostics).toEqual([
      {code: 'CIRCULAR_REFERENCE', path: '/plain/self'}, {code: 'UNSUPPORTED_FUNCTION', path: '/fn'},
      {code: 'REPEATED_REFERENCE', path: '/alias'}, {code: 'SYMBOL_VALUE', path: '/symbolValue'},
      {code: 'UNSAFE_KEY', path: ''}, {code: 'SPARSE_ARRAY', path: '/sparse'},
      {code: 'ARRAY_NON_INDEX_KEY', path: '/sparse'}, {code: 'NONPLAIN_PROTOTYPE', path: '/nonplain'},
      {code: 'SYMBOL_KEY', path: ''},
    ]);
    expect(output.value).toMatchObject({fn: null, alias: null, symbolValue: null, nonplain: null});
    expect(output.value.plain).toEqual({self: null});
    expect(Reflect.ownKeys(output.value)).toEqual(
      ['plain', 'fn', 'alias', 'symbolValue', 'sparse', 'nonplain']);
    const normalizedSparse = output.value.sparse;
    expect(Array.isArray(normalizedSparse)).toBe(true);
    expect(Reflect.ownKeys(normalizedSparse)).toEqual(['1', 'length']);
    expect([normalizedSparse.length, 0 in normalizedSparse, normalizedSparse[1],
      'extra' in normalizedSparse]).toEqual([2, false, 1, false]);
    expect(Object.getOwnPropertyDescriptors(normalizedSparse)).toEqual({
      1: {value: 1, writable: true, enumerable: true, configurable: true},
      length: {value: 2, writable: true, enumerable: false, configurable: false},
    });
  });
  test('sparse accounting ignores hostile canonical indices at or above length', () => {
    const source = new Proxy([1, ,], {ownKeys() { return ['0', '2', 'length']; },
      getOwnPropertyDescriptor: (target, key) => key === '2' ?
        {value: 2, writable: true, enumerable: true, configurable: true} :
        Reflect.getOwnPropertyDescriptor(target, key)});
    const output = walkBoundedData(source, limits());
    expect(output.diagnostics).toEqual([{code: 'SPARSE_ARRAY', path: ''}]);
    expect(output.value).toEqual([1, , 2]);
  });
  test('uses RFC6901 declared and wildcard paths without echoing unexpected keys', () => {
    const source = {
      'a/b~c': Symbol('hidden'), items: [{name: Symbol('hidden')}],
      '*': Symbol('hidden'), unexpectedSecret: [Symbol('hidden')],
    };
    const output = walkBoundedData(source, limits({declaredPaths: [
      ['a/b~c'], ['items'], ['items', '*'], ['items', '*', 'name']]      }));
      expect(output.diagnostics).toEqual([
        {code: 'SYMBOL_VALUE', path: '/a~1b~0c'}, {code: 'SYMBOL_VALUE', path: '/items/0/name'},
        {code: 'SYMBOL_VALUE', path: ''}, {code: 'SYMBOL_VALUE', path: '/0'},
    ]);
    expect(output.counters.stringCodeUnits).toBe('*'.length + 'unexpectedSecret'.length);
    expect([output.value['a/b~c'], output.value.items[0].name, output.value['*']]).toEqual([null, null, null]);
  });
  test('diagnostic equality succeeds and plus one fails without retention', () => {
    expect(walkBoundedData(Symbol(), limits({maxDiagnostics: 1})).status).toBe('ok');
    expect(walkBoundedData(Symbol(), limits({maxDiagnostics: 0}))).toEqual(fatal('budget-fatal', counters()));
  });
  test.each(['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'])(
    'sanitizes admitted %s failures and stops immediately',
    operation => {
      const calls = [];
      const handler = {getPrototypeOf(target) {
          calls.push('prototype:CALLER_SECRET');
          if (operation === 'getPrototypeOf') throw 'THROWN_CALLER_SECRET';
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          calls.push('keys:CALLER_SECRET');
          if (operation === 'ownKeys') throw 'THROWN_CALLER_SECRET';
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          calls.push('descriptor:CALLER_SECRET');
          if (operation === 'getOwnPropertyDescriptor') throw 'THROWN_CALLER_SECRET';
          return Reflect.getOwnPropertyDescriptor(target, key);
        }};
      const output = walkBoundedData(new Proxy({key: 1}, handler), limits());
      const expectedCounters = operation === 'getPrototypeOf' ?
        counters({prototypeCalls: 1, maxContainerDepth: 1}) :
        operation === 'ownKeys' ? counters({
          ownKeysCalls: 1, prototypeCalls: 1, maxContainerDepth: 1}) :
          counters({entries: 2, stringCodeUnits: 3, ownKeysCalls: 1,
            descriptorCalls: 1, prototypeCalls: 1, maxContainerDepth: 1});
      expect(output).toEqual(fatal('inspection-fatal', expectedCounters));
      expect(JSON.stringify(output)).not.toMatch(/CALLER_SECRET/);
      expect(calls).toHaveLength(operation === 'getPrototypeOf' ? 1 : operation === 'ownKeys' ? 2 : 3);
    });
  test.each((() => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const invariant = new Proxy(Object.preventExtensions(
      {CALLER_SECRET_FIXED: 1}), {ownKeys() { return []; }});
    const missing = new Proxy({}, {ownKeys() { return ['CALLER_SECRET_GHOST']; }});
    return [
      ['revoked', revoked.proxy, counters({maxContainerDepth: 1})],
      ['invariant', invariant, counters({ownKeysCalls: 1, prototypeCalls: 1, maxContainerDepth: 1})],
      ['missing descriptor', missing, counters({entries: 2, stringCodeUnits: 19,
        ownKeysCalls: 1, descriptorCalls: 1, prototypeCalls: 1, maxContainerDepth: 1})],
    ];
  })())('sanitizes exact %s proxy failure', (_label, source, expectedCounters) => {
    const output = walkBoundedData(source, limits());
    expect(output).toEqual(fatal('inspection-fatal', expectedCounters));
    expect(JSON.stringify(output)).not.toMatch(/CALLER_SECRET/);
  });
  test('preserves integer/string/symbol own-key order and DFS early abort', () => {
    const calls = [];
    const symbol = Symbol('safe-test-symbol');
    const child = new Proxy({leaf: 1}, {ownKeys(target) {
        calls.push('child'); return Reflect.ownKeys(target);
      }});
    const source = {later: 1, 2: child, alpha: 1, [symbol]: 1};
    const output = walkBoundedData(source, limits({maxOwnKeysCalls: 1,
      declaredPaths: [['2'], ['2', 'leaf'], ['later'], ['alpha']]}));
    expect([output.status, calls, output.diagnostics]).toEqual(['budget-fatal', [], []]);
  });
  test('never invokes serialization, iteration, coercion, or ambient hooks', () => {
    let calls = 0;
    const hook = () => { calls += 1; return 'CALLER_SECRET'; };
    const source = {
      [Symbol.iterator]: hook, [Symbol.toPrimitive]: hook,
      toJSON: hook, valueOf: hook, toString: hook,
    };
    const spies = [
      jest.spyOn(Math, 'random'), jest.spyOn(Date, 'now'), jest.spyOn(JSON, 'stringify'),
      jest.spyOn(console, 'log').mockImplementation(() => {})];
    const environment = Object.getOwnPropertyDescriptor(process, 'env');
    let environmentReads = 0;
    Object.defineProperty(process, 'env', {configurable: true, get() {
      environmentReads += 1; return environment.value;
    }});
    walkBoundedData(source, limits());
    Object.defineProperty(process, 'env', environment);
    expect([calls, environmentReads]).toEqual([0, 0]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    for (const spy of spies) spy.mockRestore();
  });
});
test('production module is statically pure and respects source boundaries', () => {
  const production = fs.readFileSync(path.join(__dirname, `${modulePath}.js`), 'utf8');
  expect(production).not.toMatch(
    /test-support|github-governance-validation-fixtures|GraphSnapshotV1|TODO|FIXME|HACK|<<<<<<<|>>>>>>>/,
  );
  expect(production).not.toMatch(
    /\brequire\s*\(|\bconsole\.|\bprocess\.|\bDate\b|Math\.random|JSON\.|structuredClone|Object\.assign/);
  expect(production).not.toMatch(/\/tmp|\/var\/tmp|e70c8c16|b4f98865|e6e12f9d/);
});

'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const governance = require('../../test-support/release/github-governance-boundary-formulas');
const {selectRootPolicy} = require(
  '../../scripts/release/github-governance-validation-runtime-policy',
);

const modulePath = path.resolve(
  __dirname,
  '../../test-support/release/github-governance-boundary-formulas.js',
);
const g3Keys = [
  'scannedPaths',
  'findings',
  'evidencePerFinding',
  'evidenceItems',
  'repositoryPaths',
  'extraOwnKeys',
];
const g4Keys = [
  'root', 'repository', 'rulesets', 'legacyBranchProtection', 'environments',
  'inventories', 'actions', 'collaborators', 'branches', 'workflow',
  'rulesetEntries', 'rulesPerRuleset', 'knownRulesPerRuleset',
  'unknownRulesPerRuleset', 'conditionVisitsPerRuleset',
  'bypassVisitsPerRuleset', 'ruleVisitsPerRuleset', 'environmentEntries',
  'extraOwnKeys',
];
const recordKeys = ['group', 'preset', 'expectedVisits', 'counts', 'formula'];
const g9RecordKeys = [
  'group',
  'preset',
  'axis',
  'expectedVisits',
  'counts',
  'formula',
];

function expected(group, preset, expectedVisits, keys, values, formula, axis) {
  const counts = {};
  keys.forEach((key, index) => {
    counts[key] = values[index];
  });
  return axis === undefined
    ? {group, preset, expectedVisits, counts, formula}
    : {group, preset, axis, expectedVisits, counts, formula};
}

function expectRecord(actual, expectedRecord, keys, hasAxis = false) {
  expect(actual).toEqual(expectedRecord);
  expect(Object.keys(actual)).toEqual(hasAxis ? g9RecordKeys : recordKeys);
  expect(Object.keys(actual.counts)).toEqual(keys);
  expect(Object.isFrozen(actual)).toBe(true);
  expect(Object.isFrozen(actual.counts)).toBe(true);
  expect(Array.isArray(actual)).toBe(false);
  expect(Array.isArray(actual.counts)).toBe(false);
}

function filesIn(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(entryPath) : [entryPath];
  });
}

function sourceLiterals(source) {
  return source.match(
    /'(?:\\.|[^'\\\r\n])*'|"(?:\\.|[^"\\\r\n])*"|`(?:\\.|[^`\\])*`/g,
  ) || [];
}

function coldLoad(source) {
  const harness = [
    "const Module = require('module');",
    "const fs = require('fs');",
    "const source = Buffer.from(process.argv[1], 'base64').toString('utf8');",
    "let attempts = 0; const blocked = () => { attempts += 1; throw new Error('forbidden side effect'); };",
    "const tripwire = new Proxy(blocked, {get: blocked, set: blocked, defineProperty: blocked, deleteProperty: blocked, ownKeys: blocked, apply: blocked, construct: blocked});",
    "const saved = [];",
    "const replace = (target, key, value) => { const descriptor = Object.getOwnPropertyDescriptor(target, key); if (descriptor && !descriptor.configurable) { if (!('value' in descriptor) || !descriptor.writable) throw new Error('unable to install tripwire'); saved.push([target, key, descriptor, true]); target[key] = value; return; } saved.push([target, key, descriptor, false]); Object.defineProperty(target, key, {configurable: true, enumerable: descriptor ? descriptor.enumerable : true, writable: true, value}); };",
    "const restore = () => { for (let index = saved.length - 1; index >= 0; index -= 1) { const [target, key, descriptor, assigned] = saved[index]; if (!descriptor) delete target[key]; else if (assigned) target[key] = descriptor.value; else Object.defineProperty(target, key, descriptor); } };",
    "const blockMethods = target => Object.getOwnPropertyNames(target).forEach(key => { const descriptor = Object.getOwnPropertyDescriptor(target, key); if (descriptor && typeof descriptor.value === 'function') replace(target, key, blocked); });",
    'try {',
    "const globalKeys = ['process', 'console', 'Date', 'Math', 'performance', 'crypto', 'fetch', 'WebSocket', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame', 'structuredClone', 'print', 'JSON'];",
    'for (const key of globalKeys) Object.getOwnPropertyDescriptor(global, key);',
    "blockMethods(fs); blockMethods(fs.promises);",
    'for (const key of globalKeys) replace(global, key, tripwire);',
    "replace(Array.prototype, 'sort', blocked); if (Array.prototype.toSorted) replace(Array.prototype, 'toSorted', blocked);",
    "const cache = new Proxy({}, {get: blocked, set: blocked, defineProperty: blocked, deleteProperty: blocked, ownKeys: blocked}); replace(Module, '_cache', cache); replace(Module.prototype, 'require', blocked);",
    "const loaded = new Module('boundary-formulas'); loaded.filename = 'boundary-formulas.js'; loaded.paths = []; loaded._compile(source, loaded.filename);",
    "for (const [group, family] of Object.entries(loaded.exports)) for (const formula of Object.values(family)) { if (group === 'G9') { formula('errors'); formula('stringUnits'); } else formula(); }",
    "if (attempts !== 0) throw new Error('side effect was attempted');",
    '} finally { restore(); }',
  ].join('');
  return spawnSync(
    process.execPath,
    ['-e', harness, Buffer.from(source).toString('base64')],
    {encoding: 'utf8'},
  );
}

describe('GitHub governance boundary formulas', () => {
  test('publishes only frozen ordered CommonJS formula authorities', () => {
    expect(Object.keys(governance)).toEqual(['G3', 'G4', 'G9']);
    expect(governance).not.toHaveProperty('default');
    expect(Object.isFrozen(governance)).toBe(true);
    for (const family of Object.values(governance)) {
      expect(Object.keys(family)).toEqual(['canonical', 'max', 'maxPlusOne']);
      expect(Object.isFrozen(family)).toBe(true);
      for (const formula of Object.values(family)) {
        expect(typeof formula).toBe('function');
        expect(Object.isFrozen(formula)).toBe(true);
      }
    }
  });

  test.each([
    ['canonical', 3, [0, 0, 0, 0, 0, 0], '3'],
    ['max', 2015003, [10000, 5000, 96, 480000, 15000, 0], '3 + 10000 + 5000 + (5000 * 400) = 2015003'],
    ['maxPlusOne', 2015004, [10000, 5000, 96, 480000, 15000, 1], '3 + 10000 + 5000 + (5000 * 400) + 1 = 2015004'],
  ])('returns the exact frozen G3 %s record', (preset, visits, values, formula) => {
    expectRecord(
      governance.G3[preset](),
      expected('G3', preset, visits, g3Keys, values, formula),
      g3Keys,
    );
  });

  test.each([
    ['canonical', 11, [11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], '11'],
    ['max', 2592031, [11, 3, 301800, 6, 271200, 2000, 4, 2000, 4, 2015003, 100, 100, 4, 96, 2003, 400, 607, 100, 0], '11 + 3 + 301800 + 6 + 271200 + 2000 + 4 + 2000 + 4 + 2015003 = 2592031'],
    ['maxPlusOne', 2592032, [11, 3, 301800, 6, 271200, 2000, 4, 2000, 4, 2015003, 100, 100, 4, 96, 2003, 400, 607, 100, 1], '11 + 3 + 301800 + 6 + 271200 + 2000 + 4 + 2000 + 4 + 2015003 + 1 = 2592032'],
  ])('returns the exact frozen G4 %s record', (preset, visits, values, formula) => {
    expectRecord(
      governance.G4[preset](),
      expected('G4', preset, visits, g4Keys, values, formula),
      g4Keys,
    );
  });

  test.each([
    ['errors', 'canonical', 0, 0, 0, '0'],
    ['errors', 'max', 100, 100, 0, '100 errors'],
    ['errors', 'maxPlusOne', 101, 101, 0, '101 errors'],
    ['stringUnits', 'canonical', 1, 0, 1, '1 string unit'],
    ['stringUnits', 'max', 16777216, 0, 16777216, '16777216 string units'],
    ['stringUnits', 'maxPlusOne', 16777217, 0, 16777217, '16777217 string units'],
  ])('returns the exact frozen G9 %s %s record', (axis, preset, visits, errors, stringUnits, formula) => {
    expectRecord(
      governance.G9[preset](axis),
      expected('G9', preset, visits, ['errors', 'stringUnits'], [errors, stringUnits], formula, axis),
      ['errors', 'stringUnits'],
      true,
    );
  });

  test('keeps the documented G3 and G4 arithmetic as formulas only', () => {
    expect(governance.G3.max().expectedVisits).toBe(
      3 + 10000 + 5000 + 5000 * 400,
    );
    expect(governance.G3.maxPlusOne().expectedVisits).toBe(
      3 + 10000 + 5000 + 5000 * 400 + 1,
    );
    const maximum = governance.G4.max();
    expect(maximum.expectedVisits).toBe(
      11 + 3 + 301800 + 6 + 271200 + 2000 + 4 + 2000 + 4 + 2015003,
    );
    expect(maximum.counts.rulesPerRuleset).toBe(100);
    expect(maximum.counts.knownRulesPerRuleset).toBe(4);
    expect(maximum.counts.unknownRulesPerRuleset).toBe(96);
    expect(maximum.counts.ruleVisitsPerRuleset).toBe(607);
    expect([
      maximum.counts.conditionVisitsPerRuleset,
      maximum.counts.bypassVisitsPerRuleset,
      maximum.counts.ruleVisitsPerRuleset,
    ]).toEqual([2003, 400, 607]);
    expect(7 + 2003 + 400 + 607).toBe(3017);
    expect(governance.G4.maxPlusOne().expectedVisits).toBe(
      maximum.expectedVisits + 1,
    );
    expect(selectRootPolicy(maximum.expectedVisits)).toMatchObject({
      ownKeySlotBudget: maximum.expectedVisits,
      limits: {
        maxEntries: governance.G4.maxPlusOne().expectedVisits,
        maxOwnKeysCalls: governance.G4.maxPlusOne().expectedVisits,
        maxDescriptorCalls: 2 * governance.G4.maxPlusOne().expectedVisits - 1,
        maxPrototypeCalls: governance.G4.maxPlusOne().expectedVisits,
      },
    });
  });

  test('creates no shared mutable records, counts, arrays, or payload graphs', () => {
    const argument = {extraOwnKeys: 1};
    const first = governance.G3.canonical(argument);
    const second = governance.G3.canonical(argument);
    const third = governance.G4.canonical();
    const fourth = governance.G9.canonical('errors');
    expect(first).not.toBe(second);
    expect(first.counts).not.toBe(second.counts);
    expect(first).not.toBe(argument);
    expect(first.counts).not.toBe(argument);
    expect(first.counts).not.toBe(third.counts);
    expect(third.counts).not.toBe(fourth.counts);
    expect(Object.values(governance.G3)).not.toContain(first);
    expect(Object.values(governance.G4)).not.toContain(third);
    expect(Object.values(governance.G9)).not.toContain(fourth);
  });

  test('returns fresh records for every exported formula call', () => {
    for (const invoke of [
      ...Object.values(governance.G3),
      ...Object.values(governance.G4),
      ...Object.values(governance.G9).flatMap(formula => [
        () => formula('errors'),
        () => formula('stringUnits'),
      ]),
    ].map(formula => (typeof formula === 'function' ? formula : null))) {
      const first = invoke();
      const second = invoke();
      expect(first).not.toBe(second);
      expect(first.counts).not.toBe(second.counts);
    }
  });

  test('rejects every unsupported G9 axis with the fixed TypeError', () => {
    for (const formula of Object.values(governance.G9)) {
      for (const invoke of [
        () => formula(),
        () => formula('unknown'),
        () => formula(1),
        () => formula({axis: 'errors'}),
        () => formula('errors', 'stringUnits'),
        () => formula('errors', undefined),
      ]) {
        expect(invoke).toThrow(new TypeError('Unsupported governance fixture option.'));
      }
    }
  });

  test('is silent and side-effect-free when cold loaded', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    const result = coldLoad(source);
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({status: 0, stdout: '', stderr: ''});
  });

  test('uses only approved source literals and has no prohibited source behavior', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    const allowed = new Set([
      'G3', 'G4', 'G9', 'canonical', 'max', 'maxPlusOne', 'errors',
      'stringUnits', '3', '3 + 10000 + 5000 + (5000 * 400) = 2015003',
      '3 + 10000 + 5000 + (5000 * 400) + 1 = 2015004', '11',
      '11 + 3 + 301800 + 6 + 271200 + 2000 + 4 + 2000 + 4 + 2015003 = 2592031',
      '11 + 3 + 301800 + 6 + 271200 + 2000 + 4 + 2000 + 4 + 2015003 + 1 = 2592032',
      '0', '1 string unit', '100 errors', '101 errors', '16777216 string units',
      '16777217 string units', 'Unsupported governance fixture option.',
    ]);
    const literals = sourceLiterals(source);
    expect(sourceLiterals(['`', 'template', '`'].join(''))).toEqual(['`template`']);
    expect(literals.map(literal => literal.slice(1, -1)).every(literal => allowed.has(literal))).toBe(true);
    expect(source).not.toMatch(new RegExp([
      '\\b(?:require|import|process|env|globalThis|global|fs|readFile|writeFile|appendFile|readdir|fetch|XMLHttpRequest|WebSocket|http|https|net|dns|localStorage|sessionStorage|indexedDB|caches|Date|performance|hrtime|setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|random|crypto|console|stdout|stderr|output|print|log|child_process|spawn|exec|execFile|shell|command|sort|toSorted|JSON|stringify|serialize|parse|cache)\\b',
      '|\\bmodule\\s*\\.\\s*(?:cache|require|children)\\b',
    ].join('')));
    expect(source).not.toMatch(new RegExp([
      ['gh', 'p_'].join(''),
      ['github', '_pat_'].join(''),
      ['Bear', 'er\\s'].join(''),
      ['Bas', 'ic\\s'].join(''),
      '-{5}(?:BEGIN|END)(?: [A-Z]+)?(?: [A-Z]+)?-{5}',
      '\\b[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b',
      '[A-Za-z0-9+/]{40,}={0,2}',
      '[A-Fa-f0-9]{40,}',
      ['author', 'ization'].join(''),
      '[a-z][a-z0-9+.-]*:\\/\\/[^\\s/:@]+:[^\\s/@]+@',
      ['se', 'cret'].join(''),
      ['to', 'ken'].join(''),
      ['pass', 'word'].join(''),
      ['credential'].join(''),
      'api[_ -]?key',
      'private[_ -]?key',
    ].join('|'), 'i'));
    expect(source).not.toMatch(/\b(?:Error|message|stack|cause)\b/);
  });

  test('has no production import of test support', () => {
    const productionFiles = [
      path.resolve(__dirname, '../../App.tsx'),
      ...filesIn(path.resolve(__dirname, '../../src')),
    ];
    expect(productionFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n')).not.toMatch(/test-support\//);
  });
});

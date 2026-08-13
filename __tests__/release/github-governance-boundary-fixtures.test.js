'use strict';

const fs = require('fs');
const path = require('path');
const releaseSupport = path.resolve(__dirname, '../../test-support/release');
const aggregatePath = path.join(releaseSupport, 'github-governance-boundary-fixtures.js');
const familyPaths = [
  'github-governance-boundary-contract-finding',
  'github-governance-boundary-formulas',
  'github-governance-boundary-path-depth',
  'github-governance-boundary-descriptor-ordering',
];
const loadFamilies = () =>
  familyPaths.map(filename => require(path.join(releaseSupport, filename)));
const families = loadFamilies();
const expected = {
  G1: families[0].G1,
  G2: families[0].G2,
  G3: families[1].G3,
  G4: families[1].G4,
  G5: families[2].G5,
  G6: families[2].G6,
  G7: families[3].G7,
  G8: families[3].G8,
  G9: families[1].G9,
};
afterEach(() => {
  delete require.cache[require.resolve(aggregatePath)];
  jest.restoreAllMocks();
});
test('exports only the frozen G1-G9 identities in order', () => {
  const aggregate = require(aggregatePath);
  expect(Object.keys(aggregate)).toEqual(Object.keys(expected));
  expect(Reflect.ownKeys(aggregate)).toEqual(Object.keys(expected));
  expect(Object.isFrozen(aggregate)).toBe(true);
  for (const key of Object.keys(expected)) {
    expect(aggregate[key]).toBe(expected[key]);
  }
  expect(aggregate.default).toBeUndefined();
});
test('cold aggregate import is silent and changes no family object', () => {
  jest.resetModules();
  const freshFamilies = loadFamilies();
  const before = freshFamilies.map(family =>
    Object.getOwnPropertyDescriptors(family),
  );
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const freeze = jest.spyOn(Object, 'freeze');
  const aggregate = require(aggregatePath);
  expect([log, warn, error].map(spy => spy.mock.calls)).toEqual([[], [], []]);
  expect(
    freshFamilies.map(family => Object.getOwnPropertyDescriptors(family)),
  ).toEqual(before);
  expect(freeze).toHaveBeenCalledTimes(1);
  expect(freeze).toHaveBeenCalledWith(aggregate);
});
test('source remains a constant-time identity-only aggregate', () => {
  const source = fs.readFileSync(aggregatePath, 'utf8');
  expect(source).not.toMatch(
    /\b(?:class|function|new|for|while|map|reduce|parse|constructor)\b/,
  );
  expect(source).not.toMatch(/\b(?:auth|credential|password|permission|token)\b/i);
  expect(source.match(/\brequire\(/g)).toHaveLength(4);
  expect(source.match(/Object\.freeze\(/g)).toHaveLength(1);
});
test('production dependency graph cannot reach test-support', () => {
  const root = path.resolve(__dirname, '../..');
  const pending = [path.join(root, 'index.js'), path.join(root, 'App.tsx')];
  const visited = new Set();
  const resolveLocal = (from, request) => {
    const base = path.resolve(path.dirname(from), request);
    return [base, `${base}.js`, `${base}.ts`, `${base}.tsx`].find(candidate =>
      fs.existsSync(candidate),
    );
  };
  while (pending.length > 0) {
    const filename = pending.pop();
    if (!filename || visited.has(filename)) {
      continue;
    }
    visited.add(filename);
    expect(filename.startsWith(path.join(root, 'test-support'))).toBe(false);
    const source = fs.readFileSync(filename, 'utf8');
    const imports = source.matchAll(
      /(?:require\(\s*|from\s+|import\s+)['"](\.[^'"]+)['"]/g,
    );
    for (const match of imports) {
      const dependency = resolveLocal(filename, match[1]);
      if (dependency) {
        pending.push(dependency);
      }
    }
  }
});

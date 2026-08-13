'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const support = path.join(root, 'test-support/release');
const aggregatePath = path.join(support, 'github-governance-boundary-fixtures.js');
const familyNames = ['github-governance-boundary-contract-finding',
  'github-governance-boundary-formulas', 'github-governance-boundary-path-depth',
  'github-governance-boundary-descriptor-ordering'];
const loadFamilies = () => familyNames.map(name => require(path.join(support, name)));
const familyShape = family => Reflect.ownKeys(family).map(key => {
    const {configurable, enumerable, writable} =
      Object.getOwnPropertyDescriptor(family, key);
    return [key, configurable, enumerable, writable,
      Reflect.ownKeys(family[key]), Object.isFrozen(family[key])];
  });

afterEach(() => { jest.resetModules(); jest.restoreAllMocks(); });

test('exports only the frozen G1-G9 identities in order', () => {
  const families = loadFamilies();
  const expected = {
    G1: families[0].G1, G2: families[0].G2, G3: families[1].G3,
    G4: families[1].G4, G5: families[2].G5, G6: families[2].G6,
    G7: families[3].G7, G8: families[3].G8, G9: families[1].G9,
  };
  const aggregate = require(aggregatePath);
  expect(Reflect.ownKeys(aggregate)).toEqual(Object.keys(expected));
  expect(Object.isFrozen(aggregate)).toBe(true);
  for (const key of Object.keys(expected)) {
    expect(aggregate[key]).toBe(expected[key]);
  }
  expect(aggregate.default).toBeUndefined();
});

test('cold dependency-chain import is pure and silent', () => {
  const baseline = loadFamilies().map(familyShape);
  jest.resetModules();
  const envDescriptor = Object.getOwnPropertyDescriptor(process, 'env');
  const processEnv = process.env;
  Object.defineProperty(process, 'env',
    {configurable: true, get: () => processEnv});
  const env = jest.spyOn(process, 'env', 'get');
  const observed = [
    ...['log', 'info', 'debug', 'warn', 'error'].map(method =>
      jest.spyOn(console, method).mockImplementation(() => {})),
    jest.spyOn(fs, 'readFileSync'),
    jest.spyOn(fs, 'writeFileSync'),
    jest.spyOn(process, 'cwd'),
  ];
  const freeze = jest.spyOn(Object, 'freeze');
  try {
    const aggregate = require(aggregatePath);
    expect(observed.map(spy => spy.mock.calls)).toEqual(observed.map(() => []));
    expect(env).not.toHaveBeenCalled();
    expect(loadFamilies().map(familyShape)).toEqual(baseline);
    expect(freeze).toHaveBeenCalledWith(aggregate);
  } finally {
    jest.restoreAllMocks();
    Object.defineProperty(process, 'env', envDescriptor);
  }
});

test('source remains a constant-time identity-only aggregate', () => {
  const source = fs.readFileSync(aggregatePath, 'utf8');
  expect(source).not.toMatch(/\b(?:class|function|new|for|while|map|reduce|clone|cop(?:y|ier)|pars(?:e|er)|constructors?)\b/);
  expect(source).not.toMatch(/\b(?:auth\w*|credentials?|passwords?|permissions?|tokens?)\b/i);
  expect(source).not.toMatch(/\b(?:process\.(?:env|cwd)|fs|fetch|https?|axios|XMLHttpRequest|readFile|writeFile|(?:Aggregate|Eval|Range|Reference|Suppressed|Syntax|Type|URI)?Error|throw|catch|invalid|unsupported)\b/i);
  expect(source.replace('./github-governance-boundary-formulas', '')).not.toMatch(/\b(?:TODO|FIXME|HACK|placeholders?|stubs?|formulas?|materializ\w*|\w*graph\w*|re(?:implement|[-\s]+implementation)\w*)\b|#198/i);
  expect(source.match(/\brequire\(/g)).toHaveLength(4);
  expect(source.match(/Object\.freeze\(/g)).toHaveLength(1);
});

test('production dependency graph cannot reach test-support', () => {
  const pending = [path.join(root, 'index.js'), path.join(root, 'App.tsx')];
  const visited = new Set();
  const resolveLocal = (from, request) => {
    const base = request.startsWith('@/')
      ? path.join(root, 'src', request.slice(2))
      : path.resolve(path.dirname(from), request);
    const candidates = [base, ...['js', 'ts', 'tsx'].map(ext => `${base}.${ext}`),
      ...['js', 'ts', 'tsx'].map(ext => path.join(base, `index.${ext}`))];
    return candidates.find(candidate =>
      fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  };
  while (pending.length > 0) {
    const filename = pending.pop();
    if (!filename || visited.has(filename)) continue;
    visited.add(filename);
    expect(path.relative(root, filename).split(path.sep)[0]).not.toBe('test-support');
    const source = fs.readFileSync(filename, 'utf8');
    for (const match of source.matchAll(/(?:require|import)\(\s*['"]([^'"]+)['"]|(?:from|import)\s+['"]([^'"]+)['"]/g)) {
      const request = match[1] || match[2];
      if (request.startsWith('.') || request.startsWith('@/')) {
        pending.push(resolveLocal(filename, request));
      }
    }
  }
});

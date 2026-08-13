'use strict';
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const governance = require('../../test-support/release/github-governance-boundary-path-depth');
const fixturePath = path.resolve(__dirname, '../../test-support/release/github-governance-boundary-path-depth.js');

function componentPath(componentCount) {
  return 'x'.repeat(componentCount).split('').join('/');
}
function expectG5Result(result, axis, fixturePathValue) {
  expect(Object.keys(result)).toEqual(['group', 'axis', 'path', 'utf16Units', 'components']);
  expect(result).toEqual({
    group: 'G5',
    axis,
    path: fixturePathValue,
    utf16Units: fixturePathValue.length,
    components: fixturePathValue.split('/').length,
  });

  for (const component of result.path.split('/')) {
    expect(component).not.toBe('');
    expect(component).not.toBe('.');
    expect(component).not.toBe('..');
    expect(component).not.toContain('\\');
    expect(component).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(component).not.toMatch(
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i,
    );
  }
}
function chainNodes(root) {
  const nodes = [];
  let current = root;

  while (true) {
    nodes.push(current);
    if (!Object.hasOwn(current, 'next')) {
      return nodes;
    }
    current = current.next;
  }
}
function expectG6Result(result, declaredDepth) {
  expect(Object.keys(result)).toEqual(['group', 'declaredDepth', 'root']);
  expect(result.group).toBe('G6');
  expect(result.declaredDepth).toBe(declaredDepth);

  let current = result.root;
  for (let container = 1; container <= declaredDepth; container += 1) {
    expect(Object.getPrototypeOf(current)).toBeNull();
    expect(Array.isArray(current)).toBe(false);
    expect(Object.getOwnPropertySymbols(current)).toEqual([]);
    if (container === declaredDepth) {
      expect(Object.getOwnPropertyNames(current)).toEqual(['value']);
      expect(Object.getOwnPropertyDescriptor(current, 'value')).toEqual({value: null, writable: true, enumerable: true, configurable: true});
      expect(Object.hasOwn(current, 'next')).toBe(false);
      continue;
    }
    expect(Object.getOwnPropertyNames(current)).toEqual(['next']);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'next');
    expect(descriptor).toEqual({value: expect.any(Object), writable: true, enumerable: true, configurable: true});
    expect(Object.hasOwn(descriptor, 'get')).toBe(false);
    expect(Object.hasOwn(descriptor, 'set')).toBe(false);
    current = current.next;
  }
}
function productionFiles(location) {
  if (fs.statSync(location).isFile()) {
    return [location];
  }

  return fs.readdirSync(location, {withFileTypes: true}).flatMap(entry =>
    productionFiles(path.join(location, entry.name)),
  );
}
describe('G5 and G6 governance boundaries', () => {
  test('exports only ordered frozen family and function APIs', () => {
    expect(Object.keys(governance)).toEqual(['G5', 'G6']);
    expect(Object.getOwnPropertyNames(governance)).toEqual(['G5', 'G6']);
    expect(governance).not.toHaveProperty('default');
    expect(Object.isFrozen(governance)).toBe(true);
    for (const family of [governance.G5, governance.G6]) {
      expect(Object.keys(family)).toEqual(['canonical', 'max', 'maxPlusOne']);
      expect(Object.isFrozen(family)).toBe(true);
      for (const member of Object.values(family)) {
        expect(typeof member).toBe('function');
        expect(Object.isFrozen(member)).toBe(true);
      }
    }
  });
  test('emits exact G5 paths and measured boundaries for both axes', () => {
    for (const axis of ['utf16', 'components']) {
      const paths = {
        canonical: 'fixture/path',
        max: axis === 'utf16' ? 'x'.repeat(240) : componentPath(120),
        maxPlusOne:
          axis === 'utf16' ? 'x'.repeat(241) : componentPath(121),
      };

      for (const [method, fixturePathValue] of Object.entries(paths)) {
        expectG5Result(governance.G5[method](axis), axis, fixturePathValue);
      }
    }
  });
  test('rejects missing, extra, wrong, and non-string G5 axes exactly', () => {
    const invalidAxes = [[], ['utf16', 'components'], ['unsupported'], [''], [null], [undefined], [0], [true], [{}], [new String('utf16')], [Symbol('utf16')]];
    for (const method of Object.values(governance.G5)) {
      for (const argumentsValue of invalidAxes) {
        expect(() => method(...argumentsValue)).toThrow(
          new TypeError('Unsupported governance fixture option.'),
        );
      }
    }
  });
  test('emits exact fresh null-prototype G6 depth chains and descriptors', () => {
    expectG6Result(governance.G6.canonical(), 1);
    expectG6Result(governance.G6.max(), 32);
    expectG6Result(governance.G6.maxPlusOne(), 33);
  });
  test('keeps each returned graph mutable and identity-isolated', () => {
    const firstG5 = governance.G5.max('utf16');
    const secondG5 = governance.G5.max('utf16');
    const firstG6 = governance.G6.max();
    const secondG6 = governance.G6.max();
    const supplied = Object.create(null);
    const fromSuppliedArgument = governance.G6.canonical(supplied);
    const firstNodes = chainNodes(firstG6.root);
    const secondNodes = chainNodes(secondG6.root);
    expect(Object.isFrozen(firstG5)).toBe(false);
    expect(Object.isFrozen(firstG6.root)).toBe(false);
    expect(firstG5).not.toBe(secondG5);
    expect(firstG5).not.toBe(firstG6);
    expect(firstG5).not.toBe(firstG6.root);
    expect(new Set([...firstNodes, ...secondNodes]).size).toBe(64);
    expect(fromSuppliedArgument).not.toBe(supplied);
    expect(fromSuppliedArgument.root).not.toBe(supplied);
    firstG5.path = 'x';
    firstG6.root.next = Object.create(null);
    firstNodes.at(-1).value = 'x';

    expect(secondG5.path).toHaveLength(240);
    expect(secondG6.root.next).toBe(secondNodes[1]);
    expect(secondNodes.at(-1).value).toBeNull();
  });
  test('cold-loads silently and contains only permitted pure fixture literals', () => {
    const source = fs.readFileSync(fixturePath, 'utf8');
    const literalValues = Array.from(
      source.matchAll(/'([^'\\]*)'/g),
      match => match[1],
    );
    const harness = [
      "'use strict';",
      "const Module = require('module');",
      "const fail = () => { throw new Error('forbidden side effect'); };",
      'Module._load = fail;',
      "for (const name of ['log', 'info', 'warn', 'error', 'debug']) {",
      '  console[name] = fail;',
      '}',
      'Date.now = fail;',
      'Math.random = fail;',
      "const loaded = new Module('github-governance-boundary-path-depth');",
      "loaded.filename = 'github-governance-boundary-path-depth.js';",
      'loaded.paths = [];',
      "loaded._compile(Buffer.from(process.argv[1], 'base64').toString('utf8'), loaded.filename);",
      'if (Object.keys(loaded.exports).length !== 2) process.exitCode = 1;',
    ].join('\n');
    const result = spawnSync(
      process.execPath,
      ['-e', harness, Buffer.from(source).toString('base64')],
      {encoding: 'utf8'},
    );

    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({status: 0, stdout: '', stderr: ''});
    expect(literalValues).toEqual([
      'use strict',
      'Unsupported governance fixture option.',
      'fixture/path',
      'x',
      '/',
      'utf16',
      'components',
      'G5',
      'next',
      'value',
      'G6',
    ]);
    expect(source).not.toMatch(
      /\b(?:require|import|fs|process|child_process|http|https|net|dns|console|Date|Math|Buffer|JSON)\b/,
    );
    expect(source).not.toMatch(
      /\b(?:Array|Map|Set|WeakMap|WeakSet|sort|stringify|parse|Error|message|stack|cause)\b/,
    );
    expect(source).not.toMatch(
      /ghp_|github_pat_|\b(?:Bearer|Basic)\s|-----BEGIN |\bauthorization\b|:\/\/[^/\s]+@/i,
    );
    expect(source).not.toMatch(/\/tmp|\/var\/tmp|[A-Za-z0-9+/_-]{40,}={0,2}/);
  });
  test('keeps test-support imports out of production sources', () => {
    const roots = [
      path.resolve(__dirname, '../../src'),
      path.resolve(__dirname, '../../App.tsx'),
      path.resolve(__dirname, '../../index.js'),
    ];
    const imports = roots
      .flatMap(productionFiles)
      .map(file => fs.readFileSync(file, 'utf8'))
      .join('\n');

    expect(imports).not.toMatch(
      /(?:from\s*|require\s*\(|import\s*\()\s*['"][^'"]*test-support(?:\/|['"])/,
    );
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const {GOVERNANCE_CONTRACT, GOVERNANCE_FINDING_SCHEMA_VERSION, SCANNER_FINDING_CODES} = require('../../scripts/release/github-governance-contract.js');

const modulePath = path.join(__dirname, '../../test-support/release/github-governance-boundary-contract-finding.js');
const contractModulePath = path.join(__dirname, '../../scripts/release/github-governance-contract.js');
const {G1, G2} = require('../../test-support/release/github-governance-boundary-contract-finding');
const FINDING_ROOT_KEYS = ['schemaVersion', 'kind', 'code', 'severity', 'scope', 'subject', 'message', 'remediation', 'path', 'location', 'evidence'];
// Issue #200's canonical contract requires these exact synthetic literals verbatim.
// The approved #182 contract module exports schema/code/evidence fields, but no
// alternate structural message/remediation constants.
const CANONICAL_STRUCTURAL_FIXTURE_MESSAGE = 'STRUCTURAL_FIXTURE_MESSAGE';
const CANONICAL_STRUCTURAL_FIXTURE_REMEDIATION = 'STRUCTURAL_FIXTURE_REMEDIATION';
const FINDING_MATCH = {
  schemaVersion: GOVERNANCE_FINDING_SCHEMA_VERSION,
  kind: 'scanner',
  code: SCANNER_FINDING_CODES[0],
  severity: 'error',
  scope: 'workflow',
  subject: 'fixture-subject',
  message: CANONICAL_STRUCTURAL_FIXTURE_MESSAGE,
  remediation: CANONICAL_STRUCTURAL_FIXTURE_REMEDIATION,
  path: '.github/workflows/fixture.yml',
  location: {line: 1, column: 1},
};
const CANONICAL_STRUCTURAL_LITERAL_PATTERNS = Object.freeze([
  {label: 'structural message literal', pattern: /message:\s*'STRUCTURAL_FIXTURE_MESSAGE'/},
  {label: 'structural remediation literal', pattern: /remediation:\s*'STRUCTURAL_FIXTURE_REMEDIATION'/},
]);
const FORBIDDEN_SOURCE_PATTERNS = Object.freeze([
  {label: 'system temp paths', pattern: /\/tmp|\/var\/tmp/},
  {label: 'placeholder markers', pattern: /\bTODO\b|\bFIXME\b|\bXXX\b/},
  {label: 'console calls', pattern: /\bconsole\./},
  {label: 'process/env access', pattern: /\bprocess(?:\.\w+|\[['"][^'"]+['"]\])/},
  {label: 'time sources', pattern: /\bDate\b/},
  {label: 'random sources', pattern: /\bMath\.random\b/},
  {label: 'JSON serialization', pattern: /\bJSON\.(?:parse|stringify)\b/},
  {label: 'sorting', pattern: /\.sort\(/},
  {label: 'module cache mutation', pattern: /\bmodule\.cache\b/},
  {
    label: 'core io requires',
    pattern: /\brequire\((['"])(fs|http|https|dns|net|child_process|tls|os)\1\)/,
  },
  {label: 'ghp token prefix', pattern: /\bghp_[A-Za-z0-9_]+\b/},
  {label: 'github_pat token prefix', pattern: /\bgithub_pat_[A-Za-z0-9_]+\b/},
  {label: 'bearer auth scheme', pattern: /\bBearer\b/},
  {label: 'basic auth scheme', pattern: /\bBasic\b/},
  {label: 'jwt marker', pattern: /\bJWT\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/},
  {label: 'pem marker', pattern: /-----BEGIN(?: [A-Z0-9]+){1,6}-----/},
  {label: 'long base64 literal', pattern: /['"][A-Za-z0-9+/]{40,}={0,2}['"]/},
  {label: 'long hex literal', pattern: /['"][A-Fa-f0-9]{40,}['"]/},
  {label: 'authorization header', pattern: /\b(?:authorization|proxy-authorization)\b/i},
  {label: 'userinfo url', pattern: /https?:\/\/[^/\s:@]+:[^/\s@]+@/i},
  {
    label: 'secret prose',
    pattern: /\b(?:secret|password|passwd|token|credential|private\s+key|api[-_ ]?key)\b/i,
  },
  {label: 'raw Error constructor', pattern: /\bnew\s+Error\(/},
  {
    label: 'raw error property access',
    pattern: /\b(?:err|error|result|response)\s*\.\s*(?:message|stack|cause|command|output|log)\b/,
  },
  {
    label: 'raw bracketed error property access',
    pattern: /\b(?:err|error|result|response)\[['"](?:message|stack|cause|command|output|log)['"]\]/,
  },
]);

function collectVisits(root) {
  const visits = [];
  function visit(value, currentPath, isRoot) {
    if (!isRoot) {
      visits.push({path: currentPath.join('.'), value});
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...currentPath, String(index)], false));
      return;
    }
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(key => visit(value[key], [...currentPath, key], false));
    }
  }
  visit(root, [], true);
  return visits;
}

function expectOrderedPlainData(actual, expected) {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect(actual).toHaveLength(expected.length);
    expected.forEach((item, index) => expectOrderedPlainData(actual[index], item));
    return;
  }
  if (expected && typeof expected === 'object') {
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    Object.keys(expected).forEach(key => expectOrderedPlainData(actual[key], expected[key]));
  }
}

function expectDistinctMutableGraph(left, right) {
  if (!left || typeof left !== 'object') {
    return;
  }
  expect(left).not.toBe(right);
  if (Array.isArray(left)) {
    left.forEach((item, index) => expectDistinctMutableGraph(item, right[index]));
    return;
  }
  Object.keys(left).forEach(key => expectDistinctMutableGraph(left[key], right[key]));
}

function createFixtureName(prefix, index) {
  return `fixture-${String(prefix + index).padStart(6, '0')}`;
}

function createTrackedValue(label, value, accessLog, cache = new WeakMap()) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (cache.has(value)) {
    return cache.get(value);
  }
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      if (typeof property === 'string') {
        accessLog.push(`${label}.${property}`);
      }
      return createTrackedValue(
        `${label}.${String(property)}`,
        Reflect.get(target, property, receiver),
        accessLog,
        cache,
      );
    },
  });
  cache.set(value, proxy);
  return proxy;
}

function collectProductionSources(rootDirectory) {
  const files = [path.join(rootDirectory, 'App.tsx'), path.join(rootDirectory, 'index.js')];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }
  walk(path.join(rootDirectory, 'src'));
  return files;
}

function expectFinding(finding, shape, counts, visits) {
  const itemKeys = shape === 'three-key' ? ['namespace', 'name', 'state'] : ['namespace', 'name'];
  const itemBase = shape === 'three-key' ? {namespace: 'action', state: 'present'} : {namespace: 'action'};
  expect(Object.keys(finding)).toEqual(FINDING_ROOT_KEYS);
  expect(finding).toMatchObject(FINDING_MATCH);
  expect(Object.keys(finding.location)).toEqual(['line', 'column']);
  expect(Object.keys(finding.evidence)).toEqual(['expected', 'observed', 'related']);
  expect(collectVisits(finding)).toHaveLength(visits);
  for (const [collection, prefix, count] of [
    ['expected', 0, counts[0]],
    ['observed', 100000, counts[1]],
    ['related', 200000, counts[2]],
  ]) {
    expect(finding.evidence[collection]).toHaveLength(count);
    finding.evidence[collection].forEach((item, index) => {
      expect(Object.keys(item)).toEqual(itemKeys);
      expect(item).toEqual({...itemBase, name: createFixtureName(prefix, index)});
    });
  }
}

describe('github-governance-boundary-contract-finding exports', () => {
  test('freezes the closed CommonJS API in exact insertion order', () => {
    const exported = require('../../test-support/release/github-governance-boundary-contract-finding');
    expect(Object.keys(exported)).toEqual(['G1', 'G2']);
    [exported.G1, exported.G2].forEach(family => {
      expect(Object.keys(family)).toEqual(['canonical', 'max', 'maxPlusOne']);
      Object.values(family).forEach(method => expect(Object.isFrozen(method)).toBe(true));
      expect(Object.isFrozen(family)).toBe(true);
    });
    expect(exported.default).toBeUndefined();
    expect(Object.isFrozen(exported)).toBe(true);
  });
});

describe('G1 governance contract fixtures', () => {
  test.each([
    ['canonical', 311, G1.canonical],
    ['max', 311, G1.max],
  ])('%s returns a fresh mutable deep copy of #182 at %i visits', (_label, visitCount, method) => {
    const fixture = method();
    expect(fixture).toEqual(GOVERNANCE_CONTRACT);
    expectOrderedPlainData(fixture, GOVERNANCE_CONTRACT);
    expect(collectVisits(fixture)).toHaveLength(visitCount);
    expectDistinctMutableGraph(GOVERNANCE_CONTRACT, fixture);
    expect(Object.isFrozen(fixture)).toBe(false);
  });

  test('maxPlusOne preserves contract order and adds only the final mutable root boundary', () => {
    const fixture = G1.maxPlusOne();
    expect(fixture.fixtureBoundary).toBeNull();
    expect(Object.keys(fixture)).toEqual([...Object.keys(GOVERNANCE_CONTRACT), 'fixtureBoundary']);
    Object.keys(GOVERNANCE_CONTRACT).forEach(key => expectOrderedPlainData(fixture[key], GOVERNANCE_CONTRACT[key]));
    expect(collectVisits(fixture)).toHaveLength(312);
    expect(Object.getOwnPropertyDescriptor(fixture, 'fixtureBoundary')).toEqual({
      value: null,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    expectDistinctMutableGraph(GOVERNANCE_CONTRACT, fixture);
  });

  test('repeated calls are equal, isolated, and do not mutate #182', () => {
    const first = G1.canonical();
    const second = G1.canonical();
    expect(first).toEqual(second);
    expectDistinctMutableGraph(first, second);
    first.repository.defaultBranch = 'fixture';
    first.requiredChecks[0] = 'fixture';
    first.rulesets['protect-dev'].conditions.refName.include.push('fixture');
    expect(GOVERNANCE_CONTRACT.repository.defaultBranch).toBe('dev');
    expect(GOVERNANCE_CONTRACT.requiredChecks[0]).toBe('TypeScript Check');
    expect(GOVERNANCE_CONTRACT.rulesets['protect-dev'].conditions.refName.include).toEqual(['refs/heads/dev']);
    expect(second.repository.defaultBranch).toBe('dev');
    expect(second.requiredChecks[0]).toBe('TypeScript Check');
    expect(second.rulesets['protect-dev'].conditions.refName.include).toEqual(['refs/heads/dev']);
    expect(G1.canonical()).toEqual(GOVERNANCE_CONTRACT);
  });
});

describe('G2 scanner finding fixtures', () => {
  test('defaults omitted calls to the three-key shape', () => {
    expect(G2.canonical()).toEqual(G2.canonical('three-key'));
    expect(G2.max()).toEqual(G2.max('three-key'));
    expect(G2.maxPlusOne()).toEqual(G2.maxPlusOne('three-key'));
  });

  test.each([
    ['three-key', [1, 1, 1], 28, G2.canonical],
    ['three-key', [32, 32, 32], 400, G2.max],
    ['three-key', [32, 32, 33], 404, G2.maxPlusOne],
    ['two-key', [1, 1, 1], 25, G2.canonical],
    ['two-key', [43, 43, 42], 400, G2.max],
    ['two-key', [43, 43, 43], 403, G2.maxPlusOne],
  ])('%s fixtures honor exact topology and visit arithmetic', (shape, counts, visits, method) => {
    expectFinding(method(shape), shape, counts, visits);
  });

  test.each([
    ['three-key', G2.maxPlusOne('three-key'), 'evidence.related.32', {namespace: 'action', name: 'fixture-200032', state: 'present'}],
    ['two-key', G2.maxPlusOne('two-key'), 'evidence.related.42', {namespace: 'action', name: 'fixture-200042'}],
  ])('%s plus-one first exceeds the 400 ceiling at visit 401 with exact metadata', (_shape, finding, pathAt401, itemAt401) => {
    expect(collectVisits(finding)[400]).toEqual({path: pathAt401, value: itemAt401});
  });

  test.each([
    ['explicit undefined', [undefined]],
    ['extra arg', ['three-key', 'caller-echo-check']],
    ['unsupported string', ['caller-echo-check']],
    ['empty string', ['']],
    ['null', [null]],
    ['number', [1]],
    ['boolean', [false]],
    ['symbol', [Symbol('fixture')]],
    ['array', [[]]],
    ['object', [{}]],
  ])('rejects %s with the exact fixed TypeError', (_label, args) => {
    Object.values(G2).forEach(method => {
      expect(() => method(...args)).toThrow(new TypeError('Unsupported governance fixture option.'));
      try {
        method(...args);
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        expect(error.message).toBe('Unsupported governance fixture option.');
        expect(String(error)).toBe('TypeError: Unsupported governance fixture option.');
      }
    });
  });

  test.each(['three-key', 'two-key'])('%s calls stay fresh, isolated, and mutable', shape => {
    const first = G2.max(shape);
    const second = G2.max(shape);
    expect(first).toEqual(second);
    expectDistinctMutableGraph(first, second);
    first.location.line = 9;
    first.evidence.expected[0].name = 'fixture-999999';
    expect(second.location.line).toBe(1);
    expect(second.evidence.expected[0].name).toBe(createFixtureName(0, 0));
    expect(G2.max(shape)).toEqual(second);
  });
});

describe('module discipline', () => {
  test('structural literals stay pinned to the canonical ground truth', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    const contractSource = fs.readFileSync(contractModulePath, 'utf8');
    CANONICAL_STRUCTURAL_LITERAL_PATTERNS.forEach(({pattern}) => expect(source).toMatch(pattern));
    expect(source.match(/STRUCTURAL_FIXTURE_MESSAGE/g)).toHaveLength(1);
    expect(source.match(/STRUCTURAL_FIXTURE_REMEDIATION/g)).toHaveLength(1);
    expect(contractSource).not.toMatch(/STRUCTURAL_FIXTURE_MESSAGE|STRUCTURAL_FIXTURE_REMEDIATION/);
    const finding = G2.canonical();
    expect(finding.message).toBe(CANONICAL_STRUCTURAL_FIXTURE_MESSAGE);
    expect(finding.remediation).toBe(CANONICAL_STRUCTURAL_FIXTURE_REMEDIATION);
  });

  test('cold import is silent and binds only the approved fields without eager fixture generation', () => {
    const accessLog = [];
    const trackedContractModule = createTrackedValue(
      'contractModule',
      {
        GOVERNANCE_CONTRACT: {
          evidence: {
            nameNamespaces: ['action'],
            stateValues: [
              'absent',
              'active',
              'all',
              'disabled',
              'enabled',
              'evaluate',
              'fail_closed',
              'local_only',
              'matched',
              'mismatched',
              'present',
            ],
          },
        },
        GOVERNANCE_FINDING_SCHEMA_VERSION,
        SCANNER_FINDING_CODES: [SCANNER_FINDING_CODES[0]],
      },
      accessLog,
    );
    const spies = ['log', 'info', 'warn', 'error'].map(name => jest.spyOn(console, name).mockImplementation(() => {}));
    let loaded;
    try {
      jest.isolateModules(() => {
        jest.doMock('../../scripts/release/github-governance-contract.js', () => trackedContractModule);
        loaded = require(modulePath);
      });
      expect(loaded).toBeDefined();
      expect(Object.keys(loaded)).toEqual(['G1', 'G2']);
      expect(accessLog).toEqual([
        'contractModule.GOVERNANCE_CONTRACT',
        'contractModule.GOVERNANCE_FINDING_SCHEMA_VERSION',
        'contractModule.SCANNER_FINDING_CODES',
        'contractModule.GOVERNANCE_CONTRACT.evidence',
        'contractModule.GOVERNANCE_CONTRACT.evidence.nameNamespaces',
        'contractModule.GOVERNANCE_CONTRACT.evidence.nameNamespaces.0',
        'contractModule.GOVERNANCE_CONTRACT.evidence',
        'contractModule.GOVERNANCE_CONTRACT.evidence.stateValues',
        'contractModule.GOVERNANCE_CONTRACT.evidence.stateValues.10',
      ]);
      expect(accessLog).not.toContain('contractModule.SCANNER_FINDING_CODES.0');
    } finally {
      spies.forEach(spy => {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      });
      jest.resetModules();
    }
  });

  test('source forbids hostile APIs, temp paths, credentials, and raw error/log exfiltration shapes', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    FORBIDDEN_SOURCE_PATTERNS.forEach(({pattern}) => {
      expect(source).not.toMatch(pattern);
    });
  });

  test('production source files do not import test-support', () => {
    collectProductionSources(path.join(__dirname, '../..')).forEach(filePath => {
      expect(fs.readFileSync(filePath, 'utf8')).not.toMatch(/test-support\//);
    });
  });
});

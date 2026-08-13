'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const contract = require('../../scripts/release/github-governance-contract.js');
const graph = require('../../test-support/release/github-governance-fixture-graph');
const fixtures = require('../../test-support/release/github-governance-validation-fixtures');
const boundaries = require('../../test-support/release/github-governance-boundary-fixtures');

const modulePath = path.resolve(
  __dirname,
  '../../test-support/release/github-governance-validation-fixtures.js',
);
const badOption = 'Unsupported governance fixture option.';

function mutableNodes(value, output = new Set(), seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  output.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, 'value')) {
      mutableNodes(descriptor.value, output, seen);
    }
  }
  return output;
}

function expectIsolated(left, right, protectedNodes = new WeakSet()) {
  const leftNodes = mutableNodes(left);
  const rightNodes = mutableNodes(right);
  for (const node of leftNodes) {
    expect(rightNodes.has(node)).toBe(false);
    expect(protectedNodes.has(node)).toBe(false);
  }
}

function arraySnapshot(value) {
  const output = [];
  function visit(current, trail) {
    if (Array.isArray(current)) output.push([trail, current.slice()]);
    if (current && typeof current === 'object') {
      for (const key of Object.keys(current)) visit(current[key], `${trail}.${key}`);
    }
  }
  visit(value, 'root');
  return output;
}

const casePaths = {
  'C-A01': ['root.requiredChecks'], 'C-A02': ['root.repositoryVariableNames'],
  'C-A03': ['root.allowedRepositoryDemoSecretNames'],
  'C-A04': ['root.releaseCredentialSecretNames'],
  'C-A05': ['root.copilotForbiddenSecretNames'],
  'C-A06': ['root.evidence.nameNamespaces'],
  'C-A07': ['root.evidence.identifierNamespaces'],
  'C-A08': ['root.evidence.stateValues'],
  'C-A09': ['root.productionApproval.eligibleHumanPermissions'],
  'C-A10': ['root.productionApproval.eligibleTriggerAppIds'],
  'C-A11': ['root.rulesets.protect-dev.conditions.refName.include', 'root.rulesets.protect-main.conditions.refName.include'],
  'C-A12': ['root.rulesets.protect-dev.conditions.refName.exclude', 'root.rulesets.protect-main.conditions.refName.exclude'],
  'C-A13': ['root.rulesets.protect-dev.bypassActors', 'root.rulesets.protect-main.bypassActors'],
  'C-A14': ['root.rulesets.protect-dev.rules', 'root.rulesets.protect-main.rules'],
  'C-A15': ['root.rulesets.protect-dev.rules.3.parameters.required_status_checks', 'root.rulesets.protect-main.rules.3.parameters.required_status_checks'],
  'C-A16': ['root.environments.release-query.reviewers', 'root.environments.release-ios.reviewers', 'root.environments.release-android.reviewers', 'root.environments.production-ios.reviewers', 'root.environments.production-android.reviewers'],
  'C-A17': ['root.environments.release-query.branchPolicies', 'root.environments.release-ios.branchPolicies', 'root.environments.release-android.branchPolicies', 'root.environments.production-ios.branchPolicies', 'root.environments.production-android.branchPolicies'],
  'C-A18': ['root.environments.release-query.secretNames', 'root.environments.release-ios.secretNames', 'root.environments.release-android.secretNames', 'root.environments.production-ios.secretNames', 'root.environments.production-android.secretNames'],
  'C-A19': ['root.environments.release-query.variableNames', 'root.environments.release-ios.variableNames', 'root.environments.release-android.variableNames', 'root.environments.production-ios.variableNames', 'root.environments.production-android.variableNames'],
  'F-A01': ['root.evidence.expected'], 'F-A02': ['root.evidence.observed'],
  'F-A03': ['root.evidence.related'], 'W-A01': ['root.scannedFiles'],
  'W-A02': ['root.findings'], 'R-A01': ['root.rulesets'],
  'R-A02': ['root.rulesets.0.conditions.refName.include', 'root.rulesets.1.conditions.refName.include'],
  'R-A03': ['root.rulesets.0.conditions.refName.exclude', 'root.rulesets.1.conditions.refName.exclude'],
  'R-A04': ['root.rulesets.0.bypassActors', 'root.rulesets.1.bypassActors'],
  'R-A05': ['root.rulesets.0.rules', 'root.rulesets.1.rules'],
  'R-A06': ['root.rulesets.0.rules.3.parameters.required_status_checks', 'root.rulesets.1.rules.3.parameters.required_status_checks'],
  'E-A01': ['root.environments'],
  'E-A02': ['root.environments.0.reviewers', 'root.environments.1.reviewers', 'root.environments.2.reviewers', 'root.environments.3.reviewers', 'root.environments.4.reviewers'],
  'E-A03': ['root.environments.0.branchPolicies', 'root.environments.1.branchPolicies', 'root.environments.2.branchPolicies', 'root.environments.3.branchPolicies', 'root.environments.4.branchPolicies'],
  'E-A04': ['root.environments.0.secretNames', 'root.environments.1.secretNames', 'root.environments.2.secretNames', 'root.environments.3.secretNames', 'root.environments.4.secretNames'],
  'E-A05': ['root.environments.0.variableNames', 'root.environments.1.variableNames', 'root.environments.2.variableNames', 'root.environments.3.variableNames', 'root.environments.4.variableNames'],
  'N-A01': ['root.repositorySecretNames'], 'N-A02': ['root.repositoryVariableNames'],
  'N-A03': ['root.collaborators'],
};

function changedArrays(baseline, changed) {
  const before = new Map(arraySnapshot(baseline));
  return new Map(arraySnapshot(changed).filter(([trail, array]) =>
    before.has(trail) && array.length !== before.get(trail).length,
  ));
}

function changedArrayPaths(baseline, changed) {
  const before = new Map(arraySnapshot(baseline));
  return arraySnapshot(changed).filter(([trail, array]) =>
    before.has(trail) && JSON.stringify(array) !== JSON.stringify(before.get(trail)),
  ).map(([trail]) => trail);
}

describe('github governance validation fixtures', () => {
  test('cold imports and builder calls have an exact frozen, side-effect-free surface', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    const harness = [
      "'use strict'; const target = process.argv[2]; const source = Buffer.from(process.argv[1], 'base64').toString('utf8'); const stdout = process.stdout; const stderr = process.stderr; const Module = require('module'); const path = require('path'); const fail = () => { throw new Error('side effect'); };",
      "const dependencies = {'../../scripts/release/github-governance-contract.js': require(path.resolve(path.dirname(target), '../../scripts/release/github-governance-contract.js')), './github-governance-fixture-graph': require(path.resolve(path.dirname(target), 'github-governance-fixture-graph.js')), './github-governance-boundary-fixtures': require(path.resolve(path.dirname(target), 'github-governance-boundary-fixtures.js'))};",
      "const modules = [require('fs'), require('http'), require('https'), require('net'), require('dns'), require('child_process')];",
      "for (const item of [...modules, console, Date, Math]) for (const key of Object.keys(item)) { const descriptor = Object.getOwnPropertyDescriptor(item, key); if (descriptor && descriptor.writable && typeof descriptor.value === 'function') item[key] = fail; }",
      "Object.defineProperty(process, 'env', {configurable: true, get: fail}); stdout.write = fail; stderr.write = fail; Date.now = fail; Math.random = fail;",
      "Module._load = request => { if (!Object.hasOwn(dependencies, request)) fail(); return dependencies[request]; }; const loaded = new Module(target); loaded.filename = target; loaded.paths = []; loaded._compile(source, target); const exported = loaded.exports;",
      "if (Object.keys(exported).join(',') !== 'buildContract,buildFinding,buildWorkflowScan,buildNormalizedGovernanceState,cloneWithDescriptors,snapshotGraph') process.exitCode = 1;",
      "if (!Object.isFrozen(exported) || !Object.values(exported).every(Object.isFrozen)) process.exitCode = 1;",
      "for (const build of [exported.buildContract, exported.buildFinding, exported.buildWorkflowScan, exported.buildNormalizedGovernanceState]) build();",
    ].join('');
    const result = spawnSync(
      process.execPath,
      ['-e', harness, Buffer.from(source).toString('base64'), modulePath],
      {encoding: 'utf8'},
    );
    expect(source).not.toMatch(/\b(?:fs|http|https|dns|net|process\.env|console\.|Date\.|Math\.random|module\.cache)\b/);
    expect(result).toMatchObject({status: 0, stdout: '', stderr: ''});
    expect(Object.keys(fixtures)).toEqual([
      'buildContract', 'buildFinding', 'buildWorkflowScan',
      'buildNormalizedGovernanceState', 'cloneWithDescriptors', 'snapshotGraph',
    ]);
    expect(fixtures.cloneWithDescriptors).toBe(graph.cloneWithDescriptors);
    expect(fixtures.snapshotGraph).toBe(graph.snapshotGraph);
  });

  test.each([
    ['contract', () => fixtures.buildContract()],
    ['finding', () => fixtures.buildFinding()],
    ['workflow', () => fixtures.buildWorkflowScan()],
    ['state', () => fixtures.buildNormalizedGovernanceState()],
  ])('defaults are ordered, mutable, equal, and isolated: %s', (_name, build) => {
    const first = build();
    const second = build();
    expect(fixtures.snapshotGraph(first)).toEqual(fixtures.snapshotGraph(second));
    expect(Object.isFrozen(first)).toBe(false);
    expectIsolated(first, second, mutableNodes(contract.GOVERNANCE_CONTRACT));
  });

  test('uses canonical V2 literals and exact documented root and nested order', () => {
    expect(fixtures.buildContract()).toEqual(contract.GOVERNANCE_CONTRACT);
    const finding = fixtures.buildFinding();
    expect(finding.schemaVersion).toBe(contract.GOVERNANCE_FINDING_SCHEMA_VERSION);
    expect(Object.keys(finding)).toEqual(['schemaVersion', 'kind', 'code', 'severity', 'scope', 'subject', 'message', 'remediation', 'path', 'location', 'evidence']);
    expect(Object.keys(finding.location)).toEqual(['line', 'column']);
    for (const [shape, itemKeys] of [['two-key', ['namespace', 'name']], ['three-key', ['namespace', 'name', 'state']]]) {
      const evidence = fixtures.buildFinding({evidenceShape: shape}).evidence;
      expect(Object.keys(evidence)).toEqual(['expected', 'observed', 'related']);
      for (const items of Object.values(evidence)) expect(Object.keys(items[0])).toEqual(itemKeys);
    }
    const workflow = fixtures.buildWorkflowScan();
    expect(workflow.schemaVersion).toBe(contract.CONTRACT_VERSION);
    expect(Object.keys(workflow)).toEqual([
      'schemaVersion', 'scannedFiles', 'findings',
    ]);
    const state = fixtures.buildNormalizedGovernanceState();
    expect(state.schemaVersion).toBe(contract.NORMALIZED_STATE_SCHEMA_VERSION);
    expect(Object.keys(state)).toEqual([
      'schemaVersion', 'repository', 'rulesets', 'legacyBranchProtection',
      'environments', 'repositorySecretNames', 'repositoryVariableNames',
      'actions', 'collaborators', 'branches', 'workflowScan',
    ]);
    expect(Object.keys(state.branches)).toEqual(['dev', 'main']);
    expect(Object.keys(state.environments[3].reviewers[0])).toEqual(['type', 'login', 'id']);
    expect(Object.keys(state.environments[3].branchPolicies[0])).toEqual(['type', 'name']);
  });

  test('table-drives every A-case to its exact deterministic injection path', () => {
    const groups = [
      [fixtures.buildContract, Array.from({length: 19}, (_, index) => `C-A${String(index + 1).padStart(2, '0')}`), code => code >= 'C-A11' && code <= 'C-A15' ? 2 : code >= 'C-A16' ? 5 : 1],
      [fixtures.buildFinding, ['F-A01', 'F-A02', 'F-A03'], () => 1],
      [fixtures.buildWorkflowScan, ['W-A01', 'W-A02'], () => 1],
      [fixtures.buildNormalizedGovernanceState, ['R-A01', 'R-A02', 'R-A03', 'R-A04', 'R-A05', 'R-A06', 'E-A01', 'E-A02', 'E-A03', 'E-A04', 'E-A05', 'N-A01', 'N-A02', 'N-A03'], code => code[0] === 'R' && code !== 'R-A01' ? 2 : code[0] === 'E' && code !== 'E-A01' ? 5 : 1],
    ];
    for (const [build, cases] of groups) for (const arrayCase of cases) {
      const option = {arrayCase, variant: 'inject'};
      const beforeOption = fixtures.snapshotGraph(option);
      const baseline = build();
      const changed = build(option);
      const differences = changedArrays(baseline, changed);
      expect(fixtures.snapshotGraph(option)).toEqual(beforeOption);
      expect([...differences.keys()]).toEqual(casePaths[arrayCase]);
      const canonicalArrays = new Map(arraySnapshot(baseline));
      for (const [trail, array] of arraySnapshot(changed)) {
        if (canonicalArrays.has(trail) &&
          !casePaths[arrayCase].some(path => path === trail || path.startsWith(`${trail}.`))) {
          expect(array).toEqual(canonicalArrays.get(trail));
        }
      }
      for (const [trail, array] of differences) {
        const before = new Map(arraySnapshot(baseline)).get(trail);
        const element = array.at(-1);
        expect(array).toHaveLength(before.length + 1);
        expect(typeof element === 'string' || Object.keys(element).length > 1).toBe(true);
      }
      expectIsolated(changed, baseline);
    }
  });

  test('applies positive variants with their exact designated semantics', () => {
    const contractBaseline = fixtures.buildContract();
    const swapped = fixtures.buildContract({arrayCase: 'C-A01', variant: 'swap'});
    expect(swapped.requiredChecks).toEqual([contractBaseline.requiredChecks[1], contractBaseline.requiredChecks[0], ...contractBaseline.requiredChecks.slice(2)]);
    expect(changedArrayPaths(contractBaseline, swapped)).toEqual(['root.requiredChecks']);
    const workflowBaseline = fixtures.buildWorkflowScan(); const duplicate = fixtures.buildWorkflowScan({arrayCase: 'W-A02', variant: 'duplicate'});
    expect(duplicate.findings).toHaveLength(2); expect(duplicate.findings.slice(0, -1)).toEqual(workflowBaseline.findings);
    expect(duplicate.findings[1]).toEqual(duplicate.findings[0]);
    expect(duplicate.findings[1]).not.toBe(duplicate.findings[0]); expectIsolated(duplicate, workflowBaseline);
    const stateBaseline = fixtures.buildNormalizedGovernanceState(); const collision = fixtures.buildNormalizedGovernanceState({arrayCase: 'N-A03', variant: 'caseFoldCollision'});
    const [identity, folded] = collision.collaborators;
    expect({...folded, login: identity.login}).toEqual(identity);
    expect(identity.login).toMatch(/^[\x00-\x7F]+$/); expect(folded.login).toBe(identity.login === identity.login.toLowerCase() ? identity.login.toUpperCase() : identity.login.toLowerCase());
    expect(changedArrayPaths(stateBaseline, collision)).toEqual(['root.collaborators']); expectIsolated(collision, stateBaseline);
  });

  test.each([
    [fixtures.buildContract, 'C-A10', 'swap'],
    [fixtures.buildContract, 'C-A10', 'duplicate'],
    [fixtures.buildContract, 'C-A08', 'caseFoldCollision'],
    [fixtures.buildWorkflowScan, 'W-A02', 'caseFoldCollision'],
    [fixtures.buildNormalizedGovernanceState, 'E-A02', 'duplicate'],
  ])('enforces exact empty, singleton, and nonapplicable variants', (build, arrayCase, variant) => {
    expect(() => build({arrayCase, variant})).toThrow(new TypeError(badOption));
  });

  test('descriptor-inspects closed options without invoking accessors', () => {
    const accessor = {};
    Object.defineProperty(accessor, 'variant', {get: () => { throw new Error('read'); }});
    const inherited = Object.create({boundary: 'max'});
    const values = [
      Symbol('option'), accessor, inherited, {unknown: 'value'},
      {arrayCase: 'C-A01', variant: 'inject', boundary: 'max'},
      {arrayCase: 'R-A01', boundary: 'max'},
    ];
    for (const value of values) {
      expect(() => fixtures.buildContract(value)).toThrow(new TypeError(badOption));
    }
    expect(() => fixtures.buildNormalizedGovernanceState(values.at(-1)))
      .toThrow(new TypeError(badOption));
  });

  test('materializes supported named boundaries through the public facade', () => {
    const contractMax = fixtures.buildContract({boundary: 'max'});
    const contractPlusOne = fixtures.buildContract({boundary: 'maxPlusOne'});
    expectIsolated(contractMax, fixtures.buildContract());
    expect(contractPlusOne).not.toEqual(contractMax);
    const findingMax = fixtures.buildFinding({boundary: 'max', evidenceShape: 'two-key'});
    expect(findingMax).not.toEqual(fixtures.buildFinding({evidenceShape: 'two-key'}));
    for (const [boundary, length] of [['canonical', 12], ['max', 240], ['maxPlusOne', 241]]) {
      const state = fixtures.buildNormalizedGovernanceState({
        boundary, boundaryGroup: 'repositoryPath',
      });
      expect(state.workflowScan.scannedFiles[0]).toHaveLength(length);
    }
    expect(() => fixtures.buildWorkflowScan({boundary: 'max'})).toThrow(new TypeError(badOption));
    for (const boundaryGroup of ['ruleset', 'environment', 'normalized']) {
      expect(() => fixtures.buildNormalizedGovernanceState({boundary: 'max', boundaryGroup}))
        .toThrow(new TypeError(badOption));
    }
    for (const preset of ['canonical', 'max', 'maxPlusOne']) {
      expect(boundaries.G1[preset]()).toEqual(fixtures.buildContract({boundary: preset}));
    }
    expect(['canonical', 'max', 'maxPlusOne'].map(preset => Object.values(
      boundaries.G2[preset]('three-key').evidence).map(items => items.length),
    )).toEqual([[1, 1, 1], [32, 32, 32], [32, 32, 33]]);
    expect(['canonical', 'max', 'maxPlusOne'].map(preset =>
      boundaries.G5[preset]('utf16').utf16Units)).toEqual([12, 240, 241]);
    expect(['canonical', 'max', 'maxPlusOne'].map(preset =>
      boundaries.G6[preset]().declaredDepth)).toEqual([1, 32, 33]);
    expect(boundaries.G7.canonical('sparse')).toHaveLength(4);
    expect(Reflect.ownKeys(boundaries.G7.max())).toHaveLength(57);
    expect([boundaries.G7.maxPlusOne, boundaries.G8.max, boundaries.G8.maxPlusOne]).toEqual([undefined, undefined, undefined]); expect(boundaries.G8.canonical('swap')).toEqual(['fixture-000001', 'fixture-000000']);
    expect(() => boundaries.G5.maxPlusOne('utf16', 'extra')).toThrow(new TypeError(badOption));
  });

  test('compares frozen G3, G4, and G9 formula counters without materializing payloads', () => {
    const expected = [[boundaries.G3, [[3, [0, 0, 0, 0, 0, 0]], [2015003, [10000, 5000, 96, 480000, 15000, 0]], [2015004, [10000, 5000, 96, 480000, 15000, 1]]]], [boundaries.G4, [[11, [11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]], [2594433, [11, 3, 301800, 6, 271100, 2000, 4, 4500, 6, 2015003, 100, 100, 4, 96, 2003, 400, 607, 100, 0]], [2594434, [11, 3, 301800, 6, 271100, 2000, 4, 4500, 6, 2015003, 100, 100, 4, 96, 2003, 400, 607, 100, 1]]]]];
    for (const [family, values] of expected) for (const [preset, [visits, counts]] of ['canonical', 'max', 'maxPlusOne'].map((preset, index) => [preset, values[index]])) {
      const formula = family[preset]();
      expect([Object.isFrozen(formula), Object.isFrozen(formula.counts), formula.expectedVisits, Object.values(formula.counts)]).toEqual([true, true, visits, counts]);
    }
    for (const [axis, values] of [['errors', [[0, 0, 0], [100, 100, 0], [101, 101, 0]]], ['stringUnits', [[1, 0, 1], [16777216, 0, 16777216], [16777217, 0, 16777217]]]]) for (const [preset, counts] of ['canonical', 'max', 'maxPlusOne'].map((preset, index) => [preset, values[index]])) {
      const formula = boundaries.G9[preset](axis);
      expect([Object.isFrozen(formula), Object.isFrozen(formula.counts), formula.expectedVisits, Object.values(formula.counts)]).toEqual([true, true, counts[0], counts.slice(1)]);
    }
    expect(() => boundaries.G9.canonical('errors', undefined)).toThrow(new TypeError(badOption));
  });

  test('contains only pure structural fixture behavior', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).not.toMatch(/\/tmp|\/var\/tmp|\bTODO\b|\bFIXME\b|console\./);
    expect(source).not.toMatch(/\bvoid\s+(?:G|GOVERNANCE|NORMALIZED|SCANNER|POLICY|compare)/);
    expect(source).not.toMatch(/\b(?:fetch|child_process|readFile|writeFile|random|stdout|stderr)\b/);
    expect(source).not.toMatch(/ghp_|github_pat_|Bearer |Basic |-----BEGIN|:\/\/[^\s/]*@/);
  });
});

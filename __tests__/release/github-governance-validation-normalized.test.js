'use strict';

const fs = require('fs');
const {
  buildNormalizedGovernanceState,
  snapshotGraph,
} = require('../../test-support/release/github-governance-validation-fixtures');
const modulePath =
  '../../scripts/release/github-governance-validation-normalized';
const {validateNormalizedGovernanceState} = require(modulePath);

const STRUCTURAL_MESSAGES = Object.freeze({
  BUDGET_EXCEEDED: 'Validation budget exceeded.',
  OBJECT_SHAPE:
    'Object keys do not match the required shape and insertion order.',
  REQUIRED_LITERAL: 'Value does not match the required literal.',
  CANONICAL_ORDER: 'Collection is not in canonical order.',
  DUPLICATE_IDENTITY: 'Collection contains a duplicate identity.',
  EXPECTED_BOOLEAN: 'Expected a boolean.',
  EXPECTED_ENUM: 'Expected an allowed value.',
  EXPECTED_INTEGER: 'Expected an integer in the allowed range.',
});
const issue = (path, message) => ({code: 'SCHEMA_INVALID', path, message});
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const pad = (value, width = 4) => String(value).padStart(width, '0');
const compact = (value, width = 2) =>
  value.toString(36).padStart(width, '0');

function canonicalState() {
  const state = buildNormalizedGovernanceState();
  state.rulesets.sort((left, right) =>
    compare(left.name, right.name) || compare(left.id, right.id));
  for (const ruleset of state.rulesets)
    ruleset.rules[3].parameters.required_status_checks.sort((left, right) =>
      compare(left.context, right.context));
  state.environments.sort((left, right) =>
    compare(left.name, right.name) || compare(left.id, right.id));
  for (const environment of state.environments) {
    environment.reviewers.sort((left, right) =>
      compare(left.type, right.type) || compare(left.login, right.login) ||
      compare(left.id, right.id));
    environment.branchPolicies.sort((left, right) =>
      compare(left.type, right.type) || compare(left.name, right.name));
    environment.secretNames.sort(compare);
    environment.variableNames.sort(compare);
  }
  state.repositorySecretNames.sort(compare);
  state.repositoryVariableNames.sort(compare);
  state.collaborators.sort((left, right) =>
    compare(left.login, right.login) || compare(left.id, right.id));
  return state;
}

function ownSlots(value) {
  if (value === null || typeof value !== 'object') return 0;
  return Object.keys(value).reduce(
    (total, key) => total + 1 + ownSlots(value[key]), 0,
  );
}

function maximalRuleset(index) {
  const checks = Array.from({length: 100}, (unused, item) => ({
    context: `c${compact(item)}`, integration_id: null,
  }));
  return {
    id: `id-${pad(index)}`, name: `ruleset-${pad(index)}`,
    enforcement: 'active', target: 'branch',
    conditions: {refName: {
      include: Array.from({length: 1000},
        (unused, item) => `a${compact(item)}`),
      exclude: Array.from({length: 1000},
        (unused, item) => `z${compact(item)}`),
    }},
    bypassActors: Array.from({length: 100}, (unused, item) => ({
      actor_id: item, actor_type: 'Team', bypass_mode: 'always',
    })),
    rules: [
      {type: 'deletion', parameters: null},
      {type: 'non_fast_forward', parameters: null},
      {type: 'pull_request', parameters: {
        required_approving_review_count: 6,
        dismiss_stale_reviews_on_push: true,
        require_last_push_approval: true,
        required_review_thread_resolution: true,
        require_code_owner_review: false,
      }},
      {type: 'required_status_checks', parameters: {
        required_status_checks: checks,
        strict_required_status_checks_policy: true,
      }},
      ...Array.from({length: 96}, (unused, item) => ({
        type: `u${compact(item)}`, parameters: null,
      })),
    ],
  };
}

function maximalEnvironment(index) {
  return {
    id: `environment-${pad(index)}`, name: `environment-${pad(index)}`,
    canAdminsBypass: false, preventSelfReview: false,
    reviewers: Array.from({length: 100}, (unused, item) => ({
      type: 'U', login: `r${compact(item)}`, id: item,
    })),
    deploymentBranchPolicy: {
      protectedBranches: false, customBranchPolicies: true,
    },
    branchPolicies: Array.from({length: 100}, (unused, item) => ({
      type: 'b', name: `p${compact(item)}`,
    })),
    secretNames: Array.from({length: 1000},
      (unused, item) => `S${compact(item)}`),
    variableNames: Array.from({length: 1000},
      (unused, item) => `V${compact(item)}`),
  };
}

function maximalWorkflow(template) {
  const finding = template.findings[0];
  const bucket = prefix => Array.from({length: 32}, (unused, item) => ({
    ...finding.evidence.expected[0], name: `${prefix}${compact(item, 1)}`,
  }));
  return {
    schemaVersion: template.schemaVersion,
    scannedFiles: Array.from({length: 10000},
      (unused, item) =>
        `.github/workflows/f${compact(item, 3)}.yml`),
    findings: Array.from({length: 5000}, (unused, item) => ({
      ...finding,
      path: `.github/workflows/g${compact(item, 3)}.yml`,
      location: {...finding.location},
      evidence: {
        expected: bucket('a'), observed: bucket('b'), related: bucket('c'),
      },
    })),
  };
}

function maximalState() {
  const state = canonicalState();
  state.rulesets = Array.from({length: 100},
    (unused, index) => maximalRuleset(index));
  state.legacyBranchProtection = {
    dev: {exists: true, protected: true},
    main: {exists: true, protected: true},
  };
  state.environments = Array.from({length: 100},
    (unused, index) => maximalEnvironment(index));
  state.repositorySecretNames = Array.from({length: 1000},
    (unused, index) => `S${compact(index)}`);
  state.repositoryVariableNames = Array.from({length: 1000},
    (unused, index) => `V${compact(index)}`);
  state.collaborators = Array.from({length: 500}, (unused, index) => ({
    login: `user-${pad(index)}`, id: index, permission: 'pull',
  }));
  state.workflowScan = maximalWorkflow(state.workflowScan);
  return state;
}

function errors(state) {
  return validateNormalizedGovernanceState(state).errors || [];
}

describe('normalized GitHub governance validation', () => {
  test('exports exactly one frozen validator and accepts the exact shape', () => {
    const exported = require(modulePath);
    const state = canonicalState();
    const before = snapshotGraph(state);
    const result = validateNormalizedGovernanceState(state);

    expect(Object.keys(exported)).toEqual(['validateNormalizedGovernanceState']);
    expect(Object.isFrozen(exported)).toBe(true);
    expect(Object.isFrozen(validateNormalizedGovernanceState)).toBe(true);
    expect(validateNormalizedGovernanceState).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.value)).toEqual([
      'schemaVersion', 'repository', 'rulesets', 'legacyBranchProtection',
      'environments', 'repositorySecretNames', 'repositoryVariableNames',
      'actions', 'collaborators', 'branches', 'workflowScan',
    ]);
    expect(snapshotGraph(state)).toEqual(before);
  });

  test('accepts the simultaneous maximum and accounts for every formula term',
    () => {
      const state = maximalState();
      expect([
        ownSlots(state), Object.keys(state).length, ownSlots(state.repository),
        ownSlots(state.rulesets), ownSlots(state.legacyBranchProtection),
        ownSlots(state.environments), ownSlots(state.repositorySecretNames) +
          ownSlots(state.repositoryVariableNames),
        ownSlots(state.actions), ownSlots(state.collaborators),
        ownSlots(state.branches), ownSlots(state.workflowScan),
      ]).toEqual([
        2592031, 11, 3, 301800, 6, 271200, 2000, 4, 2000, 4, 2015003,
      ]);
      const maximalResult = validateNormalizedGovernanceState(state);
      expect(maximalResult).toEqual({ok: true, value: expect.anything()});

      state.repositorySecretNames.push('SECRET_EXTRA');
      expect(errors(state)).toEqual([
        issue('', STRUCTURAL_MESSAGES.BUDGET_EXCEEDED),
      ]);
      state.repositorySecretNames.pop();
      state.extra = true;
      expect(errors(state)).toEqual([
        issue('', STRUCTURAL_MESSAGES.BUDGET_EXCEEDED),
      ]);
    }, 300000);

  test.each([
    ['rulesets', 100, state => state, 'rulesets',
      index => maximalRuleset(index)],
    ['ruleset includes', 1000, state =>
      state.rulesets[0].conditions.refName, 'include',
    index => `a${compact(index)}`],
    ['ruleset excludes', 1000, state =>
      state.rulesets[0].conditions.refName, 'exclude',
    index => `z${compact(index)}`],
    ['bypass actors', 100, state => state.rulesets[0], 'bypassActors',
      index => ({actor_id: index, actor_type: 'Team', bypass_mode: 'always'})],
    ['rules', 100, state => state.rulesets[0], 'rules',
      index => ({type: `u${compact(index)}`, parameters: null})],
    ['required checks', 100, state =>
      state.rulesets[0].rules[3].parameters, 'required_status_checks',
    index => ({context: `c${compact(index)}`, integration_id: null})],
    ['environments', 100, state => state, 'environments',
      index => maximalEnvironment(index)],
    ['reviewers', 100, state => state.environments[0], 'reviewers',
      index => ({type: 'U', login: `r${compact(index)}`, id: index})],
    ['branch policies', 100, state => state.environments[0], 'branchPolicies',
      index => ({type: 'b', name: `p${compact(index)}`})],
    ['environment secrets', 1000, state => state.environments[0],
      'secretNames', index => `S${compact(index)}`],
    ['environment variables', 1000, state => state.environments[0],
      'variableNames', index => `V${compact(index)}`],
    ['repository secrets', 1000, state => state, 'repositorySecretNames',
      index => `S${compact(index)}`],
    ['repository variables', 1000, state => state, 'repositoryVariableNames',
      index => `V${compact(index)}`],
    ['collaborators', 500, state => state, 'collaborators',
      index => ({login: `user-${pad(index)}`, id: index, permission: 'pull'})],
    ['scanned files', 10000, state => state.workflowScan, 'scannedFiles',
      index => `.github/workflows/f${compact(index, 3)}.yml`],
    ['findings', 5000, state => state.workflowScan, 'findings',
      (index, state) => {
        const value = state.workflowScan.findings[0];
        return {...value, path: `.github/workflows/g${compact(index, 3)}.yml`,
          location: {...value.location}, evidence: Object.fromEntries(
            Object.entries(value.evidence).map(([key, items]) =>
              [key, items.map(entry => ({...entry}))]),
          )};
      }],
    ...['expected', 'observed', 'related'].map(key =>
      [`evidence ${key}`, 32, state =>
        state.workflowScan.findings[0].evidence, key,
      (index, state) => ({
        ...state.workflowScan.findings[0].evidence[key][0],
        name: `fixture-${compact(index)}`,
      })]),
  ])('accepts exact %s limit and budget-fails isolated plus one',
    (name, limit, select, key, item) => {
      const state = canonicalState();
      select(state)[key] = Array.from({length: limit}, (unused, index) =>
        item(index, state));
      expect(errors(state)).toEqual([]);
      select(state)[key].push(item(limit, state));
      expect(errors(state)).toEqual([
        issue('', STRUCTURAL_MESSAGES.BUDGET_EXCEEDED),
      ]);
    }, 300000);

  test.each([
    ['schema version', state => {
      state.schemaVersion = 3;
    }, '/schemaVersion', STRUCTURAL_MESSAGES.EXPECTED_INTEGER],
    ['repository shape', state => {
      state.repository.extra = true;
    }, '/repository', STRUCTURAL_MESSAGES.OBJECT_SHAPE],
    ['legacy branch', state => {
      state.legacyBranchProtection = {
        dev: {exists: true, protected: false},
        main: {exists: true, protected: false, extra: true},
      };
    }, '/legacyBranchProtection/main', STRUCTURAL_MESSAGES.OBJECT_SHAPE],
    ['actions enum', state => {
      state.actions.allowedActions = 'private';
    }, '/actions/allowedActions', STRUCTURAL_MESSAGES.EXPECTED_ENUM],
    ['branch literal', state => {
      state.branches.dev.name = 'main';
    }, '/branches/dev/name', STRUCTURAL_MESSAGES.REQUIRED_LITERAL],
    ['nested ruleset', state => {
      state.rulesets[0].target = 'repository';
    }, '/rulesets/0/target', STRUCTURAL_MESSAGES.REQUIRED_LITERAL],
    ['nested environment', state => {
      state.environments[0].canAdminsBypass = 'false';
    }, '/environments/0/canAdminsBypass',
    STRUCTURAL_MESSAGES.EXPECTED_BOOLEAN],
    ['nested workflow', state => {
      state.workflowScan.schemaVersion = '1.0.0';
    }, '/workflowScan/schemaVersion', STRUCTURAL_MESSAGES.REQUIRED_LITERAL],
  ])('rejects malformed %s without raw values',
    (name, change, path, message) => {
      const state = canonicalState();
      change(state);
      const result = validateNormalizedGovernanceState(state);
      expect(result.errors).toContainEqual(issue(path, message));
    });

  test.each([
    ['N-A01', 'repositorySecretNames', ['ALPHA', 'BRAVO'], null],
    ['N-A01', 'repositorySecretNames', ['BRAVO', 'ALPHA'], 'CANONICAL_ORDER'],
    ['N-A01', 'repositorySecretNames', ['ALPHA', 'ALPHA'],
      'DUPLICATE_IDENTITY'],
    ['N-A01', 'repositorySecretNames', ['ALPHA', 'BRAVO', 'alpha'],
      'DUPLICATE_IDENTITY'],
    ['N-A02', 'repositoryVariableNames', ['ALPHA', 'BRAVO'], null],
    ['N-A02', 'repositoryVariableNames', ['BRAVO', 'ALPHA'],
      'CANONICAL_ORDER'],
    ['N-A02', 'repositoryVariableNames', ['ALPHA', 'ALPHA'],
      'DUPLICATE_IDENTITY'],
    ['N-A02', 'repositoryVariableNames', ['ALPHA', 'BRAVO', 'alpha'],
      'DUPLICATE_IDENTITY'],
  ])('enforces canonical %s %s variant without mutation',
    (arrayCase, field, values, diagnostic) => {
      const state = canonicalState();
      state[field] = values;
      const before = snapshotGraph(state);
      const result = errors(state);
      if (diagnostic === null) expect(result).toEqual([]);
      else expect(result).toContainEqual(issue(
        `/${field}/${values.length - 1}`, STRUCTURAL_MESSAGES[diagnostic],
      ));
      expect(snapshotGraph(state)).toEqual(before);
    });

  test('enforces every N-A03 variant without mutation', () => {
    const cases = [
      [[{login: 'a', id: 1, permission: 'pull'},
        {login: 'b', id: 2, permission: 'push'}], null],
      [
        [{login: 'z', id: 1, permission: 'pull'},
          {login: 'a', id: 2, permission: 'pull'}],
        issue('/collaborators/1', STRUCTURAL_MESSAGES.CANONICAL_ORDER),
      ],
      [
        [{login: 'a', id: 1, permission: 'pull'},
          {login: 'a', id: 1, permission: 'pull'}],
        issue('/collaborators/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY),
      ],
      [
        [{login: 'ALICE', id: 1, permission: 'pull'},
          {login: 'BOB', id: 2, permission: 'pull'},
          {login: 'alice', id: 3, permission: 'pull'}],
        issue('/collaborators/2', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY),
      ],
      [
        [{login: 'a', id: 1, permission: 'owner'}],
        issue('/collaborators/0/permission', STRUCTURAL_MESSAGES.EXPECTED_ENUM),
      ],
      [
        [{login: 'a', id: 1, permission: 'pull', permissions: {}}],
        issue('/collaborators/0', STRUCTURAL_MESSAGES.OBJECT_SHAPE),
      ],
    ];
    for (const [collaborators, expected] of cases) {
      const state = canonicalState();
      state.collaborators = collaborators;
      const before = snapshotGraph(state);
      const result = errors(state);
      if (expected === null) expect(result).toEqual([]);
      else expect(result).toContainEqual(expected);
      expect(snapshotGraph(state)).toEqual(before);
    }
  });

  test('rejects reordered keys, protected branch data, and permission aliases',
    () => {
      for (const change of [
        state => Object.fromEntries(Object.entries(state).reverse()),
        state => {
          state.repository = Object.fromEntries(
            Object.entries(state.repository).reverse(),
          );
          return state;
        },
        state => {
          state.branches.dev.protected = true;
          return state;
        },
        ...['permissions', 'admin', 'maintain', 'push', 'triage', 'pull']
          .map(key => state => {
            state.collaborators[0][key] = true;
            return state;
          }),
      ]) {
        expect(errors(change(canonicalState()))).toContainEqual(expect.objectContaining({
          message: STRUCTURAL_MESSAGES.OBJECT_SHAPE,
        }));
      }
    });

  test('owns one walk and keeps its shared callback read-only and ephemeral',
    () => {
      const source = fs.readFileSync(require.resolve(modulePath), 'utf8');
      expect(source.match(/\bvalidateRoot\(/g)).toHaveLength(1);
      expect(source.match(/validate\w+InContext\([^;]+context/g)).toHaveLength(3);
      expect(source).toContain('return undefined;');
      expect(source).not.toMatch(
        /\.sort\(|Object\.(?:defineProperty|defineProperties)|structuredClone|JSON\.|walkBoundedData|selectRootPolicy|WeakMap|privateStates|ownSlots|visitedValues\s*[+\-]=|context\s*=|TODO|FIXME|HACK/,
      );
      const state = canonicalState();
      const before = snapshotGraph(state);
      const result = validateNormalizedGovernanceState(state);
      expect(result.ok).toBe(true);
      expect(snapshotGraph(state)).toEqual(before);
      expect(result.value).not.toBe(state);
    });

  test('returns fresh shallow-frozen successes and recursively frozen failures',
    () => {
      const state = canonicalState();
      const first = validateNormalizedGovernanceState(state);
      const second = validateNormalizedGovernanceState(state);
      expect(first).not.toBe(second);
      expect(first.value).not.toBe(second.value);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.value)).toBe(false);
      first.value.repository.nameWithOwner = 'detached/mutable';
      expect(state.repository.nameWithOwner).not.toBe('detached/mutable');

      state.actions = {defaultWorkflowPermissions: 'raw-secret-value'};
      const failure = validateNormalizedGovernanceState(state);
      expect(Object.isFrozen(failure)).toBe(true);
      expect(Object.isFrozen(failure.errors)).toBe(true);
      expect(failure.errors.every(Object.isFrozen)).toBe(true);
      expect(failure.value).toBeUndefined();
      expect(JSON.stringify(failure)).not.toContain('raw-secret-value');
    });
});

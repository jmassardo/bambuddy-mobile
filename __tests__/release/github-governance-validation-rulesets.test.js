'use strict';

const fs = require('fs');
const validatorPath =
  '../../scripts/release/github-governance-validation-rulesets';
const runtimePath = '../../scripts/release/github-governance-validation-runtime';
const {
  buildNormalizedGovernanceState,
  snapshotGraph,
} = require("../../test-support/release/github-governance-validation-fixtures");

const {validateRulesetsInContext} = require(validatorPath);
const {STRUCTURAL_MESSAGES, validateRoot} = require(runtimePath);
const NORMALIZED_BUDGET = 2592031;
const failure = message => ({
  ok: false,
  errors: [{code: 'SCHEMA_INVALID', path: '', message}],
});

function canonicalState() {
  const state = buildNormalizedGovernanceState();
  for (const ruleset of state.rulesets) {
    ruleset.rules[3].parameters.required_status_checks.sort((left, right) =>
      left.context < right.context ? -1 : left.context > right.context ? 1 : 0);
  }
  return state;
}

function validate(state) {
  const before = snapshotGraph(state);
  let cloneBefore;
  let context;
  const result = validateRoot(state, NORMALIZED_BUDGET, (clone, shared) => {
    context = {...shared};
    cloneBefore = snapshotGraph(clone);
    expect(validateRulesetsInContext(
      clone.rulesets, shared, '/rulesets',
    )).toBeUndefined();
    expect(snapshotGraph(clone)).toEqual(cloneBefore);
    expect({...shared}).toEqual(context);
  });
  expect(snapshotGraph(state)).toEqual(before);
  return {result, context};
}

function errors(result) {
  return result.errors.map(error => [error.path, error.message]);
}

function pad(index) {
  return String(index).padStart(3, '0');
}

function maximalRuleSet() {
  const checks = Array.from({length: 100}, (_, index) => ({
    context: `check-${pad(index)}`,
    integration_id: null,
  }));
  return [
    {type: 'deletion', parameters: null},
    {type: 'non_fast_forward', parameters: null},
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 6,
        dismiss_stale_reviews_on_push: true,
        require_last_push_approval: true,
        required_review_thread_resolution: true,
        require_code_owner_review: false,
      },
    },
    {
      type: 'required_status_checks',
      parameters: {
        required_status_checks: checks,
        strict_required_status_checks_policy: true,
      },
    },
    ...Array.from({length: 96}, (_, index) => ({
      type: `unknown-${pad(index)}`,
      parameters: null,
    })),
  ];
}

function maximalRuleset(index) {
  return {
    id: `id-${pad(index)}`,
    name: `ruleset-${pad(index)}`,
    enforcement: 'active',
    target: 'branch',
    conditions: {
      refName: {
        include: Array.from(
          {length: 1000}, (_, item) => `refs/heads/a-${pad(item)}`,
        ),
        exclude: Array.from(
          {length: 1000}, (_, item) => `refs/heads/z-${pad(item)}`,
        ),
      },
    },
    bypassActors: Array.from({length: 100}, (_, item) => ({
      actor_id: item,
      actor_type: 'Team',
      bypass_mode: 'always',
    })),
    rules: maximalRuleSet(),
  };
}

function ownSlots(value) {
  if (value === null || typeof value !== 'object') return 0;
  return Object.keys(value).reduce(
    (total, key) => total + 1 + ownSlots(value[key]), 0,
  );
}

function firstRuleset(state) {
  return state.rulesets[0];
}

describe('github governance in-context ruleset validation', () => {
  test('exports only the exact frozen three-argument validator', () => {
    const surface = require(validatorPath);
    expect(Object.keys(surface)).toEqual(['validateRulesetsInContext']);
    expect(Object.isFrozen(surface)).toBe(true);
    expect(Object.isFrozen(validateRulesetsInContext)).toBe(true);
    expect(validateRulesetsInContext).toHaveLength(3);
  });

  test('accepts the maximal formula and reports exact own-slot terms', () => {
    const ruleset = maximalRuleset(0);
    const state = canonicalState();
    state.rulesets = Array.from(
      {length: 100}, (_, index) => maximalRuleset(index),
    );
    expect(ownSlots(ruleset.conditions)).toBe(2003);
    expect(ownSlots(ruleset.bypassActors)).toBe(400);
    expect(ownSlots(ruleset.rules)).toBe(607);
    expect(Object.keys(ruleset)).toHaveLength(7);
    expect(ownSlots(ruleset)).toBe(3017);
    expect(ownSlots(state.rulesets)).toBe(301800);
    expect(6 + 8 + 305 + 96 * 3).toBe(607);
    let context;
    const result = validateRoot(state, NORMALIZED_BUDGET, (clone, shared) => {
      context = {...shared};
      validateRulesetsInContext(clone.rulesets, shared, '/rulesets');
    });
    expect(result.ok).toBe(true);
    expect(Object.keys(context)).toEqual([
      'ownKeySlots', 'visitedValues', 'stringCodeUnits',
      'maxContainerDepth', 'diagnosticCount',
    ]);
  });

  test.each([
    ['rulesets', state => state, 'rulesets'],
    ['include', state => firstRuleset(state).conditions.refName, 'include'],
    ['exclude', state => firstRuleset(state).conditions.refName, 'exclude'],
    ['bypass actors', state => firstRuleset(state), 'bypassActors'],
    ['rules', state => firstRuleset(state), 'rules'],
    ['required checks', state =>
      firstRuleset(state).rules[3].parameters, 'required_status_checks'],
  ])('parent runtime rejects %s limit plus one before element inspection',
    (_name, select, key) => {
      const state = canonicalState();
      const touched = jest.fn();
      const hostile = new Proxy({}, {
        ownKeys() {
          touched();
          throw new Error('element must not be inspected');
        },
      });
      const maximum = key === 'include' || key === 'exclude' ? 1000 : 100;
      select(state)[key] = Array.from({length: maximum + 1}, () => hostile);
      const callback = jest.fn();
      const result = validateRoot(state, NORMALIZED_BUDGET, callback);
      expect(result).toEqual(failure(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED));
      expect(callback).not.toHaveBeenCalled();
      expect(touched).not.toHaveBeenCalled();
    });

  test.each([
    ['rulesets reordered', state => state.rulesets.reverse(),
      '/rulesets/1', STRUCTURAL_MESSAGES.CANONICAL_ORDER],
    ['rulesets duplicate', state =>
      state.rulesets.splice(1, 0, {...state.rulesets[0]}),
    '/rulesets/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ['rulesets folded duplicate', state => {
      const duplicate = {...state.rulesets[0], name: 'PROTECT-DEV'};
      state.rulesets.splice(1, 0, duplicate);
    }, '/rulesets/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ['include reordered', state =>
      (firstRuleset(state).conditions.refName.include = ['z', 'a']),
    '/rulesets/0/conditions/refName/include/1',
    STRUCTURAL_MESSAGES.CANONICAL_ORDER],
    ['include duplicate', state =>
      (firstRuleset(state).conditions.refName.include = ['a', 'a']),
    '/rulesets/0/conditions/refName/include/1',
    STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ['exclude reordered', state =>
      (firstRuleset(state).conditions.refName.exclude = ['z', 'a']),
    '/rulesets/0/conditions/refName/exclude/1',
    STRUCTURAL_MESSAGES.CANONICAL_ORDER],
    ['exclude duplicate', state =>
      (firstRuleset(state).conditions.refName.exclude = ['a', 'a']),
    '/rulesets/0/conditions/refName/exclude/1',
    STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ['actors reordered', state => (firstRuleset(state).bypassActors = [
      {actor_id: 2, actor_type: 'Team', bypass_mode: 'always'},
      {actor_id: 1, actor_type: 'Team', bypass_mode: 'always'},
    ]), '/rulesets/0/bypassActors/1', STRUCTURAL_MESSAGES.CANONICAL_ORDER],
    ['actors duplicate', state => (firstRuleset(state).bypassActors = [
      {actor_id: null, actor_type: 'Team', bypass_mode: 'always'},
      {actor_id: 0, actor_type: 'Team', bypass_mode: 'always'},
    ]), '/rulesets/0/bypassActors/1',
    STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ['rules reordered', state => firstRuleset(state).rules.reverse(),
      '/rulesets/0/rules/1', STRUCTURAL_MESSAGES.CANONICAL_ORDER],
    ['rules duplicate', state => {
      const rules = firstRuleset(state).rules;
      rules.splice(1, 0, {...rules[0]});
    }, '/rulesets/0/rules/1', STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
    ['checks reordered', state => {
      firstRuleset(state).rules[3].parameters.required_status_checks = [
        {context: 'z', integration_id: null},
        {context: 'a', integration_id: null},
      ];
    }, '/rulesets/0/rules/3/parameters/required_status_checks/1',
    STRUCTURAL_MESSAGES.CANONICAL_ORDER],
    ['checks folded duplicate', state => {
      firstRuleset(state).rules[3].parameters.required_status_checks = [
        {context: 'CHECK', integration_id: null},
        {context: 'check', integration_id: 1},
      ];
    }, '/rulesets/0/rules/3/parameters/required_status_checks/1',
    STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY],
  ])('reports the exact canonical-array error without mutation: %s',
    (_name, mutate, path, message) => {
      const state = canonicalState();
      mutate(state);
      expect(errors(validate(state).result)).toContainEqual([path, message]);
    });

  test('accepts exact actor order and rejects every non-snake-case shape', () => {
    const valid = canonicalState();
    firstRuleset(valid).bypassActors = [
      {actor_id: null, actor_type: 'Integration', bypass_mode: 'always'},
      {actor_id: 7, actor_type: 'Team', bypass_mode: 'pull_request'},
    ];
    expect(validate(valid).result.ok).toBe(true);
    const invalidActors = [
      {actorId: 1, actorType: 'Team', bypassMode: 'always'},
      {actor_type: 'Team', actor_id: 1, bypass_mode: 'always'},
      {actor_id: 1, actor_type: 'Team'},
      {actor_id: 1, actor_type: 'Team', bypass_mode: 'always', extra: true},
    ];
    for (const actor of invalidActors) {
      const state = canonicalState();
      firstRuleset(state).bypassActors = [actor];
      expect(errors(validate(state).result)).toContainEqual([
        '/rulesets/0/bypassActors/0', STRUCTURAL_MESSAGES.OBJECT_SHAPE,
      ]);
    }
  });

  test('rejects known parameter shape drift and permits structural unknown rules', () => {
    for (const index of [0, 1, 2, 3]) {
      const state = canonicalState();
      const rule = firstRuleset(state).rules[index];
      if (rule.parameters === null) rule.parameters = {unknown: true};
      else rule.parameters.unknown = true;
      const result = validate(state).result;
      expect(result.ok).toBe(false);
      expect(result.errors.some(error =>
        error.message === (index < 2 ?
          STRUCTURAL_MESSAGES.REQUIRED_LITERAL :
          STRUCTURAL_MESSAGES.OBJECT_SHAPE))).toBe(true);
    }
    const state = canonicalState();
    firstRuleset(state).rules.push({
      type: 'unknown_rule_type',
      parameters: null,
    });
    expect(validate(state).result.ok).toBe(true);
    firstRuleset(state).rules[4].parameters = {};
    expect(errors(validate(state).result)).toContainEqual([
      '/rulesets/0/rules/4/parameters',
      STRUCTURAL_MESSAGES.REQUIRED_LITERAL,
    ]);
  });

  test('does not mutate, sort, freeze, redefine, reclone, or retain context', () => {
    const state = canonicalState();
    let calls;
    const result = validateRoot(state, NORMALIZED_BUDGET, (clone, context) => {
      const sort = jest.spyOn(Array.prototype, 'sort');
      const freeze = jest.spyOn(Object, 'freeze');
      const define = jest.spyOn(Object, 'defineProperty');
      const stringify = jest.spyOn(JSON, 'stringify');
      try {
        validateRulesetsInContext(clone.rulesets, context, '/rulesets');
        calls = [sort, freeze, define, stringify].map(spy => spy.mock.calls);
      } finally {
        sort.mockRestore();
        freeze.mockRestore();
        define.mockRestore();
        stringify.mockRestore();
      }
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([[], [], [], []]);
  });

  test('has only approved imports and no runtime ownership or unsafe operations', () => {
    const source = fs.readFileSync(require.resolve(validatorPath), 'utf8');
    expect(source.match(/require\('[^']+'\)/g)).toEqual([
      "require('./github-governance-contract')",
      "require('./github-governance-validation-runtime')",
      "require('./github-governance-validation-ordering')",
    ]);
    expect(source).not.toMatch(
      /test-support|validateRoot|walkBoundedData|selectRootPolicy|WeakMap|\.sort\(|Object\.freeze\(clone|structuredClone|JSON\./,
    );
    expect(source).toContain(
      'module.exports = Object.freeze({validateRulesetsInContext});',
    );
  });
});

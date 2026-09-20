'use strict';

const fs = require('fs');
const modulePath =
  '../../scripts/release/github-governance-validation-environments';
const runtimePath =
  '../../scripts/release/github-governance-validation-runtime';
const {
  buildNormalizedGovernanceState,
  snapshotGraph,
} = require('../../test-support/release/github-governance-validation-fixtures');
const { validateEnvironmentsInContext } = require(modulePath);
const { STRUCTURAL_MESSAGES, validateRoot } = require(runtimePath);

const BUDGET = 2592031;
const contextKeys = [
  'ownKeySlots',
  'visitedValues',
  'stringCodeUnits',
  'maxContainerDepth',
  'diagnosticCount',
];

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(state) {
  state.environments.sort(
    (left, right) =>
      compare(left.name, right.name) || compare(left.id, right.id),
  );
  for (const environment of state.environments) {
    environment.reviewers.sort(
      (left, right) =>
        compare(left.type, right.type) ||
        compare(left.login, right.login) ||
        compare(left.id, right.id),
    );
    environment.branchPolicies.sort(
      (left, right) =>
        compare(left.type, right.type) || compare(left.name, right.name),
    );
    environment.secretNames.sort(compare);
    environment.variableNames.sort(compare);
  }
  return state;
}

function run(source) {
  const before = snapshotGraph(source);
  let cloneBefore;
  const result = validateRoot(source, BUDGET, (clone, sharedContext) => {
    cloneBefore = snapshotGraph(clone);
    expect(
      validateEnvironmentsInContext(
        clone.environments,
        sharedContext,
        '/environments',
      ),
    ).toBeUndefined();
    expect(snapshotGraph(clone)).toEqual(cloneBefore);
    expect(Object.keys(sharedContext)).toEqual(contextKeys);
    expect(Object.isFrozen(sharedContext)).toBe(true);
  });
  expect(snapshotGraph(source)).toEqual(before);
  return result;
}

function errorPairs(result) {
  return result.errors.map(error => [error.path, error.message]);
}

function environment(index, sizes = {}) {
  const label = String(index).padStart(4, '0');
  const { reviewers = 0, policies = 0, secrets = 0, variables = 0 } = sizes;
  return {
    id: `environment-${label}`,
    name: `environment-${label}`,
    canAdminsBypass: false,
    preventSelfReview: false,
    reviewers: Array.from({ length: reviewers }, (_, itemIndex) => ({
      type: 'User',
      login: `reviewer-${String(itemIndex).padStart(4, '0')}`,
      id: itemIndex,
    })),
    deploymentBranchPolicy: {
      protectedBranches: false,
      customBranchPolicies: true,
    },
    branchPolicies: Array.from({ length: policies }, (_, itemIndex) => ({
      type: 'branch',
      name: `policy-${String(itemIndex).padStart(4, '0')}`,
    })),
    secretNames: Array.from(
      { length: secrets },
      (_, itemIndex) => `SECRET_${String(itemIndex).padStart(4, '0')}`,
    ),
    variableNames: Array.from(
      { length: variables },
      (_, itemIndex) => `VARIABLE_${String(itemIndex).padStart(4, '0')}`,
    ),
  };
}

function ownSlots(value) {
  if (value === null || typeof value !== 'object') return 0;
  return Object.keys(value).reduce(
    (sum, key) => sum + 1 + ownSlots(value[key]),
    0,
  );
}

describe('github governance environment validation', () => {
  test('publishes only the exact frozen in-context function', () => {
    const exported = require(modulePath);
    expect(Object.keys(exported)).toEqual(['validateEnvironmentsInContext']);
    expect(Object.isFrozen(exported)).toBe(true);
    expect(Object.isFrozen(validateEnvironmentsInContext)).toBe(true);
    expect(validateEnvironmentsInContext).toHaveLength(3);
  });

  test('accepts canonical managed and discovered records without mutation', () => {
    const managed = canonicalize(buildNormalizedGovernanceState());
    const discovered = canonicalize(buildNormalizedGovernanceState());
    discovered.environments = [
      environment(0),
      environment(1, { reviewers: 2, policies: 2, secrets: 2, variables: 2 }),
    ];
    for (const state of [managed, discovered]) {
      expect(run(state).ok).toBe(true);
    }
  });

  test('measures the exact maximal environment subtree and collection terms', () => {
    const environments = Array.from({ length: 100 }, (_, index) =>
      environment(index, {
        reviewers: 100,
        policies: 100,
        secrets: 1000,
        variables: 1000,
      }),
    );
    expect(ownSlots(environments[0])).toBe(2711);
    expect(ownSlots(environments)).toBe(271200);
    const state = canonicalize(buildNormalizedGovernanceState());
    state.environments = environments;
    expect(run(state).ok).toBe(true);
  });

  test.each([
    [
      'environments',
      state => {
        state.environments = [environment(1), environment(0)];
      },
      '/environments/1',
    ],
    [
      'reviewers',
      state => {
        state.environments = [environment(0, { reviewers: 2 })];
        state.environments[0].reviewers.reverse();
      },
      '/environments/0/reviewers/1',
    ],
    [
      'branch policies',
      state => {
        state.environments = [environment(0, { policies: 2 })];
        state.environments[0].branchPolicies.reverse();
      },
      '/environments/0/branchPolicies/1',
    ],
    [
      'secret names',
      state => {
        state.environments = [environment(0, { secrets: 2 })];
        state.environments[0].secretNames.reverse();
      },
      '/environments/0/secretNames/1',
    ],
    [
      'variable names',
      state => {
        state.environments = [environment(0, { variables: 2 })];
        state.environments[0].variableNames.reverse();
      },
      '/environments/0/variableNames/1',
    ],
  ])(
    'reports canonical order for reordered %s without mutation',
    (_name, change, expectedPath) => {
      const state = canonicalize(buildNormalizedGovernanceState());
      change(state);
      expect(errorPairs(run(state))).toContainEqual([
        expectedPath,
        STRUCTURAL_MESSAGES.CANONICAL_ORDER,
      ]);
    },
  );

  test.each([
    [
      'environments',
      state => {
        state.environments = [environment(0), environment(0)];
        state.environments[1].id = 'different-id';
        state.environments[1].name = state.environments[0].name.toUpperCase();
      },
      '/environments/1',
    ],
    [
      'reviewers',
      state => {
        const item = environment(0, { reviewers: 1 });
        item.reviewers.unshift({ type: 'User', login: 'REVIEWER-0000', id: 1 });
        item.reviewers.splice(1, 0, { type: 'User', login: 'ZZZZ', id: 2 });
        state.environments = [item];
      },
      '/environments/0/reviewers/2',
    ],
    [
      'branch policies',
      state => {
        const item = environment(0, { policies: 2 });
        item.branchPolicies.push({ ...item.branchPolicies[0] });
        state.environments = [item];
      },
      '/environments/0/branchPolicies/2',
    ],
    [
      'secret names',
      state => {
        const item = environment(0, { secrets: 1 });
        item.secretNames.push(item.secretNames[0].toLowerCase());
        state.environments = [item];
      },
      '/environments/0/secretNames/1',
    ],
    [
      'variable names',
      state => {
        const item = environment(0, { variables: 1 });
        item.variableNames.push(item.variableNames[0].toLowerCase());
        state.environments = [item];
      },
      '/environments/0/variableNames/1',
    ],
  ])(
    'reports folded or exact duplicate identity for %s without mutation',
    (_name, change, expectedPath) => {
      const state = canonicalize(buildNormalizedGovernanceState());
      change(state);
      expect(errorPairs(run(state))).toContainEqual([
        expectedPath,
        STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY,
      ]);
    },
  );

  test('rejects every reordered, missing, extra, and contract-side shape', () => {
    const nestedCases = [
      ['reviewers', { type: 'User', id: 1, login: 'reviewer' }],
      ['reviewers', { type: 'User', login: 'reviewer' }],
      ['reviewers', { type: 'User', login: 'reviewer', id: 1, extra: true }],
      ['branchPolicies', { name: 'main', type: 'branch' }],
      ['branchPolicies', { type: 'branch' }],
      ['branchPolicies', { type: 'branch', name: 'main', extra: true }],
    ];
    const cases = [
      ({ id, name, ...rest }) => ({ name, id, ...rest }),
      ({ id: _id, ...rest }) => rest,
      item => ({ ...item, extra: true }),
      ...nestedCases.map(([key, record]) => item => ({
        ...item,
        [key]: [record],
      })),
    ];
    for (const change of cases) {
      const state = canonicalize(buildNormalizedGovernanceState());
      state.environments = [change(environment(0))];
      expect(errorPairs(run(state))).toContainEqual([
        expect.stringMatching(/^\/environments\/0/),
        STRUCTURAL_MESSAGES.OBJECT_SHAPE,
      ]);
    }
    for (const key of Object.keys(environment(0))) {
      const state = canonicalize(buildNormalizedGovernanceState());
      const item = environment(0);
      delete item[key];
      state.environments = [item];
      expect(errorPairs(run(state))).toContainEqual([
        '/environments/0',
        STRUCTURAL_MESSAGES.OBJECT_SHAPE,
      ]);
    }
  });

  test('accepts exact limits and limit plus one fails closed', () => {
    const limits = [
      ['environments', 100, 101],
      ['reviewers', 100, 101],
      ['policies', 100, 101],
      ['secrets', 1000, 1001],
      ['variables', 1000, 1001],
    ];
    for (const [kind, maximum, overflow] of limits) {
      const state = canonicalize(buildNormalizedGovernanceState());
      if (kind === 'environments') {
        state.environments = Array.from({ length: maximum }, (_, index) =>
          environment(index),
        );
      } else {
        state.environments = [environment(0, { [kind]: maximum })];
      }
      expect(run(state).ok).toBe(true);
      if (kind === 'environments') {
        state.environments = Array.from({ length: overflow }, (_, index) =>
          environment(index),
        );
      } else {
        state.environments = [environment(0, { [kind]: overflow })];
      }
      expect(run(state)).toEqual({
        ok: false,
        errors: [
          {
            code: 'SCHEMA_INVALID',
            path: '',
            message: STRUCTURAL_MESSAGES.BUDGET_EXCEEDED,
          },
        ],
      });
    }
  });

  test('guards every collection before its elements and returns undefined', () => {
    jest.resetModules();
    const events = [];
    const messages = {
      OBJECT_SHAPE: STRUCTURAL_MESSAGES.OBJECT_SHAPE,
    };
    const mockRuntime = {
      STRUCTURAL_MESSAGES: messages,
      addError: (...args) => events.push(['error', ...args.slice(1)]),
      childPath: (parent, child) => `${parent}/${child}`,
      expectArray: (_context, value, path) => {
        events.push(['array', path]);
        return value;
      },
      expectBoolean: (_context, _value, path) => events.push(['value', path]),
      expectInteger: (_context, _value, path) => events.push(['value', path]),
      expectObject: (_context, value, path) => {
        events.push(['object', path]);
        return value;
      },
      expectString: (_context, _value, path) => events.push(['value', path]),
      validateCollectionLength: (_context, value, path, maximum) => {
        events.push(['length', path, maximum]);
        return value.length <= maximum;
      },
    };
    jest.doMock(runtimePath, () => mockRuntime);
    jest.doMock(
      '../../scripts/release/github-governance-validation-ordering',
      () => ({
        foldAsciiCase: value => value.toLowerCase(),
        requireCanonicalArray: () => undefined,
        requireCanonicalStrings: () => undefined,
      }),
    );
    const guarded = require(modulePath).validateEnvironmentsInContext;
    const context = Object.freeze({
      ownKeySlots: 0,
      visitedValues: 1,
      stringCodeUnits: 0,
      maxContainerDepth: 1,
      diagnosticCount: 0,
    });
    const cases = [
      [Array.from({ length: 101 }, () => environment(0)), '/environments', 100],
      [[environment(0, { reviewers: 101 })], '/environments/0/reviewers', 100],
      [
        [environment(0, { policies: 101 })],
        '/environments/0/branchPolicies',
        100,
      ],
      [
        [environment(0, { secrets: 1001 })],
        '/environments/0/secretNames',
        1000,
      ],
      [
        [environment(0, { variables: 1001 })],
        '/environments/0/variableNames',
        1000,
      ],
    ];
    for (const [value, guardedPath, maximum] of cases) {
      events.length = 0;
      expect(guarded(value, context, '/environments')).toBeUndefined();
      const guardIndex = events.findIndex(
        event => event[0] === 'length' && event[1] === guardedPath,
      );
      expect(events[guardIndex]).toEqual(['length', guardedPath, maximum]);
      expect(
        events
          .slice(guardIndex + 1)
          .some(
            event =>
              (event[0] === 'object' || event[0] === 'value') &&
              event[1].startsWith(`${guardedPath}/`),
          ),
      ).toBe(false);
    }
    jest.dontMock(runtimePath);
    jest.dontMock(
      '../../scripts/release/github-governance-validation-ordering',
    );
  });

  test('has only reviewed imports and no runtime ownership or mutation surface', () => {
    const source = fs.readFileSync(require.resolve(modulePath), 'utf8');
    expect(source.match(/require\('[^']+'\)/g)).toEqual([
      "require('./github-governance-validation-runtime')",
      "require('./github-governance-validation-ordering')",
    ]);
    expect(source).not.toMatch(
      /test-support|runtime-policy|validateRoot|walkBoundedData|privateStates|WeakMap|(?:^|[^.])\bsort\(|structuredClone|JSON\.|TODO|FIXME|HACK/,
    );
    expect(source).not.toMatch(
      /Object\.(?:defineProperty|preventExtensions|seal)|delete\s|context\s*=/,
    );
  });
});

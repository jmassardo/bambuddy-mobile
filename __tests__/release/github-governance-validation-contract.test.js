'use strict';

const fixturePath =
  '../../test-support/release/github-governance-validation-fixtures';
const validatorPath =
  '../../scripts/release/github-governance-validation-contract';
const runtimePath =
  '../../scripts/release/github-governance-validation-runtime';
const contractPath = '../../scripts/release/github-governance-contract';
const {
  buildContract,
  cloneWithDescriptors,
  snapshotGraph,
} = require('../../test-support/release/github-governance-validation-fixtures');
const {GOVERNANCE_CONTRACT} = require(contractPath);
const {STRUCTURAL_MESSAGES} = require(runtimePath);
const {validateGovernanceContract} = require(validatorPath);

const ARRAY_CASES = Object.freeze([
  'C-A01', 'C-A02', 'C-A03', 'C-A04', 'C-A05', 'C-A06', 'C-A07',
  'C-A08', 'C-A09', 'C-A10', 'C-A11', 'C-A12', 'C-A13', 'C-A14',
  'C-A15', 'C-A16', 'C-A17', 'C-A18', 'C-A19',
]);
const SWAP_CASES = Object.freeze([
  'C-A01', 'C-A02', 'C-A03', 'C-A04', 'C-A05', 'C-A06', 'C-A07',
  'C-A08', 'C-A09', 'C-A14', 'C-A15',
]);
const DUPLICATE_CASES = Object.freeze([
  'C-A01', 'C-A02', 'C-A03', 'C-A04', 'C-A05', 'C-A06', 'C-A07',
  'C-A08', 'C-A09', 'C-A11', 'C-A14', 'C-A15', 'C-A17', 'C-A18',
]);
const CASE_FOLD_CASES = Object.freeze([
  'C-A01', 'C-A02', 'C-A03', 'C-A04', 'C-A05', 'C-A06', 'C-A07',
  'C-A15', 'C-A17', 'C-A18',
]);

function expectFailure(result) {
  expect(result.ok).toBe(false);
  expect(Object.keys(result)).toEqual(['ok', 'errors']);
  expect(result.errors.length).toBeGreaterThan(0);
}

function expectRecursivelyFrozen(value, visited = new WeakSet()) {
  if (value === null || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, 'value'))
      expectRecursivelyFrozen(descriptor.value, visited);
  }
}

describe('github governance contract validator', () => {
  test('has an exact frozen one-function public surface and pure cold import', () => {
    const before = snapshotGraph(GOVERNANCE_CONTRACT);
    jest.isolateModules(() => {
      const cold = require(validatorPath);
      expect(Object.keys(cold)).toEqual(['validateGovernanceContract']);
      expect(Object.isFrozen(cold)).toBe(true);
      expect(Object.isFrozen(cold.validateGovernanceContract)).toBe(true);
    });
    expect(snapshotGraph(GOVERNANCE_CONTRACT)).toEqual(before);
    expect(fixturePath).toBe(
      '../../test-support/release/github-governance-validation-fixtures',
    );
  });

  test('returns a fresh shallow-frozen success with a mutable detached value', () => {
    const input = buildContract();
    const before = snapshotGraph(input);
    const first = validateGovernanceContract(input);
    const second = validateGovernanceContract(input);

    expect(first.ok).toBe(true);
    expect(Object.keys(first)).toEqual(['ok', 'value']);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.value)).toBe(false);
    expect(first).not.toBe(second);
    expect(first.value).not.toBe(second.value);
    expect(first.value).not.toBe(input);
    expect(first.value).toEqual(input);

    first.value.repository.nameWithOwner = 'detached/example';
    expect(second.value.repository.nameWithOwner)
      .toBe('jmassardo/bambuddy-mobile');
    expect(input.repository.nameWithOwner).toBe('jmassardo/bambuddy-mobile');
    expect(snapshotGraph(input)).toEqual(before);
  });

  test('runs exactly one 311 root lifecycle with exact context and undefined callback', () => {
    const actualRuntime = jest.requireActual(runtimePath);
    const validateRoot = jest.fn((value, budget, callback) =>
      actualRuntime.validateRoot(value, budget, (clone, context) => {
        expect(Object.keys(context)).toEqual([
          'ownKeySlots',
          'visitedValues',
          'stringCodeUnits',
          'maxContainerDepth',
          'diagnosticCount',
        ]);
        expect(Object.isFrozen(context)).toBe(true);
        expect(context.ownKeySlots).toBe(311);
        expect(context.visitedValues).toBe(312);
        expect(callback(clone, context)).toBeUndefined();
        return undefined;
      }));

    jest.isolateModules(() => {
      jest.doMock(runtimePath, () => ({...actualRuntime, validateRoot}));
      const isolated = require(validatorPath);
      expect(isolated.validateGovernanceContract(buildContract()).ok).toBe(true);
    });
    jest.dontMock(runtimePath);
    expect(validateRoot).toHaveBeenCalledTimes(1);
    expect(validateRoot.mock.calls[0][1]).toBe(311);
  });

  test.each(ARRAY_CASES)(
    '%s accepts its canonical arrays without mutating the input',
    arrayCase => {
      const input = buildContract({arrayCase});
      const before = snapshotGraph(input);
      expect(validateGovernanceContract(input).ok).toBe(true);
      expect(snapshotGraph(input)).toEqual(before);
    },
  );

  test.each(ARRAY_CASES)(
    '%s rejects injected array values without mutating or echoing input',
    arrayCase => {
      const input = buildContract({arrayCase, variant: 'inject'});
      const before = snapshotGraph(input);
      const result = validateGovernanceContract(input);
      expectFailure(result);
      expect(JSON.stringify(result)).not.toContain('STRUCTURAL_FIXTURE');
      expect(snapshotGraph(input)).toEqual(before);
    },
  );

  test.each([
    ...SWAP_CASES.map(arrayCase => [arrayCase, 'swap']),
    ...DUPLICATE_CASES.map(arrayCase => [arrayCase, 'duplicate']),
    ...CASE_FOLD_CASES.map(arrayCase => [arrayCase, 'caseFoldCollision']),
  ])('%s rejects the %s ordered-array variant', (arrayCase, variant) => {
    const input = buildContract({arrayCase, variant});
    const before = snapshotGraph(input);
    expectFailure(validateGovernanceContract(input));
    expect(snapshotGraph(input)).toEqual(before);
  });

  test.each([
    'release-query',
    'release-ios',
    'release-android',
    'production-ios',
  ])('C-A18 rejects reordered %s secrets without mutation', environmentName => {
    const input = buildContract({arrayCase: 'C-A18'});
    const secrets = input.environments[environmentName].secretNames;
    [secrets[0], secrets[1]] = [secrets[1], secrets[0]];
    const before = snapshotGraph(input);
    expectFailure(validateGovernanceContract(input));
    expect(snapshotGraph(input)).toEqual(before);
  });

  test.each([
    ['production-ios', 'duplicate'],
    ['production-ios', 'case-fold collision'],
    ['production-android', 'duplicate'],
    ['production-android', 'case-fold collision'],
  ])('C-A16 rejects a %s %s reviewer', (environmentName, variant) => {
    const input = buildContract({arrayCase: 'C-A16'});
    const reviewers = input.environments[environmentName].reviewers;
    const duplicate = cloneWithDescriptors(reviewers[0]);
    if (variant === 'case-fold collision')
      duplicate.login = duplicate.login.toUpperCase();
    reviewers.push(duplicate);
    const before = snapshotGraph(input);
    expectFailure(validateGovernanceContract(input));
    expect(snapshotGraph(input)).toEqual(before);
  });

  test('an added root key returns only the budget singleton', () => {
    const input = buildContract();
    input.unexpected = true;
    const before = snapshotGraph(input);
    const result = validateGovernanceContract(input);
    expect(result).toEqual({
      ok: false,
      errors: [{
        code: 'SCHEMA_INVALID',
        path: '',
        message: STRUCTURAL_MESSAGES.BUDGET_EXCEEDED,
      }],
    });
    expect(snapshotGraph(input)).toEqual(before);
    expectRecursivelyFrozen(result);
  });

  test.each([
    ['reordered keys', input => {
      const value = input.repository;
      input.repository = {
        defaultBranch: value.defaultBranch,
        nameWithOwner: value.nameWithOwner,
        allowMergeCommit: value.allowMergeCommit,
      };
    }],
    ['missing key', input => {
      delete input.actionsPolicy.allowMergeCommit;
    }],
    ['changed literal', input => {
      input.contractVersion = '1.0.0';
    }],
    ['V1 shape', input => {
      input.contractVersion = '1.0.0';
      input.findingSchema.version = 1;
      input.normalizedStateSchema.version = 1;
    }],
  ])('rejects %s structurally without mutation or input echo', (_name, mutate) => {
    const input = buildContract();
    mutate(input);
    const before = snapshotGraph(input);
    const result = validateGovernanceContract(input);
    expectFailure(result);
    expect(result).not.toHaveProperty('value');
    expect(snapshotGraph(input)).toEqual(before);
    expectRecursivelyFrozen(result);
  });

  test('rejects accessors without invoking or echoing them', () => {
    const input = buildContract();
    const getter = jest.fn(() => '2.0.0');
    Object.defineProperty(input, 'contractVersion', {
      get: getter,
      enumerable: true,
      configurable: true,
    });
    const result = validateGovernanceContract(input);
    expectFailure(result);
    expect(getter).not.toHaveBeenCalled();
    expect(result.errors).toContainEqual({
      code: 'SCHEMA_INVALID',
      path: '/contractVersion',
      message: STRUCTURAL_MESSAGES.ACCESSOR_PROPERTY,
    });
    expectRecursivelyFrozen(result);
  });

  test.each([
    ['throwing ownKeys', input => new Proxy(input, {
      ownKeys() {
        throw new Error('hostile');
      },
    })],
    ['throwing descriptor', input => new Proxy(input, {
      getOwnPropertyDescriptor() {
        throw new Error('hostile');
      },
    })],
    ['repeated reference', input => {
      input.normalizedStateSchema = input.findingSchema;
      return input;
    }],
  ])('rejects %s under structural precedence', (_name, makeHostile) => {
    const result = validateGovernanceContract(makeHostile(buildContract()));
    expectFailure(result);
    expect(result).not.toHaveProperty('value');
    expectRecursivelyFrozen(result);
  });

  test('does not mutate descriptor-rich independent input', () => {
    const input = cloneWithDescriptors(buildContract());
    const before = snapshotGraph(input);
    expect(validateGovernanceContract(input).ok).toBe(true);
    expect(snapshotGraph(input)).toEqual(before);
  });
});

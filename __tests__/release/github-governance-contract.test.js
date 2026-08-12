'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const {Buffer} = require('buffer');

const contractPath = path.resolve(
  __dirname,
  '../../scripts/release/github-governance-contract.js',
);
const governance = require(contractPath);

const scannerFindingCodes = [
  'TRACKED_FILE_LIST_FAILED',
  'TRACKED_FILE_READ_FAILED',
  'UNSUPPORTED_SOURCE_SYNTAX',
  'SYSTEM_TEMP_LITERAL',
  'CREDENTIAL_MATERIALIZATION_UNSUPPORTED',
  'CREDENTIAL_CLEANUP_UNPROVEN',
  'MUTABLE_ACTION_REFERENCE',
  'MALFORMED_WORKFLOW',
  'SCHEMA_INVALID',
];

const policyFindingCodes = [
  'RULESET_MISSING',
  'RULESET_DUPLICATE',
  'RULESET_ENFORCEMENT_MISMATCH',
  'RULESET_TARGET_MISMATCH',
  'RULESET_REF_CONDITION_MISMATCH',
  'RULESET_BYPASS_PRESENT',
  'RULESET_RULE_SET_MISMATCH',
  'RULESET_PULL_REQUEST_PARAMETERS_MISMATCH',
  'RULESET_STATUS_CHECKS_MISMATCH',
  'RULESET_CONFLICTING_ACTIVE',
  'RULESET_TARGETING_UNPROVEN',
  'LEGACY_BRANCH_PROTECTION_PRESENT',
  'GOVERNED_BRANCH_METADATA_INVALID',
  'ENVIRONMENT_MISSING',
  'ENVIRONMENT_ADMIN_BYPASS_MISMATCH',
  'ENVIRONMENT_SELF_REVIEW_MISMATCH',
  'ENVIRONMENT_DEPLOYMENT_POLICY_MISMATCH',
  'ENVIRONMENT_REVIEWER_MISMATCH',
  'ENVIRONMENT_SECRET_INVENTORY_MISMATCH',
  'ENVIRONMENT_VARIABLE_SHADOW',
  'COPILOT_FORBIDDEN_SECRET',
  'REPOSITORY_DEMO_SECRET_MISSING',
  'REPOSITORY_RELEASE_SECRET_MISSCOPED',
  'REPOSITORY_VARIABLE_MISSING',
  'ACTIONS_DEFAULT_PERMISSION_MISMATCH',
  'ACTIONS_PR_APPROVAL_MISMATCH',
  'ACTIONS_SHA_PINNING_MISMATCH',
  'REPOSITORY_MERGE_COMMIT_DISABLED',
  'PRODUCTION_PARTICIPANT_TOPOLOGY_BLOCKED',
];

const requiredChecks = [
  'TypeScript Check',
  'Lint',
  'Test',
  'Build iOS (Debug)',
  'Build Android (Debug)',
];

const repositoryVariableNames = [
  'APPLE_TEAM_ID',
  'MATCH_GIT_URL',
  'IOS_BUNDLE_ID',
  'ANDROID_PACKAGE_NAME',
  'GOOGLE_PLAY_TRACKS',
  'RELEASE_AUTOMATION_APP_ID',
];

const demoSecrets = [
  'BAMBUDDY_DEMO_URL',
  'BAMBUDDY_DEMO_USERNAME',
  'BAMBUDDY_DEMO_PASSWORD',
];

const releaseSecrets = [
  'ASC_KEY_ID',
  'ASC_ISSUER_ID',
  'ASC_KEY_CONTENT',
  'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT',
  'APPLE_ID',
  'MATCH_PASSWORD',
  'MATCH_GIT_AUTHORIZATION',
  'BAMBUDDY_RELEASE_STORE_CONTENT',
  'BAMBUDDY_RELEASE_STORE_PASSWORD',
  'BAMBUDDY_RELEASE_KEY_ALIAS',
  'BAMBUDDY_RELEASE_KEY_PASSWORD',
  'RELEASE_AUTOMATION_APP_PRIVATE_KEY',
];

function expectedRuleset(name, branch) {
  return {
    name,
    enforcement: 'active',
    target: 'branch',
    conditions: {
      refName: {
        include: [`refs/heads/${branch}`],
        exclude: [],
      },
    },
    bypassActors: [],
    rules: [
      {type: 'deletion', parameters: null},
      {type: 'non_fast_forward', parameters: null},
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 1,
          dismiss_stale_reviews_on_push: true,
          require_last_push_approval: true,
          required_review_thread_resolution: true,
          require_code_owner_review: false,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          required_status_checks: requiredChecks.map(context => ({
            context,
            integration_id: null,
          })),
          strict_required_status_checks_policy: true,
        },
      },
    ],
  };
}

function expectedEnvironment({
  name,
  preventSelfReview,
  reviewers,
  branchPolicies,
  secretNames,
}) {
  return {
    name,
    canAdminsBypass: false,
    preventSelfReview,
    reviewers,
    deploymentBranchPolicy: {
      protectedBranches: false,
      customBranchPolicies: true,
    },
    branchPolicies,
    secretNames,
    variableNames: [],
  };
}

const expectedContract = {
  contractVersion: '2.0.0',
  findingSchema: {
    id: 'bambuddy.release-governance.finding',
    version: 2,
  },
  normalizedStateSchema: {
    id: 'bambuddy.release-governance.normalized-state',
    version: 2,
  },
  repository: {
    nameWithOwner: 'jmassardo/bambuddy-mobile',
    defaultBranch: 'dev',
    allowMergeCommit: true,
  },
  requiredChecks,
  repositoryVariableNames,
  allowedRepositoryDemoSecretNames: demoSecrets,
  releaseCredentialSecretNames: releaseSecrets,
  copilotForbiddenSecretNames: [...releaseSecrets, ...demoSecrets],
  evidence: {
    nameNamespaces: [
      'action',
      'branch',
      'check',
      'credential-name',
      'environment',
      'repository',
      'repository-variable',
      'reviewer',
      'ruleset',
    ],
    identifierNamespaces: [
      'destination-binding',
      'rule-type',
      'workflow-key',
    ],
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
      'protected',
      'read',
      'ready',
      'selected',
      'unprotected',
      'write',
    ],
  },
  actionsPolicy: {
    defaultWorkflowPermissions: 'read',
    canApprovePullRequestReviews: false,
    shaPinningRequired: true,
    allowedActions: 'all',
    allowMergeCommit: true,
  },
  automationApp: {
    installationScope: 'selected_repository',
    repository: 'jmassardo/bambuddy-mobile',
    permissions: {
      metadata: 'read',
      contents: 'write',
      pullRequests: 'write',
    },
    personalTokenFallback: false,
    administrationPermission: false,
    approvalPermission: false,
  },
  productionApproval: {
    stateWithCurrentParticipants: 'fail_closed',
    eligibleHumanPermissions: ['admin', 'maintain', 'push'],
    minimumDistinctEligibleHumans: 2,
    reviewerMayInitiate: false,
    eligibleTriggerAppIds: [],
  },
  rulesets: {
    'protect-dev': expectedRuleset('protect-dev', 'dev'),
    'protect-main': expectedRuleset('protect-main', 'main'),
  },
  environments: {
    'release-query': expectedEnvironment({
      name: 'release-query',
      preventSelfReview: false,
      reviewers: [],
      branchPolicies: [{name: 'dev', type: 'branch'}],
      secretNames: [
        'ASC_KEY_ID',
        'ASC_ISSUER_ID',
        'ASC_KEY_CONTENT',
        'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT',
        'RELEASE_AUTOMATION_APP_PRIVATE_KEY',
      ],
    }),
    'release-ios': expectedEnvironment({
      name: 'release-ios',
      preventSelfReview: false,
      reviewers: [],
      branchPolicies: [{name: 'v*.*.*', type: 'tag'}],
      secretNames: [
        'ASC_KEY_ID',
        'ASC_ISSUER_ID',
        'ASC_KEY_CONTENT',
        'APPLE_ID',
        'MATCH_PASSWORD',
        'MATCH_GIT_AUTHORIZATION',
        ...demoSecrets,
      ],
    }),
    'release-android': expectedEnvironment({
      name: 'release-android',
      preventSelfReview: false,
      reviewers: [],
      branchPolicies: [{name: 'v*.*.*', type: 'tag'}],
      secretNames: [
        'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT',
        'BAMBUDDY_RELEASE_STORE_CONTENT',
        'BAMBUDDY_RELEASE_STORE_PASSWORD',
        'BAMBUDDY_RELEASE_KEY_ALIAS',
        'BAMBUDDY_RELEASE_KEY_PASSWORD',
        ...demoSecrets,
      ],
    }),
    'production-ios': expectedEnvironment({
      name: 'production-ios',
      preventSelfReview: true,
      reviewers: [{type: 'User', id: 9603391, login: 'jmassardo'}],
      branchPolicies: [{name: 'v*.*.*', type: 'tag'}],
      secretNames: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_CONTENT'],
    }),
    'production-android': expectedEnvironment({
      name: 'production-android',
      preventSelfReview: true,
      reviewers: [{type: 'User', id: 9603391, login: 'jmassardo'}],
      branchPolicies: [{name: 'v*.*.*', type: 'tag'}],
      secretNames: ['GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT'],
    }),
  },
};

function expectRecursivelyFrozen(value, visited = new WeakSet()) {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  ) {
    return;
  }
  if (visited.has(value)) {
    return;
  }

  visited.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      expectRecursivelyFrozen(descriptor.value, visited);
    }
  }
}

function finding(overrides = {}) {
  return {
    path: 'workflow.yml',
    location: {line: 10, column: 20},
    kind: 'policy',
    scope: 'repository',
    code: 'RULESET_MISSING',
    subject: 'protect-dev',
    message: 'Ruleset is missing',
    ...overrides,
  };
}

describe('GitHub governance V2 contract', () => {
  test('exports only the ordered durable V2 authority', () => {
    expect(Object.keys(governance)).toEqual([
      'CONTRACT_VERSION',
      'GOVERNANCE_FINDING_SCHEMA_ID',
      'GOVERNANCE_FINDING_SCHEMA_VERSION',
      'NORMALIZED_STATE_SCHEMA_ID',
      'NORMALIZED_STATE_SCHEMA_VERSION',
      'GOVERNANCE_CONTRACT',
      'SCANNER_FINDING_CODES',
      'POLICY_FINDING_CODES',
      'compareGovernanceFindings',
    ]);
    expect(governance.CONTRACT_VERSION).toBe('2.0.0');
    expect(governance.GOVERNANCE_FINDING_SCHEMA_ID).toBe(
      'bambuddy.release-governance.finding',
    );
    expect(governance.GOVERNANCE_FINDING_SCHEMA_VERSION).toBe(2);
    expect(governance.NORMALIZED_STATE_SCHEMA_ID).toBe(
      'bambuddy.release-governance.normalized-state',
    );
    expect(governance.NORMALIZED_STATE_SCHEMA_VERSION).toBe(2);
    expect(governance).not.toHaveProperty('default');
    expect(
      Object.keys(governance).some(key => /V1|VALID|MIGRAT|COMPAT|FALLBACK/i.test(key)),
    ).toBe(false);
  });

  test('publishes the exact ordered code inventories and contract topology', () => {
    expect(governance.SCANNER_FINDING_CODES).toEqual(scannerFindingCodes);
    expect(governance.POLICY_FINDING_CODES).toEqual(policyFindingCodes);
    expect(governance.GOVERNANCE_CONTRACT).toEqual(expectedContract);
    expect(Object.keys(governance.GOVERNANCE_CONTRACT)).toEqual([
      'contractVersion',
      'findingSchema',
      'normalizedStateSchema',
      'repository',
      'requiredChecks',
      'repositoryVariableNames',
      'allowedRepositoryDemoSecretNames',
      'releaseCredentialSecretNames',
      'copilotForbiddenSecretNames',
      'evidence',
      'actionsPolicy',
      'automationApp',
      'productionApproval',
      'rulesets',
      'environments',
    ]);
  });

  test('recursively freezes every exported object without shared mutable backing', () => {
    expectRecursivelyFrozen(governance);
    expectRecursivelyFrozen(governance.GOVERNANCE_CONTRACT);
    expectRecursivelyFrozen(governance.SCANNER_FINDING_CODES);
    expectRecursivelyFrozen(governance.POLICY_FINDING_CODES);

    const checks = governance.GOVERNANCE_CONTRACT.requiredChecks;
    expect(() => checks.push('Mutable')).toThrow(TypeError);
    expect(checks).toEqual(requiredChecks);
  });

  test('compares each tuple field in precedence order and returns zero for ties', () => {
    const fields = [
      ['path', {path: 'a.yml'}, {path: 'b.yml'}],
      ['line', {location: {line: 1, column: 20}}, {location: {line: 2, column: 1}}],
      ['column', {location: {line: 10, column: 1}}, {location: {line: 10, column: 2}}],
      ['kind', {kind: 'a'}, {kind: 'b'}],
      ['scope', {scope: 'a'}, {scope: 'b'}],
      ['code', {code: 'A'}, {code: 'B'}],
      ['subject', {subject: 'a'}, {subject: 'b'}],
      ['message', {message: 'a'}, {message: 'b'}],
    ];

    for (const [, earlier, later] of fields) {
      expect(
        governance.compareGovernanceFindings(
          finding(earlier),
          finding(later),
        ),
      ).toBe(-1);
      expect(
        governance.compareGovernanceFindings(
          finding(later),
          finding(earlier),
        ),
      ).toBe(1);
    }
    expect(
      governance.compareGovernanceFindings(finding(), finding()),
    ).toBe(0);
  });

  test('uses numeric location defaults and JavaScript UTF-16 string ordering', () => {
    const withoutLocation = finding({path: undefined, location: undefined});
    const explicitDefaults = finding({path: '', location: {line: 0, column: 0}});
    expect(
      governance.compareGovernanceFindings(
        withoutLocation,
        explicitDefaults,
      ),
    ).toBe(0);

    expect(
      governance.compareGovernanceFindings(
        finding({location: {line: 2, column: 0}}),
        finding({location: {line: 10, column: 0}}),
      ),
    ).toBe(-1);
    expect(
      governance.compareGovernanceFindings(
        finding({path: '\u{1f600}'}),
        finding({path: '\uffff'}),
      ),
    ).toBe(-1);
  });

  test('cold-loads silently without module-originated I/O or nondeterminism', () => {
    const source = fs.readFileSync(contractPath, 'utf8');
    const harness = `
      'use strict';
      const Module = require('module');
      const fs = require('fs');
      const http = require('http');
      const https = require('https');
      const net = require('net');
      const childProcess = require('child_process');
      const throwUse = () => { throw new Error('forbidden side effect'); };
      for (const target of [fs, http, https, net, childProcess]) {
        for (const key of Object.keys(target)) {
          const descriptor = Object.getOwnPropertyDescriptor(target, key);
          if (
            descriptor &&
            descriptor.writable &&
            typeof descriptor.value === 'function'
          ) {
            target[key] = throwUse;
          }
        }
      }
      for (const key of ['log', 'info', 'warn', 'error', 'debug']) {
        console[key] = throwUse;
      }
      Date.now = throwUse;
      Math.random = throwUse;
      const loaded = new Module('governance-contract');
      loaded.filename = 'governance-contract.js';
      loaded.paths = [];
      loaded._compile(Buffer.from(process.argv[1], 'base64').toString('utf8'), loaded.filename);
      if (Object.keys(loaded.exports).length !== 9) process.exitCode = 1;
    `;
    const result = spawnSync(
      process.execPath,
      ['-e', harness, Buffer.from(source).toString('base64')],
      {encoding: 'utf8'},
    );

    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      status: 0,
      stdout: '',
      stderr: '',
    });
  });
});

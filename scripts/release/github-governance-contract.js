'use strict';

const CONTRACT_VERSION = '2.0.0';
const GOVERNANCE_FINDING_SCHEMA_ID = 'bambuddy.release-governance.finding';
const GOVERNANCE_FINDING_SCHEMA_VERSION = 2;
const NORMALIZED_STATE_SCHEMA_ID =
  'bambuddy.release-governance.normalized-state';
const NORMALIZED_STATE_SCHEMA_VERSION = 2;

function recursivelyFreeze(value, visited = new WeakSet()) {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  ) {
    return value;
  }

  if (visited.has(value)) {
    return value;
  }

  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, 'value')) {
      recursivelyFreeze(descriptor.value, visited);
    }
  }

  return Object.freeze(value);
}

const SCANNER_FINDING_CODES = [
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

const POLICY_FINDING_CODES = [
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

const allowedRepositoryDemoSecretNames = [
  'BAMBUDDY_DEMO_URL',
  'BAMBUDDY_DEMO_USERNAME',
  'BAMBUDDY_DEMO_PASSWORD',
];

const releaseCredentialSecretNames = [
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

const pullRequestParameters = {
  required_approving_review_count: 1,
  dismiss_stale_reviews_on_push: true,
  require_last_push_approval: true,
  required_review_thread_resolution: true,
  require_code_owner_review: false,
};

function createRequiredStatusChecksParameters() {
  return {
    required_status_checks: requiredChecks.map(context => ({
      context,
      integration_id: null,
    })),
    strict_required_status_checks_policy: true,
  };
}

function createRuleset(name, branch) {
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
      {type: 'pull_request', parameters: {...pullRequestParameters}},
      {
        type: 'required_status_checks',
        parameters: createRequiredStatusChecksParameters(),
      },
    ],
  };
}

const tagBranchPolicy = [{name: 'v*.*.*', type: 'tag'}];
const productionReviewer = [{type: 'User', id: 9603391, login: 'jmassardo'}];

function createEnvironment({
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

const GOVERNANCE_CONTRACT = {
  contractVersion: CONTRACT_VERSION,
  findingSchema: {
    id: GOVERNANCE_FINDING_SCHEMA_ID,
    version: GOVERNANCE_FINDING_SCHEMA_VERSION,
  },
  normalizedStateSchema: {
    id: NORMALIZED_STATE_SCHEMA_ID,
    version: NORMALIZED_STATE_SCHEMA_VERSION,
  },
  repository: {
    nameWithOwner: 'jmassardo/bambuddy-mobile',
    defaultBranch: 'dev',
    allowMergeCommit: true,
  },
  requiredChecks,
  repositoryVariableNames,
  allowedRepositoryDemoSecretNames,
  releaseCredentialSecretNames,
  copilotForbiddenSecretNames: [
    ...releaseCredentialSecretNames,
    ...allowedRepositoryDemoSecretNames,
  ],
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
    'protect-dev': createRuleset('protect-dev', 'dev'),
    'protect-main': createRuleset('protect-main', 'main'),
  },
  environments: {
    'release-query': createEnvironment({
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
    'release-ios': createEnvironment({
      name: 'release-ios',
      preventSelfReview: false,
      reviewers: [],
      branchPolicies: tagBranchPolicy.map(policy => ({...policy})),
      secretNames: [
        'ASC_KEY_ID',
        'ASC_ISSUER_ID',
        'ASC_KEY_CONTENT',
        'APPLE_ID',
        'MATCH_PASSWORD',
        'MATCH_GIT_AUTHORIZATION',
        ...allowedRepositoryDemoSecretNames,
      ],
    }),
    'release-android': createEnvironment({
      name: 'release-android',
      preventSelfReview: false,
      reviewers: [],
      branchPolicies: tagBranchPolicy.map(policy => ({...policy})),
      secretNames: [
        'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT',
        'BAMBUDDY_RELEASE_STORE_CONTENT',
        'BAMBUDDY_RELEASE_STORE_PASSWORD',
        'BAMBUDDY_RELEASE_KEY_ALIAS',
        'BAMBUDDY_RELEASE_KEY_PASSWORD',
        ...allowedRepositoryDemoSecretNames,
      ],
    }),
    'production-ios': createEnvironment({
      name: 'production-ios',
      preventSelfReview: true,
      reviewers: productionReviewer.map(reviewer => ({...reviewer})),
      branchPolicies: tagBranchPolicy.map(policy => ({...policy})),
      secretNames: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_CONTENT'],
    }),
    'production-android': createEnvironment({
      name: 'production-android',
      preventSelfReview: true,
      reviewers: productionReviewer.map(reviewer => ({...reviewer})),
      branchPolicies: tagBranchPolicy.map(policy => ({...policy})),
      secretNames: ['GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT'],
    }),
  },
};

function compareValues(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareGovernanceFindings(left, right) {
  const leftValues = [
    left.path ?? '',
    left.location?.line ?? 0,
    left.location?.column ?? 0,
    left.kind,
    left.scope,
    left.code,
    left.subject,
    left.message,
  ];
  const rightValues = [
    right.path ?? '',
    right.location?.line ?? 0,
    right.location?.column ?? 0,
    right.kind,
    right.scope,
    right.code,
    right.subject,
    right.message,
  ];

  for (let index = 0; index < leftValues.length; index += 1) {
    const comparison = compareValues(leftValues[index], rightValues[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

module.exports = recursivelyFreeze({
  CONTRACT_VERSION,
  GOVERNANCE_FINDING_SCHEMA_ID,
  GOVERNANCE_FINDING_SCHEMA_VERSION,
  NORMALIZED_STATE_SCHEMA_ID,
  NORMALIZED_STATE_SCHEMA_VERSION,
  GOVERNANCE_CONTRACT,
  SCANNER_FINDING_CODES,
  POLICY_FINDING_CODES,
  compareGovernanceFindings,
});

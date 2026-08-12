'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const REQUIRED_CHECKS = [
  'TypeScript Check',
  'Lint',
  'Test',
  'Build iOS (Debug)',
  'Build Android (Debug)',
];
const REQUIRED_REPO_VARIABLES = [
  'APPLE_TEAM_ID',
  'MATCH_GIT_URL',
  'IOS_BUNDLE_ID',
  'ANDROID_PACKAGE_NAME',
  'GOOGLE_PLAY_TRACKS',
];
const REPO_DEMO_SECRETS = [
  'BAMBUDDY_DEMO_URL',
  'BAMBUDDY_DEMO_USERNAME',
  'BAMBUDDY_DEMO_PASSWORD',
];
const RELEASE_CREDENTIAL_SECRETS = [
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
];
const COPILOT_FORBIDDEN_SECRETS = [
  ...new Set([...RELEASE_CREDENTIAL_SECRETS, ...REPO_DEMO_SECRETS]),
];
const GH_API_HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2022-11-28',
];
const SYSTEM_TEMP_PATHS = [
  `${path.posix.sep}var${path.posix.sep}tmp`,
  `${path.posix.sep}tmp`,
];
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const GIT_TRACKED_SCAN_PATHS = [
  '.github/workflows',
  'fastlane',
  'scripts/release',
];
const CLEANUP_SCAN_EXCLUSIONS = new Set([
  path.posix.join('scripts', 'release', 'verify-github-config.js'),
]);
const CLEANUP_CONTROL_PATTERN =
  /\bfinally\b|\bensure\b|trap\s+['"][^'"]*EXIT\b|trap\s+\S+\s+EXIT\b|post\s*:/i;
const CREDENTIAL_NAME_PATTERN =
  /\b(ASC_KEY_CONTENT|GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT|MATCH_GIT_AUTHORIZATION|MATCH_PASSWORD|BAMBUDDY_RELEASE_STORE_CONTENT|BAMBUDDY_RELEASE_STORE_PASSWORD|BAMBUDDY_RELEASE_KEY_ALIAS|BAMBUDDY_RELEASE_KEY_PASSWORD)\b/;
const MATERIALIZATION_PATTERN =
  /\b(writeFileSync|writeFile\(|fs\.writeFile|File\.write|base64\b|mktemp\b|mkdtemp\b|NamedTemporaryFile|BufferedWriter|printf\b.+>|echo\b.+>|cat\b.+>)/;
const EXTERNAL_USES_PATTERN = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/;

const EXPECTED_RULESETS = {
  'protect-dev': {
    name: 'protect-dev',
    refNameInclude: ['refs/heads/dev'],
    refNameExclude: [],
    reviewRule: {
      required_approving_review_count: 1,
      dismiss_stale_reviews_on_push: true,
      require_last_push_approval: true,
      required_review_thread_resolution: true,
      require_code_owner_review: false,
    },
  },
  'protect-main': {
    name: 'protect-main',
    refNameInclude: ['refs/heads/main'],
    refNameExclude: [],
    reviewRule: {
      required_approving_review_count: 1,
      dismiss_stale_reviews_on_push: true,
      require_last_push_approval: true,
      required_review_thread_resolution: true,
      require_code_owner_review: false,
    },
  },
};

const EXPECTED_ENVIRONMENTS = {
  'release-query': {
    branchPolicies: [{ name: 'dev', type: 'branch' }],
    canAdminsBypass: false,
    preventSelfReview: false,
    reviewers: [],
    requiredSecrets: [
      'ASC_KEY_ID',
      'ASC_ISSUER_ID',
      'ASC_KEY_CONTENT',
      'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT',
    ],
  },
  'release-ios': {
    branchPolicies: [{ name: 'v*.*.*', type: 'tag' }],
    canAdminsBypass: false,
    preventSelfReview: false,
    reviewers: [],
    requiredSecrets: [
      'ASC_KEY_ID',
      'ASC_ISSUER_ID',
      'ASC_KEY_CONTENT',
      'APPLE_ID',
      'MATCH_PASSWORD',
      'MATCH_GIT_AUTHORIZATION',
      'BAMBUDDY_DEMO_URL',
      'BAMBUDDY_DEMO_USERNAME',
      'BAMBUDDY_DEMO_PASSWORD',
    ],
  },
  'release-android': {
    branchPolicies: [{ name: 'v*.*.*', type: 'tag' }],
    canAdminsBypass: false,
    preventSelfReview: false,
    reviewers: [],
    requiredSecrets: [
      'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT',
      'BAMBUDDY_RELEASE_STORE_CONTENT',
      'BAMBUDDY_RELEASE_STORE_PASSWORD',
      'BAMBUDDY_RELEASE_KEY_ALIAS',
      'BAMBUDDY_RELEASE_KEY_PASSWORD',
      'BAMBUDDY_DEMO_URL',
      'BAMBUDDY_DEMO_USERNAME',
      'BAMBUDDY_DEMO_PASSWORD',
    ],
  },
  'production-ios': {
    branchPolicies: [{ name: 'v*.*.*', type: 'tag' }],
    canAdminsBypass: false,
    preventSelfReview: true,
    reviewers: [{ login: 'jmassardo', id: 9603391, type: 'User' }],
    requiredSecrets: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_CONTENT'],
  },
  'production-android': {
    branchPolicies: [{ name: 'v*.*.*', type: 'tag' }],
    canAdminsBypass: false,
    preventSelfReview: true,
    reviewers: [{ login: 'jmassardo', id: 9603391, type: 'User' }],
    requiredSecrets: ['GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT'],
  },
};

function defaultRunCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function defaultReadFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function addUnique(entries) {
  return [...new Set(entries)].sort();
}

function sortByName(items) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function sortReviewers(reviewers) {
  return [...reviewers].sort((left, right) => {
    const loginCompare = (left.login || '').localeCompare(right.login || '');
    if (loginCompare !== 0) {
      return loginCompare;
    }
    return (left.id || 0) - (right.id || 0);
  });
}

class CollectionError extends Error {
  constructor(scope, subject, message, remediation) {
    super(message);
    this.name = 'CollectionError';
    this.scope = scope;
    this.subject = subject;
    this.remediation = remediation;
  }
}

function safeParseJson(text, description) {
  try {
    return JSON.parse(text);
  } catch {
    throw new CollectionError(
      'malformed-data',
      description,
      `${description} returned malformed JSON.`,
      `Confirm the read-only GitHub response for ${description} is valid JSON, then retry the verifier.`,
    );
  }
}

function isNotFoundResult(result) {
  if ((result.status ?? 0) === 0) {
    return false;
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (output.includes('HTTP 404')) {
    return true;
  }

  const trimmed = (result.stdout || '').trim();
  if (trimmed.startsWith('{')) {
    const parsed = safeParseJson(trimmed, 'GitHub API error payload');
    return parsed.status === '404' || parsed.status === 404;
  }

  return false;
}

function runJsonCommand(runCommand, command, args, description, options = {}) {
  const result = runCommand(command, args, options);
  if ((result.status ?? 0) !== 0) {
    if (options.allowNotFound && isNotFoundResult(result)) {
      return options.notFoundValue ?? null;
    }

    throw new CollectionError(
      'read-only-command',
      description,
      `${description} failed with status ${result.status}.`,
      `Verify read access and the scoped GitHub configuration for ${description}, then retry; do not broaden token permissions.`,
    );
  }

  const trimmed = result.stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return safeParseJson(trimmed, description);
}

function requireArray(value, description) {
  if (!Array.isArray(value)) {
    throw new CollectionError(
      'malformed-data',
      description,
      `${description} did not return the expected array.`,
      `Confirm the read-only GitHub response shape for ${description}, then retry the verifier.`,
    );
  }
  return value;
}

function validateRulesetDetail(ruleset, expectedId) {
  const description = `get repository ruleset ${expectedId}`;
  if (
    !ruleset ||
    typeof ruleset !== 'object' ||
    ruleset.id !== expectedId ||
    typeof ruleset.name !== 'string' ||
    typeof ruleset.enforcement !== 'string' ||
    typeof ruleset.target !== 'string' ||
    !Array.isArray(ruleset.conditions?.ref_name?.include) ||
    !Array.isArray(ruleset.conditions?.ref_name?.exclude) ||
    !Array.isArray(ruleset.bypass_actors) ||
    !Array.isArray(ruleset.rules)
  ) {
    throw new CollectionError(
      'malformed-data',
      description,
      `${description} did not return complete ruleset conditions, bypass actors, and rules.`,
      `Confirm ruleset ${expectedId} is readable through the repository ruleset detail API, then retry the verifier.`,
    );
  }
  return ruleset;
}

function parseRepoFromRemote(remoteUrl) {
  const httpsMatch = remoteUrl.match(
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/,
  );
  if (!httpsMatch) {
    throw new Error(
      `Unable to determine owner/repo from remote URL: ${remoteUrl}`,
    );
  }

  return `${httpsMatch[1]}/${httpsMatch[2]}`;
}

function resolveRepo(runCommand) {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  const result = runCommand('git', ['config', '--get', 'remote.origin.url'], {
    cwd: PROJECT_ROOT,
  });
  if ((result.status ?? 0) !== 0) {
    const output = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim();
    throw new Error(`Unable to resolve repository from git remote: ${output}`);
  }

  return parseRepoFromRemote(result.stdout.trim());
}

function buildGhApiArgs(pathname) {
  return ['api', ...GH_API_HEADERS, pathname];
}

function normalizeRule(rule) {
  return {
    type: rule.type,
    parameters: rule.parameters || {},
  };
}

function normalizeRulesets(rulesets) {
  return sortByName(
    (rulesets || []).map(ruleset => ({
      id: ruleset.id,
      name: ruleset.name,
      enforcement: ruleset.enforcement,
      target: ruleset.target,
      refNameInclude: addUnique(ruleset.conditions?.ref_name?.include || []),
      refNameExclude: addUnique(ruleset.conditions?.ref_name?.exclude || []),
      bypassActors: ruleset.bypass_actors || [],
      rules: (ruleset.rules || []).map(normalizeRule),
    })),
  );
}

function normalizeReviewers(reviewers) {
  return sortReviewers(
    (reviewers || []).map(reviewerEntry => {
      const reviewer = reviewerEntry.reviewer || reviewerEntry;
      return {
        type: reviewerEntry.type || reviewer.type || 'User',
        login: reviewer.login,
        id: reviewer.id,
      };
    }),
  );
}

function normalizeBranchPolicies(payload) {
  return sortByName(
    ((payload && payload.branch_policies) || []).map(policy => ({
      name: policy.name,
      type: policy.type,
    })),
  );
}

function normalizeEnvironment(detail, branchPolicies, secrets, variables) {
  const reviewerRule = (detail.protection_rules || []).find(
    rule => rule.type === 'required_reviewers',
  );

  return {
    id: detail.id,
    name: detail.name,
    canAdminsBypass: detail.can_admins_bypass,
    preventSelfReview: Boolean(reviewerRule?.prevent_self_review),
    reviewers: normalizeReviewers(reviewerRule?.reviewers || []),
    deploymentBranchPolicy: {
      protectedBranches: Boolean(
        detail.deployment_branch_policy?.protected_branches,
      ),
      customBranchPolicies: Boolean(
        detail.deployment_branch_policy?.custom_branch_policies,
      ),
      patterns: normalizeBranchPolicies(branchPolicies),
    },
    secretNames: addUnique((secrets || []).map(secret => secret.name)),
    variableNames: addUnique((variables || []).map(variable => variable.name)),
  };
}

function normalizeCollaborators(collaborators) {
  return [...(collaborators || [])]
    .map(collaborator => ({
      login: collaborator.login,
      id: collaborator.id,
      roleName: collaborator.role_name,
      permissions: collaborator.permissions || {},
    }))
    .sort((left, right) => left.login.localeCompare(right.login));
}

function listTrackedFiles(runCommand) {
  const result = runCommand('git', ['ls-files', ...GIT_TRACKED_SCAN_PATHS], {
    cwd: PROJECT_ROOT,
  });
  if ((result.status ?? 0) !== 0) {
    const output = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim();
    throw new Error(`Unable to list tracked files for policy scan: ${output}`);
  }

  return result.stdout
    .split('\n')
    .map(entry => entry.trim())
    .filter(Boolean)
    .sort();
}

function isWorkflowFile(filePath) {
  return (
    filePath.startsWith('.github/workflows/') && /\.(ya?ml)$/i.test(filePath)
  );
}

function isReleaseRelatedScript(filePath) {
  return (
    isWorkflowFile(filePath) ||
    filePath.startsWith('fastlane/') ||
    filePath.startsWith('scripts/release/')
  );
}

function isExternalActionReference(reference) {
  return (
    !reference.startsWith('./') &&
    !reference.startsWith('../') &&
    !reference.startsWith('docker://')
  );
}

function scanWorkflowUses(filePath, content) {
  const findings = [];
  const lines = content.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*#/.test(line)) {
      continue;
    }

    const match = line.match(EXTERNAL_USES_PATTERN);
    if (!match) {
      continue;
    }

    const reference = match[1];
    if (!isExternalActionReference(reference)) {
      continue;
    }

    const atIndex = reference.lastIndexOf('@');
    const ref = atIndex === -1 ? '' : reference.slice(atIndex + 1);
    if (!FULL_SHA_PATTERN.test(ref)) {
      findings.push({
        filePath,
        lineNumber: index + 1,
        reference,
      });
    }
  }

  return findings;
}

function scanSystemTempPaths(filePath, content) {
  const findings = [];
  const lines = content.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const literal = SYSTEM_TEMP_PATHS.find(candidate =>
      line.includes(candidate),
    );
    if (!literal) {
      continue;
    }

    findings.push({
      filePath,
      lineNumber: index + 1,
      literal,
      line: line.trim(),
    });
  }

  return findings;
}

function requiresCleanupControl(filePath, content) {
  if (CLEANUP_SCAN_EXCLUSIONS.has(filePath)) {
    return false;
  }

  return (
    CREDENTIAL_NAME_PATTERN.test(content) &&
    MATERIALIZATION_PATTERN.test(content)
  );
}

function scanCleanupControls(filePath, content) {
  if (!requiresCleanupControl(filePath, content)) {
    return [];
  }

  if (CLEANUP_CONTROL_PATTERN.test(content)) {
    return [];
  }

  return [
    {
      filePath,
    },
  ];
}

function scanTrackedFiles(files, readFile) {
  const workflowFiles = files.filter(isWorkflowFile);
  const releaseFiles = files.filter(isReleaseRelatedScript);
  const unpinnedActions = workflowFiles.flatMap(filePath =>
    scanWorkflowUses(filePath, readFile(path.join(PROJECT_ROOT, filePath))),
  );
  const tempPathFindings = releaseFiles.flatMap(filePath =>
    scanSystemTempPaths(filePath, readFile(path.join(PROJECT_ROOT, filePath))),
  );
  const cleanupControlFindings = releaseFiles.flatMap(filePath =>
    scanCleanupControls(filePath, readFile(path.join(PROJECT_ROOT, filePath))),
  );

  return {
    scannedFiles: files,
    unpinnedActions,
    tempPathFindings,
    cleanupControlFindings,
  };
}

function collectGitHubState(options = {}) {
  const runCommand = options.runCommand || defaultRunCommand;
  const readFile = options.readFile || defaultReadFile;
  const repo = options.repo || resolveRepo(runCommand);
  const repository = runJsonCommand(
    runCommand,
    'gh',
    buildGhApiArgs(`repos/${repo}`),
    'get repository metadata',
  );
  const rulesetSummaries = requireArray(
    runJsonCommand(
      runCommand,
      'gh',
      buildGhApiArgs(`repos/${repo}/rulesets`),
      'list repository rulesets',
    ),
    'list repository rulesets',
  );
  const rulesets = rulesetSummaries.map(summary => {
    if (!summary || !Number.isInteger(summary.id) || summary.id <= 0) {
      throw new CollectionError(
        'malformed-data',
        'list repository rulesets',
        'list repository rulesets returned an entry without a valid ruleset ID.',
        'Confirm the read-only repository ruleset list response, then retry the verifier.',
      );
    }
    return validateRulesetDetail(
      runJsonCommand(
        runCommand,
        'gh',
        buildGhApiArgs(`repos/${repo}/rulesets/${summary.id}`),
        `get repository ruleset ${summary.id}`,
      ),
      summary.id,
    );
  });
  const environmentsResponse = runJsonCommand(
    runCommand,
    'gh',
    buildGhApiArgs(`repos/${repo}/environments`),
    'list environments',
  );
  const environmentNames = addUnique(
    (environmentsResponse?.environments || []).map(
      environment => environment.name,
    ),
  );
  const environments = environmentNames.map(environmentName => {
    const detail = runJsonCommand(
      runCommand,
      'gh',
      buildGhApiArgs(`repos/${repo}/environments/${environmentName}`),
      `get environment ${environmentName}`,
    );
    const branchPolicies = detail.deployment_branch_policy
      ?.custom_branch_policies
      ? runJsonCommand(
          runCommand,
          'gh',
          buildGhApiArgs(
            `repos/${repo}/environments/${environmentName}/deployment-branch-policies`,
          ),
          `list deployment branch policies for ${environmentName}`,
          { allowNotFound: true, notFoundValue: { branch_policies: [] } },
        )
      : { branch_policies: [] };
    const secrets = runJsonCommand(
      runCommand,
      'gh',
      [
        'secret',
        'list',
        '--repo',
        repo,
        '--env',
        environmentName,
        '--json',
        'name',
      ],
      `list environment secrets for ${environmentName}`,
    );
    const variables = runJsonCommand(
      runCommand,
      'gh',
      [
        'variable',
        'list',
        '--repo',
        repo,
        '--env',
        environmentName,
        '--json',
        'name',
      ],
      `list environment variables for ${environmentName}`,
    );

    return normalizeEnvironment(detail, branchPolicies, secrets, variables);
  });

  const trackedFiles = options.trackedFiles || listTrackedFiles(runCommand);
  const workflowScan = scanTrackedFiles(trackedFiles, readFile);
  const repoSecrets = runJsonCommand(
    runCommand,
    'gh',
    ['secret', 'list', '--repo', repo, '--json', 'name'],
    'list repository secrets',
  );
  const repoVariables = runJsonCommand(
    runCommand,
    'gh',
    ['variable', 'list', '--repo', repo, '--json', 'name'],
    'list repository variables',
  );
  const collaborators = runJsonCommand(
    runCommand,
    'gh',
    buildGhApiArgs(`repos/${repo}/collaborators?affiliation=direct`),
    'list direct collaborators',
  );
  const actionsPermissions = runJsonCommand(
    runCommand,
    'gh',
    buildGhApiArgs(`repos/${repo}/actions/permissions`),
    'get repository actions permissions',
  );
  const workflowPermissions = runJsonCommand(
    runCommand,
    'gh',
    buildGhApiArgs(`repos/${repo}/actions/permissions/workflow`),
    'get workflow permissions',
  );
  const devBranchMetadata = runJsonCommand(
    runCommand,
    'gh',
    buildGhApiArgs(`repos/${repo}/branches/dev`),
    'get dev branch metadata',
  );
  const mainBranchMetadata = runJsonCommand(
    runCommand,
    'gh',
    buildGhApiArgs(`repos/${repo}/branches/main`),
    'get main branch metadata',
  );

  return {
    timestamp: new Date().toISOString(),
    repo,
    repository,
    rulesets: normalizeRulesets(rulesets),
    environments: sortByName(environments),
    repoSecrets: addUnique(repoSecrets.map(secret => secret.name)),
    repoVariables: addUnique(repoVariables.map(variable => variable.name)),
    collaborators: normalizeCollaborators(collaborators),
    actionsPolicy: {
      allowedActions: actionsPermissions.allowed_actions,
      shaPinningRequired: actionsPermissions.sha_pinning_required,
      defaultWorkflowPermissions:
        workflowPermissions.default_workflow_permissions,
      canApprovePullRequestReviews:
        workflowPermissions.can_approve_pull_request_reviews,
      allowMergeCommit: repository.allow_merge_commit,
    },
    branches: {
      dev: {
        metadata: devBranchMetadata,
        legacyProtection: runJsonCommand(
          runCommand,
          'gh',
          buildGhApiArgs(`repos/${repo}/branches/dev/protection`),
          'get dev branch protection',
          { allowNotFound: true, notFoundValue: null },
        ),
      },
      main: {
        metadata: mainBranchMetadata,
        legacyProtection: runJsonCommand(
          runCommand,
          'gh',
          buildGhApiArgs(`repos/${repo}/branches/main/protection`),
          'get main branch protection',
          { allowNotFound: true, notFoundValue: null },
        ),
      },
    },
    workflowScan,
  };
}

function createFinding(severity, scope, subject, message, remediation) {
  return {
    severity,
    scope,
    subject,
    message,
    remediation,
  };
}

function diffNames(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter(entry => !actualSet.has(entry)),
    unexpected: actual.filter(entry => !expectedSet.has(entry)),
  };
}

function compareRuleTypes(ruleset) {
  return addUnique(ruleset.rules.map(rule => rule.type));
}

function findRule(ruleset, ruleType) {
  return ruleset.rules.find(rule => rule.type === ruleType);
}

function reviewRuleMatches(actual, expected) {
  return (
    actual.required_approving_review_count ===
      expected.required_approving_review_count &&
    Boolean(actual.dismiss_stale_reviews_on_push) ===
      expected.dismiss_stale_reviews_on_push &&
    Boolean(actual.require_last_push_approval) ===
      expected.require_last_push_approval &&
    Boolean(actual.required_review_thread_resolution) ===
      expected.required_review_thread_resolution &&
    Boolean(actual.require_code_owner_review) ===
      expected.require_code_owner_review
  );
}

function verifyRulesets(state, findings) {
  const actualByName = new Map(
    state.rulesets.map(ruleset => [ruleset.name, ruleset]),
  );

  for (const [name, expected] of Object.entries(EXPECTED_RULESETS)) {
    const ruleset = actualByName.get(name);
    if (!ruleset) {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Missing required ruleset ${name}.`,
          `Create active branch ruleset ${name} for ${expected.refNameInclude[0]} with PR review, exact required checks, deletion protection, and non-fast-forward protection.`,
        ),
      );
      continue;
    }

    if (ruleset.enforcement !== 'active') {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Ruleset ${name} must be active; found ${ruleset.enforcement}.`,
          `Set repository ruleset ${name} enforcement to active.`,
        ),
      );
    }

    if (ruleset.target !== 'branch') {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Ruleset ${name} must target branches; found ${ruleset.target}.`,
          `Change ruleset ${name} target to branch.`,
        ),
      );
    }

    if (
      JSON.stringify(ruleset.refNameInclude) !==
        JSON.stringify(expected.refNameInclude) ||
      JSON.stringify(ruleset.refNameExclude) !==
        JSON.stringify(expected.refNameExclude)
    ) {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Ruleset ${name} ref conditions include ${
            ruleset.refNameInclude.join(', ') || 'no refs'
          } and exclude ${
            ruleset.refNameExclude.join(', ') || 'no refs'
          }; expected include ${expected.refNameInclude.join(
            ', ',
          )} and no exclusions.`,
          `Set ruleset ${name} ref_name conditions to include ${expected.refNameInclude.join(
            ', ',
          )} only, with an empty exclude list.`,
        ),
      );
    }

    if ((ruleset.bypassActors || []).length > 0) {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Ruleset ${name} has bypass actors configured.`,
          `Remove every bypass actor from ruleset ${name}; routine bypass is not allowed.`,
        ),
      );
    }

    const ruleTypes = compareRuleTypes(ruleset);
    const expectedTypes = [
      'deletion',
      'non_fast_forward',
      'pull_request',
      'required_status_checks',
    ];
    if (JSON.stringify(ruleTypes) !== JSON.stringify(expectedTypes)) {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Ruleset ${name} has rule types ${
            ruleTypes.join(', ') || 'none'
          }, not the approved set ${expectedTypes.join(', ')}.`,
          `Set ruleset ${name} to use only deletion, non_fast_forward, pull_request, and required_status_checks rules.`,
        ),
      );
    }

    if (ruleTypes.includes('required_linear_history')) {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Ruleset ${name} enables required_linear_history.`,
          `Remove required_linear_history from ${name}; release promotion depends on merge commits.`,
        ),
      );
    }

    const reviewRule = findRule(ruleset, 'pull_request');
    if (
      !reviewRule ||
      !reviewRuleMatches(reviewRule.parameters, expected.reviewRule)
    ) {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Ruleset ${name} review parameters do not match the approved one-approval gate.`,
          `Set ${name} pull_request parameters to one approval, stale dismissal, last-push approval, conversation resolution, and no code-owner review requirement.`,
        ),
      );
    }

    const statusRule = findRule(ruleset, 'required_status_checks');
    const actualChecks = addUnique(
      (statusRule?.parameters?.required_status_checks || []).map(
        check => check.context,
      ),
    );
    if (
      !statusRule ||
      JSON.stringify(actualChecks) !==
        JSON.stringify(addUnique(REQUIRED_CHECKS)) ||
      statusRule.parameters?.strict_required_status_checks_policy !== true
    ) {
      findings.errors.push(
        createFinding(
          'error',
          'ruleset',
          name,
          `Ruleset ${name} required status checks or strictness do not match the approved CI gate.`,
          `Set ${name} to require exactly ${REQUIRED_CHECKS.join(
            ', ',
          )} with strict_required_status_checks_policy=true.`,
        ),
      );
    }
  }

  for (const branchName of ['dev', 'main']) {
    if (state.branches[branchName].legacyProtection) {
      findings.errors.push(
        createFinding(
          'error',
          'branch-protection',
          branchName,
          `Legacy branch protection remains configured on ${branchName}.`,
          `Remove legacy branch protection from ${branchName} and keep rulesets as the single source of truth.`,
        ),
      );
    }
  }
}

function verifyEnvironments(state, findings) {
  const actualByName = new Map(
    state.environments.map(environment => [environment.name, environment]),
  );

  for (const [name, expected] of Object.entries(EXPECTED_ENVIRONMENTS)) {
    const environment = actualByName.get(name);
    if (!environment) {
      findings.errors.push(
        createFinding(
          'error',
          'environment',
          name,
          `Missing required environment ${name}.`,
          `Create environment ${name} with the approved branch or tag policy, reviewers, secret names, and admin bypass settings.`,
        ),
      );
      continue;
    }

    if (environment.canAdminsBypass !== expected.canAdminsBypass) {
      findings.errors.push(
        createFinding(
          'error',
          'environment',
          name,
          `Environment ${name} can_admins_bypass must be ${expected.canAdminsBypass}.`,
          `Set can_admins_bypass=${expected.canAdminsBypass} on environment ${name}.`,
        ),
      );
    }

    if (environment.preventSelfReview !== expected.preventSelfReview) {
      findings.errors.push(
        createFinding(
          'error',
          'environment',
          name,
          `Environment ${name} prevent_self_review must be ${expected.preventSelfReview}.`,
          `Set prevent_self_review=${expected.preventSelfReview} on environment ${name}.`,
        ),
      );
    }

    if (
      environment.deploymentBranchPolicy.protectedBranches !== false ||
      environment.deploymentBranchPolicy.customBranchPolicies !== true
    ) {
      findings.errors.push(
        createFinding(
          'error',
          'environment',
          name,
          `Environment ${name} does not use custom branch or tag deployment policies only.`,
          `Configure ${name} with deployment_branch_policy.protected_branches=false and custom_branch_policies=true.`,
        ),
      );
    }

    const actualPolicies = addUnique(
      environment.deploymentBranchPolicy.patterns.map(
        policy => `${policy.type}:${policy.name}`,
      ),
    );
    const expectedPolicies = addUnique(
      expected.branchPolicies.map(policy => `${policy.type}:${policy.name}`),
    );
    if (JSON.stringify(actualPolicies) !== JSON.stringify(expectedPolicies)) {
      findings.errors.push(
        createFinding(
          'error',
          'environment',
          name,
          `Environment ${name} deployment policies are ${
            actualPolicies.join(', ') || 'none'
          }, not ${expectedPolicies.join(', ')}.`,
          `Set environment ${name} deployment branch policies to ${expectedPolicies.join(
            ', ',
          )} only.`,
        ),
      );
    }

    const actualReviewers = environment.reviewers.map(reviewer => ({
      login: reviewer.login,
      id: reviewer.id,
      type: reviewer.type,
    }));
    if (
      JSON.stringify(actualReviewers) !== JSON.stringify(expected.reviewers)
    ) {
      findings.errors.push(
        createFinding(
          'error',
          'environment',
          name,
          `Environment ${name} reviewers do not match the approved reviewer set.`,
          expected.reviewers.length === 0
            ? `Remove required reviewers from ${name}.`
            : `Set ${name} reviewers to ${expected.reviewers
                .map(reviewer => `${reviewer.login} (${reviewer.id})`)
                .join(', ')} only.`,
        ),
      );
    }

    const secretDiff = diffNames(
      addUnique(expected.requiredSecrets),
      environment.secretNames,
    );
    if (secretDiff.missing.length > 0 || secretDiff.unexpected.length > 0) {
      const parts = [];
      if (secretDiff.missing.length > 0) {
        parts.push(`missing ${secretDiff.missing.join(', ')}`);
      }
      if (secretDiff.unexpected.length > 0) {
        parts.push(`unexpected ${secretDiff.unexpected.join(', ')}`);
      }
      findings.errors.push(
        createFinding(
          'error',
          'environment-secret',
          name,
          `Environment ${name} secret names are mis-scoped: ${parts.join(
            '; ',
          )}.`,
          `Set environment ${name} secret names to exactly ${addUnique(
            expected.requiredSecrets,
          ).join(', ')} without placeholder values or extra secrets.`,
        ),
      );
    }

    const shadowVariables = environment.variableNames.filter(variable =>
      REQUIRED_REPO_VARIABLES.includes(variable),
    );
    if (shadowVariables.length > 0) {
      findings.errors.push(
        createFinding(
          'error',
          'environment-variable',
          name,
          `Environment ${name} shadows repository variable names: ${shadowVariables.join(
            ', ',
          )}.`,
          `Remove environment-scoped variables ${shadowVariables.join(
            ', ',
          )} from ${name}; keep these names at repository scope only.`,
        ),
      );
    }
  }

  const copilot = actualByName.get('copilot');
  if (copilot) {
    const forbiddenSecrets = copilot.secretNames.filter(secret =>
      COPILOT_FORBIDDEN_SECRETS.includes(secret),
    );
    if (forbiddenSecrets.length > 0) {
      findings.errors.push(
        createFinding(
          'error',
          'environment-secret',
          'copilot',
          `copilot contains forbidden release or production secret names: ${forbiddenSecrets.join(
            ', ',
          )}.`,
          `Remove ${forbiddenSecrets.join(
            ', ',
          )} from copilot; do not reuse release credentials in that environment.`,
        ),
      );
    }
  }
}

function verifyRepoScope(state, findings) {
  const repoSecretDiff = diffNames(REPO_DEMO_SECRETS, state.repoSecrets);
  if (repoSecretDiff.missing.length > 0) {
    findings.errors.push(
      createFinding(
        'error',
        'repo-secret',
        'repository',
        `Repository demo secrets are missing: ${repoSecretDiff.missing.join(
          ', ',
        )}.`,
        `Populate repository-scoped demo secrets ${REPO_DEMO_SECRETS.join(
          ', ',
        )} so debug CI checks continue to pass.`,
      ),
    );
  }

  const forbiddenRepoSecrets = state.repoSecrets.filter(secret =>
    RELEASE_CREDENTIAL_SECRETS.includes(secret),
  );
  if (forbiddenRepoSecrets.length > 0) {
    findings.errors.push(
      createFinding(
        'error',
        'repo-secret',
        'repository',
        `Repository scope contains forbidden release credentials: ${forbiddenRepoSecrets.join(
          ', ',
        )}.`,
        `Remove ${forbiddenRepoSecrets.join(
          ', ',
        )} from repository scope and store them only in their approved environments.`,
      ),
    );
  }

  const variableDiff = diffNames(REQUIRED_REPO_VARIABLES, state.repoVariables);
  if (variableDiff.missing.length > 0) {
    findings.errors.push(
      createFinding(
        'error',
        'repo-variable',
        'repository',
        `Repository variables are missing: ${variableDiff.missing.join(', ')}.`,
        `Create repository variables ${REQUIRED_REPO_VARIABLES.join(
          ', ',
        )} with reviewed non-secret values before activating release governance.`,
      ),
    );
  }
}

function verifyActions(state, findings) {
  if (state.actionsPolicy.defaultWorkflowPermissions !== 'read') {
    findings.errors.push(
      createFinding(
        'error',
        'actions',
        'workflow-permissions',
        `default_workflow_permissions must be read; found ${state.actionsPolicy.defaultWorkflowPermissions}.`,
        'Set repository workflow permissions to read-only.',
      ),
    );
  }

  if (state.actionsPolicy.canApprovePullRequestReviews !== false) {
    findings.errors.push(
      createFinding(
        'error',
        'actions',
        'workflow-pr-review-approval',
        'Actions workflows are allowed to approve pull request reviews.',
        'Disable workflow approval of pull request reviews at repository scope.',
      ),
    );
  }

  if (state.actionsPolicy.allowMergeCommit !== true) {
    findings.errors.push(
      createFinding(
        'error',
        'actions',
        'merge-method',
        'allow_merge_commit must remain enabled for release promotion identity.',
        'Enable repository merge commits; do not replace them with linear-history enforcement.',
      ),
    );
  }

  if (state.workflowScan.unpinnedActions.length > 0) {
    findings.errors.push(
      createFinding(
        'error',
        'workflow-file',
        'action-pinning',
        `${state.workflowScan.unpinnedActions.length} external GitHub Actions use mutable refs.`,
        'Pin every external uses: reference to a 40-character commit SHA before enabling Actions SHA pinning.',
      ),
    );
  } else if (state.actionsPolicy.shaPinningRequired !== true) {
    findings.errors.push(
      createFinding(
        'error',
        'actions',
        'sha-pinning',
        'sha_pinning_required must be true after all workflow refs are pinned.',
        'Enable Actions SHA pinning after all external uses: references are pinned to immutable SHAs.',
      ),
    );
  }
}

function verifyScans(state, findings) {
  for (const finding of state.workflowScan.tempPathFindings) {
    findings.errors.push(
      createFinding(
        'error',
        'workflow-file',
        finding.filePath,
        `Tracked release file ${finding.filePath}:${finding.lineNumber} contains forbidden system temp path literal ${finding.literal}.`,
        `Replace the hardcoded temp path in ${finding.filePath} with a secure project-local path or a per-run secure temp helper.`,
      ),
    );
  }

  for (const finding of state.workflowScan.cleanupControlFindings) {
    findings.errors.push(
      createFinding(
        'error',
        'workflow-file',
        finding.filePath,
        `Credential materialization in ${finding.filePath} does not show an always-run cleanup control.`,
        `Add finally, ensure, trap, or an equivalent guaranteed cleanup path to ${finding.filePath}.`,
      ),
    );
  }
}

function determineProductionState(state, findings) {
  const collaboratorLogins = state.collaborators.map(
    collaborator => collaborator.login,
  );
  if (
    collaboratorLogins.length === 1 &&
    collaboratorLogins[0] === 'jmassardo'
  ) {
    findings.warnings.push(
      createFinding(
        'warning',
        'production',
        'reviewer-topology',
        'Production remains fail-closed until a second eligible collaborator or approved automation trigger path exists.',
        'Keep production protections intact and add a second eligible collaborator or approved automation identity before go-live.',
      ),
    );
    return 'fail_closed';
  }

  return 'ready';
}

function buildCounts(state, findings) {
  const missingRulesets = Object.keys(EXPECTED_RULESETS).filter(
    name => !state.rulesets.some(ruleset => ruleset.name === name),
  ).length;
  const missingSecrets = findings.errors.filter(
    finding =>
      finding.scope === 'environment-secret' || finding.scope === 'repo-secret',
  ).length;
  const unexpectedSecrets = findings.errors.filter(
    finding =>
      finding.scope === 'environment-secret' &&
      finding.message.includes('unexpected'),
  ).length;

  return {
    missingRulesets,
    missingSecrets,
    unexpectedSecrets,
    unpinnedActions: state.workflowScan.unpinnedActions.length,
  };
}

function verifyGitHubState(state) {
  const findings = {
    errors: [],
    warnings: [],
  };

  verifyRulesets(state, findings);
  verifyEnvironments(state, findings);
  verifyRepoScope(state, findings);
  verifyActions(state, findings);
  verifyScans(state, findings);
  const productionState = determineProductionState(state, findings);

  return {
    timestamp: state.timestamp,
    repo: state.repo,
    status: findings.errors.length === 0 ? 'pass' : 'fail',
    errors: findings.errors,
    warnings: findings.warnings,
    counts: buildCounts(state, findings),
    rulesets: state.rulesets,
    environments: state.environments,
    repoSecrets: state.repoSecrets,
    repoVariables: state.repoVariables,
    collaborators: state.collaborators,
    actionsPolicy: state.actionsPolicy,
    branchProtection: {
      dev: {
        protected: Boolean(state.branches.dev.metadata?.protected),
        hasLegacyProtection: Boolean(state.branches.dev.legacyProtection),
      },
      main: {
        protected: Boolean(state.branches.main.metadata?.protected),
        hasLegacyProtection: Boolean(state.branches.main.legacyProtection),
      },
    },
    workflowScan: state.workflowScan,
    productionState,
  };
}

function formatFinding(finding) {
  return `- [${finding.severity}] ${finding.scope}:${finding.subject} ${finding.message} Remediation: ${finding.remediation}`;
}

function renderTextReport(result) {
  const lines = [
    `timestamp=${result.timestamp}`,
    `repo=${result.repo}`,
    `status=${result.status}`,
    `productionState=${result.productionState}`,
    `counts=${JSON.stringify(result.counts)}`,
    `actionsPolicy=${JSON.stringify(result.actionsPolicy)}`,
    `branchProtection=${JSON.stringify(result.branchProtection)}`,
    `repoSecrets=${result.repoSecrets.join(', ') || '(none)'}`,
    `repoVariables=${result.repoVariables.join(', ') || '(none)'}`,
    `collaborators=${
      result.collaborators
        .map(collaborator => `${collaborator.login}#${collaborator.id}`)
        .join(', ') || '(none)'
    }`,
    `unpinnedActions=${result.workflowScan.unpinnedActions.length}`,
    `tempPathFindings=${result.workflowScan.tempPathFindings.length}`,
    `cleanupControlFindings=${result.workflowScan.cleanupControlFindings.length}`,
    'errors:',
  ];

  if (result.errors.length === 0) {
    lines.push('- none');
  } else {
    lines.push(...result.errors.map(formatFinding));
  }

  lines.push('warnings:');
  if (result.warnings.length === 0) {
    lines.push('- none');
  } else {
    lines.push(...result.warnings.map(formatFinding));
  }

  return lines.join('\n');
}

function buildCollectionFailure(error, repo) {
  const isCollectionError = error instanceof CollectionError;
  const finding = createFinding(
    'error',
    isCollectionError ? error.scope : 'verifier',
    isCollectionError ? error.subject : 'execution',
    isCollectionError
      ? error.message
      : 'The verifier could not complete its read-only inspection.',
    isCollectionError
      ? error.remediation
      : 'Confirm the verifier arguments and local read-only tooling, then retry without broadening credentials.',
  );

  return {
    timestamp: new Date().toISOString(),
    repo: repo || 'unresolved',
    status: 'fail',
    productionState: 'fail_closed',
    errors: [finding],
    warnings: [],
    collectionFailure: true,
  };
}

function renderCollectionFailureText(result) {
  return [
    `timestamp=${result.timestamp}`,
    `repo=${result.repo}`,
    'status=fail',
    'productionState=fail_closed',
    'errors:',
    ...result.errors.map(formatFinding),
    'warnings:',
    '- none',
  ].join('\n');
}

function parseCliArgs(argv) {
  const options = {
    jsonOnly: false,
    repo: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json-only') {
      options.jsonOnly = true;
      continue;
    }

    if (argument === '--repo') {
      options.repo = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function executeVerifier(argv = process.argv.slice(2), dependencies = {}) {
  let options = { jsonOnly: false, repo: undefined };
  try {
    options = parseCliArgs(argv);
    const state = collectGitHubState({
      repo: options.repo,
      runCommand: dependencies.runCommand,
      readFile: dependencies.readFile,
      trackedFiles: dependencies.trackedFiles,
    });
    return {
      jsonOnly: options.jsonOnly,
      result: verifyGitHubState(state),
    };
  } catch (error) {
    return {
      jsonOnly: options.jsonOnly,
      result: buildCollectionFailure(error, options.repo),
    };
  }
}

function main(argv = process.argv.slice(2), dependencies = {}) {
  const execution = executeVerifier(argv, dependencies);
  const { result } = execution;
  const writeOutput = dependencies.writeOutput || console.log;

  if (!execution.jsonOnly) {
    writeOutput(
      result.collectionFailure
        ? renderCollectionFailureText(result)
        : renderTextReport(result),
    );
  }
  writeOutput(JSON.stringify(result, null, 2));

  if (result.status !== 'pass') {
    if (dependencies.setExitCode) {
      dependencies.setExitCode(1);
    } else {
      process.exitCode = 1;
    }
  }

  return result;
}

module.exports = {
  PROJECT_ROOT,
  REQUIRED_CHECKS,
  REQUIRED_REPO_VARIABLES,
  REPO_DEMO_SECRETS,
  RELEASE_CREDENTIAL_SECRETS,
  COPILOT_FORBIDDEN_SECRETS,
  EXPECTED_ENVIRONMENTS,
  EXPECTED_RULESETS,
  SYSTEM_TEMP_PATHS,
  scanTrackedFiles,
  collectGitHubState,
  verifyGitHubState,
  renderTextReport,
  renderCollectionFailureText,
  executeVerifier,
  main,
  parseRepoFromRemote,
};

if (require.main === module) {
  main();
}

'use strict';

const path = require('node:path');

const {
  PROJECT_ROOT,
  REQUIRED_CHECKS,
  REQUIRED_REPO_VARIABLES,
  REPO_DEMO_SECRETS,
  SYSTEM_TEMP_PATHS,
  collectGitHubState,
  main,
  renderTextReport,
  scanTrackedFiles,
  verifyGitHubState,
} = require('../../scripts/release/verify-github-config');

function buildRuleset(name, refNameInclude) {
  return {
    id: name === 'protect-dev' ? 1 : 2,
    name,
    enforcement: 'active',
    target: 'branch',
    refNameInclude: [refNameInclude],
    refNameExclude: [],
    bypassActors: [],
    rules: [
      { type: 'deletion', parameters: {} },
      { type: 'non_fast_forward', parameters: {} },
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
          required_status_checks: REQUIRED_CHECKS.map(context => ({ context })),
          strict_required_status_checks_policy: true,
        },
      },
    ],
  };
}

function buildEnvironment(
  name,
  patternName,
  patternType,
  reviewers,
  secretNames,
  options = {},
) {
  return {
    id: `${name}-id`,
    name,
    canAdminsBypass: options.canAdminsBypass ?? false,
    preventSelfReview: options.preventSelfReview ?? false,
    reviewers: reviewers || [],
    deploymentBranchPolicy: {
      protectedBranches: false,
      customBranchPolicies: true,
      patterns: [{ name: patternName, type: patternType }],
    },
    secretNames: secretNames || [],
    variableNames: options.variableNames || [],
  };
}

function buildCompliantState() {
  return {
    timestamp: '2026-08-11T22:00:00.000Z',
    repo: 'jmassardo/bambuddy-mobile',
    rulesets: [
      buildRuleset('protect-dev', 'refs/heads/dev'),
      buildRuleset('protect-main', 'refs/heads/main'),
    ],
    environments: [
      buildEnvironment('copilot', 'dev', 'branch', [], [], {
        canAdminsBypass: true,
      }),
      buildEnvironment(
        'release-query',
        'dev',
        'branch',
        [],
        [
          'ASC_KEY_ID',
          'ASC_ISSUER_ID',
          'ASC_KEY_CONTENT',
          'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT',
        ],
      ),
      buildEnvironment(
        'release-ios',
        'v*.*.*',
        'tag',
        [],
        [
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
      ),
      buildEnvironment(
        'release-android',
        'v*.*.*',
        'tag',
        [],
        [
          'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT',
          'BAMBUDDY_RELEASE_STORE_CONTENT',
          'BAMBUDDY_RELEASE_STORE_PASSWORD',
          'BAMBUDDY_RELEASE_KEY_ALIAS',
          'BAMBUDDY_RELEASE_KEY_PASSWORD',
          'BAMBUDDY_DEMO_URL',
          'BAMBUDDY_DEMO_USERNAME',
          'BAMBUDDY_DEMO_PASSWORD',
        ],
      ),
      buildEnvironment(
        'production-ios',
        'v*.*.*',
        'tag',
        [{ login: 'jmassardo', id: 9603391, type: 'User' }],
        ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_CONTENT'],
        { preventSelfReview: true },
      ),
      buildEnvironment(
        'production-android',
        'v*.*.*',
        'tag',
        [{ login: 'jmassardo', id: 9603391, type: 'User' }],
        ['GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT'],
        { preventSelfReview: true },
      ),
    ],
    repoSecrets: [...REPO_DEMO_SECRETS],
    repoVariables: [...REQUIRED_REPO_VARIABLES],
    collaborators: [
      {
        login: 'jmassardo',
        id: 9603391,
        roleName: 'admin',
        permissions: { admin: true },
      },
    ],
    actionsPolicy: {
      allowedActions: 'all',
      shaPinningRequired: true,
      defaultWorkflowPermissions: 'read',
      canApprovePullRequestReviews: false,
      allowMergeCommit: true,
    },
    branches: {
      dev: {
        metadata: { protected: true },
        legacyProtection: null,
      },
      main: {
        metadata: { protected: true },
        legacyProtection: null,
      },
    },
    workflowScan: {
      scannedFiles: ['.github/workflows/ci.yml'],
      unpinnedActions: [],
      tempPathFindings: [],
      cleanupControlFindings: [],
    },
  };
}

function commandKey(command, args) {
  return `${command} ${args.join(' ')}`;
}

function buildRunner(fixtures) {
  const calls = [];

  const runner = (command, args) => {
    const key = commandKey(command, args);
    calls.push(key);
    const response = fixtures[key];
    if (!response) {
      throw new Error(`No fixture for command: ${key}`);
    }

    return {
      status: response.status ?? 0,
      stdout:
        typeof response.stdout === 'string'
          ? response.stdout
          : JSON.stringify(response.stdout),
      stderr: response.stderr ?? '',
    };
  };

  runner.calls = calls;
  return runner;
}

function fullPath(relativePath) {
  return path.join(PROJECT_ROOT, relativePath);
}

describe('verifyGitHubState', () => {
  test('accepts a fully compliant state and reports production as fail-closed', () => {
    const result = verifyGitHubState(buildCompliantState());

    expect(result.status).toBe('pass');
    expect(result.productionState).toBe('fail_closed');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'production',
          subject: 'reviewer-topology',
        }),
      ]),
    );
  });

  test('fails when protect-dev is missing', () => {
    const state = buildCompliantState();
    state.rulesets = state.rulesets.filter(
      ruleset => ruleset.name !== 'protect-dev',
    );

    const result = verifyGitHubState(state);

    expect(result.status).toBe('fail');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'ruleset',
          subject: 'protect-dev',
        }),
      ]),
    );
  });

  test('fails when required check contexts or strictness drift', () => {
    const state = buildCompliantState();
    const statusRule = state.rulesets[0].rules.find(
      rule => rule.type === 'required_status_checks',
    );
    statusRule.parameters.required_status_checks = [
      { context: 'TypeScript Check' },
      { context: 'Lint' },
      { context: 'Test' },
      { context: 'Build iOS (Debug)' },
      { context: 'Build Android (Release)' },
    ];
    statusRule.parameters.strict_required_status_checks_policy = false;

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'ruleset',
          subject: 'protect-dev',
        }),
      ]),
    );
  });

  test('fails when non-fast-forward or review policy protections are missing', () => {
    const state = buildCompliantState();
    state.rulesets[1].rules = state.rulesets[1].rules.filter(
      rule => rule.type !== 'non_fast_forward',
    );
    const reviewRule = state.rulesets[1].rules.find(
      rule => rule.type === 'pull_request',
    );
    reviewRule.parameters.require_last_push_approval = false;

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'ruleset',
          subject: 'protect-main',
        }),
      ]),
    );
  });

  test('fails when a ruleset has bypass actors', () => {
    const state = buildCompliantState();
    state.rulesets[0].bypassActors = [
      { actor_id: 9603391, actor_type: 'RepositoryRole' },
    ];

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'ruleset',
          subject: 'protect-dev',
          message: expect.stringContaining('bypass actors'),
        }),
      ]),
    );
  });

  test('fails when ruleset enforcement, target, or ref conditions drift', () => {
    const state = buildCompliantState();
    state.rulesets[0].enforcement = 'evaluate';
    state.rulesets[0].target = 'tag';
    state.rulesets[0].refNameInclude = ['refs/heads/main'];
    state.rulesets[0].refNameExclude = ['refs/heads/dev'];

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'ruleset',
          subject: 'protect-dev',
          message: expect.stringContaining('must be active'),
        }),
        expect.objectContaining({
          scope: 'ruleset',
          subject: 'protect-dev',
          message: expect.stringContaining('must target branches'),
        }),
        expect.objectContaining({
          scope: 'ruleset',
          subject: 'protect-dev',
          message: expect.stringContaining('expected include refs/heads/dev'),
        }),
      ]),
    );
  });

  test('fails when a ruleset adds an excluded ref', () => {
    const state = buildCompliantState();
    state.rulesets[0].refNameExclude = ['refs/heads/release'];

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'ruleset',
          subject: 'protect-dev',
          message: expect.stringContaining(
            'include refs/heads/dev and exclude refs/heads/release',
          ),
        }),
      ]),
    );
  });

  test('fails when environment branch or tag policies drift', () => {
    const state = buildCompliantState();
    state.environments.find(
      environment => environment.name === 'release-query',
    ).deploymentBranchPolicy.patterns = [{ name: 'main', type: 'branch' }];

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'environment',
          subject: 'release-query',
        }),
      ]),
    );
  });

  test('fails when production self-review protection or admin bypass settings drift', () => {
    const state = buildCompliantState();
    const productionIos = state.environments.find(
      environment => environment.name === 'production-ios',
    );
    productionIos.preventSelfReview = false;
    productionIos.canAdminsBypass = true;

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'environment',
          subject: 'production-ios',
        }),
      ]),
    );
  });

  test('fails when required secret or variable names are missing', () => {
    const state = buildCompliantState();
    state.environments.find(
      environment => environment.name === 'release-ios',
    ).secretNames = ['ASC_KEY_ID'];
    state.repoVariables = state.repoVariables.filter(
      variable => variable !== 'GOOGLE_PLAY_TRACKS',
    );

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'environment-secret',
          subject: 'release-ios',
        }),
        expect.objectContaining({
          scope: 'repo-variable',
          subject: 'repository',
        }),
      ]),
    );
  });

  test('fails when release credentials appear in copilot or repository scope', () => {
    const state = buildCompliantState();
    state.environments.find(
      environment => environment.name === 'copilot',
    ).secretNames = ['ASC_KEY_CONTENT'];
    state.repoSecrets = [...state.repoSecrets, 'MATCH_PASSWORD'];

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'environment-secret',
          subject: 'copilot',
        }),
        expect.objectContaining({
          scope: 'repo-secret',
          subject: 'repository',
        }),
      ]),
    );
  });

  test('fails when Actions defaults allow writes or PR approvals', () => {
    const state = buildCompliantState();
    state.actionsPolicy.defaultWorkflowPermissions = 'write';
    state.actionsPolicy.canApprovePullRequestReviews = true;

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'actions',
          subject: 'workflow-permissions',
        }),
        expect.objectContaining({
          scope: 'actions',
          subject: 'workflow-pr-review-approval',
        }),
      ]),
    );
  });

  test('fails when Actions SHA enforcement drifts after refs are pinned', () => {
    const state = buildCompliantState();
    state.actionsPolicy.shaPinningRequired = false;

    const result = verifyGitHubState(state);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'actions',
          subject: 'sha-pinning',
        }),
      ]),
    );
  });
});

describe('collectGitHubState', () => {
  test('uses names-only commands and fetches complete ruleset details', () => {
    const repo = 'jmassardo/bambuddy-mobile';
    const fixtures = {
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/environments`]:
        {
          stdout: {
            total_count: 2,
            environments: [{ name: 'copilot' }, { name: 'release-query' }],
          },
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/environments/copilot`]:
        {
          stdout: {
            id: 1,
            name: 'copilot',
            can_admins_bypass: true,
            protection_rules: [],
            deployment_branch_policy: null,
          },
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/environments/release-query`]:
        {
          stdout: {
            id: 2,
            name: 'release-query',
            can_admins_bypass: false,
            protection_rules: [{ type: 'branch_policy' }],
            deployment_branch_policy: {
              protected_branches: false,
              custom_branch_policies: true,
            },
          },
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/environments/release-query/deployment-branch-policies`]:
        {
          stdout: {
            total_count: 1,
            branch_policies: [{ name: 'dev', type: 'branch' }],
          },
        },
      [`gh secret list --repo ${repo} --env copilot --json name`]: {
        stdout: [],
      },
      [`gh secret list --repo ${repo} --env release-query --json name`]: {
        stdout: [],
      },
      [`gh variable list --repo ${repo} --env copilot --json name`]: {
        stdout: [],
      },
      [`gh variable list --repo ${repo} --env release-query --json name`]: {
        stdout: [],
      },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}`]:
        {
          stdout: {
            allow_merge_commit: true,
          },
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/rulesets`]:
        {
          stdout: [{ id: 91, name: 'protect-dev' }],
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/rulesets/91`]:
        {
          stdout: {
            id: 91,
            name: 'protect-dev',
            enforcement: 'active',
            target: 'branch',
            conditions: {
              ref_name: {
                include: ['refs/heads/dev'],
                exclude: [],
              },
            },
            bypass_actors: [],
            rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
          },
        },
      [`gh secret list --repo ${repo} --json name`]: {
        stdout: REPO_DEMO_SECRETS.map(name => ({ name })),
      },
      [`gh variable list --repo ${repo} --json name`]: {
        stdout: REQUIRED_REPO_VARIABLES.map(name => ({ name })),
      },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/collaborators?affiliation=direct`]:
        {
          stdout: [{ login: 'jmassardo', id: 9603391, role_name: 'admin' }],
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/actions/permissions`]:
        {
          stdout: {
            allowed_actions: 'all',
            sha_pinning_required: false,
          },
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/actions/permissions/workflow`]:
        {
          stdout: {
            default_workflow_permissions: 'read',
            can_approve_pull_request_reviews: false,
          },
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/branches/dev`]:
        {
          stdout: { protected: false },
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/branches/main`]:
        {
          stdout: { protected: false },
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/branches/dev/protection`]:
        {
          status: 1,
          stdout: { message: 'Not Found', status: '404' },
          stderr: 'gh: Not Found (HTTP 404)',
        },
      [`gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/${repo}/branches/main/protection`]:
        {
          status: 1,
          stdout: { message: 'Not Found', status: '404' },
          stderr: 'gh: Not Found (HTTP 404)',
        },
    };
    const runner = buildRunner(fixtures);
    const trackedFiles = ['.github/workflows/ci.yml'];
    const readFile = filePath => {
      if (filePath !== fullPath('.github/workflows/ci.yml')) {
        throw new Error(`Unexpected file read: ${filePath}`);
      }

      return 'jobs:\n  lint:\n    steps:\n      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567\n';
    };

    const state = collectGitHubState({
      repo,
      runCommand: runner,
      readFile,
      trackedFiles,
    });
    const commandLog = runner.calls.join('\n');
    const report = renderTextReport(verifyGitHubState(state));

    expect(commandLog).toContain(
      'gh variable list --repo jmassardo/bambuddy-mobile --json name',
    );
    expect(commandLog).toContain(
      'gh variable list --repo jmassardo/bambuddy-mobile --env release-query --json name',
    );
    expect(commandLog).not.toContain('/actions/variables');
    expect(commandLog).not.toContain('value');
    expect(commandLog).toContain(
      'gh api -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 repos/jmassardo/bambuddy-mobile/rulesets/91',
    );
    expect(state.rulesets).toEqual([
      expect.objectContaining({
        id: 91,
        name: 'protect-dev',
        refNameInclude: ['refs/heads/dev'],
        refNameExclude: [],
        bypassActors: [],
        rules: [
          { type: 'deletion', parameters: {} },
          { type: 'non_fast_forward', parameters: {} },
        ],
      }),
    ]);
    expect(report).not.toContain('super-secret-value');
  });

  test('CLI returns nonzero structured secret-free output for failed commands', () => {
    const sensitiveOutput = 'token=not-for-reporting';
    const output = [];
    let exitCode = 0;
    const result = main(['--repo', 'jmassardo/bambuddy-mobile'], {
      runCommand: () => ({
        status: 1,
        stdout: sensitiveOutput,
        stderr: sensitiveOutput,
      }),
      trackedFiles: [],
      writeOutput: entry => output.push(entry),
      setExitCode: code => {
        exitCode = code;
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'fail',
        productionState: 'fail_closed',
        collectionFailure: true,
        errors: [
          expect.objectContaining({
            scope: 'read-only-command',
            subject: 'get repository metadata',
            remediation: expect.stringContaining('do not broaden'),
          }),
        ],
      }),
    );
    expect(exitCode).toBe(1);
    expect(output).toHaveLength(2);
    expect(output[0]).toContain('status=fail');
    expect(JSON.parse(output[1])).toEqual(result);
    expect(output.join('\n')).not.toContain(sensitiveOutput);
  });

  test('CLI returns nonzero structured secret-free output for malformed JSON', () => {
    const malformedOutput = '{"credential":"not-for-reporting"';
    const output = [];
    let exitCode = 0;
    const result = main(['--repo', 'jmassardo/bambuddy-mobile'], {
      runCommand: () => ({
        status: 0,
        stdout: malformedOutput,
        stderr: '',
      }),
      trackedFiles: [],
      writeOutput: entry => output.push(entry),
      setExitCode: code => {
        exitCode = code;
      },
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        scope: 'malformed-data',
        subject: 'get repository metadata',
        remediation: expect.stringContaining('read-only GitHub response'),
      }),
    ]);
    expect(exitCode).toBe(1);
    expect(output).toHaveLength(2);
    expect(output[0]).toContain('malformed-data:get repository metadata');
    expect(JSON.parse(output[1])).toEqual(result);
    expect(output.join('\n')).not.toContain(malformedOutput);
  });
});

describe('scanTrackedFiles', () => {
  test('flags mutable action refs', () => {
    const files = ['.github/workflows/release.yml'];
    const readFile = filePath => {
      if (filePath !== fullPath('.github/workflows/release.yml')) {
        throw new Error(`Unexpected file read: ${filePath}`);
      }

      return 'steps:\n  - uses: actions/checkout@v7\n';
    };

    const scan = scanTrackedFiles(files, readFile);

    expect(scan.unpinnedActions).toEqual([
      expect.objectContaining({
        filePath: '.github/workflows/release.yml',
        lineNumber: 2,
        reference: 'actions/checkout@v7',
      }),
    ]);
  });

  test('flags forbidden shared temp path literals', () => {
    const files = ['scripts/release/materialize.sh'];
    const readFile = filePath => {
      if (filePath !== fullPath('scripts/release/materialize.sh')) {
        throw new Error(`Unexpected file read: ${filePath}`);
      }

      return [
        `KEY_FILE=${SYSTEM_TEMP_PATHS[1]}/asc-key.p8`,
        `STORE_FILE=${SYSTEM_TEMP_PATHS[0]}/release.keystore`,
      ].join('\n');
    };

    const scan = scanTrackedFiles(files, readFile);

    expect(scan.tempPathFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: 'scripts/release/materialize.sh',
          lineNumber: 1,
        }),
        expect.objectContaining({
          filePath: 'scripts/release/materialize.sh',
          lineNumber: 2,
        }),
      ]),
    );
  });

  test('flags credential materialization without guaranteed cleanup', () => {
    const files = ['scripts/release/materialize.js'];
    const readFile = filePath => {
      if (filePath !== fullPath('scripts/release/materialize.js')) {
        throw new Error(`Unexpected file read: ${filePath}`);
      }

      return [
        "const fs = require('node:fs');",
        "fs.writeFileSync('release.p8', process.env.ASC_KEY_CONTENT);",
      ].join('\n');
    };

    const scan = scanTrackedFiles(files, readFile);

    expect(scan.cleanupControlFindings).toEqual([
      expect.objectContaining({
        filePath: 'scripts/release/materialize.js',
      }),
    ]);
  });

  test('accepts credential materialization when cleanup is explicit', () => {
    const files = ['scripts/release/materialize.js'];
    const readFile = filePath => {
      if (filePath !== fullPath('scripts/release/materialize.js')) {
        throw new Error(`Unexpected file read: ${filePath}`);
      }

      return [
        "const fs = require('node:fs');",
        'try {',
        "  fs.writeFileSync('release.p8', process.env.ASC_KEY_CONTENT);",
        '} finally {',
        "  fs.rmSync('release.p8', {force: true});",
        '}',
      ].join('\n');
    };

    const scan = scanTrackedFiles(files, readFile);

    expect(scan.cleanupControlFindings).toEqual([]);
  });
});

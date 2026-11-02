'use strict';

const { execFileSync } = require('node:child_process');

const repository = 'jmassardo/bambuddy-mobile';
const environments = {
  'release-query': {
    branch: 'develop',
    secrets: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_CONTENT', 'GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT', 'RELEASE_AUTOMATION_APP_PRIVATE_KEY'],
  },
  'release-ios': {
    branch: 'develop',
    secrets: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_CONTENT', 'MATCH_PASSWORD', 'MATCH_GIT_PRIVATE_KEY'],
  },
  'release-android': {
    branch: 'develop',
    secrets: ['GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT', 'BAMBUDDY_RELEASE_STORE_CONTENT', 'BAMBUDDY_RELEASE_STORE_PASSWORD', 'BAMBUDDY_RELEASE_KEY_ALIAS', 'BAMBUDDY_RELEASE_KEY_PASSWORD'],
  },
  'production-ios': {
    branch: 'main',
    secrets: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_CONTENT'],
  },
  'production-android': {
    branch: 'main',
    secrets: ['GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT'],
  },
};

function gh(args, body) {
  return JSON.parse(execFileSync('gh', args, {
    encoding: 'utf8', input: body ? JSON.stringify(body) : undefined,
  }) || 'null');
}

function request(endpoint, method = 'GET', body) {
  const root = `repos/${repository}`;
  return gh(['api', endpoint ? `${root}/${endpoint}` : root, '--method', method, ...(body ? ['--input', '-'] : [])], body);
}

function activate(apply = false) {
  const missing = [];
  for (const [name, environment] of Object.entries(environments)) {
    const names = new Set(gh(['secret', 'list', '--repo', repository, '--env', name, '--json', 'name']).map(secret => secret.name));
    for (const secret of environment.secrets) {
      if (!names.has(secret)) missing.push(`${name}/${secret}`);
    }
  }
  const variableNames = new Set(gh(['variable', 'list', '--repo', repository, '--json', 'name']).map(variable => variable.name));
  for (const name of ['APPLE_TEAM_ID', 'MATCH_GIT_URL', 'RELEASE_AUTOMATION_APP_ID']) {
    if (!variableNames.has(name)) missing.push(`repository variable ${name}`);
  }
  if (missing.length) {
    console.error(`Activation blocked; missing configuration names:\n${missing.join('\n')}`);
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log('Required configuration names are present. Use --apply after verifying credential access to activate automatic releases.');
    return;
  }
  for (const [name, environment] of Object.entries(environments)) {
    request(`environments/${name}`, 'PUT', {
      wait_timer: 0, prevent_self_review: false, reviewers: [], can_admins_bypass: false,
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    });
    const policies = request(`environments/${name}/deployment-branch-policies`);
    const desired = policies.branch_policies.find(policy => policy.type === 'branch' && policy.name === environment.branch);
    if (!desired) request(`environments/${name}/deployment-branch-policies`, 'POST', { name: environment.branch, type: 'branch' });
    for (const policy of policies.branch_policies) {
      if (policy.type !== 'branch' || policy.name !== environment.branch) {
        request(`environments/${name}/deployment-branch-policies/${policy.id}`, 'DELETE');
      }
    }
  }
  const rulesets = request('rulesets');
  const name = 'automated-tested-store-release';
  const existing = rulesets.find(rule => rule.name === name);
  const ruleset = {
    name, target: 'branch', enforcement: 'active', bypass_actors: [],
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      { type: 'deletion' }, { type: 'non_fast_forward' },
      { type: 'pull_request', parameters: {
        required_approving_review_count: 0, dismiss_stale_reviews_on_push: true,
        require_last_push_approval: false, required_review_thread_resolution: true,
        require_code_owner_review: false, allowed_merge_methods: ['merge'],
      } },
      { type: 'required_status_checks', parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: ['TypeScript Check', 'Lint', 'Test', 'Release Candidate'].map(context => ({ context, integration_id: 15368 })),
      } },
    ],
  };
  request(existing ? `rulesets/${existing.id}` : 'rulesets', existing ? 'PUT' : 'POST', ruleset);
  request('', 'PATCH', { allow_auto_merge: true, allow_merge_commit: true });
  console.log('Automatic release environments and exact-candidate merge gates configured. Existing unrelated rulesets were preserved.');
}

if (require.main === module) activate(process.argv.includes('--apply'));
module.exports = { environments, activate };

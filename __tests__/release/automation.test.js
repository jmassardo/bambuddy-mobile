'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { execFileSync } = require('node:child_process');
const { activate, environments } = require('../../scripts/release/configure-automation');

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));

const workflow = name => yaml.load(fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows', name), 'utf8',
));
const candidate = workflow('release-candidate.yml');
const promotion = workflow('release-promotion.yml');
const ci = workflow('ci.yml');
let missing;
let mutations;
let originalExitCode;

beforeEach(() => {
  originalExitCode = process.exitCode;
  missing = false;
  mutations = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  execFileSync.mockImplementation((command, args, options) => {
    expect(command).toBe('gh');
    if (args[0] === 'secret') {
      const environment = args[args.indexOf('--env') + 1];
      return JSON.stringify(environments[environment].secrets
        .filter(name => !(missing && name === 'MATCH_PASSWORD'))
        .map(name => ({ name })));
    }
    if (args[0] === 'variable') {
      return JSON.stringify(['APPLE_TEAM_ID', 'MATCH_GIT_URL', 'RELEASE_AUTOMATION_APP_ID'].map(name => ({ name })));
    }
    const endpoint = args[1];
    const method = args[args.indexOf('--method') + 1];
    if (method !== 'GET') {
      mutations.push({ endpoint, method, body: options.input ? JSON.parse(options.input) : undefined });
      return method === 'DELETE' ? '' : '{}';
    }
    if (endpoint.endsWith('/deployment-branch-policies')) {
      return JSON.stringify({ branch_policies: [{ id: 1, name: 'v*', type: 'tag' }] });
    }
    if (endpoint.endsWith('/rulesets')) return JSON.stringify([{ id: 9, name: 'unrelated-protection' }]);
    throw new Error(`Unexpected request: ${endpoint}`);
  });
});

afterEach(() => {
  process.exitCode = originalExitCode;
  jest.restoreAllMocks();
});

test('missing credentials block activation before any configuration mutation', () => {
  missing = true;
  activate(true);
  expect(process.exitCode).toBe(1);
  expect(mutations).toEqual([]);
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining('release-ios/MATCH_PASSWORD'));
});

test('default configuration preflight is read-only even when names are complete', () => {
  activate();
  expect(mutations).toEqual([]);
});

test('activation scopes credentials to their branches and preserves unrelated rulesets', () => {
  activate(true);
  for (const [name, environment] of Object.entries(environments)) {
    expect(mutations).toContainEqual(expect.objectContaining({
      endpoint: `repos/jmassardo/bambuddy-mobile/environments/${name}`,
      body: expect.objectContaining({ reviewers: [], deployment_branch_policy: {
        protected_branches: false, custom_branch_policies: true,
      } }),
    }));
    expect(mutations).toContainEqual(expect.objectContaining({
      endpoint: `repos/jmassardo/bambuddy-mobile/environments/${name}/deployment-branch-policies`,
      body: { name: environment.branch, type: 'branch' },
    }));
  }
  const rules = mutations.find(change => change.endpoint.endsWith('/rulesets')).body;
  expect(rules.conditions.ref_name.include).toEqual(['refs/heads/main']);
  expect(rules.bypass_actors).toEqual([]);
  expect(rules.rules.find(rule => rule.type === 'required_status_checks').parameters).toEqual({
    strict_required_status_checks_policy: true,
    required_status_checks: ['TypeScript Check', 'Lint', 'Test', 'Release Candidate'].map(context => ({
      context, integration_id: 15368,
    })),
  });
  expect(mutations.some(change => change.endpoint.endsWith('/rulesets/9'))).toBe(false);
  expect(mutations).toContainEqual({
    endpoint: 'repos/jmassardo/bambuddy-mobile',
    method: 'PATCH',
    body: { allow_auto_merge: true, allow_merge_commit: true },
  });
});

test('both signed candidates require the same prepared commit and passing quality gate', () => {
  for (const platform of ['ios', 'android']) {
    expect(candidate.jobs[platform].needs).toEqual(['prepare', 'quality']);
    expect(candidate.jobs[platform].steps[0].with.ref).toBe('${{ needs.prepare.outputs.commit }}');
  }
  expect(candidate.jobs['publish-record'].needs).toEqual(['prepare', 'quality', 'ios', 'android']);
  expect(candidate.jobs['release-pr'].needs).toEqual(['prepare', 'publish-record']);
  expect(candidate.jobs.quality.steps.map(step => step.run).filter(Boolean)).toEqual([
    'npm ci', 'npm run typecheck', 'npm run lint', 'npm test -- --ci --coverage',
  ]);
});

test('main and main-bound PRs cannot rebuild app binaries', () => {
  expect(promotion.on.push.branches).toEqual(['main']);
  for (const job of Object.values(promotion.jobs)) {
    for (const step of job.steps) {
      expect(step.run || '').not.toMatch(/npm (?:ci|install)|pod install|gradlew|xcodebuild|fastlane .*?(?:build_|release_candidate|beta)/);
    }
  }
  for (const platform of ['ios', 'android']) {
    expect(promotion.jobs[platform].needs).toBe('verify');
    expect(ci.jobs[`build-${platform}`].if).toContain("github.base_ref != 'main'");
  }
  expect(ci.jobs['release-candidate'].if).toBe("github.event_name == 'pull_request' && github.base_ref == 'main'");
  expect(promotion.jobs['sync-develop'].needs).toEqual(['verify', 'ios', 'android']);
});

test('jobs that materialize credentials always remove them, including after a failure', () => {
  for (const job of [candidate.jobs.prepare, candidate.jobs.ios, candidate.jobs.android, promotion.jobs.android]) {
    expect(job.steps.at(-1)).toMatchObject({
      if: 'always()', run: 'node scripts/release/pipeline.js cleanup-credentials',
    });
  }
});

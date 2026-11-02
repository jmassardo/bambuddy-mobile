'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { nextVersion, allocateRelease, validateContext, checkRun } = require('../../scripts/release/pipeline');
const { readReleaseMetadata } = require('../../scripts/release/metadata');
const { parseChangelog } = require('../../scripts/release/changelog');

const root = path.resolve(__dirname, '../..');
const pipelinePath = path.join(root, 'scripts/release/pipeline.js');
const metadataPath = path.join(root, 'scripts/release/metadata.js');
const metadataFiles = [
  'package.json', 'package-lock.json', 'CHANGELOG.md',
  'android/app/build.gradle', 'ios/Bambuddy.xcodeproj/project.pbxproj',
];
let directory;
let context;
let candidate;

function git(...args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
}

function runInfo() {
  return {
    id: 123, run_attempt: 1, repository: { full_name: 'jmassardo/bambuddy-mobile' },
    event: 'push', head_branch: 'develop', head_sha: context.sourceCommit,
    path: '.github/workflows/release-candidate.yml', status: 'completed', conclusion: 'success',
  };
}

function verify(run = runInfo(), commit = candidate) {
  const result = spawnSync(process.execPath, ['-e',
    `require(${JSON.stringify(pipelinePath)}).verify('release-artifacts', ${JSON.stringify(commit)}, async () => (${JSON.stringify(run)})).catch(error => { console.error(error.message); process.exitCode = 1; });`,
  ], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: 'jmassardo/bambuddy-mobile' },
  });
  if (result.error) throw result.error;
  return result;
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bambuddy-release-proof-'));
  for (const file of metadataFiles) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  const baseline = readReleaseMetadata(directory, { allowEmptyUnreleased: true });
  const version = nextVersion([baseline.version]);
  const buildNumber = Math.max(baseline.iosBuild, baseline.androidVersionCode, 99) + 1;
  const changelogPath = path.join(directory, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  if (!parseChangelog(changelog, { allowEmptyUnreleased: true }).unreleasedBody) {
    fs.writeFileSync(changelogPath, changelog.replace(/^## \[Unreleased\]\r?$/m,
      '## [Unreleased]\n\n### Changed\n\n- Release test fixture.'));
  }
  git('init', '--quiet');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release-test@example.invalid');
  git('add', '.');
  git('commit', '--quiet', '-m', 'main baseline');
  const mainBase = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(directory, 'feature.txt'), 'tested feature\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'develop change');
  context = {
    sourceCommit: git('rev-parse', 'HEAD'), mainBase, version,
    buildNumber, runId: '123', runAttempt: '1', branch: `release/candidate/v${version}`,
  };
  execFileSync(process.execPath, ['-e',
    `require(${JSON.stringify(metadataPath)}).applyReleaseMetadataUpdate('.', ${JSON.stringify({
      version, date: '2026-11-01', iosBuild: buildNumber, androidVersionCode: buildNumber,
    })});`,
  ], { cwd: directory });
  fs.mkdirSync(path.join(directory, '.release'));
  fs.writeFileSync(path.join(directory, '.release/candidate.json'), JSON.stringify(context));
  git('add', '.');
  git('commit', '--quiet', '-m', 'candidate metadata');
  candidate = git('rev-parse', 'HEAD');
  fs.mkdirSync(path.join(directory, 'release-artifacts'));
  fs.writeFileSync(path.join(directory, 'release-artifacts/Bambuddy.ipa'), 'signed ios candidate');
  fs.writeFileSync(path.join(directory, 'release-artifacts/app-release.aab'), 'signed android candidate');
  execFileSync(process.execPath, [pipelinePath, 'record', 'release-artifacts'], { cwd: directory });
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

it('removes materialized signing credentials without touching other runner files', () => {
  const env = {
    ...process.env,
    RUNNER_TEMP: directory,
    GITHUB_ENV: path.join(directory, 'github-env'),
    GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT: JSON.stringify({
      private_key: 'test-only-private-key', client_email: 'test@example.invalid',
    }),
    BAMBUDDY_RELEASE_STORE_CONTENT: Buffer.from('test-only-keystore').toString('base64'),
  };
  execFileSync(process.execPath, [pipelinePath, 'credentials', 'android'], { env });
  const google = path.join(directory, 'bambuddy-google-service-account.json');
  const keystore = path.join(directory, 'bambuddy-release.keystore');
  expect(fs.statSync(google).mode & 0o777).toBe(0o600);
  expect(fs.statSync(keystore).mode & 0o777).toBe(0o600);
  execFileSync(process.execPath, [pipelinePath, 'cleanup-credentials'], { env });
  expect(fs.existsSync(google)).toBe(false);
  expect(fs.existsSync(keystore)).toBe(false);
  expect(fs.readFileSync(path.join(directory, 'feature.txt'), 'utf8')).toBe('tested feature\n');
});

it('rejects rerunning preparation before it can reserve a new version under existing artifacts', () => {
  const result = spawnSync(process.execPath, [pipelinePath, 'prepare'], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, GITHUB_REF: 'refs/heads/develop', GITHUB_RUN_ATTEMPT: '2' },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Candidate preparation cannot be rerun');
});

it('queries the canonical repository endpoint before allowing a candidate build', () => {
  const result = spawnSync(process.execPath, ['-e', `
    global.fetch = async url => url === 'https://api.github.com/repos/jmassardo/bambuddy-mobile'
      ? {ok:true,status:200,json:async()=>({allow_auto_merge:false})}
      : {ok:false,status:404};
    require(${JSON.stringify(pipelinePath)}).main('prepare')
      .catch(error=>{console.error(error.message);process.exitCode=1;});
  `], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, GITHUB_REF: 'refs/heads/develop', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REPOSITORY: 'jmassardo/bambuddy-mobile', GITHUB_TOKEN: 'test-only-token' },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Enable repository auto-merge before building release candidates');
});

it.each([
  { status: 200, keys: ['ssh-ed25519 AAAATEST=='], error: null },
  { status: 200, keys: ['ssh-rsa AAAATEST=='], error: 'GitHub did not provide an Ed25519 SSH host key' },
  { status: 503, keys: [], error: 'Unable to verify GitHub SSH host keys (503)' },
])('pins Match SSH access to verified host keys (HTTP $status, error: $error)', ({ status, keys, error }) => {
  const env = {
    ...process.env, RUNNER_TEMP: directory, GITHUB_ENV: path.join(directory, 'github-env'),
    GITHUB_TOKEN: 'test-only-token',
    MATCH_GIT_PRIVATE_KEY_CONTENT: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest-only-key\n-----END OPENSSH PRIVATE KEY-----\n',
  };
  const result = spawnSync(process.execPath, ['-e', `
    global.fetch = async () => ({ok:${status === 200},status:${status},json:async()=>({ssh_keys:${JSON.stringify(keys)}})});
    require(${JSON.stringify(pipelinePath)}).main('credentials','match')
      .catch(error=>{console.error(error.message);process.exitCode=1;});
  `], { env, encoding: 'utf8' });
  const privatePath = path.join(directory, 'bambuddy-match-deploy-key');
  const hostsPath = path.join(directory, 'bambuddy-github-known-hosts');
  expect(fs.statSync(privatePath).mode & 0o777).toBe(0o600);
  if (error) {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
    expect(fs.existsSync(path.join(directory, 'github-env'))).toBe(false);
  } else {
    expect(result.status).toBe(0);
    expect(fs.readFileSync(hostsPath, 'utf8')).toBe('github.com ssh-ed25519 AAAATEST==\n');
    const exported = fs.readFileSync(path.join(directory, 'github-env'), 'utf8');
    expect(exported).toContain(`MATCH_GIT_PRIVATE_KEY=${privatePath}\n`);
    expect(exported).toContain('StrictHostKeyChecking=yes');
    expect(exported).toContain(`UserKnownHostsFile='${hostsPath}'`);
    expect(exported).not.toContain('test-only-key');
  }
  execFileSync(process.execPath, [pipelinePath, 'cleanup-credentials'], { env });
  expect(fs.existsSync(privatePath)).toBe(false);
  expect(fs.existsSync(hostsPath)).toBe(false);
});

it.each([false, true])('synchronizes develop only when no newer work exists (newer: %s)', newer => {
  const resultPath = path.join(directory, 'sync-result.json');
  const head = newer ? 'f'.repeat(40) : context.sourceCommit;
  const result = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push({url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined});
      return {ok: true, status: 200, json: async () => ({object: {sha: ${JSON.stringify(head)}}})};
    };
    require(${JSON.stringify(pipelinePath)}).main('sync-develop')
      .then(() => fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(requests)))
      .catch(error => {console.error(error.message); process.exitCode = 1;});
  `], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: 'jmassardo/bambuddy-mobile', GITHUB_TOKEN: 'test-only-token' },
  });
  expect(result.status).toBe(0);
  const requests = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  expect(requests).toHaveLength(newer ? 1 : 2);
  if (!newer) expect(requests[1]).toMatchObject({ method: 'PATCH', body: { sha: candidate, force: false } });
});

it.each([false, true])('opens or reuses the candidate PR without republishing artifacts (existing: %s)', existing => {
  const resultPath = path.join(directory, 'pr-result.json');
  const result = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const child = require('node:child_process');
    const exec = child.execFileSync;
    const requests = [];
    child.execFileSync = (command, args, options) => {
      if (command !== 'gh') return exec(command, args, options);
      requests.push({command, args});
    };
    global.fetch = async (url, options) => {
      requests.push({url, method: options.method});
      const body = url.includes('git/ref/') ? {object: {sha: ${JSON.stringify(context.sourceCommit)}}}
        : url.includes('pulls?') ? ${existing ? '[{number: 7}]' : '[]'} : {number: 7};
      return {ok: true, status: 200, json: async () => body};
    };
    require(${JSON.stringify(pipelinePath)}).main('open-pr')
      .then(() => fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(requests)))
      .catch(error => {console.error(error.message); process.exitCode = 1;});
  `], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: 'jmassardo/bambuddy-mobile', GITHUB_TOKEN: 'test-only-token' },
  });
  expect(result.status).toBe(0);
  const requests = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  expect(requests.filter(request => request.method === 'POST')).toHaveLength(existing ? 0 : 1);
  expect(requests.at(-1)).toEqual({
    command: 'gh', args: ['pr', 'merge', '7', '--auto', '--merge', '--match-head-commit', candidate],
  });
});

it('increments beyond main, store and concurrent candidate reservations without reusing a version', () => {
  expect(nextVersion(['1.1.0', '1.1.4', '1.1.2'])).toBe('1.1.5');
  expect(() => nextVersion(['1.1.0', '1.1.2-beta'])).toThrow();
});

it('retries a competing allocation using fast-forward history instead of duplicating its version/build', async () => {
  let head = 'a'.repeat(40);
  let state = { version: '1.1.1', buildNumber: 100 };
  const trees = new Map();
  const commits = new Map();
  let count = 0;
  let raced = false;
  const conflict = () => Object.assign(new Error('Not a fast-forward'), { status: 422 });
  const client = async (endpoint, method, body) => {
    if (endpoint === 'git/ref/heads/release/state') return { object: { sha: head } };
    if (endpoint.startsWith('contents/')) return { content: Buffer.from(JSON.stringify(state)).toString('base64') };
    if (endpoint === 'git/trees') {
      const sha = `tree-${++count}`;
      trees.set(sha, JSON.parse(body.tree[0].content));
      return { sha };
    }
    if (endpoint === 'git/commits') {
      const sha = `commit-${++count}`;
      commits.set(sha, { parent: body.parents[0], state: trees.get(body.tree) });
      return { sha };
    }
    if (endpoint === 'git/refs/heads/release/state' && method === 'PATCH') {
      if (!raced) {
        raced = true;
        head = 'b'.repeat(40);
        state = { version: '1.1.2', buildNumber: 101 };
      }
      const commit = commits.get(body.sha);
      if (!body.force && commit.parent !== head) throw conflict();
      head = body.sha;
      state = commit.state;
      return {};
    }
    throw new Error('Unexpected allocation API call');
  };
  expect(await allocateRelease(['1.1.0'], 100, client)).toEqual({ version: '1.1.3', buildNumber: 102 });
});

it('accepts only the exact tested candidate tree and signed artifacts', () => {
  expect(verify().status).toBe(0);
});

it('accepts a merge commit without rebuilding when its tree is identical to the candidate', () => {
  git('checkout', '--quiet', '-b', 'main-release', context.mainBase);
  git('merge', '--quiet', '--no-ff', '-m', 'promote candidate', candidate);
  expect(git('rev-parse', 'HEAD')).not.toBe(candidate);
  expect(verify().status).toBe(0);
});

it.each(['Bambuddy.ipa', 'app-release.aab'])('rejects substituted %s even if the source commit matches', artifact => {
  fs.appendFileSync(path.join(directory, 'release-artifacts', artifact), '\nsubstitution');
  const result = verify();
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Manifest identity does not match/);
});

it('rejects a main merge containing untested changes', () => {
  fs.appendFileSync(path.join(directory, 'feature.txt'), 'untested fix');
  git('add', 'feature.txt');
  git('commit', '--quiet', '-m', 'unexpected main change');
  expect(verify().stderr).toMatch(/Untested commit or merged tree/);
});

it('rejects a different candidate commit rather than selecting a newer build', () => {
  expect(verify(runInfo(), context.sourceCommit).stderr).toMatch(/Untested commit or merged tree/);
});

it('rejects a changed release context in the downloaded record', () => {
  const filename = path.join(directory, 'release-artifacts/release-record.json');
  const record = JSON.parse(fs.readFileSync(filename, 'utf8'));
  record.context.buildNumber++;
  fs.writeFileSync(filename, JSON.stringify(record));
  expect(verify().stderr).toMatch(/context does not match/);
});

it.each([
  { conclusion: 'failure' }, { head_branch: 'main' },
  { head_sha: 'a'.repeat(40) }, { repository: { full_name: 'another/repository' } },
  { id: 124 }, { path: '.github/workflows/ci.yml' },
])('rejects a failed or unrelated build run (%j)', override => {
  const result = verify({ ...runInfo(), ...override });
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Candidate run is not the successful tested develop release/);
});

it('permits a successful failed-job retry without changing the candidate identity', () => {
  expect(() => checkRun(context, { ...runInfo(), run_attempt: 2 }, 'jmassardo/bambuddy-mobile')).not.toThrow();
});

it.each([0, 2100000001, '100'])('rejects an invalid build number %s', buildNumber => {
  expect(() => validateContext({ ...context, buildNumber })).toThrow(/build number/);
});

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { compareSemVer, parseStrictSemVer } = require('./semver');
const { applyReleaseMetadataUpdate, readReleaseMetadata, ANDROID_VERSION_CODE_MAX } = require('./metadata');
const { createReleaseManifest, validateReleaseManifest } = require('./manifest');
const { parseChangelog } = require('./changelog');

const WORKFLOW = 'Release Candidate';
const CONTEXT_PATH = '.release/candidate.json';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function output(values) {
  for (const [name, value] of Object.entries(values)) {
    if (/[\r\n]/.test(String(value))) throw new Error('Invalid workflow output');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

async function api(endpoint, method = 'GET', body) {
  const root = `https://api.github.com/repos/${required('GITHUB_REPOSITORY')}`;
  const response = await fetch(endpoint ? `${root}/${endpoint}` : root, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN || required('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = new Error(`GitHub release API failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? undefined : response.json();
}

function nextVersion(versions) {
  if (!versions.length) throw new Error('No release version baseline');
  const latest = versions.map(parseStrictSemVer).sort(compareSemVer).at(-1);
  if (!Number.isSafeInteger(latest.patch + 1)) throw new Error('Release version overflow');
  return `${latest.major}.${latest.minor}.${latest.patch + 1}`;
}

function validateContext(context) {
  const keys = ['sourceCommit', 'mainBase', 'version', 'buildNumber', 'runId', 'runAttempt', 'branch'];
  if (!context || Object.keys(context).sort().join() !== [...keys].sort().join()) {
    throw new Error('Invalid release context schema');
  }
  for (const name of ['sourceCommit', 'mainBase']) {
    if (!/^[a-f0-9]{40}$/.test(context[name])) throw new Error(`Invalid release ${name}`);
  }
  parseStrictSemVer(context.version);
  if (!Number.isSafeInteger(context.buildNumber) || context.buildNumber < 1 || context.buildNumber > ANDROID_VERSION_CODE_MAX) {
    throw new Error('Invalid release build number');
  }
  for (const name of ['runId', 'runAttempt']) {
    if (!/^[1-9]\d*$/.test(context[name]) || !Number.isSafeInteger(Number(context[name]))) throw new Error(`Invalid release ${name}`);
  }
  if (context.branch !== `release/candidate/v${context.version}`) throw new Error('Invalid release branch');
  return context;
}

function contextFrom(root = '.') {
  return validateContext(JSON.parse(fs.readFileSync(path.join(root, CONTEXT_PATH), 'utf8')));
}

async function allocateRelease(versions, nextBuildNumber, client = api) {
  for (let attempt = 0; attempt < 20; attempt++) {
    let head;
    let previous;
    try {
      head = await client('git/ref/heads/release/state');
      const file = await client(`contents/.release/state.json?ref=${head.object.sha}`);
      previous = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
      parseStrictSemVer(previous.version);
      if (!Number.isSafeInteger(previous.buildNumber) || previous.buildNumber < 1) throw new Error('Invalid release allocation state');
    } catch (error) {
      if (error.status !== 404 || head) throw error;
    }
    const version = nextVersion(previous ? [...versions, previous.version] : versions);
    const buildNumber = Math.max(nextBuildNumber, (previous?.buildNumber ?? 0) + 1);
    if (!Number.isSafeInteger(buildNumber) || buildNumber < 1 || buildNumber > ANDROID_VERSION_CODE_MAX) {
      throw new Error('Invalid next store build number');
    }
    const tree = await client('git/trees', 'POST', {
      tree: [{ path: '.release/state.json', mode: '100644', type: 'blob', content: JSON.stringify({ version, buildNumber, reservationId: randomUUID() }) }],
    });
    const commit = await client('git/commits', 'POST', {
      message: `Reserve release ${version} (${buildNumber})`,
      tree: tree.sha, parents: head ? [head.object.sha] : [],
    });
    try {
      if (head) {
        await client('git/refs/heads/release/state', 'PATCH', { sha: commit.sha, force: false });
      } else {
        await client('git/refs', 'POST', { ref: 'refs/heads/release/state', sha: commit.sha });
      }
      return { version, buildNumber };
    } catch (error) {
      if (error.status !== 422) throw error;
      // A competing fast-forward reservation won. Re-read it; never force a ref.
    }
  }
  throw new Error('Release reservation contention; retry the candidate run');
}

async function prepare() {
  if (required('GITHUB_REF') !== 'refs/heads/develop') throw new Error('Candidates must originate from develop');
  if (required('GITHUB_RUN_ATTEMPT') !== '1') {
    throw new Error('Candidate preparation cannot be rerun; start a fresh develop run instead of replacing existing artifacts');
  }
  const repository = await api('');
  if (!repository.allow_auto_merge) throw new Error('Enable repository auto-merge before building release candidates');
  const rules = await api('rules/branches/main');
  if (!rules.some(rule => rule.type === 'required_status_checks' &&
    rule.parameters?.required_status_checks?.some(check => check.context === 'Release Candidate'))) {
    throw new Error('Protect main with the Release Candidate required check before enabling releases');
  }
  const sourceCommit = required('GITHUB_SHA');
  if (git('rev-parse', 'HEAD') !== sourceCommit) throw new Error('Source checkout changed');
  git('fetch', '--no-tags', 'origin', 'main');
  const mainBase = git('rev-parse', 'origin/main');
  const mainVersion = JSON.parse(git('show', `${mainBase}:package.json`)).version;
  const store = JSON.parse(fs.readFileSync(required('RELEASE_STORE_METADATA_PATH'), 'utf8'));
  const { version, buildNumber } = await allocateRelease(
    [mainVersion, readReleaseMetadata('.', { allowEmptyUnreleased: true }).version, store.store_version], store.next_build_number);
  const context = validateContext({
    sourceCommit, mainBase, version, buildNumber,
    runId: required('GITHUB_RUN_ID'), runAttempt: required('GITHUB_RUN_ATTEMPT'),
    branch: `release/candidate/v${version}`,
  });
  await api('git/refs', 'POST', { ref: `refs/heads/${context.branch}`, sha: sourceCommit });
  git('config', 'user.name', 'Release automation');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git('switch', '-c', context.branch);
  git('merge', '--no-edit', mainBase);
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  if (!parseChangelog(changelog, { allowEmptyUnreleased: true }).unreleasedBody) {
    fs.writeFileSync('CHANGELOG.md', changelog.replace(/^## \[Unreleased\]\r?$/m,
      `## [Unreleased]\n\n### Changed\n\n- Automated release of develop commit ${sourceCommit}.`));
  }
  applyReleaseMetadataUpdate('.', {
    version, date: new Date().toISOString().slice(0, 10),
    iosBuild: buildNumber, androidVersionCode: buildNumber,
  });
  fs.mkdirSync('.release', { recursive: true });
  fs.writeFileSync(CONTEXT_PATH, `${JSON.stringify(context, null, 2)}\n`);
  git('add', 'package.json', 'package-lock.json', 'android/app/build.gradle',
    'ios/Bambuddy.xcodeproj/project.pbxproj', 'CHANGELOG.md', CONTEXT_PATH);
  git('commit', '-m', `chore(release): prepare ${version} (${buildNumber})`);
  git('push', 'origin', `HEAD:refs/heads/${context.branch}`);
  output({ commit: git('rev-parse', 'HEAD'), version, build_number: buildNumber, branch: context.branch });
}

async function credentials(platform) {
  const directory = required('RUNNER_TEMP');
  if (platform === 'match') {
    const key = `${required('MATCH_GIT_PRIVATE_KEY_CONTENT').replace(/\r\n/g, '\n').trimEnd()}\n`;
    if (!key.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----')) throw new Error('Invalid Match deploy key configuration');
    const keyPath = path.join(directory, 'bambuddy-match-deploy-key');
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    const response = await fetch('https://api.github.com/meta', {
      headers: { Authorization: `Bearer ${required('GITHUB_TOKEN')}`, Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`Unable to verify GitHub SSH host keys (${response.status})`);
    const keys = (await response.json()).ssh_keys?.filter(value => /^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(value));
    if (!keys?.length) throw new Error('GitHub did not provide an Ed25519 SSH host key');
    const hostsPath = path.join(directory, 'bambuddy-github-known-hosts');
    fs.writeFileSync(hostsPath, `${keys.map(value => `github.com ${value}`).join('\n')}\n`, { mode: 0o600 });
    const quote = value => `'${value.replace(/'/g, "'\\''")}'`;
    const ssh = `ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${quote(hostsPath)} -i ${quote(keyPath)}`;
    fs.appendFileSync(required('GITHUB_ENV'), `MATCH_GIT_PRIVATE_KEY=${keyPath}\nGIT_SSH_COMMAND=${ssh}\n`);
    return;
  }
  let google;
  try {
    google = JSON.parse(required('GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT'));
  } catch {
    throw new Error('Invalid Google service account configuration');
  }
  if (!google.private_key || !google.client_email) throw new Error('Invalid Google service account configuration');
  const googlePath = path.join(directory, 'bambuddy-google-service-account.json');
  fs.writeFileSync(googlePath, JSON.stringify(google), { mode: 0o600 });
  fs.appendFileSync(required('GITHUB_ENV'), `GOOGLE_SERVICE_ACCOUNT_KEY_PATH=${googlePath}\n`);
  if (platform === 'android') {
    const encoded = required('BAMBUDDY_RELEASE_STORE_CONTENT').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Android signing store must be base64 encoded');
    const storePath = path.join(directory, 'bambuddy-release.keystore');
    fs.writeFileSync(storePath, Buffer.from(encoded, 'base64'), { mode: 0o600 });
    fs.appendFileSync(required('GITHUB_ENV'), `BAMBUDDY_RELEASE_STORE_FILE=${storePath}\n`);
  }
}

function cleanupCredentials() {
  for (const filename of ['bambuddy-google-service-account.json', 'bambuddy-release.keystore', 'bambuddy-match-deploy-key', 'bambuddy-github-known-hosts']) {
    fs.rmSync(path.join(required('RUNNER_TEMP'), filename), { force: true });
  }
}

function manifestIdentity(context, commit, directory) {
  return {
    tag: `v${context.version}`, commit, marketingVersion: context.version,
    iosBuild: context.buildNumber, androidVersionCode: context.buildNumber,
    iosArtifact: path.join(directory, 'Bambuddy.ipa'),
    androidArtifact: path.join(directory, 'app-release.aab'),
    workflow: { name: WORKFLOW, ref: 'refs/heads/develop', runId: Number(context.runId), runAttempt: Number(context.runAttempt) },
  };
}

async function record(directory) {
  const context = contextFrom();
  const commit = git('rev-parse', 'HEAD');
  const manifest = await createReleaseManifest(manifestIdentity(context, commit, directory));
  fs.writeFileSync(path.join(directory, 'release-record.json'),
    `${JSON.stringify({ context, tree: git('rev-parse', 'HEAD^{tree}'), manifest }, null, 2)}\n`);
}

function checkRun(context, run, repository) {
  if (run.repository?.full_name !== repository || run.event !== 'push' ||
    run.head_branch !== 'develop' || run.head_sha !== context.sourceCommit ||
    run.path !== '.github/workflows/release-candidate.yml' ||
    String(run.id) !== context.runId || !Number.isInteger(run.run_attempt) ||
    run.run_attempt < Number(context.runAttempt) || run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('Candidate run is not the successful tested develop release');
  }
}

async function completedRun(id) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const run = await api(`actions/runs/${id}`);
    if (run.status === 'completed') return run;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Candidate run did not finish successfully');
}

async function verify(directory, expectedCommit, loadRun = completedRun) {
  const context = contextFrom();
  const recordValue = JSON.parse(fs.readFileSync(path.join(directory, 'release-record.json'), 'utf8'));
  if (JSON.stringify(recordValue.context) !== JSON.stringify(context)) throw new Error('Release context does not match the artifact');
  if (recordValue.manifest.commit !== expectedCommit || recordValue.tree !== git('rev-parse', 'HEAD^{tree}')) {
    throw new Error('Untested commit or merged tree; rebuilding or substituting a candidate is forbidden');
  }
  git('merge-base', '--is-ancestor', expectedCommit, 'HEAD');
  const metadata = readReleaseMetadata('.', { allowEmptyUnreleased: true });
  if (metadata.version !== context.version || metadata.iosBuild !== context.buildNumber ||
    metadata.androidVersionCode !== context.buildNumber) throw new Error('Release metadata does not match the candidate');
  await validateReleaseManifest(recordValue.manifest, manifestIdentity(context, expectedCommit, directory));
  checkRun(context, await loadRun(context.runId), required('GITHUB_REPOSITORY'));
  return context;
}

async function openPullRequest() {
  const context = contextFrom();
  const current = await api('git/ref/heads/develop');
  if (current.object.sha !== context.sourceCommit) throw new Error('Candidate superseded by a newer develop commit');
  const owner = required('GITHUB_REPOSITORY').split('/')[0];
  const existing = await api(`pulls?state=open&base=main&head=${encodeURIComponent(`${owner}:${context.branch}`)}`);
  const pull = existing[0] || await api('pulls', 'POST', {
    title: `Release ${context.version} (${context.buildNumber})`, head: context.branch, base: 'main',
    body: `Promote the tested Release Candidate run ${context.runId}. The signed IPA/AAB are already on TestFlight/Google Play internal. No rebuild is permitted.\n\nSource: ${context.sourceCommit}\nBuild: ${git('rev-parse', 'HEAD')}`,
  });
  execFileSync('gh', ['pr', 'merge', String(pull.number), '--auto', '--merge', '--match-head-commit', git('rev-parse', 'HEAD')], { stdio: 'inherit' });
}

function select() {
  if (!fs.existsSync(CONTEXT_PATH)) {
    output({ ready: false });
    return;
  }
  const context = contextFrom();
  output({ ready: true, run_id: context.runId, version: context.version, build_number: context.buildNumber });
}

async function syncDevelop() {
  const context = contextFrom();
  const current = await api('git/ref/heads/develop');
  if (current.object.sha !== context.sourceCommit) {
    console.log('Develop has newer work; leaving it untouched. Reconcile main before the next candidate if necessary.');
    return;
  }
  await api('git/refs/heads/develop', 'PATCH', { sha: git('rev-parse', 'HEAD'), force: false });
  console.log('Fast-forwarded develop to the promoted release without triggering another candidate.');
}

async function main(command, directory = 'release-artifacts') {
  if (command === 'prepare') return prepare();
  if (command === 'credentials') return credentials(directory);
  if (command === 'cleanup-credentials') return cleanupCredentials();
  if (command === 'record') return record(directory);
  if (command === 'open-pr') return openPullRequest();
  if (command === 'select') return select();
  if (command === 'sync-develop') {
    if (required('GITHUB_REF') !== 'refs/heads/main') throw new Error('Release synchronization is only allowed from main');
    return syncDevelop();
  }
  if (command === 'verify') {
    if (process.env.GITHUB_EVENT_NAME !== 'pull_request' && required('GITHUB_REF') !== 'refs/heads/main') {
      throw new Error('Production promotion is only allowed from main');
    }
    const recordValue = JSON.parse(fs.readFileSync(path.join(directory, 'release-record.json'), 'utf8'));
    const context = await verify(directory, process.env.CANDIDATE_COMMIT || recordValue.manifest.commit);
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
      const current = await api('git/ref/heads/develop');
      if (current.object.sha !== context.sourceCommit) throw new Error('Candidate superseded before merge');
    }
    return;
  }
  throw new Error('Unknown release pipeline command');
}

if (require.main === module) main(process.argv[2], process.argv[3]).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { nextVersion, allocateRelease, validateContext, checkRun, manifestIdentity, verify, main };

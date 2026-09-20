'use strict';

const fs = require('fs');
const path = require('path');
const {
  GOVERNANCE_CONTRACT: contract,
} = require('../../scripts/release/github-governance-contract.js');

const read = file =>
  fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');
const runbook = read('docs/release-operations.md');
const checklist = read('docs/release-configuration-checklist.md');
const sectionFrom = (text, heading) => {
  const marker = `## ${heading}\n`;
  const start = text.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const remainder = text.slice(start + marker.length);
  const end = remainder.indexOf('\n## ');
  return end < 0 ? remainder : remainder.slice(0, end);
};
const section = heading => sectionFrom(runbook, heading);
const codes = text => [...text.matchAll(/`([^`]+)`/g)].map(match => match[1]);
const issues = text => [
  ...new Set(
    [...text.matchAll(/(?:issues\/|#)(\d+)/g)].map(match => Number(match[1])),
  ),
];
const rows = text =>
  [...text.matchAll(/((?:^\|.*\n)+)/gm)].map(table =>
    table[1]
      .trim()
      .split('\n')
      .slice(2)
      .map(line =>
        line
          .slice(1, -1)
          .split('|')
          .map(cell => cell.trim()),
      ),
  );
const ordered = (text, values) => {
  const positions = values.map(value => text.indexOf(value));
  expect(positions.every(position => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
};
const callerRef = environment => {
  const [policy] = environment.branchPolicies;
  return `${policy.type} \`${policy.name}\` only`;
};

describe('release governance operations runbook', () => {
  test('documents the ordered state machine and canonical issue gates', () => {
    expect([...runbook.matchAll(/^## (.+)$/gm)].map(match => match[1])).toEqual(
      [
        'Purpose and activation status',
        'Canonical contracts and issue chain',
        'Invariants and STOP policy',
        'Operator preconditions',
        'Dedicated GitHub App lifecycle',
        'Sanitized preflight and evidence',
        'Forward-only mutation order',
        'Five managed environments',
        'Repository rulesets',
        'Names-only verification',
        'Workflow caller-ref constraints',
        'Disposable blocked-path probes',
        'Retry and provider outage',
        'Emergency revocation',
        'Final cleanup and completion',
      ],
    );
    ordered(section('Invariants and STOP policy'), [
      '**BLOCKED**',
      '**preflight**',
      '**App install**',
      '**scope audited**',
      '**environments configured and verified**',
      '**protect-dev**',
      '**dev probe**',
      '**protect-main**',
      '**main probe**',
      '**evidence**',
      '**complete**',
    ]);
    const canonical = section('Canonical contracts and issue chain');
    const gateText = canonical.slice(
      canonical.indexOf('The blocking operational prerequisites'),
      canonical.indexOf('\n\nIssues'),
    );
    expect(issues(gateText)).toEqual(
      issues(sectionFrom(checklist, 'Blocking go-live dependencies')),
    );
    expect(issues(canonical.slice(canonical.indexOf('\n\nIssues')))).toEqual([
      167, 173,
    ]);
    expect(issues(section('Operator preconditions'))).toEqual([
      ...issues(sectionFrom(checklist, 'Blocking go-live dependencies')),
      167,
      173,
    ]);
  });

  test('derives environment identity, callers, reviewers, and names', () => {
    const environmentText = section('Five managed environments');
    const [environmentRows, secretRows] = rows(environmentText);
    const documented = Object.fromEntries(
      environmentRows.map(([name, caller, reviewers, selfReview]) => [
        codes(name)[0],
        {
          caller,
          reviewers,
          selfReview: codes(selfReview)[0] === 'true',
        },
      ]),
    );
    const expected = Object.fromEntries(
      Object.entries(contract.environments).map(([name, environment]) => [
        name,
        {
          caller: callerRef(environment),
          reviewers:
            environment.reviewers.length === 0
              ? 'none'
              : environment.reviewers
                  .map(({ login, id }) => `\`${login}\` (\`${id}\`)`)
                  .join(', '),
          selfReview: environment.preventSelfReview,
        },
      ]),
    );
    expect(documented).toEqual(expected);
    expect(
      Object.fromEntries(
        secretRows.map(row => [codes(row[0])[0], codes(row[1])]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(contract.environments).map(([name, value]) => [
          name,
          value.secretNames,
        ]),
      ),
    );
    expect(
      codes(
        environmentText
          .split('\n\n')
          .find(p => p.startsWith('The exact repository variable')),
      ).slice(0, 6),
    ).toEqual(contract.repositoryVariableNames);
    expect(
      codes(
        environmentText
          .split('\n\n')
          .find(p => p.includes('Repository-scoped secrets')),
      ).slice(6),
    ).toEqual(contract.allowedRepositoryDemoSecretNames);
    expect(
      codes(
        environmentText.split('\n\n').find(p => p.startsWith('The `copilot`')),
      ).slice(1),
    ).toEqual(contract.copilotForbiddenSecretNames);
  });

  test('derives ordered rulesets and controls from the contract', () => {
    const text = section('Repository rulesets');
    const [rulesetRows, controlRows] = rows(text);
    expect(
      rulesetRows.map(([order, name, target, enforcement]) => [
        Number(order),
        ...[name, target, enforcement].map(value => codes(value)[0]),
      ]),
    ).toEqual(
      Object.entries(contract.rulesets).map(([name, value], index) => [
        index + 1,
        name,
        value.conditions.refName.include[0],
        value.enforcement,
      ]),
    );
    const canonical = Object.values(contract.rulesets)[0];
    const rule = type => canonical.rules.find(value => value.type === type);
    const pull = rule('pull_request').parameters;
    const checks = rule('required_status_checks').parameters;
    expect(
      codes(
        text.slice(
          text.indexOf('Both require exactly:'),
          text.indexOf('Both require strict status checks'),
        ),
      ),
    ).toEqual(contract.requiredChecks);
    expect(
      Object.fromEntries(
        controlRows.map(([name, value]) => [name, codes(value)[0]]),
      ),
    ).toEqual({
      'Strict status checks': String(
        checks.strict_required_status_checks_policy,
      ),
      'Pull request required': 'true',
      'Required approving reviews': String(
        pull.required_approving_review_count,
      ),
      'Dismiss stale reviews on push': String(
        pull.dismiss_stale_reviews_on_push,
      ),
      'Require last-push approval': String(pull.require_last_push_approval),
      'Require review-thread resolution': String(
        pull.required_review_thread_resolution,
      ),
      'Require code-owner review': String(pull.require_code_owner_review),
      'Block deletion': 'true',
      'Block non-fast-forward updates': 'true',
      'Bypass actors': canonical.bypassActors.length ? 'present' : 'none',
      'Linear-history rule': rule('required_linear_history')
        ? 'present'
        : 'absent',
    });
  });

  test('requires least privilege, audit-first minting, and bounded cleanup', () => {
    const text = section('Dedicated GitHub App lifecycle');
    const normalized = text.replace(/\s+/g, ' ');
    const app = contract.automationApp;
    expect(normalized).toContain(
      `Metadata \`${app.permissions.metadata}\`, Contents \`${app.permissions.contents}\`, and Pull requests \`${app.permissions.pullRequests}\``,
    );
    expect(text).toContain(
      `installation scope is \`${app.installationScope}\``,
    );
    [
      `sole selected repository is \`${app.repository}\``,
      `Permit Contents \`${app.permissions.contents}\` only to create each probe's disposable source branch, add its minimal non-production commit, and delete that branch.`,
      `Pull requests \`${app.permissions.pullRequests}\` is only for opening and closing the two probe PRs.`,
      `personal-token fallback is ${
        app.personalTokenFallback ? 'permitted' : 'forbidden'
      }`,
    ].forEach(value => expect(normalized).toContain(value));
    ordered(text, [
      'Validate registration and selected installation',
      'Create the App JWT in memory',
      'Discover exactly one installation',
      'Audit installation scope before operational minting',
      'audit token revoked and cleared',
      'Mint and validate the operational token',
      'at least 10 minutes remaining',
      'only as `GH_TOKEN`',
      'Bound retries and guarantee revocation',
      'Destroy every JWT, token, and private-key',
    ]);
    [
      'sole selected repository',
      'at most 20 pages',
      'at most three times',
      'exponential backoff',
      'always-run cleanup block',
      'Neither permission authorizes governance mutation',
      'administration and pull-request approval capabilities are absent',
    ].forEach(value => expect(text).toContain(value));
  });

  test('orders two real-diff probe lifecycles and cleanup', () => {
    ordered(section('Forward-only mutation order'), [
      'Activate `protect-dev`.',
      'Complete the disposable `dev` probe and close it unmerged.',
      'Activate `protect-main`.',
      'Complete the disposable `main` probe and close it unmerged.',
    ]);
    const probes = section('Disposable blocked-path probes');
    ordered(probes, [
      'create source branch',
      'create differing disposable commit',
      'open PR',
      'inspect blocked paths',
      'close PR without merge',
      'delete source branch',
      'verify PR\nclosure and branch absence',
      'revoke and clear the token',
    ]);
    [
      'minimal,\nnon-production commit',
      'Neither probe\npushes directly to `dev` or `main`, merges a PR, or mutates governance.',
      'Cleanup is an\nalways-run block after branch creation',
      'cleanup uncertainty is\n**STOP**',
      'unique branch from `dev`',
      'close-unmerged, branch-delete, verification, and token',
    ].forEach(value => expect(probes).toContain(value));
    expect(probes.match(/unique branch from `dev`/g)).toHaveLength(2);
    expect(probes.match(/minimal disposable commit/g)).toHaveLength(2);
    expect(probes.match(/App-authored PR/g)).toHaveLength(2);
    expect(section('Final cleanup and completion')).toContain(
      'both disposable source branches were deleted',
    );
  });

  test('preserves fail-closed, evidence, caller-ref, and hygiene controls', () => {
    const purpose = section('Purpose and activation status');
    const approval = contract.productionApproval;
    const normalizedPurpose = purpose.replace(/\s+/g, ' ');
    [
      `Production remains **${approval.stateWithCurrentParticipants.replace(
        '_',
        ' ',
      )}**`,
      `exactly \`${approval.minimumDistinctEligibleHumans}\` distinct eligible humans and non-self-approval`,
      `A reviewer ${
        approval.reviewerMayInitiate ? 'may' : 'may not'
      } initiate the production deployment they approve; initiation is human-only`,
      `eligible App-trigger IDs remain \`${JSON.stringify(
        approval.eligibleTriggerAppIds,
      )}\``,
    ].forEach(value => expect(normalizedPurpose).toContain(value));
    [
      '`createGitHubClient().listNames()` semantics',
      'Capture only names, refs, booleans, IDs, timestamps, and pass/fail findings.',
      'Do not retain raw API snapshots.',
      'Do not use a fixed workflow run ID.',
      'A mutable third-party Action tag is a blocking finding.',
    ].forEach(value => expect(runbook.replace(/\s+/g, ' ')).toContain(value));
    Object.values(contract.environments).forEach(environment =>
      expect(runbook).toContain(callerRef(environment)),
    );
    expect(runbook).not.toMatch(
      /\b(?:TODO|TBD|FIXME|CHANGEME|example[_-]?token|fake[_-]?token)\b|ghp_|github_pat_|-----BEGIN (?:RSA )?PRIVATE KEY-----|\/(?:var\/)?tmp(?:\/|\b)|^\s*(?:test|it)\.skip\(/im,
    );
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const {
  GOVERNANCE_CONTRACT,
} = require('../../scripts/release/github-governance-contract.js');

const checklist = fs.readFileSync(
  path.resolve(__dirname, '../../docs/release-configuration-checklist.md'),
  'utf8',
);

function section(heading) {
  const marker = `## ${heading}\n`;
  const start = checklist.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const remainder = checklist.slice(start + marker.length);
  const end = remainder.indexOf('\n## ');
  return end === -1 ? remainder : remainder.slice(0, end);
}

function tables(sectionText) {
  return [...sectionText.matchAll(/((?:^\|.*\n)+)/gm)].map(match =>
    match[1]
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
}

function codeValues(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map(match => match[1]);
}

function bulletValues(sectionText, introduction, followingHeading) {
  const start = sectionText.indexOf(introduction);
  expect(start).toBeGreaterThanOrEqual(0);
  const remainder = sectionText.slice(start + introduction.length);
  const end = followingHeading ? remainder.indexOf(followingHeading) : -1;
  const block = end === -1 ? remainder : remainder.slice(0, end);
  return block
    .split('\n')
    .filter(line => line.startsWith('- '))
    .flatMap(codeValues);
}

function expectedCallerRef(environment) {
  const [policy] = environment.branchPolicies;
  return `${policy.type} \`${policy.name}\` only`;
}

describe('release configuration checklist contract', () => {
  test('documents the exact rulesets, refs, checks, and review controls', () => {
    const rulesetSection = section('Repository rulesets');
    const [rulesetRows, reviewRows] = tables(rulesetSection);
    const documentedRulesets = Object.fromEntries(
      rulesetRows.map(([name, targetRef, enforcement, owner]) => [
        codeValues(name)[0],
        {
          targetRef: codeValues(targetRef)[0],
          enforcement: codeValues(enforcement)[0],
          owner: codeValues(owner)[0],
        },
      ]),
    );
    const expectedRulesets = Object.fromEntries(
      Object.entries(GOVERNANCE_CONTRACT.rulesets).map(([name, ruleset]) => [
        name,
        {
          targetRef: ruleset.conditions.refName.include[0],
          enforcement: ruleset.enforcement,
          owner: 'jmassardo',
        },
      ]),
    );

    expect(documentedRulesets).toEqual(expectedRulesets);
    expect(
      bulletValues(
        rulesetSection,
        'Both rulesets require exactly these check contexts:',
        '| Pull-request and history control',
      ),
    ).toEqual(GOVERNANCE_CONTRACT.requiredChecks);

    expect(Object.fromEntries(reviewRows)).toEqual({
      'Strict status checks': '`true`',
      'Pull request required': '`true`',
      'Required approving reviews': '`1`',
      'Dismiss stale reviews on push': '`true`',
      'Require last-push approval': '`true`',
      'Require review-thread resolution': '`true`',
      'Require code-owner review': '`false`',
      'Block deletion': '`true`',
      'Block non-fast-forward updates': '`true`',
      'Bypass actors': '`none`',
      'Linear-history rule': '`absent`',
    });

    for (const ruleset of Object.values(GOVERNANCE_CONTRACT.rulesets)) {
      expect(ruleset.bypassActors).toEqual([]);
      expect(
        ruleset.rules.find(rule => rule.type === 'pull_request').parameters,
      ).toEqual({
        required_approving_review_count: 1,
        dismiss_stale_reviews_on_push: true,
        require_last_push_approval: true,
        required_review_thread_resolution: true,
        require_code_owner_review: false,
      });
    }
  });

  test('documents the exact five environment scopes and secret allowlists', () => {
    const [rows] = tables(section('Managed environments'));
    const documented = Object.fromEntries(
      rows.map(
        ([
          name,
          callerRefs,
          reviewers,
          adminBypass,
          preventSelfReview,
          secrets,
          owner,
        ]) => [
          codeValues(name)[0],
          {
            callerRefs,
            reviewers,
            adminBypass: codeValues(adminBypass)[0] === 'true',
            preventSelfReview: codeValues(preventSelfReview)[0] === 'true',
            secrets: codeValues(secrets),
            owner: codeValues(owner)[0],
          },
        ],
      ),
    );
    const expected = Object.fromEntries(
      Object.entries(GOVERNANCE_CONTRACT.environments).map(
        ([name, environment]) => [
          name,
          {
            callerRefs: expectedCallerRef(environment),
            reviewers:
              environment.reviewers.length === 0
                ? '`none`'
                : '`jmassardo` (`9603391`)',
            adminBypass: environment.canAdminsBypass,
            preventSelfReview: environment.preventSelfReview,
            secrets: environment.secretNames,
            owner: 'jmassardo',
          },
        ],
      ),
    );

    expect(documented).toEqual(expected);
    expect(Object.keys(documented)).toHaveLength(5);
    expect(
      Object.values(GOVERNANCE_CONTRACT.environments).every(
        environment => environment.variableNames.length === 0,
      ),
    ).toBe(true);
  });

  test('documents exact repository variable and repository secret scopes', () => {
    const repositorySection = section('Repository scope');
    expect(
      bulletValues(
        repositorySection,
        'and are reviewed every 90 days and after any release-pipeline incident:',
        'Only these demo secrets',
      ),
    ).toEqual(GOVERNANCE_CONTRACT.repositoryVariableNames);
    expect(
      bulletValues(
        repositorySection,
        'Only these demo secrets are allowed at repository scope:',
      ),
    ).toEqual(GOVERNANCE_CONTRACT.allowedRepositoryDemoSecretNames);
    expect(repositorySection).toContain(
      'All release credentials belong only to the environment allowlists above.',
    );
    expect(repositorySection).toContain(
      '`copilot` must contain none of the demo or release credential names.',
    );
  });

  test('documents the exact Actions settings and ownership', () => {
    const [rows] = tables(section('Actions and merge settings'));
    const documented = Object.fromEntries(
      rows.map(([setting, value, owner, reviewRule]) => [
        setting,
        {
          value: codeValues(value)[0],
          owner: codeValues(owner)[0],
          reviewRule,
        },
      ]),
    );
    const policy = GOVERNANCE_CONTRACT.actionsPolicy;

    expect(documented).toEqual({
      'Default workflow permissions': {
        value: policy.defaultWorkflowPermissions,
        owner: 'jmassardo',
        reviewRule: 'every 90 days',
      },
      'Actions may approve pull-request reviews': {
        value: String(policy.canApprovePullRequestReviews),
        owner: 'jmassardo',
        reviewRule: 'every 90 days',
      },
      'Third-party Actions use immutable SHAs': {
        value: String(policy.shaPinningRequired),
        owner: 'jmassardo',
        reviewRule: 'every workflow change',
      },
      'Allowed Actions policy': {
        value: policy.allowedActions,
        owner: 'jmassardo',
        reviewRule: 'every 90 days',
      },
      'Merge commits allowed': {
        value: String(policy.allowMergeCommit),
        owner: 'jmassardo',
        reviewRule: 'every 90 days',
      },
    });
  });

  test('limits automation to the dedicated repository App and exact rotation', () => {
    const [rows] = tables(section('Automation identity'));
    const documented = Object.fromEntries(
      rows.map(([control, requirement, owner, rotation]) => [
        control,
        { requirement, owner: codeValues(owner)[0], rotation },
      ]),
    );
    const app = GOVERNANCE_CONTRACT.automationApp;

    expect(documented).toEqual({
      'Identity and installation': {
        requirement: `dedicated GitHub App installed only on \`${app.repository}\``,
        owner: 'jmassardo',
        rotation: 'review every installation change',
      },
      'Metadata permission': {
        requirement: `\`${app.permissions.metadata}\``,
        owner: 'jmassardo',
        rotation: 'review every permission change',
      },
      'Contents permission': {
        requirement: '`read/write`',
        owner: 'jmassardo',
        rotation: 'review every permission change',
      },
      'Pull requests permission': {
        requirement: '`read/write`',
        owner: 'jmassardo',
        rotation: 'review every permission change',
      },
      'Private key': {
        requirement:
          'environment secret `RELEASE_AUTOMATION_APP_PRIVATE_KEY` in `release-query` only',
        owner: 'jmassardo',
        rotation:
          'rotate at least every 90 days and after maintainer turnover or incident',
      },
      'Personal-token fallback': {
        requirement: '`forbidden`',
        owner: 'n/a',
        rotation: '`never`',
      },
      'Administration permission': {
        requirement: '`forbidden`',
        owner: 'n/a',
        rotation: '`never`',
      },
      'Pull-request approval capability': {
        requirement: '`forbidden`',
        owner: 'n/a',
        rotation: '`never`',
      },
      'Production bypass': {
        requirement: '`forbidden`',
        owner: 'n/a',
        rotation: '`never`',
      },
    });
    expect(app).toMatchObject({
      installationScope: 'selected_repository',
      permissions: {
        metadata: 'read',
        contents: 'write',
        pullRequests: 'write',
      },
      personalTokenFallback: false,
      administrationPermission: false,
      approvalPermission: false,
    });
  });

  test('keeps production fail closed without a single-owner workaround', () => {
    const production = section('Production approval');
    const approval = GOVERNANCE_CONTRACT.productionApproval;

    expect(production).toContain(
      `Production requires at least ${approval.minimumDistinctEligibleHumans} distinct eligible humans with \`${approval.eligibleHumanPermissions[0]}\`,`,
    );
    expect(production).toContain('`maintain`, or `push` permission.');
    expect(production).toContain('The reviewer cannot initiate the deployment');
    expect(production).toContain('the eligible trigger-App list is empty');
    expect(production).toContain(
      'single-owner\ntopology, production remains fail closed',
    );
    expect(production).toContain(
      'no self-review, administrator bypass,\nApp trigger, or other workaround is permitted.',
    );
    expect(approval).toMatchObject({
      stateWithCurrentParticipants: 'fail_closed',
      reviewerMayInitiate: false,
      eligibleTriggerAppIds: [],
    });
  });

  test('links only the accepted blocking and replacement dependency chains', () => {
    const dependencies = section('Blocking go-live dependencies');
    const issueNumbers = [...dependencies.matchAll(/issues\/(\d+)/g)].map(
      match => Number(match[1]),
    );

    expect(issueNumbers).toEqual([
      162, 163, 164, 165, 166, 168, 169, 170, 171, 172, 176, 177, 178, 179, 180,
    ]);
    expect(dependencies).not.toContain('#185');
    expect(checklist).toContain(
      'Every missing or differing control is\nblocking for go-live.',
    );
  });

  test('states the exact negative assertions without placeholders', () => {
    const negatives = section('Negative assertions')
      .split('\n')
      .filter(line => line.startsWith('- '))
      .map(line => line.slice(2));

    expect(negatives).toEqual([
      'no ruleset bypass actors',
      'no direct push to governed branches',
      'no production administrator bypass',
      'no production self-review',
      'no production automation trigger or approval capability',
      'no personal access token fallback',
      'no administration permission for the automation App',
      'no App installation outside this repository',
      'no release credentials in `copilot`',
      'no release credentials at repository scope',
      'no environment variables in managed environments',
      'no extra environment secrets beyond each exact allowlist',
      'no mutable third-party Action references',
      'no hardcoded shared system temporary-directory path',
      'no placeholder credentials or configuration values',
    ]);
    expect(checklist).not.toMatch(/\b(?:TODO|TBD|FIXME|CHANGEME)\b/);
  });
});

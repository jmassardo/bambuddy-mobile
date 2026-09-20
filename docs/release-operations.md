# Release governance operations

## Purpose and activation status

This is the authorized-operator runbook for applying and proving the release governance contract for `jmassardo/bambuddy-mobile`. It is an operating procedure, not proof of current GitHub state. The canonical desired state is [`release-configuration-checklist.md`](release-configuration-checklist.md) and `scripts/release/github-governance-contract.js`.

Governance starts **BLOCKED**. The baseline may still contain mutable third-party Action tags. Treat every mutable `uses:` reference as a blocking preflight finding; do not activate SHA enforcement or either ruleset until a separately reviewed workflow change has pinned every third-party Action to a full commit SHA.

Production remains **fail closed** while `jmassardo` is the only eligible human. Production requires exactly `2` distinct eligible humans and non-self-approval. A reviewer may not initiate the production deployment they approve; initiation is human-only, and eligible App-trigger IDs remain `[]`. Never enable self-review, administrator bypass, App approval, App triggering, or another workaround.

## Canonical contracts and issue chain

Read the canonical checklist and governance contract at the exact revision approved for the change window. Do not copy their values into another contract, client, or verifier.

The blocking operational prerequisites are exactly the checklist's go-live controls and replacement-verifier chain:
[#162](https://github.com/jmassardo/bambuddy-mobile/issues/162), [#163](https://github.com/jmassardo/bambuddy-mobile/issues/163), [#164](https://github.com/jmassardo/bambuddy-mobile/issues/164), [#165](https://github.com/jmassardo/bambuddy-mobile/issues/165), and [#166](https://github.com/jmassardo/bambuddy-mobile/issues/166), followed by
[#168](https://github.com/jmassardo/bambuddy-mobile/issues/168), [#169](https://github.com/jmassardo/bambuddy-mobile/issues/169), [#170](https://github.com/jmassardo/bambuddy-mobile/issues/170), [#171](https://github.com/jmassardo/bambuddy-mobile/issues/171), [#172](https://github.com/jmassardo/bambuddy-mobile/issues/172), [#176](https://github.com/jmassardo/bambuddy-mobile/issues/176), [#177](https://github.com/jmassardo/bambuddy-mobile/issues/177), [#178](https://github.com/jmassardo/bambuddy-mobile/issues/178), [#179](https://github.com/jmassardo/bambuddy-mobile/issues/179), and [#180](https://github.com/jmassardo/bambuddy-mobile/issues/180).

Issues [#167](https://github.com/jmassardo/bambuddy-mobile/issues/167) and [#173](https://github.com/jmassardo/bambuddy-mobile/issues/173) remain canonical implementation context, but they are references rather than operational gate dependencies.

## Invariants and STOP policy

The only valid security-state progression is:

1. **BLOCKED**
2. **preflight**
3. **App install**
4. **scope audited**
5. **environments configured and verified**
6. **protect-dev**
7. **dev probe**
8. **protect-main**
9. **main probe**
10. **evidence**
11. **complete**

Apply these invariants at every state:

1. Perform one numbered action at a time and confirm its expected result.
2. A failed prerequisite or verification is **STOP** before activation or any further mutation.
3. Preserve every active protection. Never delete, disable, bypass, or weaken a protection to make progress.
4. Remediate forward with reviewed changes. Never fabricate a passing result.
5. On every failure, run cleanup, record sanitized evidence, preserve protections, and restart at preflight in a new reviewed window.
6. An App scope mismatch, uncertain cleanup, provider outage, failed probe, missing required secret or variable **name**, mutable Action reference, or verifier failure is **STOP**. Do not broaden access.
7. Secret values, variable values, tokens, JWTs, private keys, credentials, and personal data never enter commands, evidence, logs, issues, or this repository.

## Operator preconditions

### Preconditions

1. Obtain an approved change window and a second human to review every governance mutation.
2. Confirm the operator has repository administration access through the approved human account.
3. Confirm the worktree is isolated at the approved revision and clean.
4. Confirm every issue in the checklist's **Blocking go-live dependencies** section is approved: #162, #163, #164, #165, #166, #168, #169, #170, #171, #172, #176, #177, #178, #179, and #180. Do not treat reference-context issues #167 or #173 as gate dependencies.
5. Confirm reviewed, real values exist out of band for every required secret and repository variable name.
6. Confirm no value will be copied from `copilot` and no credential value will be read during names-only verification.
7. Confirm the dedicated GitHub App and its private key are controlled by the approved secret manager.
8. Confirm the operator can close both disposable probe PRs without merging.
9. Confirm the replacement names-only verifier from the approved issue chain is available. The historical missing verifier is not an allowed substitute.

**Expected result:** all prerequisites are independently reviewed.

**STOP:** if any prerequisite is absent, stale, unverifiable, or requires a personal token. Record only the missing control's name and finding.

**Forward remediation:** complete the blocking issue or approved access change, then begin a new preflight.

## Dedicated GitHub App lifecycle

The App performs bounded repository automation only. Human governance mutation is separate: the App never receives `administration`, never approves a PR, and never changes environments, rulesets, repository settings, or Actions policy.
Personal, classic, fine-grained, or other personal-token fallback is forbidden.

### 1. Validate registration and selected installation

1. Confirm the installation scope is `selected_repository` (**Only select
   repositories**).
2. Confirm the sole selected repository is
   `jmassardo/bambuddy-mobile`.
3. Confirm exact permissions are Metadata `read`, Contents `write`, and Pull
   requests `write`.
4. Confirm administration and pull-request approval capabilities are absent.

**Expected result:** one dedicated, selected-repository installation with no
broader capability.

**STOP:** any additional repository, permission, installation, or ambiguous
result. Do not edit scope during the run.

### 2. Create the App JWT in memory

1. Obtain the App ID and private-key reference from the approved secret manager
   without printing either value.
2. Create an RS256 JWT only in process memory.
3. Set `iss` to the App ID, `iat` no more than 60 seconds in the past, and `exp`
   no more than 10 minutes after `iat`.
4. Retain only in-memory references needed for bounded discovery.

**Expected result:** a short-lived JWT exists only in the process that performs
discovery.

**STOP:** a key or JWT would be written to a file, argument, output, shell
history, evidence, or log.

### 3. Discover exactly one installation

1. Call the versioned `GET /app/installations` API using `Bearer` authentication
   with the in-memory JWT.
2. Request bounded pages and follow pagination for at most 20 pages.
3. Require exactly one installation owned by `jmassardo`.
4. Call `GET /repos/jmassardo/bambuddy-mobile/installation`.
5. Require its installation ID and App ID to equal the discovered installation.

**Expected result:** both discovery paths identify one matching installation.

**STOP:** zero, multiple, mismatched, malformed, or truncated results.

### 4. Audit installation scope before operational minting

1. Mint a metadata-only audit token with
   `POST /app/installations/{installation_id}/access_tokens`.
2. Request only Metadata `read`; omit repository restriction solely so the
   audit token can enumerate the installation's complete selected scope.
3. Reject a response without both `token` and `expires_at`.
4. Using only that audit token, call `GET /installation/repositories` with 100
   entries per page and a 20-page maximum.
5. Validate pagination and `total_count`.
6. Require the complete list to contain exactly
   `jmassardo/bambuddy-mobile`.
7. In an always-run cleanup block, revoke the audit token with
   `DELETE /installation/token`.
8. Require `204 No Content`, clear the audit-token reference, and confirm
   cleanup before continuing.

**Expected result:** one-repository scope; audit token revoked and cleared.

**STOP:** do not mint an operational token if audit scope or audit-token cleanup
is uncertain.

### 5. Mint and validate the operational token

1. Request an installation token restricted to repository
   `bambuddy-mobile`.
2. Request exactly Metadata `read`, Contents `write`, and Pull requests
   `write`.
3. Reject a response without `token` and `expires_at`.
4. Parse `expires_at` and require at least 10 minutes remaining before each
   bounded task.
5. If the window is insufficient, revoke and clear the token; start a fresh App
   lifecycle rather than continuing.
6. Pass the token only as `GH_TOKEN` in the child process environment.
7. Permit Contents `write` only to create each probe's disposable source
   branch, add its minimal non-production commit, and delete that branch.
   Pull requests `write` is only for opening and closing the two probe PRs.
   Neither permission authorizes governance mutation.

**Expected result:** least-privileged token used only by its bounded child.

**STOP:** expiry cannot be validated, requested permissions differ, the child
task is broader, or the token appears in arguments or output.

### 6. Bound retries and guarantee revocation

1. Retry a transient API request at most three times.
2. Use exponential backoff between those attempts.
3. Never retry an authorization, scope, validation, probe, or policy failure.
4. In an always-run cleanup block, revoke the operational token with
   `DELETE /installation/token`.
5. Require confirmed revocation; record an expired-token response only as a
   sanitized cleanup finding.
6. Unset parent and child `GH_TOKEN`.
7. Destroy every JWT, token, and private-key reference.

**Expected result:** revocation and reference destruction are confirmed.

**STOP:** expiry, revocation, unset, or reference destruction cannot be
confirmed. Block all further work and escalate without broadening access.

## Sanitized preflight and evidence

Preflight is read-only. Use an authorized human session and the versioned
GitHub API. The following commands are examples to be human-reviewed before
execution; they request governance metadata, not credential values:

```sh
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/jmassardo/bambuddy-mobile/rulesets
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/jmassardo/bambuddy-mobile/environments
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/jmassardo/bambuddy-mobile/actions/permissions
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/jmassardo/bambuddy-mobile/actions/permissions/workflow
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/jmassardo/bambuddy-mobile/branches/dev
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/jmassardo/bambuddy-mobile/branches/main
gh secret list --repo jmassardo/bambuddy-mobile --json name
gh variable list --repo jmassardo/bambuddy-mobile --json name
```

For each of the five managed environments, list secret and variable **names
only**. For `copilot`, also list names only and require no name in the
contract's forbidden list. Use the approved replacement verifier, whose GitHub
client follows `createGitHubClient().listNames()` semantics: bounded
pagination, only each entry's `name`, and no values.

Capture only names, refs, booleans, IDs, timestamps, and pass/fail findings.
Do not retain raw API snapshots. Do not use a fixed workflow run ID. Discover
the latest successful `dev` CI run in the approved window and record only its
run ID, head ref, head SHA, timestamp, and exact check-context names.

Also scan every workflow `uses:` entry. A mutable third-party Action tag is a
blocking finding. Pinning it requires a separate, reviewed workflow change;
this runbook does not authorize editing workflows.

**Expected result:** complete sanitized evidence matches the canonical
contract, except documented controls that have not yet been activated in the
ordered procedure.

**STOP:** a verifier failure, mutable Action reference, missing required name,
extra forbidden name, unexpected value-bearing output, incomplete pagination,
or unreviewed difference.

## Forward-only mutation order

Only the authorized human operator performs governance mutations. Use the
reviewed GitHub UI or a separately reviewed versioned-API request whose payload
is compared field-by-field with the canonical contract.

1. Complete preflight.
2. Complete App installation discovery and repository-only scope audit.
3. Configure and verify all five environments.
4. Populate required secret values out of band without changing the exact
   allowlisted names.
5. Populate required repository variable values out of band without
   environment shadow copies.
6. Verify Actions defaults, merge settings, names, environments, and caller
   refs.
7. Confirm every third-party Action uses an immutable full commit SHA.
8. Activate `protect-dev`.
9. Complete the disposable `dev` probe and close it unmerged.
10. Activate `protect-main`.
11. Complete the disposable `main` probe and close it unmerged.
12. Run names-only verification and record sanitized evidence.

Never skip ahead. A failure is not authorization to undo a successful earlier
step. Fix the desired state forward and restart at preflight.

## Five managed environments

Environment variables are empty in every environment. Administrator bypass is
off in every environment.

| Environment          | Exact workflow caller ref | Reviewers               | Prevent self-review |
| -------------------- | ------------------------- | ----------------------- | ------------------- |
| `release-query`      | branch `dev` only         | none                    | `false`             |
| `release-ios`        | tag `v*.*.*` only         | none                    | `false`             |
| `release-android`    | tag `v*.*.*` only         | none                    | `false`             |
| `production-ios`     | tag `v*.*.*` only         | `jmassardo` (`9603391`) | `true`              |
| `production-android` | tag `v*.*.*` only         | `jmassardo` (`9603391`) | `true`              |

### Exact secret-name allowlists

| Environment          | Exact secret names                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-query`      | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`, `RELEASE_AUTOMATION_APP_PRIVATE_KEY`                                                                                                                      |
| `release-ios`        | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `APPLE_ID`, `MATCH_PASSWORD`, `MATCH_GIT_AUTHORIZATION`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, `BAMBUDDY_DEMO_PASSWORD`                                                                |
| `release-android`    | `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`, `BAMBUDDY_RELEASE_STORE_CONTENT`, `BAMBUDDY_RELEASE_STORE_PASSWORD`, `BAMBUDDY_RELEASE_KEY_ALIAS`, `BAMBUDDY_RELEASE_KEY_PASSWORD`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, `BAMBUDDY_DEMO_PASSWORD` |
| `production-ios`     | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`                                                                                                                                                                                                  |
| `production-android` | `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`                                                                                                                                                                                                              |

The exact repository variable names are `APPLE_TEAM_ID`, `MATCH_GIT_URL`,
`IOS_BUNDLE_ID`, `ANDROID_PACKAGE_NAME`, `GOOGLE_PLAY_TRACKS`, and
`RELEASE_AUTOMATION_APP_ID`. Repository-scoped secrets are limited to
`BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, and `BAMBUDDY_DEMO_PASSWORD`.

The `copilot` environment forbids exactly `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`, `APPLE_ID`, `MATCH_PASSWORD`, `MATCH_GIT_AUTHORIZATION`, `BAMBUDDY_RELEASE_STORE_CONTENT`, `BAMBUDDY_RELEASE_STORE_PASSWORD`, `BAMBUDDY_RELEASE_KEY_ALIAS`, `BAMBUDDY_RELEASE_KEY_PASSWORD`, `RELEASE_AUTOMATION_APP_PRIVATE_KEY`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, and `BAMBUDDY_DEMO_PASSWORD`.

Never add environment variables, extra secrets, shadow variables, or
credential values merely to satisfy a name check.

For each environment:

1. Compare current metadata with the contract.
2. Submit one human-reviewed metadata mutation if needed.
3. Re-read metadata.
4. Verify exact caller policies, reviewers, bypass setting, self-review
   setting, variable names, and secret names.
5. Record sanitized evidence.

**STOP:** any missing or extra name, caller-ref mismatch, or unverifiable
setting. Preserve already-correct environments and remediate forward.

## Repository rulesets

Activate rulesets in this exact order:

| Order | Ruleset        | Exact target      | Enforcement |
| ----- | -------------- | ----------------- | ----------- |
| 1     | `protect-dev`  | `refs/heads/dev`  | `active`    |
| 2     | `protect-main` | `refs/heads/main` | `active`    |

Both require exactly:

- `TypeScript Check`
- `Lint`
- `Test`
- `Build iOS (Debug)`
- `Build Android (Debug)`

Both require strict status checks and the exact controls below. Merge commits
remain allowed. Actions defaults remain read-only and Actions cannot approve
PR reviews.

| Ruleset control                  | Exact value |
| -------------------------------- | ----------- |
| Strict status checks             | `true`      |
| Pull request required            | `true`      |
| Required approving reviews       | `1`         |
| Dismiss stale reviews on push    | `true`      |
| Require last-push approval       | `true`      |
| Require review-thread resolution | `true`      |
| Require code-owner review        | `false`     |
| Block deletion                   | `true`      |
| Block non-fast-forward updates   | `true`      |
| Bypass actors                    | `none`      |
| Linear-history rule              | `absent`    |

1. Confirm all preconditions and environment verification pass.
2. Confirm the exact five check contexts exist on the discovered successful
   `dev` run.
3. Confirm immutable third-party Action references.
4. Activate only `protect-dev`.
5. Re-read and verify it before the `dev` probe.
6. Activate `protect-main` only after the `dev` probe succeeds and is closed
   unmerged.
7. Re-read and verify it before the `main` probe.

**STOP:** duplicate or conflicting rulesets, wrong ref, wrong check context,
missing rule, bypass actor, or verifier failure. Never deactivate a ruleset as
remediation.

## Names-only verification

The approved replacement verifier is authoritative for normalized findings.
It must use the existing governance contract and GitHub client; do not create
another contract, client, verifier, or broad snapshot.

1. Run it before each mutation batch.
2. Require bounded pagination to complete.
3. Require exact ruleset and environment names from the contract.
4. Require exact secret and variable names using `listNames()`.
5. Require exact Actions and merge booleans.
6. Require exact caller refs and production participant topology.
7. Run it after each mutation batch and after each probe cleanup.
8. Retain only sanitized normalized findings and allowed evidence fields.

**STOP:** missing verifier, execution error, schema failure, incomplete
pagination, value-bearing output, or any blocking finding.

## Workflow caller-ref constraints

GitHub evaluates environment deployment policy against the workflow **caller
ref**, not a later checkout target.

1. `release-query` may be called only from branch `dev`.
2. The other four environments may be called only from a tag matching
   `v*.*.*`.
3. A workflow called from `main` does not become eligible by checking out a
   release tag.
4. Promotion merges `dev` into `main` with a merge commit.
5. The release tag is created on that merge commit.
6. Tag-triggered release jobs use the tag as their caller ref.

**STOP:** wrong or unverifiable caller ref. Do not loosen environment policy or
fabricate a tag/ref result.

## Disposable blocked-path probes

The App token is used only for these two automation-authored PR probes. Each
uses a unique source branch based on the named base ref and one minimal,
non-production commit (for example, a uniquely named inert probe marker) so
the PR has a real diff. The artifact must not alter workflows, runtime code,
configuration, governance, credentials, or production data. Neither probe
pushes directly to `dev` or `main`, merges a PR, or mutates governance.

For each probe, the App child task must perform this bounded lifecycle in
order: create source branch, create differing disposable commit, open PR,
inspect blocked paths, close PR without merge, delete source branch, verify PR
closure and branch absence, then revoke and clear the token. Cleanup is an
always-run block after branch creation. Any failure or cleanup uncertainty is
**STOP**: attempt close-unmerged and source-branch deletion, preserve governed
refs and active protections, and perform no further mutation.

### Dev probe

1. After `protect-dev` is verified active, create a unique branch from `dev`
   and add the minimal disposable commit.
2. Open one App-authored PR from that branch to `dev`.
3. Confirm merge is blocked without one eligible approval.
4. Confirm all five exact checks are required and strict.
5. Confirm unresolved conversations and a stale or missing last-push approval
   block merge.
6. Record only PR ID, refs, booleans, check names, timestamps, and findings.
7. Run the common close-unmerged, branch-delete, verification, and token
   cleanup lifecycle.

### Main probe

1. Begin a fresh App lifecycle after the successful `dev` probe cleanup.
2. After `protect-main` is verified active, create a unique branch from `dev`,
   add the minimal disposable commit, and open its App-authored PR to `main`.
3. Confirm the same approval, strict-check, conversation, and last-push blocks.
4. Record only allowed sanitized evidence.
5. Run the common close-unmerged, branch-delete, verification, and token
   cleanup lifecycle; verify no protected ref changed.

**STOP:** a probe cannot be created, unexpectedly becomes mergeable, reports a
wrong required check, fails cleanup, changes a protected ref, or cannot be
closed unmerged. Preserve both rulesets, collect sanitized evidence, and
remediate forward.

## Retry and provider outage

### Retry

1. Classify the failure without exposing credentials.
2. Retry only a transient provider request.
3. Use at most three attempts with exponential backoff.
4. Validate token lifetime before every attempt.
5. For policy or verification failures, do not retry; clean up and restart at
   preflight after remediation.

### Provider outage

1. Stop all mutations and probe activity.
2. Preserve environments, rulesets, Actions settings, and production blocks.
3. Revoke tokens when the provider permits.
4. If revocation cannot be confirmed, block the run and escalate cleanup
   uncertainty.
5. Record provider name, timestamps, affected operation, and sanitized finding.
6. Start a new preflight after provider recovery; never resume mid-sequence.

No outage permits a bypass, wider App scope, personal token, weakened
protection, or fabricated evidence.

## Emergency revocation

1. Stop the bounded task.
2. Revoke audit and operational installation tokens.
3. Unset `GH_TOKEN` in parent and child environments.
4. Destroy JWT, token, and private-key references.
5. Revoke or rotate affected provider credentials out of band.
6. Rotate the App private key when exposure is suspected.
7. Preserve secret names, rulesets, environments, and production protections.
8. Disable an affected workflow only through a separate human-reviewed change;
   do not relax governance.
9. Record sanitized IDs, names, timestamps, and findings.
10. Run a fresh preflight after remediation.

**STOP:** any revocation or destruction is uncertain. Production and governance
activation remain blocked until cleanup is independently confirmed.

## Final cleanup and completion

1. Confirm both probe PRs are closed and unmerged.
2. Confirm both disposable source branches were deleted and no other branch
   was removed.
3. Confirm no protected ref changed through a direct push.
4. Confirm audit and operational tokens are revoked.
5. Confirm `GH_TOKEN` is absent from parent and child environments.
6. Confirm all JWT, token, and private-key references are destroyed.
7. Run final names-only verification.
8. Confirm `protect-dev` and `protect-main` remain active.
9. Confirm production remains fail closed unless approved distinct-human non-self-approval now exists.
10. Store only names, refs, booleans, IDs, timestamps, and findings.

The run is **complete** only when every cleanup and verification result is confirmed. Otherwise it is **STOP**, protections remain in place, and the next attempt begins at preflight.

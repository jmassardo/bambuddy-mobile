# Release configuration checklist

Use this as the exact governance contract for `jmassardo/bambuddy-mobile`. Status snapshots belong in `docs/release-configuration-verification.md`.

## Repository rulesets

| Item                                   | Required value                                                                   | Owner       | Notes                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| Ruleset names                          | `protect-dev`, `protect-main`                                                    | `jmassardo` | Rulesets are the single source of truth for `dev` and `main`     |
| Target refs                            | `refs/heads/dev`, `refs/heads/main`                                              | `jmassardo` | No wildcard expansion                                            |
| Enforcement                            | `active`                                                                         | `jmassardo` | Do not use `evaluate` as the final state                         |
| Required status checks                 | `TypeScript Check`, `Lint`, `Test`, `Build iOS (Debug)`, `Build Android (Debug)` | `jmassardo` | Exact names only                                                 |
| Strict status checks                   | `true`                                                                           | `jmassardo` | Latest commit must be green                                      |
| PR required                            | `true`                                                                           | `jmassardo` | No direct push path                                              |
| Required approvals                     | `1`                                                                              | `jmassardo` | Reviewer must be eligible                                        |
| Dismiss stale approvals                | `true`                                                                           | `jmassardo` | Required                                                         |
| Require last push approval             | `true`                                                                           | `jmassardo` | Required                                                         |
| Require review conversation resolution | `true`                                                                           | `jmassardo` | Required                                                         |
| Block deletion                         | `true`                                                                           | `jmassardo` | Required                                                         |
| Block non-fast-forward updates         | `true`                                                                           | `jmassardo` | Required                                                         |
| Bypass actors                          | none                                                                             | `jmassardo` | No routine admin or automation bypass                            |
| Linear history                         | absent                                                                           | `jmassardo` | Merge commits must remain allowed for release promotion identity |

### Ruleset activation checklist

- [ ] Approved dedicated repository-only GitHub App is available for automation-authored probe PRs
- [ ] Environment secret names are populated with reviewed real values
- [ ] Repository variables are populated with reviewed real values
- [ ] All workflow `uses:` refs are pinned to immutable SHAs
- [ ] `node scripts/release/verify-github-config.js --repo jmassardo/bambuddy-mobile` is clean except for the expected fail-closed production warning

## Environments

| Environment          | Allowed refs      | Required reviewers      | Admin bypass | Self-review prevention | Exact secret names                                                                                                                                                                                                                                | Owner       |
| -------------------- | ----------------- | ----------------------- | ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `release-query`      | branch `dev` only | none                    | `false`      | `false`                | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`                                                                                                                                                            | `jmassardo` |
| `release-ios`        | tag `v*.*.*` only | none                    | `false`      | `false`                | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `APPLE_ID`, `MATCH_PASSWORD`, `MATCH_GIT_AUTHORIZATION`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, `BAMBUDDY_DEMO_PASSWORD`                                                                | `jmassardo` |
| `release-android`    | tag `v*.*.*` only | none                    | `false`      | `false`                | `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`, `BAMBUDDY_RELEASE_STORE_CONTENT`, `BAMBUDDY_RELEASE_STORE_PASSWORD`, `BAMBUDDY_RELEASE_KEY_ALIAS`, `BAMBUDDY_RELEASE_KEY_PASSWORD`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, `BAMBUDDY_DEMO_PASSWORD` | `jmassardo` |
| `production-ios`     | tag `v*.*.*` only | `jmassardo` (`9603391`) | `false`      | `true`                 | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`                                                                                                                                                                                                  | `jmassardo` |
| `production-android` | tag `v*.*.*` only | `jmassardo` (`9603391`) | `false`      | `true`                 | `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`                                                                                                                                                                                                              | `jmassardo` |

### Environment checklist

- [ ] `copilot` contains none of the release or production secret names above
- [ ] No dummy or placeholder secret values were created just to satisfy presence
- [ ] Production environments remain fail-closed until a second eligible collaborator or approved automation trigger path exists
- [ ] No extra secret names exist in the five managed release or production environments

## Repository-scoped variables

These names belong at repository scope only:

- [ ] `APPLE_TEAM_ID`
- [ ] `MATCH_GIT_URL`
- [ ] `IOS_BUNDLE_ID`
- [ ] `ANDROID_PACKAGE_NAME`
- [ ] `GOOGLE_PLAY_TRACKS`

### Variable ownership

| Variable set                     | Scope      | Owner       | Review cadence                                               |
| -------------------------------- | ---------- | ----------- | ------------------------------------------------------------ |
| Release metadata variables above | repository | `jmassardo` | review every 90 days and after any release pipeline incident |

## Repository-scoped secrets

Allowed repository secret names for current debug CI only:

- [ ] `BAMBUDDY_DEMO_URL`
- [ ] `BAMBUDDY_DEMO_USERNAME`
- [ ] `BAMBUDDY_DEMO_PASSWORD`

Forbidden at repository scope:

- [ ] no `ASC_*`
- [ ] no `MATCH_*`
- [ ] no `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`
- [ ] no `BAMBUDDY_RELEASE_*`

## Actions and merge settings

| Setting                      | Required value                            | Owner       | Review cadence                  |
| ---------------------------- | ----------------------------------------- | ----------- | ------------------------------- |
| Default workflow permissions | `read`                                    | `jmassardo` | every 90 days                   |
| Workflow PR review approval  | `false`                                   | `jmassardo` | every 90 days                   |
| Merge commits allowed        | `true`                                    | `jmassardo` | every 90 days                   |
| SHA pinning required         | `true` after all workflow refs are pinned | `jmassardo` | verify on every workflow change |

### Workflow hygiene checklist

- [ ] every external `uses:` reference is pinned to a 40-character commit SHA
- [ ] no release automation file contains a hardcoded shared system temporary directory
- [ ] any credential materialization step has `finally`, `ensure`, `trap`, or equivalent always-run cleanup

## Automation identity and rotation

| Item                        | Required policy                                                                                                                                                                 | Owner       | Rotation cadence                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| Automation identity         | Dedicated GitHub App installed solely on `jmassardo/bambuddy-mobile`                                                                                                            | `jmassardo` | rotate private key at least every 90 days and after any maintainer turnover or incident |
| Repository permissions      | Metadata: read; Contents: read and write; Pull requests: read and write; no additional permissions                                                                              | `jmassardo` | review on every App permission or installation change                                   |
| Authentication flow         | Mint a short-lived installation token for each run, use it only for the repository installation, then discard it                                                                | `jmassardo` | every automation run                                                                    |
| Installation verification   | Discover installations; use and revoke a metadata-read scope-audit token to verify the complete installation repository list; fail unless this repository is the sole selection | `jmassardo` | every automation run                                                                    |
| Token lifecycle             | Require at least 10 minutes remaining before bounded work; revoke with `DELETE /installation/token` and clear all in-memory/environment references in always-run cleanup        | `jmassardo` | every automation run                                                                    |
| Personal-token fallback     | forbidden; no classic, fine-grained, broad, or other personal token may substitute for the App installation token                                                               | n/a         | never                                                                                   |
| Installation scope widening | forbidden; authorization failures must not be remediated by installing the App on another repository or widening its access                                                     | n/a         | never                                                                                   |

## Go-live prerequisites

- [ ] Approved automation identity is available and documented
- [ ] Required environment secret names are populated with reviewed real values
- [ ] Required repository variable names are populated with reviewed real values
- [ ] Workflow refs are SHA pinned and repository SHA pinning is enabled
- [ ] Disposable blocked-path probe PRs against `dev` and `main` have been run and closed
- [ ] Production self-approval remains blocked
- [ ] `docs/release-configuration-verification.md` reflects the current live state

## Negative assertions

- [ ] no release credentials in `copilot`
- [ ] no store or signing credentials at repository scope
- [ ] no ruleset bypass actors
- [ ] no production admin bypass
- [ ] no production self-review weakening
- [ ] no hardcoded shared system temporary directory in release automation files
- [ ] no unpinned third-party Actions
- [ ] no personal token used for release governance or release automation
- [ ] no App token used without installation discovery, repository-only verification, expiry validation, and cleanup/revocation

# Release configuration contract

This checklist defines the required release-governance configuration for
`jmassardo/bambuddy-mobile`. It is a configuration contract, not evidence of
current state or an operations runbook. Every missing or differing control is
blocking for go-live.

## Repository rulesets

| Ruleset        | Exact target ref  | Enforcement | Owner       |
| -------------- | ----------------- | ----------- | ----------- |
| `protect-dev`  | `refs/heads/dev`  | `active`    | `jmassardo` |
| `protect-main` | `refs/heads/main` | `active`    | `jmassardo` |

Both rulesets require exactly these check contexts:

- `TypeScript Check`
- `Lint`
- `Test`
- `Build iOS (Debug)`
- `Build Android (Debug)`

| Pull-request and history control | Required value |
| -------------------------------- | -------------- |
| Strict status checks             | `true`         |
| Pull request required            | `true`         |
| Required approving reviews       | `1`            |
| Dismiss stale reviews on push    | `true`         |
| Require last-push approval       | `true`         |
| Require review-thread resolution | `true`         |
| Require code-owner review        | `false`        |
| Block deletion                   | `true`         |
| Block non-fast-forward updates   | `true`         |
| Bypass actors                    | `none`         |
| Linear-history rule              | `absent`       |

There is no direct-push path and no administrator, automation, or other bypass
actor. Merge commits remain allowed.

## Managed environments

Caller refs and secret allowlists are exact; environment variables are empty.

| Environment          | Allowed caller refs | Reviewers               | Admin bypass | Prevent self-review | Exact secret allowlist                                                                                                                                                                                                                            | Owner       |
| -------------------- | ------------------- | ----------------------- | ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `release-query`      | branch `dev` only   | `none`                  | `false`      | `false`             | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`, `RELEASE_AUTOMATION_APP_PRIVATE_KEY`                                                                                                                      | `jmassardo` |
| `release-ios`        | tag `v*.*.*` only   | `none`                  | `false`      | `false`             | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `APPLE_ID`, `MATCH_PASSWORD`, `MATCH_GIT_AUTHORIZATION`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, `BAMBUDDY_DEMO_PASSWORD`                                                                | `jmassardo` |
| `release-android`    | tag `v*.*.*` only   | `none`                  | `false`      | `false`             | `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`, `BAMBUDDY_RELEASE_STORE_CONTENT`, `BAMBUDDY_RELEASE_STORE_PASSWORD`, `BAMBUDDY_RELEASE_KEY_ALIAS`, `BAMBUDDY_RELEASE_KEY_PASSWORD`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, `BAMBUDDY_DEMO_PASSWORD` | `jmassardo` |
| `production-ios`     | tag `v*.*.*` only   | `jmassardo` (`9603391`) | `false`      | `true`              | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`                                                                                                                                                                                                  | `jmassardo` |
| `production-android` | tag `v*.*.*` only   | `jmassardo` (`9603391`) | `false`      | `true`              | `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`                                                                                                                                                                                                              | `jmassardo` |

## Repository scope

Repository variables are owned by `jmassardo`, exist only at repository scope,
and are reviewed every 90 days and after any release-pipeline incident:

- `APPLE_TEAM_ID`
- `MATCH_GIT_URL`
- `IOS_BUNDLE_ID`
- `ANDROID_PACKAGE_NAME`
- `GOOGLE_PLAY_TRACKS`
- `RELEASE_AUTOMATION_APP_ID`

Only these demo secrets are allowed at repository scope:

- `BAMBUDDY_DEMO_URL`
- `BAMBUDDY_DEMO_USERNAME`
- `BAMBUDDY_DEMO_PASSWORD`

All release credentials belong only to the environment allowlists above.
`copilot` must contain none of the demo or release credential names.

## Actions and merge settings

| Setting                                  | Required value | Owner       | Review rule           |
| ---------------------------------------- | -------------- | ----------- | --------------------- |
| Default workflow permissions             | `read`         | `jmassardo` | every 90 days         |
| Actions may approve pull-request reviews | `false`        | `jmassardo` | every 90 days         |
| Third-party Actions use immutable SHAs   | `true`         | `jmassardo` | every workflow change |
| Allowed Actions policy                   | `all`          | `jmassardo` | every 90 days         |
| Merge commits allowed                    | `true`         | `jmassardo` | every 90 days         |

## Automation identity

| Control                          | Exact requirement                                                               | Owner       | Rotation or review rule                                                 |
| -------------------------------- | ------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| Identity and installation        | dedicated GitHub App installed only on `jmassardo/bambuddy-mobile`              | `jmassardo` | review every installation change                                        |
| Metadata permission              | `read`                                                                          | `jmassardo` | review every permission change                                          |
| Contents permission              | `read/write`                                                                    | `jmassardo` | review every permission change                                          |
| Pull requests permission         | `read/write`                                                                    | `jmassardo` | review every permission change                                          |
| Private key                      | environment secret `RELEASE_AUTOMATION_APP_PRIVATE_KEY` in `release-query` only | `jmassardo` | rotate at least every 90 days and after maintainer turnover or incident |
| Personal-token fallback          | `forbidden`                                                                     | `n/a`       | `never`                                                                 |
| Administration permission        | `forbidden`                                                                     | `n/a`       | `never`                                                                 |
| Pull-request approval capability | `forbidden`                                                                     | `n/a`       | `never`                                                                 |
| Production bypass                | `forbidden`                                                                     | `n/a`       | `never`                                                                 |

## Production approval

Production requires at least 2 distinct eligible humans with `admin`,
`maintain`, or `push` permission. The reviewer cannot initiate the deployment,
and the eligible trigger-App list is empty. With the intentional single-owner
topology, production remains fail closed: no self-review, administrator bypass,
App trigger, or other workaround is permitted.

## Blocking go-live dependencies

Go-live controls:

- [ ] [#162](https://github.com/jmassardo/bambuddy-mobile/issues/162)
- [ ] [#163](https://github.com/jmassardo/bambuddy-mobile/issues/163)
- [ ] [#164](https://github.com/jmassardo/bambuddy-mobile/issues/164)
- [ ] [#165](https://github.com/jmassardo/bambuddy-mobile/issues/165)
- [ ] [#166](https://github.com/jmassardo/bambuddy-mobile/issues/166)

Replacement verifier chain:

- [ ] [#168](https://github.com/jmassardo/bambuddy-mobile/issues/168)
- [ ] [#169](https://github.com/jmassardo/bambuddy-mobile/issues/169)
- [ ] [#170](https://github.com/jmassardo/bambuddy-mobile/issues/170)
- [ ] [#171](https://github.com/jmassardo/bambuddy-mobile/issues/171)
- [ ] [#172](https://github.com/jmassardo/bambuddy-mobile/issues/172)
- [ ] [#176](https://github.com/jmassardo/bambuddy-mobile/issues/176)
- [ ] [#177](https://github.com/jmassardo/bambuddy-mobile/issues/177)
- [ ] [#178](https://github.com/jmassardo/bambuddy-mobile/issues/178)
- [ ] [#179](https://github.com/jmassardo/bambuddy-mobile/issues/179)
- [ ] [#180](https://github.com/jmassardo/bambuddy-mobile/issues/180)

## Negative assertions

- no ruleset bypass actors
- no direct push to governed branches
- no production administrator bypass
- no production self-review
- no production automation trigger or approval capability
- no personal access token fallback
- no administration permission for the automation App
- no App installation outside this repository
- no release credentials in `copilot`
- no release credentials at repository scope
- no environment variables in managed environments
- no extra environment secrets beyond each exact allowlist
- no mutable third-party Action references
- no hardcoded shared system temporary-directory path
- no placeholder credentials or configuration values

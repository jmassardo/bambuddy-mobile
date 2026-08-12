# Release configuration verification

## Repository metadata and baseline SHA

| Field                             | Value                                                   |
| --------------------------------- | ------------------------------------------------------- |
| Repository                        | `jmassardo/bambuddy-mobile`                             |
| Repository URL                    | `https://github.com/jmassardo/bambuddy-mobile`          |
| Baseline inspected for this issue | `origin/dev@b9e41e17cc10e87a98dbce1a33dd9aaa6a195f50`   |
| Preflight snapshot state          | `2026-08-11T21:31Z` after Architecture/Standards review |
| Post-mutation verification run    | `2026-08-11T21:47:23.063Z`                              |
| Verifier status                   | `fail`                                                  |
| Production state                  | `fail_closed`                                           |

## Reviewed live mutations and snapshots

### Preflight snapshot before mutation

| Control                   | Observed state                                                                |
| ------------------------- | ----------------------------------------------------------------------------- |
| Repository rulesets       | none                                                                          |
| `dev` branch protection   | `protected=false`                                                             |
| `main` branch protection  | `protected=false`                                                             |
| Environments              | `copilot` only                                                                |
| Repository secret names   | `BAMBUDDY_DEMO_PASSWORD`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`       |
| Repository variable names | none                                                                          |
| Actions defaults          | `default_workflow_permissions=read`, `can_approve_pull_request_reviews=false` |
| Actions policy            | `allowed_actions=all`, `sha_pinning_required=false`                           |
| Merge commits             | `allow_merge_commit=true`                                                     |
| Direct collaborators      | `jmassardo` (`9603391`) only                                                  |

### Applied live mutations

Only the controls that were safe and accurate to apply were changed:

| Timestamp              | Mutation                                                                                                                                        | Result  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `2026-08-11T21:39:21Z` | created `release-query` environment (`19706598295`) with `dev` branch policy                                                                    | applied |
| `2026-08-11T21:39:33Z` | created `release-ios` environment (`19706606682`) with `v*.*.*` tag policy                                                                      | applied |
| `2026-08-11T21:39:34Z` | created `release-android` environment (`19706607430`) with `v*.*.*` tag policy                                                                  | applied |
| `2026-08-11T21:39:35Z` | created `production-ios` environment (`19706608218`) with reviewer `jmassardo` (`9603391`), `prevent_self_review=true`, tag policy `v*.*.*`     | applied |
| `2026-08-11T21:39:36Z` | created `production-android` environment (`19706609055`) with reviewer `jmassardo` (`9603391`), `prevent_self_review=true`, tag policy `v*.*.*` | applied |

Not applied:

- no rulesets were activated;
- no secret values were created or copied;
- no repository variables were created;
- no workflow permission broadening was performed;
- no SHA pinning was enabled.

## Ruleset summary

| Ruleset        | Live state | Notes              |
| -------------- | ---------- | ------------------ |
| `protect-dev`  | missing    | activation blocked |
| `protect-main` | missing    | activation blocked |

### Branch protection summary

| Branch | Protected | Legacy branch protection |
| ------ | --------- | ------------------------ |
| `dev`  | `false`   | `false`                  |
| `main` | `false`   | `false`                  |

## Environment summary

| Environment          | ID            | Allowed refs | Reviewers               | Admin bypass | Self-review prevention | Secret names only |
| -------------------- | ------------- | ------------ | ----------------------- | ------------ | ---------------------- | ----------------- |
| `copilot`            | `18404195094` | unrestricted | none                    | `true`       | `false`                | none              |
| `release-query`      | `19706598295` | branch `dev` | none                    | `false`      | `false`                | none              |
| `release-ios`        | `19706606682` | tag `v*.*.*` | none                    | `false`      | `false`                | none              |
| `release-android`    | `19706607430` | tag `v*.*.*` | none                    | `false`      | `false`                | none              |
| `production-ios`     | `19706608218` | tag `v*.*.*` | `jmassardo` (`9603391`) | `false`      | `true`                 | none              |
| `production-android` | `19706609055` | tag `v*.*.*` | `jmassardo` (`9603391`) | `false`      | `true`                 | none              |

## Repository secret names only

| Scope                | Names                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| repository           | `BAMBUDDY_DEMO_PASSWORD`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME` |
| managed environments | none yet                                                                |

## Repository variable names only

| Scope                | Names |
| -------------------- | ----- |
| repository           | none  |
| managed environments | none  |

## Actions settings and workflow pin scan

### Repository Actions settings

| Setting                            | Live state |
| ---------------------------------- | ---------- |
| `default_workflow_permissions`     | `read`     |
| `can_approve_pull_request_reviews` | `false`    |
| `allow_merge_commit`               | `true`     |
| `allowed_actions`                  | `all`      |
| `sha_pinning_required`             | `false`    |

### Workflow pin scan result

The verifier found `16` mutable external `uses:` refs.

| File                           | Line  | Mutable ref                       |
| ------------------------------ | ----- | --------------------------------- |
| `.github/workflows/ci.yml`     | `14`  | `actions/checkout@v7`             |
| `.github/workflows/ci.yml`     | `16`  | `actions/setup-node@v7`           |
| `.github/workflows/ci.yml`     | `29`  | `actions/checkout@v7`             |
| `.github/workflows/ci.yml`     | `31`  | `actions/setup-node@v7`           |
| `.github/workflows/ci.yml`     | `45`  | `actions/checkout@v7`             |
| `.github/workflows/ci.yml`     | `47`  | `actions/setup-node@v7`           |
| `.github/workflows/ci.yml`     | `61`  | `actions/checkout@v7`             |
| `.github/workflows/ci.yml`     | `63`  | `actions/setup-node@v7`           |
| `.github/workflows/ci.yml`     | `68`  | `ruby/setup-ruby@v1`              |
| `.github/workflows/ci.yml`     | `88`  | `actions/checkout@v7`             |
| `.github/workflows/ci.yml`     | `90`  | `actions/setup-node@v7`           |
| `.github/workflows/ci.yml`     | `95`  | `actions/setup-java@v5`           |
| `.github/workflows/ci.yml`     | `100` | `ruby/setup-ruby@v1`              |
| `.github/workflows/codeql.yml` | `66`  | `actions/checkout@v7`             |
| `.github/workflows/codeql.yml` | `76`  | `github/codeql-action/init@v4`    |
| `.github/workflows/codeql.yml` | `105` | `github/codeql-action/analyze@v4` |

Additional scan results:

- hardcoded shared temp path literals in tracked release automation files: `0`
- credential materialization files missing guaranteed cleanup: `0`

## Collaborator summary

| Login       | ID        | Role    |
| ----------- | --------- | ------- |
| `jmassardo` | `9603391` | `admin` |

## Production state

Production is **fail closed until a second eligible collaborator exists**. Current controls preserve that state:

- `production-ios` requires `jmassardo` review and prevents self-review;
- `production-android` requires `jmassardo` review and prevents self-review;
- no admin bypass is configured on those environments;
- no second eligible collaborator currently exists to trigger or approve an alternate path.

## Exact remediation required before activation

1. provision the dedicated repository-only GitHub App with Metadata: read, Contents: read and write, and Pull requests: read and write; use only short-lived installation tokens and no personal-token fallback ([#163](https://github.com/jmassardo/bambuddy-mobile/issues/163));
2. populate environment secret names with reviewed real values ([#165](https://github.com/jmassardo/bambuddy-mobile/issues/165)):
   - `release-query`: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`
   - `release-ios`: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `APPLE_ID`, `MATCH_PASSWORD`, `MATCH_GIT_AUTHORIZATION`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, `BAMBUDDY_DEMO_PASSWORD`
   - `release-android`: `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`, `BAMBUDDY_RELEASE_STORE_CONTENT`, `BAMBUDDY_RELEASE_STORE_PASSWORD`, `BAMBUDDY_RELEASE_KEY_ALIAS`, `BAMBUDDY_RELEASE_KEY_PASSWORD`, `BAMBUDDY_DEMO_URL`, `BAMBUDDY_DEMO_USERNAME`, `BAMBUDDY_DEMO_PASSWORD`
   - `production-ios`: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`
   - `production-android`: `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`
3. create repository variables `APPLE_TEAM_ID`, `MATCH_GIT_URL`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE_NAME`, and `GOOGLE_PLAY_TRACKS` ([#164](https://github.com/jmassardo/bambuddy-mobile/issues/164));
4. pin all `16` mutable GitHub Action refs to immutable SHAs, then enable `sha_pinning_required=true` ([#162](https://github.com/jmassardo/bambuddy-mobile/issues/162));
5. activate `protect-dev` and `protect-main` only after steps 1 through 4 are complete ([#166](https://github.com/jmassardo/bambuddy-mobile/issues/166));
6. run disposable blocked-path probe PRs for `dev` and `main`, then refresh this evidence document with the new sanitized output ([#166](https://github.com/jmassardo/bambuddy-mobile/issues/166)).

# Release operations runbook

## Current activation status

Release governance is only **partially applied** today:

- environments are created and restricted to the approved refs;
- repository Actions defaults already remain read-only and cannot approve PR reviews;
- `dev` and `main` are still unprotected because activating the required rulesets is not safe yet;
- production remains intentionally **fail-closed** because only `jmassardo` can currently trigger or approve protected deployments.

Current blockers that must be cleared **before** activating branch rulesets or Actions SHA pinning:

1. no approved non-human automation identity is available yet for disposable probe PRs and future release-promotion PR authorship;
2. required environment secret names and repository variable names are still absent;
3. committed workflow `uses:` refs are still mutable tags, so `sha_pinning_required=true` would break CI immediately.

## 1. Prerequisites and live-state preflight

### Required operator prerequisites

- GitHub repository admin access for `jmassardo/bambuddy-mobile`
- isolated worktree from the approved baseline
- approved dedicated GitHub App identity:
  - installed solely on `jmassardo/bambuddy-mobile`
  - repository permissions limited to Metadata: read, Contents: read and write, and Pull requests: read and write
  - authenticated with short-lived installation access tokens minted for each automation run
  - App private key stored and rotated out-of-band; installation tokens are never persisted
- reviewed values for every required environment secret and repository variable
- no reuse of `copilot` secrets for release or production
- no classic, fine-grained, broad, or other personal access token fallback

The App installation token flow is the only approved automation flow: create a
signed App JWT at run time, exchange it for a short-lived token for the
repository-only installation, use that token for the bounded operation, and
discard it when the run ends. Never widen the App installation or permissions
to resolve an authorization failure.

### Dedicated GitHub App installation-token procedure

Provisioning and each automation run must use this exact flow:

1. Confirm the App registration grants only **Metadata: read**, **Contents:
   read and write**, and **Pull requests: read and write**. Confirm its
   installation target is **Only select repositories** with
   `jmassardo/bambuddy-mobile` as the sole selected repository.
2. Create an RS256 App JWT in memory with the App ID as `iss`, `iat` no more
   than 60 seconds in the past, and `exp` no more than 10 minutes after `iat`.
   Read the private key from the approved secret manager, never from the
   repository, command line, log, or generated file.
3. Authenticate as the App by sending the in-memory JWT with GitHub's
   documented `Bearer` authorization scheme. Call `GET /app/installations`
   using the versioned GitHub API and follow its pagination links within a
   20-page bound. Require exactly one installation owned by `jmassardo`; zero,
   multiple, malformed, or truncated results stop the run.
4. Independently call
   `GET /repos/jmassardo/bambuddy-mobile/installation` with the App JWT.
   Require its installation ID and App ID to equal the discovered
   installation.
5. Mint a scope-audit token by calling
   `POST /app/installations/{installation_id}/access_tokens` with the App JWT,
   no `repositories` or `repository_ids` restriction, and permissions reduced
   to `{"metadata":"read"}`. Omitting the repository restriction is required
   for this audit token to see the installation's complete selected-repository
   scope. Reject a response without `token` and `expires_at`.
6. With only the in-memory scope-audit token, call
   `GET /installation/repositories`; request 100 entries per page, follow
   pagination within a 20-page bound, validate `total_count`, and require the
   complete result to contain exactly `jmassardo/bambuddy-mobile`. Any
   additional, missing, malformed, or truncated repository result stops the
   run. In an always-run cleanup block, call `DELETE /installation/token` with
   the audit token, require `204 No Content`, clear the token, and stop if
   cleanup cannot be confirmed.
7. After the repository-only audit succeeds, exchange the App JWT for the
   operational token with
   `POST /app/installations/{installation_id}/access_tokens`. The request must
   restrict `repositories` to `["bambuddy-mobile"]` and request only:

   ```json
   {
     "repositories": ["bambuddy-mobile"],
     "permissions": {
       "metadata": "read",
       "contents": "write",
       "pull_requests": "write"
     }
   }
   ```

   This is the GitHub **Create an installation access token for an app**
   operation. Reject a response without both `token` and `expires_at`; never
   print or persist the token.

8. Before every bounded task, parse `expires_at` and require at least 10
   minutes of remaining lifetime. Mint a new token before starting if that
   window is unavailable. A run may create or close only the two approved
   disposable probe PRs (`dev` and `main`) and must cap API retries at three
   with exponential backoff. Do not reuse the token for unrelated work or
   continue a partially completed mutation after expiry.
9. Put the token only in the child process environment (`GH_TOKEN`), never in
   arguments or output. In an always-run cleanup block, unset it in the parent
   and child environments and call `DELETE /installation/token` with the
   installation token to revoke it early. Treat `204 No Content` as success;
   an already expired token may return an authentication failure, which must
   be recorded only as a sanitized cleanup result. Destroy all in-memory JWT,
   token, and private-key references when cleanup finishes.

There is no PAT fallback. Installation discovery, repository verification,
token exchange, bounded use, expiry checks, and revocation are mandatory; an
authorization or cleanup failure stops the automation without widening scope.

### Preflight snapshot commands

Run these before **any** mutation:

```sh
gh api repos/jmassardo/bambuddy-mobile/rulesets
gh api repos/jmassardo/bambuddy-mobile/environments
gh api repos/jmassardo/bambuddy-mobile/actions/permissions
gh api repos/jmassardo/bambuddy-mobile/actions/permissions/workflow
gh api repos/jmassardo/bambuddy-mobile/collaborators?affiliation=direct
gh api repos/jmassardo/bambuddy-mobile/branches/dev
gh api repos/jmassardo/bambuddy-mobile/branches/main

gh secret list --repo jmassardo/bambuddy-mobile --json name
gh variable list --repo jmassardo/bambuddy-mobile --json name

gh secret list --repo jmassardo/bambuddy-mobile --env copilot --json name
gh variable list --repo jmassardo/bambuddy-mobile --env copilot --json name
```

Confirm the exact CI check contexts from the latest successful `dev` run:

```sh
gh run list \
  --repo jmassardo/bambuddy-mobile \
  --workflow ci.yml \
  --branch dev \
  --status success \
  --limit 1 \
  --json databaseId,headBranch,headSha,updatedAt

gh run view 31523025639 --repo jmassardo/bambuddy-mobile --json jobs
```

Run the names-only verifier before and after each reviewed mutation batch:

```sh
node scripts/release/verify-github-config.js --repo jmassardo/bambuddy-mobile
```

The verifier requests bounded 100-item pages for rulesets, environments,
deployment branch policies, and collaborators. The supported `gh secret list`
and `gh variable list` commands follow all pagination links internally; the
verifier requests and retains only each entry's `name` field.

## 2. Safe mutation order

Follow this order exactly. Do **not** skip ahead.

1. provision the approved automation identity first;
2. capture the sanitized preflight snapshot;
3. confirm the required CI checks exist exactly as:
   - `TypeScript Check`
   - `Lint`
   - `Test`
   - `Build iOS (Debug)`
   - `Build Android (Debug)`
4. create or update the five release and production environments;
5. populate environment secrets and repository variables out-of-band with reviewed real values only;
6. run `node scripts/release/verify-github-config.js --repo jmassardo/bambuddy-mobile`;
7. pin every external GitHub Action to a full commit SHA, then enable repository SHA pinning;
8. activate `protect-dev`, then validate with one disposable automation-authored PR into `dev`;
9. activate `protect-main`, then validate with one disposable automation-authored `dev`→`main` probe PR;
10. refresh `docs/release-configuration-verification.md` with the new sanitized state.

Rollback policy is forward-only:

- do not auto-delete or weaken active protections;
- only delete or recreate typoed draft environments before protection goes live;
- any rollback that lowers protection must be explicitly approved by a human and posted to issue #159 first.

## 3. Create or update environments

### `release-query`

```sh
python3 - <<'PY' | gh api \
  --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/release-query \
  --input -
import json
print(json.dumps({
    "deployment_branch_policy": {
        "protected_branches": False,
        "custom_branch_policies": True,
    },
    "reviewers": [],
    "can_admins_bypass": False,
    "prevent_self_review": False,
}))
PY

python3 - <<'PY' | gh api \
  --method POST \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/release-query/deployment-branch-policies \
  --input -
import json
print(json.dumps({"name": "dev", "type": "branch"}))
PY
```

Required secret names:

- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_KEY_CONTENT`
- `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`

### `release-ios`

```sh
python3 - <<'PY' | gh api \
  --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/release-ios \
  --input -
import json
print(json.dumps({
    "deployment_branch_policy": {
        "protected_branches": False,
        "custom_branch_policies": True,
    },
    "reviewers": [],
    "can_admins_bypass": False,
    "prevent_self_review": False,
}))
PY

python3 - <<'PY' | gh api \
  --method POST \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/release-ios/deployment-branch-policies \
  --input -
import json
print(json.dumps({"name": "v*.*.*", "type": "tag"}))
PY
```

Required secret names:

- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_KEY_CONTENT`
- `APPLE_ID`
- `MATCH_PASSWORD`
- `MATCH_GIT_AUTHORIZATION`
- `BAMBUDDY_DEMO_URL`
- `BAMBUDDY_DEMO_USERNAME`
- `BAMBUDDY_DEMO_PASSWORD`

### `release-android`

```sh
python3 - <<'PY' | gh api \
  --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/release-android \
  --input -
import json
print(json.dumps({
    "deployment_branch_policy": {
        "protected_branches": False,
        "custom_branch_policies": True,
    },
    "reviewers": [],
    "can_admins_bypass": False,
    "prevent_self_review": False,
}))
PY

python3 - <<'PY' | gh api \
  --method POST \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/release-android/deployment-branch-policies \
  --input -
import json
print(json.dumps({"name": "v*.*.*", "type": "tag"}))
PY
```

Required secret names:

- `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`
- `BAMBUDDY_RELEASE_STORE_CONTENT`
- `BAMBUDDY_RELEASE_STORE_PASSWORD`
- `BAMBUDDY_RELEASE_KEY_ALIAS`
- `BAMBUDDY_RELEASE_KEY_PASSWORD`
- `BAMBUDDY_DEMO_URL`
- `BAMBUDDY_DEMO_USERNAME`
- `BAMBUDDY_DEMO_PASSWORD`

### `production-ios`

```sh
python3 - <<'PY' | gh api \
  --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/production-ios \
  --input -
import json
print(json.dumps({
    "deployment_branch_policy": {
        "protected_branches": False,
        "custom_branch_policies": True,
    },
    "reviewers": [{"type": "User", "id": 9603391}],
    "can_admins_bypass": False,
    "prevent_self_review": True,
}))
PY

python3 - <<'PY' | gh api \
  --method POST \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/production-ios/deployment-branch-policies \
  --input -
import json
print(json.dumps({"name": "v*.*.*", "type": "tag"}))
PY
```

Required secret names:

- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_KEY_CONTENT`

### `production-android`

```sh
python3 - <<'PY' | gh api \
  --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/production-android \
  --input -
import json
print(json.dumps({
    "deployment_branch_policy": {
        "protected_branches": False,
        "custom_branch_policies": True,
    },
    "reviewers": [{"type": "User", "id": 9603391}],
    "can_admins_bypass": False,
    "prevent_self_review": True,
}))
PY

python3 - <<'PY' | gh api \
  --method POST \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/environments/production-android/deployment-branch-policies \
  --input -
import json
print(json.dumps({"name": "v*.*.*", "type": "tag"}))
PY
```

Required secret names:

- `GOOGLE_SERVICE_ACCOUNT_KEY_CONTENT`

### Repository-scoped variable names

Populate these at repository scope only:

- `APPLE_TEAM_ID`
- `MATCH_GIT_URL`
- `IOS_BUNDLE_ID`
- `ANDROID_PACKAGE_NAME`
- `GOOGLE_PLAY_TRACKS`

Do not create environment-scoped shadow copies of those names.

## 4. Create or update rulesets

Do **not** run these until:

- the approved automation identity exists;
- required environment secrets and repository variables are populated;
- all external `uses:` refs are pinned to immutable SHAs;
- the verifier is clean except for the expected single-collaborator production warning.

### `protect-dev`

```sh
python3 - <<'PY' | gh api \
  --method POST \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  repos/jmassardo/bambuddy-mobile/rulesets \
  --input -
import json
print(json.dumps({
    "name": "protect-dev",
    "target": "branch",
    "enforcement": "active",
    "bypass_actors": [],
    "conditions": {
        "ref_name": {
            "include": ["refs/heads/dev"],
            "exclude": [],
        },
    },
    "rules": [
        {"type": "deletion"},
        {"type": "non_fast_forward"},
        {
            "type": "pull_request",
            "parameters": {
                "required_approving_review_count": 1,
                "dismiss_stale_reviews_on_push": True,
                "require_code_owner_review": False,
                "require_last_push_approval": True,
                "required_review_thread_resolution": True,
            },
        },
        {
            "type": "required_status_checks",
            "parameters": {
                "strict_required_status_checks_policy": True,
                "required_status_checks": [
                    {"context": "TypeScript Check"},
                    {"context": "Lint"},
                    {"context": "Test"},
                    {"context": "Build iOS (Debug)"},
                    {"context": "Build Android (Debug)"},
                ],
            },
        },
    ],
}))
PY
```

### `protect-main`

Use the same payload, changing only the ruleset name and target ref:

- `name`: `protect-main`
- `conditions.ref_name.include`: `["refs/heads/main"]`

Required ruleset semantics:

- one approving review
- dismiss stale approvals
- require approval on the latest reviewable push
- require conversation resolution
- block deletion
- block non-fast-forward updates
- no bypass actors
- no `required_linear_history`

Repository setting preconditions:

- `allow_merge_commit=true`
- `default_workflow_permissions=read`
- `can_approve_pull_request_reviews=false`
- `sha_pinning_required=true` only after workflow refs are fully pinned

## 5. Verify names only and capture sanitized evidence

Run:

```sh
node scripts/release/verify-github-config.js --repo jmassardo/bambuddy-mobile
```

Capture only:

- names
- booleans
- IDs
- refs
- timestamps
- pass/fail findings

Never capture:

- secret values
- variable values
- copied credentials from `copilot`
- broad token contents

`docs/release-configuration-verification.md` is a **current snapshot**, not an append-only log.

## 6. Release prep must originate from `dev`

`release-query` only accepts the `dev` branch. Any prep workflow using that environment must be triggered from `dev`.

Relevant project commands remain unchanged:

```sh
npm run build:ios:release
npm run build:android:release
npm run beta:ios
npm run beta:android
bundle exec fastlane ios beta
bundle exec fastlane android beta
```

Do not redesign workflows in this issue; later release workflow issues must call the existing commands from approved refs only.

## 7. Tag, build, and promotion must originate from `vX.Y.Z`

GitHub evaluates environment restrictions against the **caller ref**, not a later checkout target. That means:

- `release-ios`, `release-android`, `production-ios`, and `production-android` must run from the release tag ref itself;
- a workflow running on `main` cannot enter those tag-only environments just because it later checks out a tag;
- `dev`→`main` promotion must stay merge-commit based, then the release tag must be cut from that merge commit.

Release promotion sequence:

1. merge `dev` into `main` with a merge commit;
2. create the release tag `vX.Y.Z` on that merge commit;
3. dispatch tag-based release jobs;
4. require manual production approval from `jmassardo` only after release artifacts are ready.

## 8. Retry, provider outage, and emergency revocation

### Retry

- rerun the same tag-based workflow if the failure is transient;
- if verification fails, remediate forward and re-run;
- never weaken protections to “get one run through.”

### Provider outage

- pause release attempts;
- keep environments and rulesets intact;
- document the provider outage and retry window on the issue;
- do not bypass production approvals or branch governance.

### Emergency revocation

- revoke affected provider credentials out-of-band;
- remove or rotate the affected environment secret values without changing secret names;
- if needed, temporarily disable the impacted release workflow by human review, not by relaxing rulesets;
- refresh the verification evidence after the remediation.

## 9. Manual blocked-path tests

Run these only after prerequisites are ready:

1. open one disposable automation-authored PR into `dev`;
2. confirm merge is blocked until:
   - one eligible approval exists;
   - all five required checks are green;
   - all review conversations are resolved;
3. close the probe PR unmerged;
4. repeat with one disposable automation-authored `dev`→`main` probe PR;
5. confirm a direct push to `dev` or `main` is blocked;
6. confirm production jobs cannot self-approve.

Current limitation:

- with only `jmassardo` as a direct collaborator and no approved automation identity yet, these blocked-path PR validations remain intentionally pending.

## 10. Explicit fail-closed production statement

Production is **fail-closed today**. Do not weaken reviewer or self-review protections to make a single-user topology pass. Production approval stays blocked until a second eligible collaborator or approved automation trigger path exists.

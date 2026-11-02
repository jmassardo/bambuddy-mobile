# Build-once releases

This is the current release policy. It supersedes the historical manual-approval
contract in `release-configuration-checklist.md`, `release-operations.md`, and
`scripts/release/github-governance-contract.js`. Those documents and their tests
remain historical references, not activation requirements for this pipeline.

## Release flow

1. A push to `develop` reserves a unique patch version and shared iOS/Android build
   number, merges current `main`, and commits version metadata to a candidate branch.
2. TypeScript, lint, and the complete Jest suite must pass before signing.
   One signed IPA and one signed AAB are built and uploaded to TestFlight and Play
   internal testing. No human beta-testing approval is required.
3. The successful run records the candidate commit, exact Git tree, version,
   build numbers, run identity, and both binary checksums in a retained artifact.
   A dedicated GitHub App opens a merge-commit PR to `main` and enables auto-merge.
4. Required PR checks verify the originating run succeeded and the proposed merge
   has exactly the tested tree. `main` promotes those existing store builds by API:
   it never compiles, signs, or uploads another app binary.
5. After both submissions succeed, `develop` is fast-forwarded to the release only
   if it has no newer work. This uses `GITHUB_TOKEN`, deliberately avoiding another
   workflow trigger. Newer development is never reset or overwritten.

App Store review and Google review still determine public availability. Submission
is automatic; approval is not guaranteed. Both stores must already have their
app records, agreements, review information, and required listings configured.
Apple's API key needs access to builds and App Store submission; the Play service
account needs app-specific testing and production release permissions.

## Configuration and activation

`scripts/release/configure-automation.js` defines required environment secret
names. Never commit credential values. Configure:

| Environment | Allowed branch | Credentials |
| --- | --- | --- |
| `release-query` | `develop` | Apple API key trio, Google service-account JSON, automation App private key |
| `release-ios` | `develop` | Apple API key trio, Match password and read-only SSH deploy key |
| `release-android` | `develop` | Google JSON, release keystore and its password/alias/key password |
| `production-ios` | `main` | Apple API key trio only; no signing credentials |
| `production-android` | `main` | Google JSON only; no signing credentials |

Repository variables: `APPLE_TEAM_ID`, `MATCH_GIT_URL`,
`RELEASE_AUTOMATION_APP_ID`. Existing repository-scoped demo secrets remain
available to candidate build jobs. The Match repository must already contain valid
App Store certificates and profiles; CI uses read-only Match.
`MATCH_GIT_URL` uses the SSH URL of that repository. Store the unencrypted
OpenSSH deploy key in `release-ios/MATCH_GIT_PRIVATE_KEY` and install its public
key on the signing repository with write access disabled. CI pins SSH host keys
from GitHub's HTTPS metadata API and deletes temporary key files even on failure.

Install the dedicated GitHub App only on this repository, with Contents and Pull
requests write and Metadata read. Store its private key only in `release-query`.
Do not substitute a personal access token or grant the App administration access.
The App creates candidate commits and PRs so GitHub runs the required checks.

After reviewing and merging the implementation PR into `develop`, verify actual
credential access, then run:

```sh
node scripts/release/configure-automation.js          # names-only preflight
node scripts/release/configure-automation.js --apply  # explicit activation
```

Activation refuses to mutate configuration if required names are missing. It
allows only the branch callers above, removes human deployment approval gates
for these five environments, enables repository auto-merge, and manages the
`automated-tested-store-release` ruleset on `main`: merge PRs, strict
`TypeScript Check`, `Lint`, `Test`, and `Release Candidate` checks from GitHub
Actions, no bypass actors, no deletion, and no force pushes. Other rulesets remain
untouched; conflicting additional review requirements must be reconciled explicitly.
Names-only preflight does not validate credential contents or grant store access.
Protected `develop` rules must permit the fast-forward synchronization; otherwise
merge `main` back into `develop` through the normal reviewed path.

Activation has not happened merely because workflow files or secret names exist.
Once configured, a new push to `develop` starts the first candidate. A commit
message containing `[skip release]` intentionally skips candidate generation.

## Failures and retries

Use **Re-run failed jobs**, not **Re-run all jobs**, for an interrupted candidate.
Successful signing jobs and their artifacts must be retained. Re-running all jobs
is rejected at preparation to prevent changing the version beneath immutable
artifact names. Failed preparation or signing/upload ambiguity requires a fresh
develop push rather than reusing a possibly uploaded store build number.
PR creation is a separate, idempotent job so its retry reuses completed artifacts.
Reserved versions and build numbers are never reused; gaps after failure are expected.

Artifacts are retained for 90 days. Missing/expired artifacts, changed binaries,
changed merge trees, failed source runs, and superseded candidates stop promotion.
If `main` changes incompatibly, reconcile it into `develop` and create a fresh
candidate; never rebuild or modify an already-tested candidate to make it merge.
Reconcile branches likewise when concurrent development prevents the metadata sync.

Stores are independent and cannot commit atomically. If one submission succeeds
and the other fails, retry **Promote Store Release** on the same latest `main`
commit. Promotion is idempotent for the exact existing build. A different build or
an unrelated App Store version already in review fails rather than being replaced.
One older `REJECTED` App Store version can be updated to the candidate version,
preserving its existing listing and review metadata for resubmission. Other drafts,
newer rejected versions, and multiple editable versions are never repurposed.
Use manual workflow dispatch only on `main`; superseded main events are rejected.

To halt future releases, disable **Release Candidate** and **Promote Store Release**
in Actions and revoke the automation App installation token/private key as needed.
Store submissions already accepted require separate store-console intervention.

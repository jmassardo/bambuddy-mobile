# Backups, diagnostics and server maintenance

The Backup settings section supports ZIP exports, scheduled local snapshots,
native ZIP selection, saved-file download/share, deletion and full restore.
Save a changed output path before validating it: validation probes the server's
saved path and reports permission, read-only filesystem and ephemeral-container
storage problems. Local run times use the server-reported timezone.

**A full ZIP restore replaces the database, users, settings and data
directories.** Confirm the replacement only after preserving any needed data.
Restart the BambuBuddy server afterwards, then choose **Re-enter restored
system**. This clears the old connection and authentication state; reconnect to
the server with the restored credentials. Restore requests are never retried
automatically.

Remote Git backups support GitHub, GitLab, Gitea and Forgejo, explicit insecure
HTTP opt-in, category selection and hourly/daily/weekly schedules. Manual
disables scheduling. The Git API does not accept a time-of-day field. Initial
configuration must pass the server's private-repository checks. Leaving the
token blank when editing preserves the stored token.

Git restore previews a concrete commit before confirmation. Only selected
available categories are restored, subject to category write permissions.
Overwrite controls existing database records, **not K-profile printer slots**:
K-profiles always replace matching slots. Verify sent profiles on the printer;
a sent profile can be counted without a device acknowledgement. Cloud presets
are not restored. Credential-like settings are skipped. Git archives contain
metadata, not 3MF files or thumbnails. Results include per-category restored,
skipped and failed counts plus server explanations. History can load older rows.

System displays runtime and connected-printer details, complete storage scans,
known log-health findings and focused rescanning. Application logs use the real
server log endpoint with search, all supported severity levels, multiline
expansion, deliberate buffer clearing, live refresh and optional auto-scroll.

Server update checks and release notes are separate from mobile-app updates.
Git deployments offer an explicitly confirmed update; Docker, Home Assistant
and Windows installer deployments show the appropriate supported host actions.
The app does not execute displayed Docker commands.

Guided bug reports run diagnostic preflight, accept an optional screenshot,
and allow a reproduction interval after starting logging. Leave the screen,
reproduce the issue, then return to **Stop and submit report**. Collection
expires after five minutes, restores the prior debug setting and **never
automatically submits**. Failed stopping preserves the session for retry;
failed submission retains the captured sanitized logs. Sessions are scoped to
the configured server. Discarding restores logging and removes the local
draft. Screenshots survive navigation but not process restart.

Edits to reproduction steps, email and diagnostic opt-in/out are saved as they
change during collection and while reviewing a stopped draft. Draft edits,
logging-stop results and resumed reads are serialized so automatic expiry
cannot overwrite newer text or reset diagnostic consent. If device storage
rejects an edit, the screen retains it and shows an explicit retry warning.

For app integration, mount `BugReportCollectionGuard` from
`@/components/system/BugReportTools` once inside both `QueryClientProvider` and
`AuthProvider`, above navigation. It waits for an authorized server connection,
resumes persisted runs on startup and restores expired
collection on foregrounding. If the app is terminated or offline, restoration
is retried on the next launch/connection; no client can issue a stop request
while its process is not running.

# Local Posting Worker

Run one JSON job using `node worker/posting-worker.js --job <file>`.

Fields:

- `target`: `person` or `group` (default `group` for legacy jobs).
- `mode`: `dry-run` (default) or `live`. Live also requires CLI `--confirm true`.
- `profile`: optional OpenCLI ID/alias. Omit for one connected profile; multiple require explicit choice.
- `slow`: optional boolean for paced input.
- `caption` or `captionFile`: exactly one, with non-empty UTF-8 content.
- `images`: array of readable local paths, maximum 10.
- `screenshotDir`: optional local output directory.
- Group only: `groupUrl` or an approved `groupAlias`, never both.

Personal jobs target the selected personal identity at `/me`; no group or arbitrary profile URL is accepted.
All relative paths inside JSON are resolved against the job file's directory.

The worker discovers connected profiles before posting if no profile was supplied. It never silently chooses among multiple connected contexts. In the single-context case it omits the profile flag and lets the browser use its default routing.

Results support OpenCLI 2.x JSON envelopes. They include status, mode, caption/image counts,
screenshot and `profile_url` or `group_url`. `tab_closed` and any `cleanup_warning` are preserved.
The plugin owns an isolated tab and closes it on success or error. Successful dry-runs
do not capture preview images and return `screenshot: null`. Confirmed posting results
and diagnostic errors can still capture evidence before closing the tab.
A cleanup failure must not cause the post to be repeated.

Approval by the user and the reviewed draft are managed by the skill or calling application.
The worker's live mode/flag check is not proof that a prior draft was approved. Never retry unknown live outcomes.

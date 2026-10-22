# Local Posting Worker

The local posting worker is the machine-friendly wrapper for Hermes. It reads one local JSON job,
validates it and selects `group-post` (default) or `person-post` using `target`.
Group jobs can resolve a configured approved group alias:

```sh
opencli facebook group-post
```

The worker does not add scheduling, queues, analytics, retries, network services, cloud browser automation, or credential handling.

## Job Shape

Personal-profile job (no group configuration required):

```json
{
  "target": "person",
  "mode": "dry-run",
  "profile": "xmqguda9",
  "slow": true,
  "caption": "Personal draft supplied in Telegram or WhatsApp",
  "images": []
}
```

`target` accepts `group` or `person`; omitted means `group` for existing jobs. Optional
`profile` selects the OpenCLI browser context (ID or alias using letters/digits/dot/
underscore/hyphen). Hermes skills request an explicit profile to avoid account ambiguity.
Optional `slow` is boolean and forwards `--slow true` when enabled. Group jobs accept
these fields too. Personal jobs reject group selectors and `profileUrl`, navigate to
the selected personal identity's `/me`, and return `profile_url` instead of `group_url`.
Their default artifact directory is `artifacts/facebook-person-post`. Both job types
require explicit live mode and the worker confirm flag. Conversation-level POST/CANCEL
validation belongs to the Hermes skill; the worker does not independently track a
successful prior dry-run or chat approval. OpenCLI 2.x JSON envelopes are unwrapped.

Dry-run job:

```json
{
  "mode": "dry-run",
  "groupAlias": "main",
  "caption": "Test draft only. Do not publish.",
  "images": [],
  "screenshotDir": "../artifacts/facebook-group-post"
}
```

Live job:

```json
{
  "mode": "live",
  "groupAlias": "main",
  "captionFile": "./caption.txt",
  "images": ["./approved-image.jpg"],
  "screenshotDir": "../artifacts/facebook-group-post"
}
```

Use either `groupAlias` or `groupUrl`, not both. Use either `caption` or `captionFile`, not both. Image paths must be local files; remote image URLs are rejected. Paths inside a job are resolved relative to the job file.

## Commands

Dry-run:

```sh
node worker/posting-worker.js --job examples/job.dry-run.json
```

Live mode requires both `"mode": "live"` in the job and `--confirm true` on the command line:

```sh
node worker/posting-worker.js --job examples/job.live.json --confirm true
```

Package aliases:

```sh
npm run worker:dry-run
npm run worker:confirm
```

## Output

The worker prints compact JSON for Hermes:

```json
{
  "ok": true,
  "status": "dry-run-ready",
  "mode": "dry-run",
  "group_url": "https://www.facebook.com/groups/12345",
  "message": "Composer is prepared and left open for human review. Post was not clicked.",
  "caption_length": 33,
  "image_count": 0,
  "screenshot": "./artifacts/facebook-group-post/dry-run.png",
  "opencli_exit_code": 0
}
```

## Safety

- Default mode is dry-run.
- Dry-run jobs pass `--dry-run true` and never pass `--confirm true`.
- Live jobs pass `--confirm true` only when the job says `"mode": "live"` and the CLI also includes `--confirm true`.
- Unknown group aliases are rejected.
- Empty captions, conflicting caption inputs, missing images, and remote image URLs are rejected before OpenCLI is called.
- The worker does not bypass the plugin; it calls the plugin and keeps the plugin's validation and screenshot behavior.

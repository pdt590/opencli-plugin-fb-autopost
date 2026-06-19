# Local Posting Worker

The local posting worker is the machine-friendly wrapper for Hermes. It reads one local JSON job, validates it, resolves a configured group alias, then calls the existing OpenCLI command:

```sh
opencli facebook group-post
```

The worker does not add scheduling, queues, analytics, retries, network services, cloud browser automation, or credential handling.

## Job Shape

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

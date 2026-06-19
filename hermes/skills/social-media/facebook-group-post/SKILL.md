---
name: facebook-group-post
description: "Prepare and explicitly confirm one Facebook group post from a Hermes Telegram or WhatsApp conversation through the local OpenCLI fb-autopost worker. Use for caption and image intake, dry-run review, POST confirmation, or CANCEL."
version: 1.1.0
author: Ang Jing Kang
license: Apache-2.0
platforms: [macos, linux]
prerequisites:
  commands: [node, opencli]
metadata:
  hermes:
    tags: [facebook, telegram, whatsapp, social-media, opencli, local-automation]
    related_skills: []
---

# Facebook Group Post via Local OpenCLI Worker

## Operating Boundary

Use Hermes only as the Telegram or WhatsApp conversation layer. Perform Facebook browser automation only through the local repository worker:

```sh
cd "$FB_AUTOPOST_REPO"
node worker/posting-worker.js --job <job-file>
```

Keep Brave or Chrome on the local office/laptop machine with:

- OpenCLI Browser Bridge enabled
- Facebook logged in manually
- the OpenCLI plugin installed from this repository

Never run the Facebook browser on Android, a cloud VM, or a messaging platform server.

## Safety Rules

- Default every initial request to dry-run.
- Never publish from the initial request.
- Require the user to reply exactly `POST` before live mode.
- Require `--confirm true` on the live worker command.
- Treat `CANCEL` as final for the pending draft and never call the live worker.
- Call only `worker/posting-worker.js`; never call OpenCLI browser primitives, Browser Bridge APIs, Facebook scripts, or `opencli facebook group-post` directly.
- Process exactly one group in one job.
- Accept only local image paths saved by the Hermes gateway.
- Never store Facebook credentials, cookies, sessions, or passwords.
- Never solve or bypass login, checkpoint, CAPTCHA, 2FA, or action-blocked screens.
- Never schedule, queue, batch, retry a live post, or retry an unknown outcome.

## Intake

Collect:

1. One approved group alias or full Facebook group URL.
2. A non-empty caption.
3. Local image attachment paths, or explicit `NO IMAGES`.

Ask one short follow-up when an input is missing or ambiguous. Do not run the worker until the inputs are complete.

Example user request:

```text
Prepare a Facebook group post.
Group: main
Caption: Stock has arrived today.
Use the attached images.
Dry-run only.
```

## Dry-Run

Create one job under:

```text
$FB_AUTOPOST_REPO/artifacts/hermes-jobs/<job-id>.dry-run.json
```

Shape:

```json
{
  "mode": "dry-run",
  "groupAlias": "main",
  "caption": "Caption text from the user",
  "images": [
    "/absolute/local/path/photo-1.jpg"
  ],
  "screenshotDir": "./artifacts/facebook-group-post"
}
```

Run:

```sh
cd "$FB_AUTOPOST_REPO"
node worker/posting-worker.js --job artifacts/hermes-jobs/<job-id>.dry-run.json
```

Do not pass `--confirm true`.

On `dry-run-ready`, reply:

```text
Draft prepared.
Status: dry-run-ready
Screenshot: <screenshot path>
Reply POST to publish or CANCEL to discard.
```

Keep exactly one pending draft in the current conversation.

## POST

Accept `POST` only when the current conversation has exactly one successful pending dry-run.

Create a new live job using the same group, caption, images, and screenshot directory:

```json
{
  "mode": "live",
  "groupAlias": "main",
  "caption": "Caption text from the user",
  "images": [
    "/absolute/local/path/photo-1.jpg"
  ],
  "screenshotDir": "./artifacts/facebook-group-post"
}
```

Run exactly once:

```sh
cd "$FB_AUTOPOST_REPO"
node worker/posting-worker.js --job artifacts/hermes-jobs/<job-id>.live.json --confirm true
```

Report one of:

- `posted`
- `pending-review`
- `failed`
- `unknown`

For `failed` or `unknown`, include the screenshot when available, tell the user to check Facebook manually, and do not retry.

## CANCEL

On `CANCEL`:

- do not call the worker
- clear the pending confirmation
- tell the user to close or discard any open Facebook draft manually

## Response Templates

Missing group:

```text
Which approved Facebook group should I use?
```

Missing caption:

```text
Please send the caption text for this post.
```

Missing images:

```text
Please attach images, or reply NO IMAGES for a text-only post.
```

Live result:

```text
Submitted. Facebook status: <posted|pending-review|failed|unknown>.
Screenshot: <screenshot path>
```

## Verification

- Confirm `FB_AUTOPOST_REPO` is configured and points to the repository.
- Confirm exactly one group is selected.
- Confirm the caption is non-empty.
- Confirm image inputs are local paths or the user explicitly chose no images.
- Confirm the dry-run job uses `"mode": "dry-run"` and no confirm flag.
- Confirm the user replied exactly `POST` before live mode.
- Confirm the live job uses `"mode": "live"` and the command includes one `--confirm true`.
- Include status and screenshot path when available.

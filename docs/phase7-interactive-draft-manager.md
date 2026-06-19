# Phase 7 Interactive Draft Manager

Phase 7 adds a WhatsApp Business Platform control layer for guided menus. Facebook browser automation still stays local in the OpenCLI plugin and local posting worker.

## Runtime Status

Goal 7B implemented menu rendering, text fallback parsing, and incoming message routing.

Goal 7C adds a local JSON draft store, group store helpers, and a WhatsApp flow state machine.

Goal 7D adds WhatsApp image media download and local image storage.

Goal 7E adds the first local worker integration for dry-run only. A `DRY RUN` action creates a local worker job JSON, calls the existing `worker/posting-worker.js`, stores the worker result on the draft, and returns the status plus screenshot path to WhatsApp.

Goal 7F adds guarded `POST` and `CANCEL` behavior after a successful dry-run. Live publishing still goes only through the local posting worker, and the worker must be called with `--confirm true`.

Goal 7G completes the operator docs, setup guide, troubleshooting guide, and manual pilot checklist. It does not add product behavior.

The runtime wiring now creates persistent local draft/group stores, sends outbound replies through WhatsApp Cloud API, and supports the minimum complete conversation:

```text
MENU -> NEW POST -> group -> caption -> images -> DONE -> DRY RUN -> POST/CANCEL
```

New group URLs require `APPROVE GROUP` before they are stored as approved aliases.

Related docs:

- [WhatsApp Business API reference](whatsapp-business-api.md)
- [WhatsApp Business setup](whatsapp-business-setup.md)
- [WhatsApp Business troubleshooting](whatsapp-business-troubleshooting.md)
- [Phase 7 pilot checklist](phase7-pilot-checklist.md)

## Menu UX

Main Menu:

```text
New Post
Drafts
Groups
Settings
Help
```

Main Menu is rendered as a WhatsApp interactive list payload where supported. The body also includes a text fallback:

```text
Reply 1=New Post, 2=Drafts, 3=Groups, 4=Settings, 5=Help.
```

New Post is rendered as reply buttons where supported:

```text
Use Existing Group
Add New Group URL
Cancel
```

It also includes:

```text
Reply 1=Use Existing Group, 2=Add New Group URL, 3=Cancel.
```

Drafts and Groups return local status information. Settings remains a limited safety summary rather than a remote machine-management interface.

## Incoming Action Normalization

Button replies, list replies, and numbered text fallback are normalized into one internal action shape:

```json
{
  "type": "menu_action",
  "action": "new_post",
  "conversationId": "60123456789",
  "userPhone": "60123456789",
  "messageId": "wamid..."
}
```

Unsupported payloads normalize to:

```json
{
  "type": "unsupported_payload",
  "action": "show_help",
  "reason": "unsupported_payload"
}
```

`POST` is recognized and routed only when exactly one draft in the same user/conversation is `dry_run_ready`:

```json
{
  "type": "menu_action",
  "action": "post",
  "draftStatus": "posted"
}
```

In Goal 7C, `New Post` can create a local draft when the router is given a draft store.

In Goal 7E, `DRY RUN` is recognized and routed through the local worker only when a draft is already `ready_for_dry_run`.

In Goal 7F, `POST` is rejected unless the draft is `dry_run_ready`, has a valid non-expired confirmation token, still has the dry-run screenshot path, and belongs to the same WhatsApp user/conversation. `CANCEL` sets the active draft to `cancelled` and never calls the worker.

## Local Storage

The MVP uses local JSON files, not a database:

```text
artifacts/whatsapp-business/drafts.json
artifacts/whatsapp-business/media/<conversation-id>/<draft-id>/
artifacts/whatsapp-business/jobs/
```

Draft writes are atomic: write a temporary file first, then rename it to `drafts.json`.

Example draft:

```json
{
  "draftId": "draft_20260617120000000_ab12cd34",
  "userPhone": "60123456789",
  "conversationId": "60123456789",
  "groupAlias": "main",
  "groupUrl": "https://www.facebook.com/groups/12345",
  "caption": "Caption text",
  "localImagePaths": [],
  "whatsappMediaIds": [],
  "status": "ready_for_dry_run",
  "dryRunScreenshotPath": null,
  "createdAt": "2026-06-17T12:00:00.000Z",
  "updatedAt": "2026-06-17T12:05:00.000Z",
  "confirmationToken": null,
  "confirmationExpiresAt": null,
  "lastWorkerResult": null
}
```

Example draft after one downloaded image:

```json
{
  "draftId": "draft_20260617120000000_ab12cd34",
  "localImagePaths": [
    "/repo/artifacts/whatsapp-business/media/60123456789/draft_20260617120000000_ab12cd34/media-1.jpg"
  ],
  "whatsappMediaIds": ["media-1"],
  "status": "collecting_images"
}
```

One active collecting draft is allowed per user/conversation. Multiple saved drafts are allowed after earlier drafts are cancelled, failed, posted, or otherwise no longer collecting.

## Dry-Run Worker Integration

When a draft reaches `ready_for_dry_run`, the WhatsApp layer can create this job file:

```text
artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
```

Example job:

```json
{
  "mode": "dry-run",
  "groupAlias": "main",
  "caption": "Caption text",
  "images": [
    "/repo/artifacts/whatsapp-business/media/60123456789/draft_20260617120000000_ab12cd34/media-1.jpg"
  ],
  "screenshotDir": "./artifacts/facebook-group-post"
}
```

The command is:

```sh
node worker/posting-worker.js --job artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
```

The dry-run path never adds `--confirm true`. The worker resolves the group alias locally, calls the OpenCLI plugin in dry-run mode, and returns JSON.

Successful worker result:

```json
{
  "ok": true,
  "status": "dry-run-ready",
  "mode": "dry-run",
  "screenshot": "./artifacts/facebook-group-post/dry-run.png"
}
```

On success, the draft moves to `dry_run_ready`, stores `lastWorkerResult`, stores `dryRunScreenshotPath`, and receives a confirmation token that expires after 30 minutes by default. Editing the group, caption, or images after dry-run clears the old confirmation token.

Failed worker result:

```json
{
  "ok": false,
  "status": "failed",
  "message": "Browser Bridge unavailable",
  "screenshot": "./artifacts/facebook-group-post/failure.png"
}
```

On failure, the draft moves to `failed`, stores `lastWorkerResult`, and keeps any screenshot path returned by the worker.

## POST Worker Integration

After a successful dry-run, `POST` creates this job file:

```text
artifacts/whatsapp-business/jobs/<draft-id>.live.json
```

Example live job:

```json
{
  "mode": "live",
  "groupAlias": "main",
  "caption": "Caption text",
  "images": [
    "/repo/artifacts/whatsapp-business/media/60123456789/draft_20260617120000000_ab12cd34/media-1.jpg"
  ],
  "screenshotDir": "./artifacts/facebook-group-post"
}
```

The command is:

```sh
node worker/posting-worker.js --job artifacts/whatsapp-business/jobs/<draft-id>.live.json --confirm true
```

Safety gates before the live worker call:

- Exactly one `dry_run_ready` draft for the same user/conversation.
- Confirmation token exists.
- Confirmation token is not expired.
- Draft was not edited after dry-run.
- Dry-run screenshot path exists.
- Same user/conversation that owns the draft sends `POST`.

Worker status mapping:

```text
posted -> posted
pending-review -> pending_review
failed -> failed
unknown -> failed
```

`unknown` is deliberately mapped to `failed` and is not retried. The operator must check Facebook manually.

## CANCEL Behavior

`CANCEL` finds the active draft for the same user/conversation and sets it to `cancelled`. It never calls the local worker.

The WhatsApp response tells the user that if a Facebook composer is still open in the local browser, they may need to close or discard it manually.

## Draft Statuses

Allowed statuses:

```text
collecting_group
collecting_caption
collecting_images
ready_for_dry_run
dry_run_running
dry_run_ready
approved_for_post
posting
posted
pending_review
failed
cancelled
```

Allowed state transitions in Goal 7C:

```text
collecting_group -> collecting_caption | cancelled | failed
collecting_caption -> collecting_group | collecting_images | cancelled | failed
collecting_images -> collecting_caption | ready_for_dry_run | cancelled | failed
ready_for_dry_run -> collecting_group | collecting_caption | collecting_images | dry_run_running | cancelled | failed
dry_run_running -> dry_run_ready | failed | cancelled
dry_run_ready -> collecting_group | collecting_caption | collecting_images | approved_for_post | cancelled | failed
approved_for_post -> posting | cancelled | failed
posting -> posted | pending_review | failed
failed -> collecting_group | collecting_caption | collecting_images | cancelled
```

Direct live-state transitions through the generic WhatsApp flow helper are rejected. Goal 7E may move a draft through `dry_run_running` and `dry_run_ready` only through the dry-run worker path. Goal 7F may move a draft through `approved_for_post`, `posting`, `posted`, `pending_review`, or `failed` only through the guarded live worker path.

## Group Store

Group helpers read and write `config/groups.json`.

Supported operations:

- Add group alias and URL.
- List groups.
- Rename group.
- Remove group.
- Approve group for posting.

Facebook group URL validation reuses the existing OpenCLI plugin validation. New group aliases require explicit confirmation before `approvedForPosting: true`.

## Media Handling

Incoming WhatsApp image messages are handled only when a draft store and Cloud API access token are supplied.

Flow:

1. Extract WhatsApp image media ID from the webhook message.
2. Resolve metadata/download URL through the WhatsApp Cloud API helper.
3. Download the binary with bearer auth.
4. Save it locally under:
   ```text
   artifacts/whatsapp-business/media/<conversation-id>/<draft-id>/<media-id>.<ext>
   ```
5. Validate the local file before adding it to the draft.
6. Append only the local path and WhatsApp media ID to the draft.

Supported image types:

```text
.jpg
.jpeg
.png
.webp
.gif
```

Rules:

- Maximum 10 images per draft.
- Missing media IDs are rejected.
- Unsupported MIME types/extensions are rejected.
- Remote image URLs are rejected as worker inputs.
- The WhatsApp access token is never stored in the draft.
- `No Images` remains the explicit text-only path.
- No automatic cleanup scheduler is added in Goal 7D. Manual cleanup can be documented later.

## Allowed Users

If `WHATSAPP_BUSINESS_ALLOWED_USERS` is configured, incoming messages from other phone numbers are rejected before any menu action is routed.

Use comma-separated phone numbers:

```sh
export WHATSAPP_BUSINESS_ALLOWED_USERS="60123456789,60198765432"
```

## Safety Boundaries

- Dry-run worker calls are allowed only for drafts already marked `ready_for_dry_run`.
- The WhatsApp layer does not call OpenCLI directly.
- The WhatsApp layer does not call Browser Bridge directly.
- The WhatsApp layer does not automate Facebook directly.
- Live `POST` is allowed only after a valid dry-run and only through the local worker.
- Dry-run jobs never pass `--confirm true`.
- Live jobs must pass `--confirm true` exactly once.
- A valid dry-run creates a short-lived confirmation token. Editing the draft clears the token and blocks live posting.
- No Facebook credential, cookie, or session handling.
- No scheduler.
- No queue.
- No multi-group posting.
- No analytics.
- No retry behavior.
- Worker receives only local image paths in later phases.
- WhatsApp media access token is never stored in drafts.
- Remote image URLs are rejected as worker inputs.
- `POST` rejects missing, expired, wrong-user, edited-draft, missing-screenshot, and ambiguous multi-draft states.
- Live states cannot be reached directly through WhatsApp flow helpers.

## Verification

Run:

```sh
npm test
npm run whatsapp-business:dry-run
```

Manual Phase 7 pilot:

```text
docs/phase7-pilot-checklist.md
```

Start the local webhook server:

```sh
npm run whatsapp-business
```

Example webhook verification:

```sh
curl "http://127.0.0.1:8787/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=hello"
```

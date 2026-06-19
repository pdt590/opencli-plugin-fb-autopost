# WhatsApp Business Troubleshooting

This guide covers the Phase 7 WhatsApp Business control server. The server still does not post to Facebook, call OpenCLI directly, or automate the browser. The dry-run flow may call the local posting worker, but it must not pass `--confirm true`.

## Webhook Verification Fails

- Confirm `WHATSAPP_VERIFY_TOKEN` is set locally.
- Confirm the same verify token is configured in the Meta webhook dashboard.
- Confirm the public tunnel routes to:
  ```text
  /webhook
  ```
- Test locally:
  ```sh
  curl "http://127.0.0.1:8787/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=hello"
  ```
- Confirm the local server is running:
  ```sh
  npm run whatsapp-business
  ```
- Confirm the HTTPS tunnel points to `http://127.0.0.1:8787/webhook`.

## Invalid Token Or Signature

- If webhook verification fails, rotate the verify token locally and in Meta, then retry verification.
- If POST requests fail with signature errors, confirm `WHATSAPP_APP_SECRET` matches the Meta app secret.
- If signature validation is not ready for a local pilot, unset `WHATSAPP_APP_SECRET` and document that the pilot is local-only.
- Verify the exact signature header and algorithm against official Meta docs before production use.

Do not paste real tokens or app secrets into logs, docs, screenshots, or support messages.

## Unknown User Rejected

- Confirm the user's WhatsApp sender ID is in `WHATSAPP_BUSINESS_ALLOWED_USERS`.
- Use international-format digits without `+`, spaces, or dashes:
  ```sh
  export WHATSAPP_BUSINESS_ALLOWED_USERS="60123456789"
  ```
- If the value contains multiple users, separate them with commas.
- Restart the local server after changing environment variables.

Unknown users must stay rejected. Do not disable allowed-user checks for a real pilot.

## Button Or List Does Not Render

- Confirm the incoming message webhook is reaching the local server.
- Confirm the outgoing interactive payload is a list or button payload.
- Verify current interactive message limits and session-window rules against official Meta docs.
- Use text fallback if the client does not show buttons or lists:
  ```text
  1
  2
  3
  MENU
  HELP
  DRY RUN
  POST
  CANCEL
  ```
- Confirm the user is messaging the WhatsApp Business number, not a different personal number.

## Image Does Not Attach To Draft

- Confirm the incoming webhook message has `type: "image"`.
- Confirm the image payload includes `image.id`.
- Confirm `WHATSAPP_CLOUD_ACCESS_TOKEN` is set.
- Confirm `WHATSAPP_PHONE_NUMBER_ID` is set.
- Confirm the media MIME type is supported:
  ```text
  image/jpeg
  image/png
  image/webp
  image/gif
  ```
- Confirm the draft is already collecting images. The draft needs group and caption before image completion.
- Confirm the media download URL has not expired. Request a fresh image from WhatsApp if needed.

## Unsupported Image Type

Supported local worker image extensions are:

```text
.jpg
.jpeg
.png
.webp
.gif
```

Unsupported MIME types are rejected before the path is added to a draft.

## Too Many Images

Each draft supports at most 10 images. Extra WhatsApp image messages are rejected and do not call the worker.

## Dry-Run Worker Fails

- Confirm the draft status is `ready_for_dry_run`.
- Confirm the worker job exists under:
  ```text
  artifacts/whatsapp-business/jobs/
  ```
- Confirm the job has `"mode": "dry-run"` and does not contain `confirm`.
- Confirm the local machine can run:
  ```sh
  node worker/posting-worker.js --job artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
  ```
- Confirm Browser Bridge is ready with:
  ```sh
  npm run doctor
  npx opencli doctor
  ```
- Resolve Facebook login, checkpoint, CAPTCHA, or action-blocked states manually in the local Brave/Chrome profile. The bot must not bypass them.

## Local Worker Failed

- Run the generated job manually:
  ```sh
  node worker/posting-worker.js --job artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
  ```
- Confirm the job uses local image paths, not remote URLs.
- Confirm the group alias exists in:
  ```text
  config/groups.json
  ```
- Confirm the worker output is JSON and includes `status`, `message`, and `screenshot` when available.
- If the worker returns `failed` or `unknown`, inspect Facebook manually. Do not retry a live post automatically.

## Browser Bridge Disconnected

- Run:
  ```sh
  npx opencli doctor
  npm run doctor
  ```
- Confirm Brave/Chrome is open on the local office/laptop machine.
- Confirm the OpenCLI Browser Bridge extension is installed and enabled in that profile.
- Start the daemon manually if needed:
  ```sh
  node node_modules/@jackwener/opencli/dist/src/daemon.js
  ```
- Retry `npx opencli doctor` after the daemon and browser are ready.

## Facebook Logged Out

- Open Facebook in the same local Brave/Chrome profile used by Browser Bridge.
- Log in manually.
- Run:
  ```sh
  npx opencli facebook groups
  ```
- Continue only after the command can read the account's groups.

The project does not store Facebook credentials and does not perform Facebook login.

## Checkpoint, CAPTCHA, Or Action Blocked

- Stop the pilot.
- Take or preserve the failure screenshot.
- Resolve the screen manually in the local browser.
- Do not use code to bypass, solve, or hide checkpoint, CAPTCHA, 2FA, login, or action-blocked flows.
- Do not retry a failed live post automatically.

## Media Token Safety

The WhatsApp Cloud API access token is used only for the metadata and binary download request. It is not written into `drafts.json`.

Drafts preserve:

```text
localImagePaths
whatsappMediaIds
```

Drafts do not preserve:

```text
access tokens
cookies
Facebook sessions
WhatsApp media download URLs
```

## Manual Cleanup

Goal 7 does not add an automatic cleanup scheduler.

If local media artifacts need to be removed manually after testing, inspect first:

```sh
find artifacts/whatsapp-business/media -type f
```

Then remove only files you no longer need. Do not remove active drafts that are still waiting for dry-run or approval.

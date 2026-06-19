# Phase 7 Pilot Checklist

Use this checklist for the WhatsApp Business interactive draft manager pilot. It is an operator checklist, not an automation script.

The pilot proves this chain:

```text
User WhatsApp
-> WhatsApp Business API webhook/control server
-> local draft manager
-> local posting worker
-> OpenCLI plugin
-> local Brave/Chrome Browser Bridge
-> Facebook
```

Current Phase 7F boundary: dry-run worker integration exists, and live `POST` is allowed only after successful dry-run, valid confirmation token, unchanged draft, screenshot path, and explicit human approval.

## Safety Boundary

- [ ] No scheduler is enabled.
- [ ] No posting queue is enabled.
- [ ] No multi-group posting is enabled.
- [ ] No analytics are added.
- [ ] No cloud browser automation is used.
- [ ] No Facebook password, cookie, token, session, or credential is stored.
- [ ] No CAPTCHA, checkpoint, 2FA, login, or action-blocked bypass is attempted.
- [ ] No retry happens around a live `Post` click.
- [ ] One action targets one approved group.
- [ ] Live posting is skipped unless the current code explicitly supports confirmation and the human operator approves it.

## Automated Checks

- [ ] Install dependencies:
  ```sh
  npm install
  ```
- [ ] Run tests:
  ```sh
  npm test
  ```
- [ ] Preview WhatsApp Business server config:
  ```sh
  npm run whatsapp-business:dry-run
  ```
- [ ] Verify local repo setup:
  ```sh
  npm run setup -- --group-url "<TEST_GROUP_URL>" --group-alias main
  npm run doctor
  ```
- [ ] Verify OpenCLI:
  ```sh
  npx opencli doctor
  npx opencli facebook groups
  ```

## Manual Meta Setup

- [ ] Create or select the Meta app.
- [ ] Enable WhatsApp Business Platform / Cloud API.
- [ ] Connect a WhatsApp Business account.
- [ ] Add or select the WhatsApp Business phone number.
- [ ] Copy the phone number ID into local environment configuration.
- [ ] Create or copy the Cloud API access token into local environment configuration.
- [ ] Choose a local webhook verify token.
- [ ] Configure the app secret if signature verification is used.
- [ ] Configure the allowed users list.
- [ ] Confirm no real token or app secret is committed.

## Mode A Local Tunnel

Mode A is the MVP.

- [ ] Start an HTTPS tunnel to the local server port:
  ```text
  https://<public-tunnel-host>/webhook -> http://127.0.0.1:8787/webhook
  ```
- [ ] Set:
  ```sh
  export WHATSAPP_BUSINESS_PUBLIC_URL="https://<public-tunnel-host>/webhook"
  ```
- [ ] Start the local server:
  ```sh
  source ~/.config/opencli-fb-autopost/whatsapp.env
  npm run whatsapp-business
  ```
- [ ] Configure the Meta webhook callback URL.
- [ ] Configure the same verify token in Meta and locally.
- [ ] Complete webhook verification.

Mode B cloud relay is later/documented only. Do not use it for the MVP pilot unless a secure relay and local connector have been designed and reviewed.

## Browser Bridge Readiness

- [ ] Open Brave or Chrome on the local office/laptop machine.
- [ ] Install and enable the OpenCLI Browser Bridge extension.
- [ ] Confirm Facebook login is manual only.
- [ ] Log into Facebook manually in that browser profile.
- [ ] Confirm Browser Bridge:
  ```sh
  npx opencli doctor
  ```
- [ ] Confirm Facebook session:
  ```sh
  npx opencli facebook groups
  ```
- [ ] If Facebook shows login, checkpoint, CAPTCHA, 2FA, or action-blocked screens, stop the pilot and resolve manually in the browser.

## Interactive Menu Pilot

- [ ] Send a menu trigger from an allowed WhatsApp user.
- [ ] Confirm Main Menu renders as a WhatsApp list where supported.
- [ ] Confirm text fallback is present:
  ```text
  Reply 1=New Post, 2=Drafts, 3=Groups, 4=Settings, 5=Help.
  ```
- [ ] Choose `New Post`.
- [ ] Select an approved alias such as `main`, or send a full group URL and reply `APPROVE GROUP`.
- [ ] Send the caption as one WhatsApp message.
- [ ] Send one or more images.
- [ ] Reply `DONE`.
- [ ] Confirm reply buttons render where supported.
- [ ] Confirm numbered fallback works on a device that does not render buttons/lists.

## Draft Creation Pilot

- [ ] Create a new draft.
- [ ] Choose an existing approved group or add a test group URL.
- [ ] Confirm group URL format is validated.
- [ ] Send the caption.
- [ ] Upload one to three images.
- [ ] Confirm local media files are created under:
  ```text
  artifacts/whatsapp-business/media/
  ```
- [ ] Confirm draft records only local image paths and WhatsApp media IDs.
- [ ] Confirm access tokens and temporary media URLs are not stored in `drafts.json`.

## Dry-Run Pilot

- [ ] Send `DRY RUN`.
- [ ] Confirm a job file is created:
  ```text
  artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
  ```
- [ ] Confirm the job contains:
  ```json
  {
    "mode": "dry-run"
  }
  ```
- [ ] Confirm the job does not contain `confirm`.
- [ ] Confirm the worker command is dry-run only:
  ```sh
  node worker/posting-worker.js --job artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
  ```
- [ ] Confirm WhatsApp response includes status and screenshot path.
- [ ] Confirm Facebook draft visually on the local office/laptop browser:
  - [ ] Caption appears.
  - [ ] Images appear.
  - [ ] Screenshot path exists.
  - [ ] `Post` was not clicked.

## CANCEL Pilot

- [ ] Send `CANCEL`.
- [ ] Confirm the draft is cancelled or no further action is taken.
- [ ] Confirm no live worker command runs.
- [ ] Confirm no `--confirm true` appears in logs or job files.

## POST Pilot

Only run this after a successful dry-run and with explicit human approval in an approved test group.

- [ ] Confirm the draft is `dry_run_ready`.
- [ ] Confirm the dry-run screenshot was reviewed.
- [ ] Confirm the confirmation token is valid and not expired.
- [ ] Human operator explicitly approves one live post.
- [ ] Send `POST`.
- [ ] Confirm the local worker uses:
  ```text
  mode: "live"
  --confirm true
  ```
- [ ] Confirm the result is one of:
  ```text
  posted
  pending-review
  failed
  unknown
  ```
- [ ] If the result is `failed` or `unknown`, inspect Facebook manually. Do not retry automatically.

## Exit Criteria

- [ ] Meta webhook verification passed.
- [ ] Allowed-user filtering works.
- [ ] Unknown users are rejected.
- [ ] Menu and fallback UX are usable.
- [ ] Images download and store locally.
- [ ] Dry-run job shape is correct.
- [ ] Dry-run returns status and screenshot path.
- [ ] Browser Bridge and Facebook session are verified locally.
- [ ] `CANCEL` does not call live worker.
- [ ] `POST` was skipped or completed only with explicit approval.
- [ ] Troubleshooting notes were updated for any pilot friction.

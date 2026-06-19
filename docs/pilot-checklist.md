# Phase 6 Pilot Checklist

Use this checklist on the real local office/laptop machine before calling the repo ready for a nontechnical user.

The pilot proves the full local-first chain:

```text
Telegram or WhatsApp -> Hermes skill -> local posting worker -> OpenCLI plugin -> local Brave/Chrome Browser Bridge -> Facebook
```

## Safety Boundary

- [ ] No scheduler is enabled.
- [ ] No queue is enabled.
- [ ] No multi-group posting is enabled.
- [ ] No analytics are added.
- [ ] No cloud browser automation is used.
- [ ] No Facebook password, cookie, token, session, or credential is stored.
- [ ] No CAPTCHA, checkpoint, 2FA, login, or action-blocked bypass is attempted.
- [ ] No retry happens around the `Post` click.
- [ ] One job targets one approved group.

## Automated Vs Manual

Automated checks:

- [ ] `npm install`
- [ ] `npm test`
- [ ] `npm run setup -- --group-url "<TEST_GROUP_URL>" --group-alias main`
- [ ] `npm run doctor`
- [ ] `node worker/posting-worker.js --job <job.json>`
- [ ] `node scripts/install-hermes-skill.js --dry-run`
- [ ] `node scripts/install-hermes-skill.js --force`
- [ ] `hermes skills list`

Manual-only checks:

- [ ] Facebook login in the connected Brave/Chrome profile.
- [ ] Browser Bridge extension setup and connection.
- [ ] `opencli facebook groups` verification.
- [ ] Visual dry-run confirmation in Facebook.
- [ ] Any live `--confirm true` post.
- [ ] Telegram bot setup or WhatsApp QR pairing.
- [ ] Messaging image attachment pilot.
- [ ] CAPTCHA, checkpoint, 2FA, login wall, or action-blocked resolution.

## 1. Clean-Machine Install Test

- [ ] Clone the repo into a fresh folder:
  ```sh
  git clone https://github.com/thenotoriousmrkrabs/opencli-plugin-fb-autopost.git
  cd opencli-plugin-fb-autopost
  ```
- [ ] Install dependencies:
  ```sh
  npm install
  ```
- [ ] Run tests:
  ```sh
  npm test
  ```
- [ ] Run setup with the approved test group:
  ```sh
  npm run setup -- --group-url "<TEST_GROUP_URL>" --group-alias main
  ```
- [ ] Confirm these files exist:
  ```text
  config/settings.json
  config/groups.json
  artifacts/facebook-group-post/
  ```
- [ ] Confirm setup reports one of:
  ```text
  [ok] Local OpenCLI plugin installed
  [ok] Local OpenCLI plugin already installed
  ```

## 2. OpenCLI PATH Verification

- [ ] Check repo-local OpenCLI:
  ```sh
  node_modules/.bin/opencli --version
  ```
- [ ] Check the user-friendly command:
  ```sh
  npx opencli --version
  ```
- [ ] If bare `opencli` is expected on this machine, check:
  ```sh
  opencli --version
  ```
- [ ] If `opencli` is not found, do not block the pilot if `npx opencli ...` and `node_modules/.bin/opencli ...` work.
- [ ] Confirm `docs/troubleshooting.md` explains:
  ```text
  npm install
  npx opencli ...
  node_modules/.bin/opencli ...
  npm install -g @jackwener/opencli
  ```

## 3. Browser Bridge Readiness

- [ ] Open Brave or Chrome locally.
- [ ] Install and enable the official OpenCLI Browser Bridge extension in the same profile that will use Facebook.
- [ ] Start the daemon manually if automatic startup fails:
  ```sh
  node node_modules/@jackwener/opencli/dist/src/daemon.js
  ```
- [ ] Verify OpenCLI connectivity:
  ```sh
  node_modules/.bin/opencli doctor -v
  ```
- [ ] Open Facebook through OpenCLI if needed:
  ```sh
  node_modules/.bin/opencli browser fb-login --window foreground open "https://www.facebook.com"
  ```
- [ ] Log into Facebook manually in that same browser profile.
- [ ] Verify Facebook session:
  ```sh
  node_modules/.bin/opencli facebook groups
  npm run doctor
  ```
- [ ] Confirm `npm run doctor` reports:
  ```text
  [ok] OpenCLI plugin visible
  [ok] Browser Bridge available
  [ok] Facebook session readable
  ```

## 4. OpenCLI Plugin Dry-Run Acceptance

- [ ] Prepare one short test caption.
- [ ] Prepare local image files if the pilot includes images.
- [ ] Run dry-run only:
  ```sh
  npx opencli facebook group-post \
    --group-url "<TEST_GROUP_URL>" \
    --caption "Test draft only. Do not publish." \
    --images "./test-1.jpg,./test-2.jpg" \
    --dry-run true
  ```
- [ ] Confirm the returned JSON includes:
  ```text
  "status": "dry-run-ready"
  "mode": "dry-run"
  ```
- [ ] Visually confirm in Facebook:
  - [ ] Caption appears.
  - [ ] Images appear.
  - [ ] Screenshot path exists.
  - [ ] `Post` was not clicked.
- [ ] Close or discard the draft manually if Facebook asks about leaving the page.

## 5. Optional Supervised Live Test

Only do this with explicit human approval and only in the approved test group.

- [ ] Dry-run has already passed visually.
- [ ] Human operator approves one live test.
- [ ] Run live mode:
  ```sh
  npx opencli facebook group-post \
    --group-url "<TEST_GROUP_URL>" \
    --caption "Supervised live test." \
    --images "./test-1.jpg" \
    --confirm true
  ```
- [ ] Confirm the result is one of:
  ```text
  posted
  pending-review
  failed
  unknown
  ```
- [ ] If result is `unknown`, check Facebook manually. Do not retry automatically.

## 6. Worker Acceptance

- [ ] Create a real local job file:
  ```json
  {
    "mode": "dry-run",
    "groupAlias": "main",
    "caption": "Worker dry-run test. Do not publish.",
    "images": ["./test-1.jpg"]
  }
  ```
- [ ] Run the worker:
  ```sh
  node worker/posting-worker.js --job <job.json>
  ```
- [ ] Confirm Hermes-friendly JSON output includes:
  ```text
  "ok": true
  "status": "dry-run-ready"
  "mode": "dry-run"
  "screenshot": 
  ```
- [ ] Confirm dry-run worker output never passes `--confirm true`.
- [ ] Confirm a live worker job rejects unless both are true:
  ```text
  "mode": "live"
  --confirm true
  ```

## 7. Hermes Messaging Pilot

- [ ] Install the skill:
  ```sh
  node scripts/install-hermes-skill.js --dry-run
  node scripts/install-hermes-skill.js --force
  hermes skills list
  ```
- [ ] Configure the recommended Telegram gateway:
  ```sh
  hermes gateway setup
  ```
- [ ] Use a BotFather token and numeric Telegram allowed-user ID.
- [ ] Or pair Hermes WhatsApp manually:
  ```sh
  hermes whatsapp
  ```
- [ ] Start the gateway:
  ```sh
  hermes gateway start
  hermes gateway status
  ```
- [ ] Send a real Telegram or WhatsApp command with a caption and local/attached images.
- [ ] Confirm Hermes creates dry-run only.
- [ ] Confirm Hermes replies with status and screenshot path.
- [ ] Reply `CANCEL` and confirm no live worker is called.
- [ ] Repeat with operator approval, reply `POST`, and confirm Hermes calls the live worker with `--confirm true`.

## 8. Pilot Exit Criteria

- [ ] Clean-machine install passed.
- [ ] PATH fallback is documented and verified.
- [ ] Browser Bridge is connected.
- [ ] Facebook login is manual and verified through `opencli facebook groups`.
- [ ] OpenCLI plugin dry-run passed with screenshot.
- [ ] Worker dry-run passed with Hermes-friendly JSON.
- [ ] Hermes Telegram or WhatsApp dry-run pilot passed.
- [ ] Optional live test was either passed with explicit approval or intentionally skipped.
- [ ] All confusing pilot friction was fixed or recorded before release.

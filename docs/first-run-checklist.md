# First-Run Checklist

Use this checklist once on the local office/laptop machine.

After this checklist passes, use [docs/pilot-checklist.md](pilot-checklist.md) for the real end-to-end pilot and [docs/release-checklist.md](release-checklist.md) before tagging `v0.1.0`.

## Install

- [ ] Install Node 20 or newer.
- [ ] Install OpenCLI globally if you want the bare `opencli` command:
  ```sh
  npm install -g @jackwener/opencli
  ```
  You can skip the global install and use `npx opencli ...` after `npm install`.
- [ ] Install Hermes Agent.
- [ ] Clone this repo:
  ```sh
  git clone https://github.com/thenotoriousmrkrabs/opencli-plugin-fb-autopost.git
  cd opencli-plugin-fb-autopost
  ```
- [ ] Install repo dependencies:
  ```sh
  npm install
  ```

## Configure Local Posting

- [ ] Run setup with the approved Facebook group:
  ```sh
  npm run setup -- --group-url "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" --group-alias main
  ```
- [ ] Install the OpenCLI plugin if setup did not already do it:
  ```sh
  npx opencli plugin install "file://$(pwd)"
  ```
- [ ] Open Brave or Chrome with the OpenCLI Browser Bridge extension.
- [ ] Log into Facebook manually in that browser profile.
- [ ] Verify Facebook from the same Browser Bridge profile:
  ```sh
  node_modules/.bin/opencli facebook groups
  ```
- [ ] Check local readiness:
  ```sh
  npm run doctor
  ```

## Configure Hermes Telegram (Recommended)

- [ ] Install the Hermes skill:
  ```sh
  node scripts/install-hermes-skill.js --force
  ```
- [ ] Confirm Hermes can see it:
  ```sh
  hermes skills list
  ```
- [ ] Create a Telegram bot with `@BotFather` and obtain your numeric Telegram user ID.
- [ ] Configure the Hermes Telegram gateway:
  ```sh
  hermes gateway setup
  ```
- [ ] Enter the Telegram bot token and numeric allowed-user ID when prompted.
- [ ] Start Hermes gateway:
  ```sh
  hermes gateway start
  hermes gateway status
  ```
- [ ] See [docs/hermes-telegram.md](hermes-telegram.md) for the full setup and troubleshooting flow.

## Optional Hermes WhatsApp

- [ ] For Hermes WhatsApp QR pairing instead of Telegram:
  ```sh
  hermes whatsapp
  hermes gateway start
  ```
- [ ] See [docs/hermes-whatsapp.md](hermes-whatsapp.md).

## First Dry-Run Test

- [ ] Run one OpenCLI dry-run:
  ```sh
  npx opencli facebook group-post \
    --group-url "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" \
    --caption "Test draft only. Do not publish." \
    --dry-run true
  ```
- [ ] Confirm the browser shows a draft.
- [ ] Confirm screenshot was saved.
- [ ] Confirm `Post` was not clicked.
- [ ] Record the result in [docs/pilot-checklist.md](pilot-checklist.md) before any live test.

## First Hermes Chat Test

- [ ] Send this request through the configured Telegram or WhatsApp conversation:
  ```text
  Post to Supplier Hardware group
  Test draft only. Do not publish.
  ```
- [ ] Attach test images if needed.
- [ ] Confirm Hermes replies with:
  ```text
  Draft prepared...
  Reply POST to publish or CANCEL to discard.
  ```
- [ ] Reply `CANCEL` for the first test.

## Safety Confirmation

- [ ] Local browser remains available.
- [ ] No cloud browser automation is configured.
- [ ] No scheduler is configured.
- [ ] No queue is configured.
- [ ] No Facebook credentials are stored in this repo, Hermes, or OpenCLI config.
- [ ] Live posting will only happen after an exact chat reply of `POST` and worker `--confirm true`.
- [ ] Any first live post is a supervised manual approval step, not part of unattended setup.

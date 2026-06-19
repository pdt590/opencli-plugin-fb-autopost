# Hermes WhatsApp Skill Wrapper

Hermes is the WhatsApp control layer. The Facebook browser automation stays local in the OpenCLI plugin and local posting worker.

Do not run the Facebook browser on Android or Oracle Cloud. The office/laptop machine must keep Brave or Chrome available with the OpenCLI Browser Bridge extension and a manually logged-in Facebook session.

## Install The Hermes Skill

From this repo:

```sh
node scripts/install-hermes-skill.js --dry-run
node scripts/install-hermes-skill.js --force
hermes skills list
```

Symlink mode is useful during development:

```sh
node scripts/install-hermes-skill.js --mode symlink --force
```

The skill is installed to:

```text
~/.hermes/skills/social-media/facebook-group-post/
```

## Prepare Local Posting

Run the local setup first:

```sh
npm install
npm run setup -- --group-url "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" --group-alias supplier-hardware
npm run doctor
```

The doctor command must show the plugin, Browser Bridge, and Facebook session as ready before live use.

## Prepare Hermes WhatsApp

Pair WhatsApp and start the gateway:

```sh
hermes whatsapp
hermes gateway status
hermes gateway start
```

The Hermes skill expects WhatsApp image attachments to be available as local file paths on the same machine where this repo and browser are running.

## Message Flow

User:

```text
Post to Supplier Hardware group
Alhamdulillah, tempahan PU Metal Foam pelanggan kami telah selamat tiba.
```

User attaches images in WhatsApp.

Hermes:

```text
Draft prepared. Screenshot: ./artifacts/facebook-group-post/dry-run-2026-06-12T15-13-31-432Z.png
Status: dry-run-ready
Reply POST to publish or CANCEL to discard.
```

User:

```text
POST
```

Hermes:

```text
Submitted. Facebook status: pending-review.
Screenshot: ./artifacts/facebook-group-post/post-2026-06-12T15-18-21-709Z.png
```

## Safety Rules

- First run is always dry-run.
- Live posting requires a WhatsApp `POST` reply and worker `--confirm true`.
- `CANCEL` discards the pending draft and does not call the worker.
- Hermes must call `node worker/posting-worker.js --job ...`.
- Hermes must not call browser APIs directly.
- Hermes must not schedule, batch, or retry posts.
- Hermes must not store Facebook credentials, cookies, sessions, or passwords.
- Hermes must not accept remote image URLs for uploads.

## Verification Commands

```sh
npm test
node scripts/install-hermes-skill.js --dry-run
node scripts/install-hermes-skill.js --force
hermes skills list
node worker/posting-worker.js --job examples/job.dry-run.json
```

The worker command may reject safely if `config/groups.json` does not yet define the example alias.

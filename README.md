# OpenCLI Facebook Group Autopost

Local-first Facebook group posting through an OpenCLI plugin and Hermes skill for Telegram or WhatsApp.

The system opens Facebook in your own logged-in Brave/Chrome profile, fills one group post with a caption and optional images, and stops at a reviewable dry-run. Live publishing requires an explicit `POST` confirmation and a second worker safety flag.

## What This Project Adds

- `opencli facebook group-post`
- dry-run by default
- one-click prevention through explicit `--confirm true`
- local image attachment and verification
- screenshots for dry-run, live result, and failures
- one-group-at-a-time local posting worker
- Hermes skill for Telegram or WhatsApp conversations
- Telegram-first onboarding without webhooks or tunnels
- optional WhatsApp Business Cloud API interactive menus
- setup, doctor, packaging, pilot, and troubleshooting tools

## Architecture

```text
Telegram or WhatsApp
-> Hermes messaging gateway or WhatsApp Business adapter
-> local posting worker
-> OpenCLI plugin
-> local Browser Bridge
-> Brave/Chrome Facebook session
```

Facebook automation always stays on the local office/laptop machine.

## Safety

- Dry-run is the default.
- No unattended live posting.
- Reply POST to publish or CANCEL to discard.
- Live mode also requires `--confirm true`.
- One job targets one Facebook group.
- No scheduler or queue.
- No multi-group or concurrent posting.
- No automatic retry around the Facebook `Post` click.
- No cloud browser automation.
- No Facebook password, cookie, token, session, or credential collection.
- No CAPTCHA, checkpoint, 2FA, login-wall, or action-blocked bypass.
- No stealth, proxy, fingerprinting, or rate-limit evasion.

Use this project only for groups where you are allowed to post. Facebook UI changes can break browser selectors, and automated activity may be restricted by Facebook or group rules.

## Requirements

- macOS is the primary tested platform
- Node.js 20 or newer
- Brave or Chrome
- Facebook logged in manually
- OpenCLI Browser Bridge extension
- OpenCLI 1.8.3 or compatible
- Hermes Agent 0.14.0 or newer for messaging control

## Zero-To-One Setup

### 1. Install Hermes Agent

Official Hermes installer:

```sh
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.zshrc
hermes setup
```

Select an inference provider and model during setup. Hermes Agent is developed by Nous Research.

### 2. Clone This Repository

```sh
git clone https://github.com/thenotoriousmrkrabs/opencli-plugin-fb-autopost.git
cd opencli-plugin-fb-autopost
npm install
```

### 3. Install OpenCLI

```sh
npm install -g @jackwener/opencli@1.8.3
opencli --version
```

If a global install is unavailable, commands in this repository can use:

```sh
npx opencli
```

### 4. Install Browser Bridge

1. Install the official OpenCLI Browser Bridge extension from the OpenCLI release or Chrome Web Store instructions.
2. Open Brave or Chrome.
3. Enable the extension in the same browser profile used for Facebook.
4. Log into Facebook manually.
5. Verify:

```sh
opencli doctor
opencli facebook groups
```

This project never asks for or stores a Facebook password.

### 5. Install the OpenCLI Plugin

From the repository:

```sh
opencli plugin install "file://$(pwd)"
opencli plugin list
```

The `opencli-plugin-` prefix is removed by OpenCLI, so the installed plugin is named `fb-autopost`.

### 6. Configure the First Group

```sh
npm run setup -- \
  --group-url "https://www.facebook.com/groups/<GROUP_ID>" \
  --group-alias main
```

This creates ignored local files:

```text
config/settings.json
config/groups.json
```

Do not commit private group configuration.

### 7. Install the Hermes Skill

```sh
node scripts/install-hermes-skill.js --dry-run
node scripts/install-hermes-skill.js --force
hermes skills list
```

The installer:

- copies `facebook-group-post` into `~/.hermes/skills/social-media/`
- records this repository as `FB_AUTOPOST_REPO` in `~/.hermes/.env`
- does not store Facebook credentials

## Recommended Channel: Telegram

Telegram uses long polling. It does not require a webhook, Cloudflare tunnel, Meta app, domain, or WhatsApp Business payment configuration.

### 1. Create the Bot

1. Message `@BotFather` in Telegram.
2. Run `/newbot`.
3. Choose a bot name and username.
4. Keep the bot token private.

### 2. Find Your Numeric User ID

Message `@userinfobot`. Use the numeric ID it returns.

Do not use your Telegram username such as `@example`; Hermes allowlists numeric IDs.

### 3. Configure Hermes Telegram

```sh
hermes gateway setup
```

Enter:

- the private BotFather token
- the numeric allowed user ID
- the same numeric ID as the home channel

Then start and verify:

```sh
hermes gateway start
hermes gateway status
hermes status
```

Send `/start` to the bot. If Hermes reports an unauthorized user, replace `TELEGRAM_ALLOWED_USERS` and `TELEGRAM_HOME_CHANNEL` in `~/.hermes/.env` with the numeric ID, then restart the gateway.

Detailed guide: [docs/hermes-telegram.md](docs/hermes-telegram.md)

## First Dry-Run

Open Brave/Chrome and confirm Browser Bridge is connected:

```sh
npm run doctor
opencli doctor
opencli facebook groups
```

Send this to the Telegram bot and attach local images:

```text
Use the facebook-group-post skill.

Prepare one Facebook group post.
Group: main
Caption:
Test draft only. Do not publish.

Run dry-run only and return the screenshot path.
```

Expected response:

```text
Draft prepared.
Status: dry-run-ready
Screenshot: <local path>
Reply POST to publish or CANCEL to discard.
```

Review the local browser draft. Use `CANCEL` for the first test.

## Live Posting

Only after reviewing a successful dry-run:

```text
POST
```

Hermes must create a live job from the same reviewed inputs and call:

```sh
node worker/posting-worker.js --job <live-job.json> --confirm true
```

Valid outcomes:

- `posted`
- `pending-review`
- `failed`
- `unknown`

Failed or unknown outcomes are never retried automatically.

## Optional WhatsApp Paths

Two WhatsApp modes remain available:

1. Hermes WhatsApp QR pairing for simple text conversations.
2. WhatsApp Business Cloud API for official interactive menus.

WhatsApp Business requires Meta credentials and a public HTTPS webhook. Telegram is recommended for the simplest free onboarding.

- Hermes WhatsApp: [docs/hermes-whatsapp.md](docs/hermes-whatsapp.md)
- WhatsApp Business setup: [docs/whatsapp-business-setup.md](docs/whatsapp-business-setup.md)
- WhatsApp Business API reference: [docs/whatsapp-business-api.md](docs/whatsapp-business-api.md)
- WhatsApp Business draft manager: [docs/phase7-interactive-draft-manager.md](docs/phase7-interactive-draft-manager.md)
- WhatsApp Business pilot checklist: [docs/phase7-pilot-checklist.md](docs/phase7-pilot-checklist.md)
- WhatsApp Business troubleshooting: [docs/whatsapp-business-troubleshooting.md](docs/whatsapp-business-troubleshooting.md)

## Useful Commands

```sh
npm test
npm run doctor
npm run setup -- --group-url "<GROUP_URL>" --group-alias main
node scripts/install-hermes-skill.js --force
node worker/posting-worker.js --job examples/job.dry-run.json
npm run package
```

## Packaging

Preview the local handoff archive:

```sh
node scripts/package-local.js --dry-run
```

Create it:

```sh
npm run package
```

The compatibility alias remains available:

```sh
npm run package:local
```

## Documentation

- [First-run checklist](docs/first-run-checklist.md)
- [Telegram + Hermes](docs/hermes-telegram.md)
- [Operator guide](docs/operator-guide.md)
- [Setup details](docs/setup-guide.md)
- [Local worker](docs/local-worker.md)
- [Pilot checklist](docs/pilot-checklist.md)
- [Release checklist](docs/release-checklist.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Manual browser recon](docs/level1-runbook.md)

## Attribution

This is an independent community extension built on top of [OpenCLI](https://github.com/jackwener/OpenCLI), created by Jack Wener and licensed under Apache License 2.0. OpenCLI provides the plugin framework, Browser Bridge, browser primitives, and logged-in browser execution model.

This repository adds the Facebook `group-post` command, validation and safety gates, caption/image browser flow, local posting worker, setup and doctor tooling, Hermes skill, Telegram workflow, and optional WhatsApp Business control layer.

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is developed by Nous Research and licensed under MIT.

This project is not affiliated with or endorsed by OpenCLI, Jack Wener, Nous Research, Meta, Facebook, WhatsApp, Telegram, Brave, or Google.

See [NOTICE.md](NOTICE.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Licensed under Apache License 2.0. See [LICENSE](LICENSE).

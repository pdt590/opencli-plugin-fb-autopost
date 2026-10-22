# Hermes Telegram Setup

The installer now includes both `facebook-group-post` and `facebook-person-post`.
For a personal post, send Hermes:

```text
Use the facebook-person-post skill.
Prepare one personal Facebook post, profile xmqguda9, slow mode.
Caption: This is my personal draft.
NO IMAGES. Dry-run only.
```

After the preview, reply `POST` in the same conversation to publish once, or `CANCEL`
to clear confirmation. Attachments must first be saved locally by the gateway.
See [the personal skill example](../hermes/skills/social-media/facebook-person-post/examples/telegram-flow.md).

Telegram is the recommended messaging channel because Hermes can poll Telegram directly. No public webhook or tunnel is required.

## Install Hermes

```sh
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.zshrc
hermes setup
```

Verify:

```sh
hermes version
hermes doctor
```

## Create a Telegram Bot

1. Open Telegram.
2. Message `@BotFather`.
3. Run `/newbot`.
4. Choose a display name.
5. Choose a username ending in `bot`.
6. Store the token securely.

Never commit or paste the token into support chats, issues, screenshots, or documentation.

## Find the Allowed User ID

Message `@userinfobot`.

Use the numeric ID, for example:

```text
123456789
```

Do not use:

```text
@username
username
```

## Configure the Gateway

```sh
hermes gateway setup
```

For Telegram, enter:

- Bot token: token from BotFather
- Allowed user IDs: numeric Telegram user ID
- Home channel ID: the same numeric ID for a private chat

Start:

```sh
hermes gateway start
hermes gateway status
hermes status
```

## Install This Skill

From the cloned project:

```sh
node scripts/install-hermes-skill.js --force
hermes skills list
```

Confirm `facebook-group-post` is enabled.

The installer also writes:

```text
FB_AUTOPOST_REPO="<absolute repository path>"
```

to `~/.hermes/.env`.

Restart Hermes after changing the environment:

```sh
hermes gateway restart
```

If restart cannot control an old foreground process, stop that process and run:

```sh
hermes gateway start
```

## Verify Telegram

Send `/start` to the bot.

If there is no response:

```sh
hermes logs --since 30m
```

If logs say:

```text
Unauthorized user: <numeric-id>
```

set that numeric value in `~/.hermes/.env`:

```text
TELEGRAM_ALLOWED_USERS=<numeric-id>
TELEGRAM_HOME_CHANNEL=<numeric-id>
```

Restart the gateway.

## Test the Facebook Skill

Make sure Brave/Chrome is open, Facebook is logged in manually, and Browser Bridge is connected:

```sh
opencli doctor
opencli facebook groups
```

Send:

```text
Use the facebook-group-post skill.
Prepare one Facebook group post for group main.
Caption: Test draft only. Do not publish.
Use the attached images.
Run dry-run only.
```

Attach images in Telegram.

The first test must end with `CANCEL`.

## Runtime Requirements

- The local laptop must remain awake and online.
- Hermes gateway must be running.
- Brave/Chrome must remain available.
- Browser Bridge must be connected.
- Facebook login is manual.
- Facebook automation never runs inside Telegram or on a cloud server.

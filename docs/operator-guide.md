# Operator Guide

For personal-profile requests from Telegram/WhatsApp, use the `facebook-person-post`
Hermes skill and select a browser profile. See [the personal posting guide](person-post.md).
The examples below describe the existing group workflow; both skills use the local worker.

This guide is for the person who will use the system day to day from Telegram or WhatsApp.

The system has three local parts:

- OpenCLI plugin: controls Facebook in the local Brave/Chrome browser.
- Local posting worker: turns one JSON job into one OpenCLI command.
- Hermes skill: turns chat instructions into a dry-run job, then waits for `POST` or `CANCEL`.

Facebook automation always runs on the office/laptop machine. Keep Brave or Chrome open with the OpenCLI Browser Bridge extension and a manually logged-in Facebook session.

## What The User Does Daily

1. Send a Telegram or WhatsApp message:
   ```text
   Post to Supplier Hardware group
   <caption text>
   ```
2. Attach the images in the same chat.
3. Hermes prepares a draft only.
4. Hermes returns a screenshot path and status.
5. Review the screenshot.
6. Reply:
   - `POST` to publish
   - `CANCEL` to discard

Hermes publishes only after `POST`. The local worker also requires `--confirm true` before live mode can run.

## Example Daily Flow

User:

```text
Post to Supplier Hardware group
Alhamdulillah, tempahan PU Metal Foam pelanggan kami telah selamat tiba.
```

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

## Starting The Local Machine

Run these on the office/laptop machine:

```sh
cd opencli-plugin-fb-autopost
npm run doctor
hermes gateway status
hermes gateway start
```

If `npm run doctor` reports missing browser or Facebook login, fix that manually before posting.

## Dry-Run Test

Before using chat-controlled live posting, run one dry-run:

```sh
opencli facebook group-post \
  --group-url "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" \
  --caption "Test draft only. Do not publish." \
  --dry-run true
```

Expected result: the browser opens in the foreground, the Facebook composer is prepared, a screenshot is saved, and `Post` is not clicked.

## Live Posting Rule

Live posting is allowed only after a dry-run preview. Reply with exact `POST` only when the screenshot looks correct.

Do not use this system for:

- unattended live posting
- scheduling
- posting to multiple groups at once
- cloud browser automation
- collecting or storing Facebook credentials

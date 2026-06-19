# Setup Guide

This guide prepares a local office/laptop machine to run `opencli facebook group-post`.

The Facebook browser automation stays local. Use Brave or Chrome with the OpenCLI Browser Bridge extension and a Facebook account that is already logged in manually. Do not run the Facebook browser automation on a cloud server or Android phone.

## Safety Rules

- Setup never posts to Facebook.
- Setup never automates Facebook login.
- Setup never asks for a Facebook password.
- Setup stores no cookies, sessions, or credentials.
- Local config stores only approved group aliases and local paths.
- First posting test must be `--dry-run true`.

## 1. Install Local Dependencies

```sh
npm install
```

## 2. Run Setup

Use a group where the user is allowed to post. This saves the approved group URL locally as an alias.

```sh
npm run setup -- --group-url "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" --group-alias main
```

What setup does:

- checks Node 20 or newer
- checks whether npm dependencies exist
- checks whether `opencli` is available
- creates `config/settings.json`
- creates `config/groups.json`
- creates `artifacts/facebook-group-post`
- installs this repo as an OpenCLI plugin when possible
- prints the manual browser steps

If the bare `opencli` command is not on PATH, setup falls back to `node_modules/.bin/opencli` after `npm install`. You can also run OpenCLI commands as `npx opencli ...`.

What setup does not do:

- it does not post
- it does not click Facebook buttons
- it does not log in for the user
- it does not store secrets

## 3. Prepare The Browser Manually

1. Open Brave or Chrome with the OpenCLI Browser Bridge extension.
2. Log into Facebook manually in that browser profile.
3. Keep that browser available while OpenCLI runs.

## 4. Run Doctor

```sh
npm run doctor
```

Doctor performs non-posting checks:

- package dependencies present
- OpenCLI command available
- local plugin visible to OpenCLI
- local config readable
- artifacts directory writable
- Browser Bridge available
- Facebook session readable through `opencli facebook groups`

If something is missing, doctor prints the exact next manual step.

## 5. First Dry-Run Test

```sh
npx opencli facebook group-post \
  --group-url "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" \
  --caption "Test draft only. Do not publish." \
  --dry-run true
```

Expected result: Facebook opens in the foreground, the composer is prepared, a screenshot is saved, and `Post` is not clicked.

## 6. Live Test

Only run this after the dry-run is visually confirmed and the user explicitly approves a live test.

```sh
npx opencli facebook group-post \
  --group-url "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" \
  --caption-file ./caption.txt \
  --images ./test.jpg \
  --confirm true
```

Live mode clicks `Post` once and does not retry.

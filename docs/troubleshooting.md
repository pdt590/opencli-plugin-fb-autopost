# Troubleshooting

All fixes happen on the local office/laptop machine. Do not move Facebook browser automation to a cloud server.

## OpenCLI command not found

Symptoms:

- The terminal says `opencli: command not found` or `zsh: command not found: opencli`.
- Setup, doctor, or the worker reports that OpenCLI is not available.

Fix:

```sh
npm install
npx opencli doctor
node_modules/.bin/opencli doctor
```

Use `npx opencli ...` for commands in this repo if the bare `opencli` command is not on PATH. You may install a global command only if desired:

```sh
npm install -g @jackwener/opencli
```

`npm run setup`, `npm run doctor`, and the local worker automatically try the repo-local `node_modules/.bin/opencli` command after `npm install`.

If `npm run setup` works but a direct `opencli ...` command fails, the repo-local fallback is working. Use `npx opencli ...` or `node_modules/.bin/opencli ...` in operator instructions.

## Browser Bridge disconnected

Symptoms:

- `npm run doctor` reports Browser Bridge missing.
- Worker or OpenCLI says daemon/browser connection failed.

Fix:

```sh
opencli doctor
```

Then open Brave or Chrome with the OpenCLI Browser Bridge extension installed and enabled. Keep that browser open.

To open Facebook through the connected bridge:

```sh
node_modules/.bin/opencli browser fb-login --window foreground open "https://www.facebook.com"
```

Log into Facebook manually in that browser window.

## OpenCLI daemon failed to start

Symptoms:

- `npm run doctor` reports `BROWSER_CONNECT`.
- Output says `Failed to start opencli daemon`.
- Output mentions port `19825`.

Fix:

```sh
node node_modules/@jackwener/opencli/dist/src/daemon.js
```

If the daemon says port `19825` is already in use, close the stale OpenCLI daemon process or restart the local machine. Then rerun:

```sh
npm run doctor
```

## Facebook logged out

Symptoms:

- `npm run doctor` reports Facebook session unreadable.
- OpenCLI returns login wall, checkpoint, or auth required.

Fix:

1. Open the same Brave/Chrome profile used by OpenCLI.
2. Log into Facebook manually.
3. Run:
   ```sh
   opencli facebook groups
   npm run doctor
   ```

Do not paste Facebook passwords into Hermes, OpenCLI, or this repo.

## Browser profile mismatch

Symptoms:

- Brave or Chrome is logged into Facebook, but `opencli facebook groups` still shows login/auth errors.
- The OpenCLI extension is connected, but Facebook appears logged out in the automation window.

Cause: Brave/Chrome profiles are separate. The OpenCLI Browser Bridge extension and the Facebook login must be in the same browser profile.

Fix:

1. Open the Brave/Chrome profile where the OpenCLI extension is enabled.
2. Open Facebook in that same profile:
   ```sh
   node_modules/.bin/opencli browser fb-login --window foreground open "https://www.facebook.com"
   ```
3. Log into Facebook manually.
4. Verify:
   ```sh
   node_modules/.bin/opencli facebook groups
   npm run doctor
   ```

## Facebook draft says “Leave site?”

Cause: dry-run intentionally leaves the draft open so a human can review it.

Fix:

- Choose `Cancel` to keep reviewing the draft.
- Choose `Leave` only when you want to discard the draft and rerun.

The tool does not click through this prompt automatically.

## Images are not visible

Symptoms:

- Caption appears but images are missing.
- Worker/plugin fails preview verification.

Fix:

1. Confirm image files exist locally.
2. Use supported extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.
3. Avoid remote URLs. Save WhatsApp images locally first.
4. Rerun dry-run before any live post.

## Pending approval

Meaning: Facebook accepted the post submission, but the group requires admin/moderator review.

Action:

- Treat `pending-review` as submitted, not failed.
- Check the group manually if the post does not appear.

## Checkpoint, CAPTCHA, or action blocked

Symptoms:

- The plugin reports checkpoint, CAPTCHA, login wall, action blocked, or “You can’t post right now”.

Fix:

1. Stop automation.
2. Resolve the Facebook screen manually in the local browser.
3. Do not attempt bypasses, stealth, proxies, or automated CAPTCHA/checkpoint handling.
4. Retry only after Facebook is normal and `npm run doctor` passes.

## Hermes gateway stopped

Symptoms:

- WhatsApp messages do not reach Hermes.
- No response from the bot.

Fix:

```sh
hermes gateway status
hermes gateway start
hermes whatsapp
```

If pairing expired, run `hermes whatsapp` and pair again with the QR code.

## Invalid group alias

Symptoms:

- Worker returns `Unknown group alias "main"` or another alias.

Fix:

Run setup with the exact approved group alias:

```sh
npm run setup -- --group-url "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" --group-alias main
```

For multiple approved aliases in the future, edit `config/groups.json` locally. One worker job still posts to only one group.

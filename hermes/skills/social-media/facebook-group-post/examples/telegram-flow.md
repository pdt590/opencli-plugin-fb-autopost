# Example Telegram Flow

User:

```text
Prepare a Facebook group post.
Group: main
Caption: Stock has arrived today.
Use the attached images.
Dry-run only.
```

Hermes receives local image paths from the Telegram gateway and creates:

```text
artifacts/hermes-jobs/telegram-main.dry-run.json
```

Hermes runs:

```sh
cd "$FB_AUTOPOST_REPO"
node worker/posting-worker.js --job artifacts/hermes-jobs/telegram-main.dry-run.json
```

Hermes replies:

```text
Draft prepared.
Status: dry-run-ready
Screenshot: ./artifacts/facebook-group-post/dry-run.png
Reply POST to publish or CANCEL to discard.
```

Only after the user replies `POST`, Hermes runs the live job once with `--confirm true`.

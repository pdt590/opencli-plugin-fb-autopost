# Telegram: Prepare and Confirm a Personal Post

User sends via the configured Hermes Telegram gateway:

```text
Chuẩn bị bài đăng Facebook cá nhân, profile xmqguda9, nhập chậm.
Nội dung: Hôm nay mình hoàn thành một dự án mới 🌿.
Dùng ảnh đính kèm. Chỉ chuẩn bị bản nháp.
```

Hermes obtains the attachment's local file path from the gateway, then creates:

```json
{
  "target": "person",
  "mode": "dry-run",
  "profile": "xmqguda9",
  "slow": true,
  "caption": "Hôm nay mình hoàn thành một dự án mới 🌿.",
  "images": ["/absolute/local/path/from-telegram/photo.jpg"]
}
```

After saving `artifacts/hermes-jobs/telegram-person.dry-run.json`, run from the repository:

```sh
node worker/posting-worker.js --job artifacts/hermes-jobs/telegram-person.dry-run.json
```

For a successful `dry-run-ready`, Hermes shows the returned profile URL, caption,
image count, browser profile and screenshot, then asks for `POST` or `CANCEL`.
Do not claim a local screenshot path is a delivered attachment.

Only after exact `POST` from the same user in this conversation, create the matching
live JSON with identical reviewed fields and `mode: live`, then run once:

```sh
node worker/posting-worker.js --job artifacts/hermes-jobs/telegram-person.live.json --confirm true
```

Report actual status and screenshot. Do not retry failed or unknown outcomes.

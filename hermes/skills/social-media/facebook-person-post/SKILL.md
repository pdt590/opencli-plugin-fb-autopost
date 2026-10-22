---
name: facebook-person-post
description: "Prepare a personal Facebook post from a Hermes Telegram or WhatsApp conversation using the local OpenCLI worker. Use for personal-profile caption/image intake, slow-mode dry-run review, explicit POST confirmation and CANCEL."
version: 1.0.0
author: Ang Jing Kang
license: Apache-2.0
platforms: [macos, linux, windows]
prerequisites:
  commands: [node, opencli]
metadata:
  hermes:
    tags: [facebook, telegram, whatsapp, social-media, opencli, local-automation]
    related_skills: [facebook-group-post]
---

# Personal Facebook Posts from Telegram or WhatsApp

Use Hermes as the conversation layer and the local repository worker as the only
Facebook execution path. The browser must remain on the user's local machine with
Browser Bridge connected and Facebook logged in manually. `FB_AUTOPOST_REPO` points
to the repository. This skill works through Hermes gateways; it does not add personal
posting to the separate WhatsApp Business Cloud API interactive menus.

## Intake and Routing

Collect one post: non-empty caption (or UTF-8 caption file), local gateway-downloaded
image paths or explicit `NO IMAGES`, and the user's selected OpenCLI browser profile
ID/alias. Ask for missing inputs. Do not choose an arbitrary connected/default profile.
If personal vs group is ambiguous, ask. For groups load `facebook-group-post` instead.
Personal posts target `/me` in the selected profile, never another person's URL or a
Page. Request that the user select their personal identity in Facebook first.

Use `slow: true` unless the user requests standard input. Slow mode adjusts pacing;
it does not guarantee avoidance of Facebook bot detection.

## Prepare a Dry-Run

For every initial request create a fresh, uniquely named JSON job under
`$FB_AUTOPOST_REPO/artifacts/hermes-jobs/<job-id>.dry-run.json`:

```json
{
  "target": "person",
  "mode": "dry-run",
  "profile": "xmqguda9",
  "slow": true,
  "caption": "Caption supplied by this user",
  "images": []
}
```

`xmqguda9` is an example; use the profile chosen in the conversation. Empty images
means the user explicitly chose no images. For attachments, use local absolute paths
saved by the gateway, not Telegram/WhatsApp URLs, media IDs or remote URLs. For relative
paths, the base is the JSON job directory, not the repository. Use either `caption` or
`captionFile`, never both. Optional `screenshotDir` is also relative to the job file.
Never include `groupAlias`, `groupUrl`, `group`, or `profileUrl` for personal jobs.

Run only:

```sh
cd "$FB_AUTOPOST_REPO"
node worker/posting-worker.js --job artifacts/hermes-jobs/<job-id>.dry-run.json
```

Use the equivalent PowerShell directory change on Windows. Never call OpenCLI posting
commands, browser primitives, Browser Bridge or Facebook scripts directly. Never run
Facebook browsers on Android, a cloud VM or a messaging server.

Only `ok: true` with `status: dry-run-ready` establishes a pending draft. Reply with
status, returned `profile_url`, chosen browser profile, caption, image count and the
screenshot. Attach the screenshot through the current gateway when supported; otherwise
report its local path without claiming it was delivered. Tell the user to inspect the
Facebook identity and audience shown in the screenshot:

```text
Đã chuẩn bị bản nháp, chưa đăng.
Profile trình duyệt: <profile>
Trang cá nhân: <profile_url>
Nội dung: <caption>
Ảnh: <count>
Screenshot: <path or attachment>
Kiểm tra tài khoản và đối tượng xem bài. Trả lời POST để đăng hoặc CANCEL để hủy.
```

Keep exactly one pending draft for this user in this conversation. Do not share pending
state or confirmations between Telegram/WhatsApp conversations. Any edit to caption,
attachment content, target, browser profile or pacing invalidates the old confirmation
and requires a new dry-run. Preserve the reviewed text and attachment files until POST.

## POST and CANCEL

Accept exact `POST` only from the same user/conversation after one successful pending
dry-run. An initial request saying "post now", a previous conversation's approval,
or POST after cancellation/failure does not authorize publishing. Ask for a fresh dry-run.

Copy the reviewed job to `<job-id>.live.json`, changing only `mode` to `live`. Keep the
same profile, slow setting, caption and local image files. Run exactly once:

```sh
node worker/posting-worker.js --job artifacts/hermes-jobs/<job-id>.live.json --confirm true
```

The worker requires both live mode and `--confirm true`; conversation-level POST
validation is this skill's responsibility, not an independently enforced worker token.
Each invocation prepares a new composer rather than resuming the dry-run tab. Have
the user discard any earlier open preview if Facebook asks about an existing draft.

Report the actual returned status and screenshot. `posted` currently observes composer
closure, not a verified permalink. Clear pending confirmation after every live attempt,
including success; a repeated POST must never execute the same live job again.
For `failed`, `unknown` or a command interruption,
clear pending confirmation, tell the user to inspect Facebook manually and never retry
the live action automatically. Never call an unknown result a confirmed publication.

On `CANCEL`, do not call the worker. Clear pending confirmation and tell the user to
close/discard the open Facebook draft manually. Later POST requires a fresh dry-run.

Never store Facebook credentials/cookies/sessions, bypass checkpoint/CAPTCHA/2FA/login
or action blocks, schedule, queue, batch or retry live posting. Resolve browser warnings
manually in the selected profile. Do not send unrelated outbound messages.

## Examples

- [Telegram intake and confirmation](examples/telegram-flow.md)
- [WhatsApp intake and cancellation](examples/whatsapp-flow.md)
- [Dry-run worker job](examples/dry-run-worker-job.json)
- [Live worker job, only after POST](examples/live-worker-job.json)

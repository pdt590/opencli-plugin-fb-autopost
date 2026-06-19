# WhatsApp Business API Reference

Phase 7 uses WhatsApp Business Platform / Cloud API as the guided menu layer for the operator. It must not run Facebook browser automation directly.

The browser automation path remains local:

```text
WhatsApp Business API
-> local webhook/control server
-> draft manager
-> local posting worker
-> OpenCLI plugin
-> local Brave/Chrome Browser Bridge
-> Facebook
```

## Official Docs To Verify

Before production use, verify the current Meta requirements and endpoint shapes against official Meta documentation:

- WhatsApp Cloud API: `https://developers.facebook.com/docs/whatsapp/cloud-api/`
- Webhooks: `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/`
- Messages: `https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/`
- Media: `https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/`
- Interactive messages: `https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/#interactive-messages`

Treat this repo's docs as the local integration guide, not a replacement for Meta's current API reference.

## Required Meta Assets

Create or collect these values in Meta's developer/business tools:

- Meta app with WhatsApp Business Platform / Cloud API enabled.
- WhatsApp Business account.
- WhatsApp Business phone number.
- Cloud API access token.
- Phone number ID.
- Webhook verify token that you choose locally.
- App secret, if request signature validation is enabled.
- Public HTTPS webhook URL.
- Allowed users list for the phone numbers that may control this bot.

Use placeholders in local notes and examples. Do not paste real access tokens into docs, screenshots, commits, support chat, or issue reports.

## Environment Variables

The local server reads:

```sh
export WHATSAPP_CLOUD_ACCESS_TOKEN="<cloud-api-access-token>"
export WHATSAPP_PHONE_NUMBER_ID="<phone-number-id>"
export WHATSAPP_VERIFY_TOKEN="<random-local-verify-token>"
export WHATSAPP_APP_SECRET="<meta-app-secret>"
export WHATSAPP_BUSINESS_ALLOWED_USERS="60123456789"
export WHATSAPP_BUSINESS_PUBLIC_URL="https://<public-tunnel-host>/webhook"
```

`WHATSAPP_BUSINESS_ALLOWED_USERS` is comma-separated. Use international format digits without `+`, spaces, or dashes.

## Webhook Verification

Meta sends a webhook verification request to the public callback URL. The local server verifies:

- `hub.mode`
- `hub.verify_token`
- `hub.challenge`

Local smoke test:

```sh
curl "http://127.0.0.1:8787/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=hello"
```

Expected response:

```text
hello
```

Wrong or missing verify tokens must fail. If `WHATSAPP_APP_SECRET` is configured, POST requests must also pass signature validation. Confirm the exact signature header and algorithm against official Meta docs before production use.

## Interactive Messages

The Phase 7 UX is menu-first where WhatsApp supports it:

- Main menu as an interactive list.
- Smaller choices as reply buttons.
- Plain text fallback for every menu.

Current text fallbacks include:

```text
1
2
3
MENU
HELP
DRY RUN
POST
CANCEL
```

If buttons or lists do not render on a device, the operator can still reply with the numbered fallback.

## Media Handling

Incoming WhatsApp images are downloaded through the Cloud API media flow:

1. Receive webhook message with `type: "image"`.
2. Extract `image.id`.
3. Use the Cloud API media metadata endpoint to resolve the download URL.
4. Download the binary with bearer authorization.
5. Save it locally under:
   ```text
   artifacts/whatsapp-business/media/<conversation-id>/<draft-id>/<media-id>.<ext>
   ```
6. Add only the local path and WhatsApp media ID to the draft.

Supported image types:

```text
.jpg
.jpeg
.png
.webp
.gif
```

Remote image URLs are rejected as worker inputs. The WhatsApp access token, temporary media URL, Facebook cookies, and browser sessions are not stored in draft files.

## Dry-Run Screenshot Behavior

`DRY RUN` is allowed only when a draft has group, caption, and image decisions completed.

The local draft manager writes:

```text
artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
```

Then it calls:

```sh
node worker/posting-worker.js --job artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
```

The job must use:

```json
{
  "mode": "dry-run"
}
```

It must not include `--confirm true`. On success, the draft stores:

- `status: "dry_run_ready"`
- `dryRunScreenshotPath`
- `lastWorkerResult`
- a short-lived confirmation token

The operator reviews the screenshot path and, when watching the local browser, verifies the Facebook draft visually.

## POST And CANCEL

Current Phase 7F boundary:

- `POST` calls the local worker only after a valid dry-run, a non-expired confirmation token, a dry-run screenshot path, and explicit operator approval.
- `CANCEL` must not call the live worker.
- Live worker calls must include `mode: "live"` and the worker CLI flag `--confirm true`.
- Failed live posts must not be retried automatically.

## Deployment Modes

### Mode A: Fully Local MVP

The local office/laptop machine runs the webhook server and exposes it with an HTTPS tunnel.

Pros:

- Browser automation and draft state stay on the local machine.
- Simplest trust boundary.
- Best MVP choice for a single operator.

Cons:

- The local machine must stay awake and online.
- The tunnel URL may rotate depending on the tunnel provider.
- Network/firewall issues affect webhook delivery.

MVP recommendation: use Mode A first.

### Mode B: Cloud Relay Later

A small cloud relay receives Meta webhooks, then forwards draft commands/status to a secure connector running on the local office/laptop machine.

Pros:

- Stable public webhook URL.
- Local machine can stay behind NAT.

Cons:

- More security surface.
- Requires connector authentication and replay protection.
- Must be designed so the cloud relay never receives Facebook cookies, browser sessions, or credentials.

Mode B is documented only. It is not the Phase 7 MVP.

## Browser Requirement

The local worker depends on the same local requirements as the OpenCLI plugin:

- Brave or Chrome installed on the office/laptop machine.
- OpenCLI Browser Bridge extension installed in that browser profile.
- Facebook logged in manually in that same profile.
- Browser Bridge daemon reachable.
- `opencli facebook groups` works before pilot posting.

The WhatsApp Business API server does not open a phone browser and does not use Android Chrome. Facebook posting happens on the local office/laptop browser session.

## Safety Boundaries

- No scheduler.
- No background queue for posting.
- No multi-group posting in one action.
- No analytics.
- No cloud browser automation.
- No Facebook credential, cookie, token, or session storage.
- No CAPTCHA, checkpoint, login, 2FA, or action-blocked bypass.
- No stealth, proxy, fingerprinting, or rate-limit evasion.
- No automatic live posting.
- No retrying failed live posts.
- No replacing the local OpenCLI plugin as the posting engine.

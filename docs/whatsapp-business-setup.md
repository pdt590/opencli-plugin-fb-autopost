# WhatsApp Business API Setup

This is the Phase 7 WhatsApp Business Platform / Cloud API control server.

The standalone server handles webhook verification, outgoing WhatsApp replies, local draft state, group selection, caption collection, image downloads, dry-run, and guarded `POST`/`CANCEL`. It does not post to Facebook directly, does not automate the browser, and does not call OpenCLI directly. All Facebook work goes through the local posting worker.

## Required Meta Setup

Verify the exact steps against official Meta docs before production use. In particular, verify against official Meta docs before production use when enabling request signature checks.

Collect these values before starting the local server:

- Meta app with WhatsApp Business Platform / Cloud API enabled.
- WhatsApp Business account.
- WhatsApp Business phone number.
- Cloud API access token.
- Phone number ID.
- Webhook verify token that you choose locally.
- App secret, if request signature validation is enabled.
- Public HTTPS webhook URL.
- Allowed users list.

Meta setup steps:

1. Create or select a Meta app with WhatsApp Business Platform / Cloud API enabled.
2. Add or connect a WhatsApp Business account.
3. Add or connect a WhatsApp Business phone number.
4. Copy the phone number ID.
5. Create or copy a Cloud API access token.
6. Choose a webhook verify token locally.
7. Configure a webhook callback URL that points to this local server through an HTTPS tunnel.
8. Configure the same verify token in Meta and `WHATSAPP_VERIFY_TOKEN`.
9. Configure app secret locally if request signature validation is enabled.
10. Configure the allowed users list so only approved phone numbers can command the bot.

Official docs to check:

- WhatsApp Cloud API: `https://developers.facebook.com/docs/whatsapp/cloud-api/`
- Webhooks: `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/`
- Media API: `https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/`

## Environment Variables

```sh
export WHATSAPP_CLOUD_ACCESS_TOKEN="<cloud-api-access-token>"
export WHATSAPP_PHONE_NUMBER_ID="<phone-number-id>"
export WHATSAPP_VERIFY_TOKEN="<random-local-verify-token>"
export WHATSAPP_APP_SECRET="<meta-app-secret>"
export WHATSAPP_BUSINESS_ALLOWED_USERS="60123456789"
export WHATSAPP_BUSINESS_PUBLIC_URL="https://<public-tunnel-host>/webhook"
export WHATSAPP_GRAPH_API_VERSION="v25.0"
```

The server startup and dry-run output report whether values are configured, but they do not print token, secret, phone, or URL values.

Allowed users must be international-format digits without `+`, spaces, or dashes:

```sh
export WHATSAPP_BUSINESS_ALLOWED_USERS="60123456789,60198765432"
```

Do not commit real token, app secret, access token, tunnel URL, or customer phone values.

## Mode A: Local Tunnel MVP

Mode A is the recommended MVP. The office/laptop machine runs the server and exposes it through an HTTPS tunnel.

Flow:

```text
Meta WhatsApp webhook
-> public HTTPS tunnel
-> http://127.0.0.1:8787/webhook
-> local draft manager / local worker
```

Requirements:

- The local machine is awake.
- The local server is running.
- The tunnel is running.
- The public tunnel URL is configured in Meta.
- The Browser Bridge and Facebook login are ready locally.

Mode B cloud relay is documented only for later. Do not use a cloud relay for the MVP unless a secure relay and local connector have been designed and reviewed. The relay must never run Facebook browser automation and must never store Facebook cookies or sessions.

## Start The Local Server

Preview configuration without starting a listener:

```sh
npm run whatsapp-business:dry-run
```

Start the local webhook server:

```sh
npm run whatsapp-business
```

Default local endpoint:

```text
http://127.0.0.1:8787/webhook
```

For Meta webhook verification, expose it through an HTTPS tunnel and configure the public callback URL:

```text
https://<public-tunnel-host>/webhook
```

The server sends routed text, button, and list responses through the configured WhatsApp Cloud API `/messages` endpoint.

## Pilot Conversation

After webhook verification and subscribing to the `messages` field:

```text
MENU
NEW POST
main
<caption text>
<send one or more images>
DONE
DRY RUN
```

The bot returns the dry-run status and screenshot path. Review the local browser draft before replying:

```text
POST
```

or:

```text
CANCEL
```

For a new group, send its full Facebook group URL at the group step. The bot requires a separate `APPROVE GROUP` reply before saving it locally.

## Local Verification Command

Use the same token configured in `WHATSAPP_VERIFY_TOKEN`:

```sh
curl "http://127.0.0.1:8787/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=hello"
```

Expected response:

```text
hello
```

Wrong or missing verify tokens return an error and do not return the challenge.

## Interactive Menus And Text Fallback

The menu layer uses:

- Interactive list messages for the Main Menu.
- Reply buttons for smaller choices.
- Text fallback for every menu.

If buttons or lists do not render on the user's WhatsApp client, the user can still reply with numbered choices such as:

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

`POST` is accepted only after a successful dry-run, a valid non-expired confirmation token, an unchanged draft, and a dry-run screenshot path. `CANCEL` must not call the live worker.

## Image Upload Handling

Image messages are handled through the WhatsApp Cloud API media flow:

1. Webhook receives an image message.
2. The router extracts the WhatsApp media ID.
3. The media helper downloads metadata and the binary with bearer authorization.
4. The file is stored locally under:
   ```text
   artifacts/whatsapp-business/media/<conversation-id>/<draft-id>/
   ```
5. The draft stores only local file paths and WhatsApp media IDs.

The access token and temporary media download URL are not stored in `drafts.json`.

## Dry-Run Screenshot Behavior

When a draft is ready and the operator sends `DRY RUN`, the local draft manager creates:

```text
artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
```

The worker command is:

```sh
node worker/posting-worker.js --job artifacts/whatsapp-business/jobs/<draft-id>.dry-run.json
```

The job is dry-run only and must not include `--confirm true`. On success, the WhatsApp response includes the worker status and screenshot path. The operator should verify the screenshot and the local Facebook browser draft before sending `POST`.

## Local Worker And Browser Readiness

Before the pilot:

```sh
npm run doctor
npx opencli doctor
npx opencli facebook groups
```

The local Brave/Chrome profile must already be manually logged into Facebook. This project does not store Facebook credentials and does not solve login, checkpoint, CAPTCHA, 2FA, or action-blocked screens.

## Signature Verification

When `WHATSAPP_APP_SECRET` is configured, the server validates `x-hub-signature-256` as an HMAC-SHA256 signature over the raw webhook body.

This follows the common Meta webhook signature pattern, but the exact WhatsApp Business webhook header and algorithm must be verified against current official Meta docs before production use.

## Safety Boundaries

- Dry-run worker calls are allowed only through the local draft dry-run path.
- Live worker calls require a successful dry-run, an unexpired confirmation token, an unchanged draft, a screenshot path, and explicit `POST`.
- No direct OpenCLI calls from the WhatsApp server.
- No Browser Bridge calls.
- No direct Facebook automation from the WhatsApp server.
- No automatic live posting.
- No credential, cookie, or session storage.
- No scheduler.
- No queue.
- No multi-group posting.
- No analytics.
- No CAPTCHA, checkpoint, login, or action-blocked handling.
- No stealth, proxy, fingerprinting, or rate-limit evasion.

This server is only the future interactive WhatsApp control surface. The local OpenCLI plugin remains the only Facebook posting engine.

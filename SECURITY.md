# Security Policy

## Supported Version

Security fixes are applied to the latest tagged release and `main`.

## Report a Vulnerability

Do not open a public issue containing:

- access tokens
- Telegram bot tokens
- Meta App Secrets
- Facebook credentials or cookies
- private group URLs
- personal phone numbers
- screenshots containing private account data

Use GitHub private vulnerability reporting when enabled, or contact the repository owner privately.

## Security Boundaries

- Facebook credentials remain in the local browser profile.
- Dry-run is the default.
- Live mode requires explicit `POST` and worker `--confirm true`.
- The worker processes one group per job.
- The project does not bypass login, checkpoint, CAPTCHA, 2FA, or blocked states.
- The project does not include stealth, proxy, fingerprinting, or rate-limit evasion.
- The project does not retry a failed or unknown live post.

## Secrets

Keep all secrets outside Git:

- Hermes secrets: `~/.hermes/.env`
- WhatsApp Business secrets: a protected local environment file
- local group configuration: `config/groups.json`

Rotate any secret that is pasted into a public issue, commit, screenshot, or chat.

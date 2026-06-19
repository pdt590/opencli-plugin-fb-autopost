# Contributing

## Scope

Contributions should preserve the local-first architecture:

- OpenCLI plugin remains the only Facebook browser automation engine.
- Hermes and messaging adapters remain control layers.
- Dry-run remains the default.
- Live posting requires explicit confirmation.
- One invocation targets one group.

Do not add schedulers, bulk posting, stealth, credential storage, CAPTCHA handling, proxy rotation, or automatic live retries.

## Development

```sh
npm ci
npm test
git diff --check
```

Tests must stay under `tests/`; OpenCLI scans command files flat at the plugin root.

## Pull Requests

Include:

- behavioral summary
- safety impact
- tests added or updated
- manual browser verification, when applicable

Never include real access tokens, private group URLs, personal phone numbers, cookies, or account screenshots.

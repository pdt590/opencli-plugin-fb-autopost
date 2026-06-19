# Release Notes

## v0.1.0 - Initial Public Release

Status: initial public release. The local pilot covered installation, Browser Bridge connectivity, dry-run preparation, worker execution, and messaging integration. Live posting remains an explicitly approved, supervised action.

### Included

- Local OpenCLI plugin command: `opencli facebook group-post`.
- Dry-run by default, with live posting gated by explicit `--confirm true`.
- Setup wizard for local config and approved group aliases.
- Doctor checks for OpenCLI, Browser Bridge, plugin visibility, and Facebook session readability.
- Local posting worker for one job at a time.
- Hermes skill wrapper for Telegram- or WhatsApp-controlled dry-run review and explicit `POST` or `CANCEL`.
- WhatsApp Business Cloud API webhook with outbound list, button, and text replies.
- Persistent local draft state, approved group aliases, caption collection, and image downloads.
- Dry-run screenshot review followed by guarded `POST` or `CANCEL`.
- Duplicate webhook message protection.
- Local packaging command: `npm run package`.
- Operator, pilot, troubleshooting, and release checklists.

### Pilot Evidence To Record Before Tagging

- `npm test` passes.
- `npm run setup -- --group-url "<TEST_GROUP_URL>" --group-alias main` creates local config.
- `npm run doctor` passes on the target local machine.
- `npx opencli doctor` passes with Browser Bridge connected.
- `npx opencli facebook groups` confirms the manual Facebook login is readable.
- Plugin dry-run returns `dry-run-ready` and does not click `Post`.
- Worker dry-run returns Hermes-friendly JSON and does not pass `--confirm true`.
- Hermes Telegram or WhatsApp dry-run returns status and screenshot path.
- WhatsApp Business webhook verification and outbound Main Menu delivery pass.
- WhatsApp Business flow reaches `ready_for_dry_run` from group, caption, and image intake.
- Replacement Cloud API tokens work after restarting the webhook process.
- Optional live test is either skipped or performed once with explicit human approval in an approved test group.
- `npm run package` creates the local handoff archive.

### Safety Boundaries

- No scheduler.
- No queue.
- No multi-group posting.
- No analytics.
- No cloud browser automation.
- No Facebook credential storage.
- No CAPTCHA, checkpoint, 2FA, login, or action-blocked bypass.
- No stealth, proxy, fingerprint, or rate-evasion behavior.
- No retry around the Facebook `Post` click.

### Packaging

Use this command for the local handoff archive:

```sh
npm run package
```

Preview without writing an archive:

```sh
node scripts/package-local.js --dry-run
```

### Tagging

After the release checklist passes, tag locally:

```sh
git tag -a v0.1.0 -m "v0.1.0 initial public release"
```

Push the reviewed release commit and tag:

```sh
git push
git push origin v0.1.0
```

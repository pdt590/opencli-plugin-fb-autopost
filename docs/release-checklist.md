# Release Checklist

Use this before tagging `v0.1.0` or handing the repo to a nontechnical operator.

Release notes: [docs/release-notes.md](release-notes.md)

## Release Scope

This release is a local installable GitHub repo plus Hermes skill wrapper.

Included:

- OpenCLI `facebook group-post` plugin.
- Setup wizard.
- Doctor checks.
- Local posting worker.
- Hermes Telegram and WhatsApp skill wrapper.
- Local packaging and operator docs.
- Pilot and release checklists.
- Release notes for `v0.1.0`.

Not included:

- No scheduler.
- No queue.
- No multi-group posting.
- No analytics.
- No cloud browser automation.
- No credential storage.
- No CAPTCHA, checkpoint, 2FA, login, or action-blocked bypass.
- No retry around the `Post` click.

## Automated Release Checks

- [ ] Install dependencies:
  ```sh
  npm install
  ```
- [ ] Run tests:
  ```sh
  npm test
  ```
- [ ] Run setup:
  ```sh
  npm run setup -- --group-url "<TEST_GROUP_URL>" --group-alias main
  ```
- [ ] Run repo doctor:
  ```sh
  npm run doctor
  ```
- [ ] Run OpenCLI doctor:
  ```sh
  npx opencli doctor
  ```
- [ ] Verify Facebook group access through the manual browser session:
  ```sh
  npx opencli facebook groups
  ```
- [ ] Run plugin dry-run:
  ```sh
  npx opencli facebook group-post \
    --group-url "<TEST_GROUP_URL>" \
    --caption "Release dry-run. Do not publish." \
    --images "<ABSOLUTE_IMAGE_PATHS_CSV>" \
    --dry-run true
  ```
- [ ] Run worker dry-run:
  ```sh
  node worker/posting-worker.js --job <DRY_RUN_JOB_JSON>
  ```
- [ ] Run a Hermes Telegram or WhatsApp dry-run and record the returned status and screenshot path.
- [ ] Run package dry-run:
  ```sh
  node scripts/package-local.js --dry-run
  ```
- [ ] Create local package with the safest packaging command:
  ```sh
  npm run package
  ```
- [ ] Run Hermes skill install dry-run:
  ```sh
  node scripts/install-hermes-skill.js --dry-run
  ```
- [ ] Confirm no root-level `.test.js` files exist because OpenCLI scans plugin root command files flat.

## Manual Release Checks

- [ ] Complete [docs/pilot-checklist.md](pilot-checklist.md).
- [ ] Confirm [docs/release-notes.md](release-notes.md) records `v0.1.0` scope and remaining pilot evidence.
- [ ] Confirm Browser Bridge setup is documented clearly enough for the operator.
- [ ] Confirm Facebook login remains manual only.
- [ ] Confirm Telegram bot-token setup or WhatsApp QR pairing remains manual only.
- [ ] Confirm visual dry-run confirmation is required before live use.
- [ ] Confirm any live `--confirm true` test was explicitly approved, supervised, and performed only in an approved test group.
- [ ] If live testing is skipped, record that it was intentionally skipped before tagging.
- [ ] Confirm any CAPTCHA, checkpoint, login wall, or action-blocked screen is handled manually in the local browser.

## Documentation Cleanup

- [ ] README points to:
  ```text
  docs/first-run-checklist.md
  docs/pilot-checklist.md
  docs/release-checklist.md
  docs/release-notes.md
  docs/troubleshooting.md
  ```
- [ ] First-run checklist explains the normal nontechnical install path.
- [ ] Pilot checklist explains automated vs manual checks.
- [ ] Troubleshooting explains OpenCLI PATH fixes:
  ```text
  npm install
  npx opencli ...
  node_modules/.bin/opencli ...
  npm install -g @jackwener/opencli
  ```
- [ ] Troubleshooting explains daemon failure and port `19825`.
- [ ] Troubleshooting explains Browser Bridge profile mismatch: the extension and Facebook login must be in the same Brave/Chrome profile.
- [ ] Packaging docs state `npm run package` is the safest packaging command.
- [ ] Packaging docs also document direct dry-run preview:
  ```sh
  node scripts/package-local.js --dry-run
  ```

## Version And Git

- [ ] Confirm `package.json` version is:
  ```json
  "version": "0.1.0"
  ```
- [ ] Confirm `opencli-plugin.json` version matches:
  ```json
  "version": "0.1.0"
  ```
- [ ] Review changes:
  ```sh
  git status --short
  git diff --check
  ```
- [ ] Commit release hardening changes:
  ```sh
  git add .
  git commit -m "Prepare v0.1.0 release"
  ```
- [ ] Tag `v0.1.0` only after the pilot passes:
  ```sh
  git tag -a v0.1.0 -m "v0.1.0 initial public release"
  ```
- [ ] Push only after manual review:
  ```sh
  git push
  git push origin v0.1.0
  ```

## Package

- [ ] Preview local package:
  ```sh
  node scripts/package-local.js --dry-run
  ```
- [ ] Create local package:
  ```sh
  npm run package
  ```
- [ ] Confirm the archive includes:
  ```text
  README.md
  docs/
  group-post.js
  src/
  worker/
  hermes/
  scripts/
  install.sh
  config/*.example
  examples/
  artifacts/.gitkeep
  ```

## Release Exit Criteria

- [ ] `npm test` passes.
- [ ] `npm run package` works.
- [ ] Release notes exist.
- [ ] Docs clearly state live posting is supervised only.
- [ ] No secrets are added.
- [ ] Pilot checklist is complete or clearly records skipped optional live testing.
- [ ] Docs explain clean-machine install, PATH fallback, Browser Bridge, dry-run, worker, Hermes, and release tagging.
- [ ] No out-of-scope features were added.
- [ ] `v0.1.0` annotated tag command is documented and the tag is created only after the real pilot is accepted.

# Personal Facebook Profile Posts

`opencli facebook person-post` prepares caption and local images on the personal
Facebook identity currently selected in the chosen Chrome profile. It navigates to
`https://www.facebook.com/me`, follows the redirect, and checks visible owner controls
(`Edit profile` and `Add to story`) and a composer trigger. It stops when those controls
cannot be verified, including unsupported UI languages or layout changes.

## Install

Install dependencies and the local plugin from the repository:

```sh
npm install
opencli plugin install "file://$(pwd)"
opencli facebook person-post --help
opencli profile list
```

PowerShell installation reference:

```powershell
opencli plugin install "file://$($PWD.Path)"
```

On macOS/Linux, `./install.sh --person` installs the plugin without requiring a group URL.
No `config/groups.json` is needed. Group/Hermes setup remains available through the
existing installer path with an approved group URL. The plugin manifest accepts OpenCLI
1.8.3 and 2.x; the profile-specific browser pilot was performed on 2.0.0.

## Prepare and Review

```sh
opencli --profile xmqguda9 facebook person-post \
  --caption-file caption.txt \
  --images "photo1.jpg,photo2.png" \
  --dry-run true --keep-tab true
```

- Exactly one of `--caption` or `--caption-file` is required; caption must not be empty.
- Up to 10 readable local jpg/jpeg/png/webp/gif files are accepted, comma separated.
- Default mode is dry-run, including when `--dry-run` is omitted.
- Caption and image previews are verified before returning `dry-run-ready`.
- Screenshots default to `artifacts/facebook-person-post`; override with `--screenshot-dir`.
- Result fields: `status`, `mode`, `profile_url`, `message`, `caption_length`, `image_count`, `screenshot`.
- `--profile` is OpenCLI's browser context selector, not a Facebook target URL.
- Audience and identity are inherited from Facebook. Review both in the composer.

## Publish Once

### Optional Paced Input

Add `--slow true` to either `facebook person-post` or `facebook group-post`.
Default behavior is unchanged when the flag is omitted or false. Paced mode:

- Waits 600 ms after the composer opens.
- Inserts 12 Unicode grapheme clusters per chunk with a 200 ms gap between chunks,
  preserving Vietnamese combining marks, emoji, whitespace and line breaks.
- Waits for image previews as usual, then pauses another 700 ms when images are attached.
- Pauses 2.5 seconds after preparation, then checks Facebook security state before
  returning a dry-run or clicking Post in explicitly confirmed live mode.
- Requires an empty editor and Browser Bridge `insertText` support. An interrupted
  or unverified insert stops with a screenshot; it never falls back to appending the
  whole caption again. Inspect/discard the partial draft before a fresh invocation.

These fixed pauses control pacing and do not guarantee that Facebook will treat
automation as a human. Dry-run, explicit confirmation and checkpoint/CAPTCHA stops
still apply. The pause does not replace reviewing a dry-run before a live invocation.
Longer captions take proportionally more time.

```sh
opencli --profile xmqguda9 facebook person-post --caption-file caption.txt --slow true --dry-run true --keep-tab true
opencli --profile xmqguda9 facebook group-post --group-url "https://www.facebook.com/groups/<GROUP_ID>" --caption-file caption.txt --slow true --dry-run true --keep-tab true
```

### Explicit Confirmation

After reviewing, run the same inputs with `--confirm true` instead of `--dry-run true`.
This starts a new composer rather than resuming or authorizing the previous draft.
The adapter clicks Post once and reports Facebook's observed outcome. Composer closure
is the current success signal; it does not independently verify a permalink or feed item.
For `unknown` or failures after clicking, inspect Facebook before any retry.

Login walls, checkpoints, CAPTCHA and action blocks stop the command. Resolve them
manually in the same profile. To discard a dry-run, close its composer and select the
discard option if Facebook asks. Hermes Telegram/WhatsApp gateways can route personal
posts through the `facebook-person-post` skill and worker jobs with `target: person`.
The separate WhatsApp Business Cloud API interactive menus remain group-only.

## Verification

On 2026-10-22, OpenCLI 2.0.0 with connected profile `xmqguda9` returned
`dry-run-ready` for both caption-only and caption plus one local PNG. Screenshots were
inspected for correct caption, image preview, selected personal identity and an open
composer. No live post was performed. Automated coverage includes confirmed publishing
with a mocked browser, owner-control checks, invalid targets, login stops, attachments,
and default dry-run behavior.

The same profile also passed a `--slow true` dry-run with a Vietnamese caption,
emoji and one local PNG. The screenshot confirmed ordered text, the image preview
and an open composer; no live post was performed.

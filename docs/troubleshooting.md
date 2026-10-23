# Troubleshooting

- Missing command: run `opencli --version`, `opencli plugin list`, then command `--help`.
- Disconnected browser: open Chrome/Brave with Browser Bridge, log in manually and run `opencli profile list`.
- One connected profile: omit `--profile`. More than one: choose explicitly. No profiles: stop before posting.
- Wrong Facebook identity: select the personal identity, not a Page, and inspect the returned URL/screenshot.
- Missing local files: check paths relative to the CLI working directory.
- Slow input interrupted: inspect the saved screenshot and partial draft. Never append the whole caption automatically.
- Checkpoint/CAPTCHA/login/2FA/action block: resolve manually in the selected profile.
- Task tab not closed: inspect `cleanup_warning`, close only the remaining task tab manually and do not repeat the publication.
- `unknown`/`failed` after Post: inspect Facebook manually before considering a new action. Do not automatically retry.
- Missing skill: use `npx skills add . --skill social-autopost -a hermes-agent -g` from this checkout.

The plugin requires OpenCLI 2.x tab APIs (`newTab`, `selectTab`, `closeTab`). Upgrade before posting if those APIs are unavailable.

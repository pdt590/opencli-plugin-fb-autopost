# Level 1: Facebook Group-Post Recon Runbook

Level 1 is discovery and prototyping only. It is not for unattended posting. Do not publish a post during this runbook unless the operator explicitly chooses to do so outside these steps.

## 1. Purpose

Discover and document Facebook's group-post composer UI for the Level 2 `opencli facebook group-post` adapter.

## 2. Prerequisites

- Chrome with the OpenCLI Browser Bridge extension installed.
- `npm i -g @jackwener/opencli`.
- A Facebook session already logged in in that Chrome profile.
- A private group or a test group where you are allowed to create draft posts.

## 3. Safety Rules

- Never click `Post` during recon.
- Never interact with login, checkpoint, CAPTCHA, 2FA, or blocked-action screens through OpenCLI. Close the session and resolve manually in Chrome.
- Recon one group at a time, human-paced, in a foreground window.

## 4. Install Check

```sh
opencli --version
opencli doctor
```

## 5. Bridge Check

`opencli doctor` should report the browser extension and local daemon on `localhost:19825`. The first browser command starts the daemon if needed.

## 6. Login/Session Check

```sh
opencli facebook groups
```

Rows returned means the browser session is valid. Stop if Facebook shows `/login`, `/checkpoint`, `/checkpoint.php`, `Log in to Facebook`, `You must log in to continue`, `Enter security code`, `Confirm your identity`, or equivalent localized security text.

## 7. Dry-Run Procedure

Run the sequence below and stop before `Post`. Save screenshots and selector notes into the inventory section.

## 8. Manual Command Sequence

```sh
opencli browser fb-recon open "https://www.facebook.com/groups/<TEST_GROUP_ID>" --window foreground
opencli browser fb-recon state
opencli browser fb-recon screenshot ./artifacts/recon-01-group.png --annotate
opencli browser fb-recon click "<composer trigger ref or text>"
opencli browser fb-recon wait selector '[role="dialog"]' --timeout 15000
opencli browser fb-recon state --source ax
opencli browser fb-recon type <editor-ref> "Test draft only. Do not publish."
opencli browser fb-recon click "<Photo/video ref>"
opencli browser fb-recon upload <file-input-ref> ./test.jpg
opencli browser fb-recon screenshot ./artifacts/recon-02-composer-filled.png --annotate
opencli browser fb-recon close
```

Stop at the last line. Closing may show a discard-draft prompt; handle that manually.

## 9. Alternative Bind Flow

Open the group manually in Chrome, then bind OpenCLI to the tab:

```sh
opencli browser fb-recon bind
```

Bound sessions should not close your tab unless you explicitly close it.

## 10. Open A Group

Use `https://www.facebook.com/groups/<id>` or `https://www.facebook.com/groups/<slug>`. A loaded group should have a group URL and a visible group heading.

## 11. Locate Composer

Record exact trigger text and aria-labels for the account locale, including variants such as:

- `Write something...`
- `What's on your mind`
- `Create a public post...`
- `Anonymous post`
- Localized equivalents

Record whether the composer opens as a dialog or inline surface, and capture the editor role/label.

## 12. Fill Caption

Use:

```sh
opencli browser fb-recon type <editor-ref> "Test draft only. Do not publish."
opencli browser fb-recon get text <editor-ref>
```

Record whether text verification works through the accessibility tree.

## 13. Upload Images

Find `input[type="file"]`; note whether it exists before clicking `Photo/video` or appears afterward. Record `accept`, preview markers, progress indicators, and the final thumbnail selectors.

## 14. Stop Before Posting

Identify the `Post` button ref/aria-label and do not click it. Record disabled-to-enabled behavior after caption and image attachment.

## 15. Screenshot/Debug

Use:

```sh
opencli browser fb-recon screenshot ./artifacts/<name>.png --annotate
opencli browser fb-recon state --source ax
opencli browser fb-recon eval '<read-only JS expression>'
```

Keep `eval` read-only during recon: no clicking, navigation, or DOM mutation.

## 16. Failure Modes

For login wall, checkpoint, CAPTCHA, `Action blocked`, or `You can't post right now`:

1. Take a screenshot.
2. Record URL and visible text.
3. Close or unbind the OpenCLI session.
4. Resolve manually in Chrome.

## 17. UI Fragility Notes

Record locale-dependent text, dialog vs inline composer behavior, caption-then-images vs images-then-caption behavior, upload progress behavior, and discard-draft prompt text.

## 18. Inventory Needed Before Level 2

Fill this table from the recon run.

| Area | Observed Values |
| --- | --- |
| Composer trigger texts | TBD |
| Composer trigger aria-labels | TBD |
| Dialog selector/role | `[role="dialog"]` |
| Editor selector/role | `[contenteditable="true"][role="textbox"]` |
| File input selector | TBD |
| File input accept | TBD |
| Photo/video button labels | TBD |
| Preview markers | TBD |
| Upload progress markers | TBD |
| Post button labels | TBD |
| Post disabled semantics | TBD |
| Success signals | TBD |
| Pending-review signals | TBD |
| Error/security texts | TBD |

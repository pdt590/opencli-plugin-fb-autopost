# Example WhatsApp Flow

Use the same safety flow as Telegram:

1. Collect one group, one caption, and local attachment paths.
2. Run a dry-run without `--confirm true`.
3. Return the screenshot path.
4. Wait for exact `POST` or `CANCEL`.
5. Run a live job once with `--confirm true` only after `POST`.

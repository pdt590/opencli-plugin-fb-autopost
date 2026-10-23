#!/usr/bin/env bash
set -uo pipefail
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  echo 'Usage: bash uninstall.sh'
  echo 'Remove only the social-autopost plugin and global social-autopost skill for Hermes.'
  echo 'Keep source, artifacts, configuration, dependencies, Chrome and OpenCLI.'
  exit 0
fi
if (( $# )); then echo 'Unknown argument. Use --help.' >&2; exit 2; fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" || exit 1
cd -- "$repo_dir" || exit 1
command -v npx >/dev/null || { echo 'npx is required.' >&2; exit 1; }
failed=0
if [[ -f node_modules/@jackwener/opencli/package.json ]]; then
  npx --no-install opencli plugin uninstall social-autopost || failed=1
elif command -v opencli >/dev/null; then
  opencli plugin uninstall social-autopost || failed=1
else
  echo 'OpenCLI not found; plugin removal could not be verified.' >&2
  failed=1
fi
# Continue skill removal even if plugin removal failed.
npx --yes skills remove social-autopost -a hermes-agent -g -y || failed=1
if (( failed )); then
  echo 'Removal incomplete. Review errors above; source and browser data were preserved.' >&2
else
  echo 'Removed social-autopost and Hermes social-autopost. Source and browser data were preserved.'
fi
exit "$failed"

#!/usr/bin/env sh
set -eu
# macOS/Linux convenience installer; does not post to Facebook or ask for passwords.
if [ "${1:-}" = "--help" ]; then
  echo 'Usage: ./install.sh [approved-group-url] [alias]'
  exit 0
fi
npm install
npx opencli plugin install "file://$(pwd)"
if [ -n "${1:-}" ]; then
  npm run setup -- --group-url "$1" --group-alias "${2:-main}" --skip-plugin-install
fi
echo 'Optional Hermes skill: npx skills add . --skill facebook-post -a hermes-agent -g'
echo 'Next: opencli profile list'
echo 'Read README.md before your first dry-run.'

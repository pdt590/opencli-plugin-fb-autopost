#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'HELP'
Usage:
  ./install.sh "https://www.facebook.com/groups/<APPROVED_GROUP_ID>" [group-alias]
  ./install.sh --person

macOS-first local installer. It installs npm dependencies, runs setup,
installs the Hermes skill, and prints the next manual browser/Telegram steps.

It does not post to Facebook, log into Facebook, ask for passwords, or store
Facebook credentials.
HELP
  exit 0
fi

GROUP_URL="${1:-}"
GROUP_ALIAS="${2:-main}"
PERSON_ONLY=false
if [ "$GROUP_URL" = "--person" ]; then
  PERSON_ONLY=true
fi

if [ -z "$GROUP_URL" ]; then
  echo "Missing approved Facebook group URL."
  echo "Run: ./install.sh \"https://www.facebook.com/groups/<APPROVED_GROUP_ID>\" main"
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node 20 or newer is required. Install Node, then rerun this script."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node/npm, then rerun this script."
  exit 1
fi

echo "Installing local dependencies..."
npm install

if [ "$PERSON_ONLY" = true ]; then
  echo "Installing personal and group posting commands (no group configuration required)..."
  npx opencli plugin install "file://$(pwd)"
  npx opencli facebook person-post --help
  node scripts/install-hermes-skill.js --skill facebook-person-post --force
  echo "Next: opencli profile list"
  echo 'Prepare only: opencli --profile <profile> facebook person-post --caption "My draft" --dry-run true --keep-tab true'
  exit 0
fi

echo "Running local setup..."
npm run setup -- --group-url "$GROUP_URL" --group-alias "$GROUP_ALIAS"

echo "Installing Hermes skill..."
node scripts/install-hermes-skill.js --force

echo
echo "Next manual steps:"
echo "1. Open Brave or Chrome with the OpenCLI Browser Bridge extension."
echo "2. Log into Facebook manually in that browser profile."
echo "3. Run: npm run doctor"
echo "4. Run: hermes gateway setup"
echo "5. Configure Telegram with the BotFather token and numeric user ID."
echo "6. Run: hermes gateway start"
echo "7. Run the first dry-run from docs/hermes-telegram.md."

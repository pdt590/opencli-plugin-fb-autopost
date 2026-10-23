#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  echo 'Usage: bash install.sh [approved-group-url] [alias]'
  echo 'Linux or Windows Git Bash: install dependencies, package, install plugin and Hermes skill.'
  exit 0
fi
if (( $# > 2 )); then echo 'Too many arguments. Use --help.' >&2; exit 2; fi
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd -- "$repo_dir"
for tool in node npm npx tar; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22 || (a===22 && b<20)) { console.error("Node.js >=22.20 required"); process.exit(1); }'
npm ci --include=dev
npm run package
node scripts/install-plugin.js
npx --yes skills add . --skill social-autopost -a hermes-agent -g --copy -y
if [[ -n "${1:-}" ]]; then
  npm run setup -- --group-url "$1" --group-alias "${2:-main}" --skip-plugin-install
fi
npx --no-install opencli plugin list
echo 'Installed social-autopost and social-autopost for Hermes. Package: dist/social-autopost-local.tar.gz'
echo 'Connect Browser Bridge in your existing Chrome; this script does not launch Chrome or publish posts.'

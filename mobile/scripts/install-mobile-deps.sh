#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

npm install

if [[ "$(uname -s)" == "Darwin" && -f ios/Podfile ]]; then
  npx pod-install ios
fi

printf "Mobile dependencies installed. Copy .env.example to .env and set API_BASE_URL before running the app.\n"

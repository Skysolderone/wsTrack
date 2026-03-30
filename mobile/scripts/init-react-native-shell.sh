#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="WsTrackMobile"
RN_VERSION="${RN_VERSION:-0.76.9}"

if [[ -d "$ROOT_DIR/android" || -d "$ROOT_DIR/ios" ]]; then
  printf "android/ or ios/ already exists. Skipping native shell init.\n"
  exit 0
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/wstrack-rn-XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

npx @react-native-community/cli@latest init "$APP_NAME" \
  --version "$RN_VERSION" \
  --directory "$TMP_DIR/$APP_NAME" \
  --skip-install \
  --skip-git-init

cp -R "$TMP_DIR/$APP_NAME/android" "$ROOT_DIR/android"
cp -R "$TMP_DIR/$APP_NAME/ios" "$ROOT_DIR/ios"

for file in Gemfile .ruby-version; do
  if [[ -f "$TMP_DIR/$APP_NAME/$file" && ! -e "$ROOT_DIR/$file" ]]; then
    cp "$TMP_DIR/$APP_NAME/$file" "$ROOT_DIR/$file"
  fi
done

printf "Native shell created. Run ./scripts/install-mobile-deps.sh next.\n"

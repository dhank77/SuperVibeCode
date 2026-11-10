#!/usr/bin/env bash
# Installs SuperVibeCode on macOS:  curl -fsSL https://raw.githubusercontent.com/latjoromhi25d-dotcom/SuperVibeCode/main/landingpage/install.sh | bash
#
# A download made by curl carries no quarantine flag, so macOS opens the app without the warning a browser download of
# an app not notarized by Apple gets. Run it again to update.
set -euo pipefail

REPO="${SUPERVIBECODE_REPO:-latjoromhi25d-dotcom/SuperVibeCode}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS. On Windows run: irm https://raw.githubusercontent.com/latjoromhi25d-dotcom/SuperVibeCode/main/landingpage/install.ps1 | iex"
  echo "On Linux, download the AppImage, .deb or .rpm from https://github.com/$REPO/releases/latest"
  exit 1
fi

# Apple silicon reports x86_64 under Rosetta, so ask the hardware rather than the shell.
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then arch="arm64"; else arch="x64"; fi

url="https://github.com/$REPO/releases/latest/download/supervibecode-desktop-mac-$arch.dmg"
work="$(mktemp -d)"
mount="$work/volume"

cleanup() {
  hdiutil detach "$mount" -quiet 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "Downloading SuperVibeCode for $( [ "$arch" = arm64 ] && echo "Apple silicon" || echo "Intel" ) Macs..."
# GitHub's download link sometimes answers 504 in some regions (Southeast Asia among them) while its API still serves
# the same file, so fall back to the API when the link fails.
download() {
  curl -fL --retry 2 --retry-delay 2 --retry-all-errors --progress-bar "$url" -o "$work/SuperVibeCode.dmg" && return 0
  echo "Trying another download route..."
  asset="$(curl -fsSL --retry 3 --retry-all-errors "https://api.github.com/repos/$REPO/releases/latest" | tr -d '\n' \
    | grep -o "\"url\": *\"[^\"]*/releases/assets/[0-9]*\"[^}]*\"name\": *\"supervibecode-desktop-mac-$arch.dmg\"" \
    | grep -o 'https://api.github.com/[^"]*/releases/assets/[0-9]*' | head -n 1)"
  [ -n "$asset" ] || return 1
  curl -fL --retry 5 --retry-delay 3 --retry-all-errors --progress-bar -H "Accept: application/octet-stream" "$asset" \
    -o "$work/SuperVibeCode.dmg"
}

download || {
  echo "Download failed. Check your connection and run the command again, or download it from https://github.com/$REPO/releases/latest"
  exit 1
}

mkdir -p "$mount"
hdiutil attach "$work/SuperVibeCode.dmg" -nobrowse -readonly -noautoopen -quiet -mountpoint "$mount"
app="$(find "$mount" -maxdepth 1 -name "*.app" -print -quit)"

if [ -z "$app" ]; then
  echo "The download didn't contain the app. Try again, or download it from https://github.com/$REPO/releases/latest"
  exit 1
fi

name="$(basename "$app")"
# /Applications needs no password for an administrator; other accounts install to their own Applications folder.
target="/Applications"
[ -w "$target" ] || target="$HOME/Applications"
mkdir -p "$target"

osascript -e "quit app \"${name%.app}\"" >/dev/null 2>&1 || true
rm -rf "$target/$name"
ditto "$app" "$target/$name"
xattr -dr com.apple.quarantine "$target/$name" 2>/dev/null || true

echo "Installed $name in $target. Opening it now."
open "$target/$name"

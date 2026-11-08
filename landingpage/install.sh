#!/usr/bin/env bash
# Installs SuperVibeCode on macOS:  curl -fsSL https://<site>/install.sh | bash
#
# A download made by curl carries no quarantine flag, so macOS opens the app without the warning a browser download of
# an app not notarized by Apple gets. Run it again to update.
set -euo pipefail

REPO="${SUPERVIBECODE_REPO:-latjoromhi25d-dotcom/SuperVibeCode}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS. On Windows run: irm <site>/install.ps1 | iex"
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
curl -fL --progress-bar "$url" -o "$work/SuperVibeCode.dmg"

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

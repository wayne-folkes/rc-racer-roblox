#!/usr/bin/env bash
# Renders the Roblox experience images from the HTML sources in design/, as rc-racer's design/render.sh does.
#   icon.png       512x512 from icon.html: the experience icon
#   thumbnail.png  1920x1080 from thumbnail.html: an experience thumbnail
# Upload both in the Creator Dashboard: the experience's Configure > Places > Basic Info (or Places > Icon /
# Thumbnails). Roblox moderates them, and doesn't allow links to other sites in them.
# Needs Google Chrome in /Applications. Override with CHROME=/path/to/chrome.
set -euo pipefail

DESIGN_DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Headless Chrome writes the screenshot itself. Its exit status can be non-zero even when the PNG is fine,
# so success is judged by the output file.
# shot <html-file> <width> <height> <out-png>
shot() {
  rm -f "$4"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --no-first-run --no-default-browser-check --user-data-dir="$TMP/profile" \
    --window-size="$2,$3" --screenshot="$4" "file://$1" >/dev/null 2>&1 || true
  if [[ ! -s "$4" ]]; then
    echo "Chrome did not produce $4" >&2
    exit 1
  fi
  echo "wrote $4"
}

shot "$DESIGN_DIR/icon.html" 512 512 "$DESIGN_DIR/icon.png"
shot "$DESIGN_DIR/thumbnail.html" 1920 1080 "$DESIGN_DIR/thumbnail.png"

for f in icon.png thumbnail.png; do
  sips -g pixelWidth -g pixelHeight "$DESIGN_DIR/$f" | tail -n 2
done

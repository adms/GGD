#!/usr/bin/env bash
# Run a Pillow-dependent repo tool with a Python whose architecture matches PIL.
# The desktop app may launch pnpm under Rosetta while the user's Pillow wheel is
# arm64; plain `python3` then exists but fails only at `_imaging` import time.
set -euo pipefail

if python3 -c 'from PIL import Image' >/dev/null 2>&1; then
  exec python3 "$@"
fi
if command -v arch >/dev/null 2>&1 && arch -arm64 python3 -c 'from PIL import Image' >/dev/null 2>&1; then
  exec arch -arm64 python3 "$@"
fi
if [[ -x /opt/homebrew/bin/python3 ]] && /opt/homebrew/bin/python3 -c 'from PIL import Image' >/dev/null 2>&1; then
  exec /opt/homebrew/bin/python3 "$@"
fi
if [[ -x /usr/bin/python3 ]] && /usr/bin/python3 -c 'from PIL import Image' >/dev/null 2>&1; then
  exec /usr/bin/python3 "$@"
fi

echo 'No Python with a working Pillow installation was found.' >&2
exit 2

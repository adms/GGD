#!/usr/bin/env bash
# Fetch the instrument soundfont bgm-gen plays its notes on (GH#531).
#
#   bash tools/bgm-gen/sf/FETCH.sh
#
# MuseScore_General.sf3 — MIT licence, S. Christian Collins, after FluidR3Mono
# (Michael Cowgill) and FluidR3 (Frank Wen). Provenance and the full credit are
# in content/assets/CREDITS.md; the licence text is committed next to the file.
#
# ⭐ The sha256 is checked, not trusted: this is the deterministic INPUT to every
# rendered track, so a different soundfont silently produces different audio from
# the same score — which is precisely the property the whole tool is built on.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General"
WANT="5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3"

curl -sSfL --max-time 600 -o "$HERE/MuseScore_General.sf3" "$BASE/MuseScore_General.sf3"
curl -sSfL --max-time 60  -o "$HERE/MuseScore_General_License.md" "$BASE/MuseScore_General_License.md"

GOT="$(shasum -a 256 "$HERE/MuseScore_General.sf3" | cut -d' ' -f1)"
if [ "$GOT" != "$WANT" ]; then
  echo "⛔ soundfont sha256 mismatch" >&2
  echo "   want $WANT" >&2
  echo "   got  $GOT" >&2
  echo "   ⛔ 不要拿它算音樂 —— 同一份 score 會產出不同的 bytes。" >&2
  exit 1
fi
echo "✓ MuseScore_General.sf3  sha256 ${GOT:0:16}…  ($(du -h "$HERE/MuseScore_General.sf3" | cut -f1))"
echo "  下一步: 建 note bank"
echo "  python3 -c 'import sys;sys.path.insert(0,\"tools/bgm-gen/src\");from ggd import sampler;sampler.main([])'"

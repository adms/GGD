#!/usr/bin/env bash
#
# audio-optimize/optimize.sh — cap the shipped audio at a 128 kbps / 44.1 kHz
# CEILING, re-encoding IN PLACE only the files that EXCEED it. Idempotent and
# reversible (every touched original is backed up first).
#
# WHY A CEILING, NOT A TARGET
# ---------------------------
# Most of content/assets/audio is already at or below the cap: the login/board
# voice clips are 22 050 Hz / ~60 kbps and the BGM beds (incl. the *.samantha.mp3
# variants) are already 44 100 Hz / 128 kbps. Re-encoding those UP would only
# bloat them and burn quality for nothing. So this script LEAVES anything already
# at/below the cap untouched and only re-encodes the outliers DOWN:
#
#   • bit_rate  > 130 000  (a small tolerance over 128 000 so true-128k CBR beds
#                           are never re-touched → the run stays idempotent), OR
#   • sample_rate > 44 100
#
# WHAT IT DOES NOT TOUCH
# ----------------------
#   • *.wav  — a WAV cannot be expressed at "128 kbps"; the combat SFX WAVs are
#     44 100 Hz/16-bit PCM (705 kbps by construction) and are referenced by
#     content/config/audio-map.json BY NAME. Converting them to .mp3 would mean
#     renaming + editing that map (out of this tool's remit). They are reported
#     under "SKIPPED (wav)" so the opportunity is visible, but left as-is.
#   • Anything already ≤ the cap (the 22 kHz voices, the 128k BGM beds, the
#     Samantha variants) — skipped, so the login/combat audio is bit-identical.
#
# OUTPUT FORMAT / SAMPLE RATE
# ---------------------------
# Re-encoded to CBR 128 kbps libmp3lame, sample rate = min(current, 44 100) so a
# 22 kHz clip that somehow exceeded on bitrate is never UP-sampled. Channel count
# and metadata are preserved (-map_metadata 0). Same path, same filename.
#
# MANIFESTS
# ---------
# The MANIFEST.json files under audio/ record `sourceBytes` (the provenance size
# of the ORIGINAL third-party download) and the pipeline's TARGET `sampleRate`
# (44 100) — neither is the current output size, and dropping the bitrate does
# not change a clip's DURATION — so no manifest needs patching. (The script warns
# if it ever sees an output whose duration drifted, which would be a bug.)
#
# USAGE
#   tools/audio-optimize/optimize.sh --dry-run   # report only, touch nothing
#   tools/audio-optimize/optimize.sh             # apply in place (backs up first)
#
# Requires: ffmpeg + ffprobe on PATH (with libmp3lame).
set -euo pipefail

# --- config ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUDIO_DIR="$REPO_ROOT/content/assets/audio"
CEILING_SR=44100
THRESH_BR=130000          # re-encode above this (tolerance over the 128k target)
TARGET_BR="128k"          # CBR output bitrate

DRY_RUN=0
[[ "${1:-}" == "--dry-run" || "${1:-}" == "-n" ]] && DRY_RUN=1

command -v ffmpeg  >/dev/null 2>&1 || { echo "error: ffmpeg not found on PATH"  >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "error: ffprobe not found on PATH" >&2; exit 1; }
[[ -d "$AUDIO_DIR" ]] || { echo "error: audio dir not found: $AUDIO_DIR" >&2; exit 1; }

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$SCRIPT_DIR/.backups/$TS"   # .backups/ matches .gitignore '.backup*/'

# --- helpers --------------------------------------------------------------
probe() { # $1=file $2=entry(sample_rate|bit_rate|duration)
  ffprobe -v error -select_streams a:0 -show_entries "stream=$2" \
    -of default=noprint_wrappers=1:nokey=1 "$1" 2>/dev/null | head -1
}
dur() { # duration via format (more reliable than stream for some mp3)
  ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$1" 2>/dev/null | head -1
}
human() { # bytes -> MB with 2 decimals
  awk -v b="$1" 'BEGIN{ printf "%.2f MB", b/1048576 }'
}

# --- scan + act -----------------------------------------------------------
total_before=0 total_after=0
n_encoded=0 n_skipped_ok=0 n_skipped_wav=0
declare -a ENCODED_LOG=()

echo "audio-optimize: ceiling ${TARGET_BR}/${CEILING_SR}Hz  (dry-run=${DRY_RUN})"
echo "audio dir: $AUDIO_DIR"
echo

# WAV report (never re-encoded, but surfaced)
while IFS= read -r -d '' f; do
  sz=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")
  total_before=$((total_before + sz)); total_after=$((total_after + sz))
  n_skipped_wav=$((n_skipped_wav + 1))
done < <(find "$AUDIO_DIR" -type f -name '*.wav' -print0)

# MP3 pass
while IFS= read -r -d '' f; do
  sz=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")
  total_before=$((total_before + sz))
  sr=$(probe "$f" sample_rate); br=$(probe "$f" bit_rate)
  [[ -z "$sr" ]] && sr=0
  # bit_rate can be N/A on some headerless VBR — fall back to size*8/duration
  if [[ -z "$br" || "$br" == "N/A" ]]; then
    d=$(dur "$f"); [[ -z "$d" || "$d" == "N/A" ]] && d=0
    br=$(awk -v s="$sz" -v d="$d" 'BEGIN{ if(d>0) printf "%d", (s*8)/d; else print 0 }')
  fi

  over_br=$(( br > THRESH_BR ? 1 : 0 ))
  over_sr=$(( sr > CEILING_SR ? 1 : 0 ))

  if [[ $over_br -eq 0 && $over_sr -eq 0 ]]; then
    n_skipped_ok=$((n_skipped_ok + 1))
    total_after=$((total_after + sz))
    continue
  fi

  # target sample rate never UP-samples
  new_sr=$sr; [[ $sr -gt $CEILING_SR ]] && new_sr=$CEILING_SR
  rel="${f#"$AUDIO_DIR"/}"
  before_dur=$(dur "$f")

  if [[ $DRY_RUN -eq 1 ]]; then
    printf "  WOULD ENCODE  %6sHz %4dk -> %s/%sHz  %s\n" "$sr" "$((br/1000))" "$TARGET_BR" "$new_sr" "$rel"
    n_encoded=$((n_encoded + 1))
    total_after=$((total_after + sz))   # unknown; count as-is for the dry-run tally
    continue
  fi

  # back up the original (idempotent: never clobber an existing backup)
  bpath="$BACKUP_DIR/$rel"
  mkdir -p "$(dirname "$bpath")"
  [[ -e "$bpath" ]] || cp -p "$f" "$bpath"

  tmp="$(dirname "$f")/.opt-$$-$(basename "$f")"
  ffmpeg -hide_banner -loglevel error -y -i "$f" \
    -c:a libmp3lame -b:a "$TARGET_BR" -ar "$new_sr" -map_metadata 0 "$tmp"

  # NEVER GROW: a very short clip just over the threshold (e.g. an 80 ms UI blip
  # at 133k VBR) can come out LARGER as 128k CBR + LAME header. Re-encoding it
  # would bloat, not shrink — the exact thing the ceiling exists to avoid. If the
  # output is not smaller, discard it, drop the (now-redundant) backup, and treat
  # the file as already-compliant so the run stays a pure size reduction.
  new_sz=$(stat -f%z "$tmp" 2>/dev/null || stat -c%s "$tmp")
  if [[ $new_sz -ge $sz ]]; then
    rm -f "$tmp"
    [[ -e "$bpath" ]] && rm -f "$bpath"
    n_skipped_ok=$((n_skipped_ok + 1))
    total_after=$((total_after + sz))
    continue
  fi
  mv -f "$tmp" "$f"

  total_after=$((total_after + new_sz))
  n_encoded=$((n_encoded + 1))

  # duration sanity: a bitrate change must not move the clip length (> 60 ms drift = bug)
  after_dur=$(dur "$f")
  drift=$(awk -v a="${before_dur:-0}" -v b="${after_dur:-0}" 'BEGIN{ d=a-b; if(d<0)d=-d; printf "%.3f", d }')
  warn=""
  awk -v d="$drift" 'BEGIN{ exit !(d>0.06) }' && warn="  ⚠ duration drift ${drift}s"
  ENCODED_LOG+=("$(printf "  %6sHz %4dk %7dB -> %5dB  %s%s" "$sr" "$((br/1000))" "$sz" "$new_sz" "$rel" "$warn")")
done < <(find "$AUDIO_DIR" -type f -name '*.mp3' -print0)

# --- report ---------------------------------------------------------------
if [[ ${#ENCODED_LOG[@]} -gt 0 ]]; then
  echo "re-encoded:"
  printf '%s\n' "${ENCODED_LOG[@]}"
  echo
fi
echo "summary:"
echo "  encoded (mp3 over cap) : $n_encoded"
echo "  skipped (already ≤ cap): $n_skipped_ok"
echo "  skipped (wav, reported): $n_skipped_wav"
echo "  total before           : $(human "$total_before")"
if [[ $DRY_RUN -eq 0 ]]; then
  saved=$((total_before - total_after))
  echo "  total after            : $(human "$total_after")"
  echo "  saved                  : $(human "$saved")"
  echo "  backups                : $BACKUP_DIR"
else
  echo "  (dry-run: no files changed; after/saved not computed)"
fi

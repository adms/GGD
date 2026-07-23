#!/usr/bin/env sh
# nginx/precompress.sh — emit `.gz` (and `.br`, when the brotli CLI is present)
# sidecars next to the static files nginx and the vite dev server serve.
#
# WHY SIDECARS AND NOT JUST RUNTIME gzip
#   - ratio: offline `gzip -9` / `brotli -q 11` beat what any server will spend
#     per request. Measured on this repo's 163 .glb: 36,525,948 B raw →
#     19,518,292 B at gzip -9 → 17,660,572 B at brotli -q 11.
#   - CPU: nginx `gzip_static on` (already compiled into the stock image) and
#     `brotli_static on` serve the sidecar with ZERO compression work.
#   - one artifact, two servers: apps/client/vite.config.ts's staticHandler
#     reads exactly the same sidecars, so `client-lan` gets the win too.
#
# STALENESS IS THE REAL HAZARD. A regenerated .glb beside an OLD .glb.gz means
# every gzip-capable client gets the old model and only clients that refuse gzip
# get the new one — a divergence that is nearly invisible. Two defences:
#   1. this script rewrites any sidecar older than its source, and DELETES
#      orphans whose source is gone;
#   2. both consumers verify mtime at request time and ignore a stale sidecar
#      (vite: freshSidecar(); nginx: re-run this script in the deploy pipeline).
# Run it after anything that writes into content/assets/.
#
# THE SIDECARS ARE BUILD OUTPUT, NOT SOURCE. ~19.5 MB of them under content/ would
# be real repo bloat, so add these two lines to .gitignore before running this
# against content/ (this script does not edit .gitignore — that file is outside
# this change's ownership):
#     *.gz
#     *.br
#
# Usage:  nginx/precompress.sh [dir ...]        (default: content/assets)
#         SKIP_BROTLI=1 nginx/precompress.sh    (gzip sidecars only)

set -eu

# Compressible by measurement. mp3/ogg/png/webp/jpg are deliberately absent:
# they are already-compressed containers — measured on this repo, gzip buys
# 1.005 % on mp3 and 0.383 % on png, and one png came out BIGGER than the input.
MIN_BYTES=256

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
[ "$#" -gt 0 ] || set -- "$root_dir/content/assets"

have_brotli=0
if [ "${SKIP_BROTLI:-0}" != "1" ] && command -v brotli >/dev/null 2>&1; then
    have_brotli=1
fi

filesize() { wc -c < "$1" | tr -d ' '; }

# Rebuild $2 from $1 with the command in $3.. unless it is already newer than
# the source. Drops the result if it did not actually come out smaller.
refresh() {
    src=$1; out=$2; shift 2
    if [ -f "$out" ] && [ ! "$src" -nt "$out" ]; then return 0; fi
    if ! "$@" < "$src" > "$out.tmp$$" 2>/dev/null; then rm -f "$out.tmp$$"; return 0; fi
    if [ "$(filesize "$out.tmp$$")" -lt "$(filesize "$src")" ]; then
        mv -f "$out.tmp$$" "$out"
    else
        rm -f "$out.tmp$$" "$out"
    fi
}

tally=$(mktemp)
trap 'rm -f "$tally"' EXIT INT TERM

for dir in "$@"; do
    if [ ! -d "$dir" ]; then
        echo "precompress: skipping missing $dir" >&2
        continue
    fi

    find "$dir" -type f -print | while IFS= read -r f; do
        case "$f" in
            # Orphan sweep: a sidecar whose source was deleted or renamed would
            # otherwise be served forever.
            *.gz | *.br)
                [ -f "${f%.*}" ] || rm -f "$f"
                continue
                ;;
            # .webmanifest: the PWA manifest linked from apps/client/index.html.
            # nginx types it application/manifest+json (see nginx/nginx.conf) and
            # that type is in gzip_types, so it deserves a sidecar like any other
            # JSON. Without this line it was the one text file in the SPA dist
            # that shipped raw.
            *.glb | *.gltf | *.json | *.webmanifest | *.wav | *.svg | *.wasm | *.txt | *.js | *.css | *.html) ;;
            *) continue ;;
        esac

        size=$(filesize "$f")
        [ "$size" -ge "$MIN_BYTES" ] || continue
        refresh "$f" "$f.gz" gzip -9 -c
        [ "$have_brotli" -eq 1 ] && refresh "$f" "$f.br" brotli -q 11 -c

        gz=$size; br=$size
        [ -f "$f.gz" ] && gz=$(filesize "$f.gz")
        [ -f "$f.br" ] && br=$(filesize "$f.br")
        printf '%s %s %s\n' "$size" "$gz" "$br"
    done >> "$tally"
done

raw_total=0; gz_total=0; br_total=0; n=0
while read -r size gz br; do
    raw_total=$((raw_total + size)); gz_total=$((gz_total + gz)); br_total=$((br_total + br)); n=$((n + 1))
done < "$tally"

echo "precompress: $n files"
echo "  raw        $raw_total B"
echo "  gzip -9    $gz_total B  (saved $((raw_total - gz_total)) B)"
if [ "$have_brotli" -eq 1 ]; then
    echo "  brotli -11 $br_total B  (saved $((raw_total - br_total)) B)"
else
    echo "  brotli     SKIPPED — no brotli CLI on PATH (install it, or SKIP_BROTLI=1 to silence)"
fi

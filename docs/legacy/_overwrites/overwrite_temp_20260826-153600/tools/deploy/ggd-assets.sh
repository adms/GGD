#!/bin/sh
# ggd-assets.sh — manifest, verify and ASSERT the out-of-band asset sets that
# git cannot carry. Task #176.
#
# THE PROBLEM THIS EXISTS FOR
# ---------------------------
# data/blizzard-overlay/ is 556 files / 87,403,869 B and is gitignored by
# .gitignore's `/data/**`. It can never reach a host through a git push. But
# the client REQUIRES it: 40 of 113 champions have no dedicated shipped model
# and fall back to one of four generic KayKit stand-ins without it, and 97 of
# 113 have no authored voice clip at all and fall back to silence.
#
# Absent, nothing fails. nginx returns 404, the resolver treats that as a
# supported state, and the deploy looks completely healthy. The owner on
# localhost sees the right models; a family member on the deployed build sees
# four repeated stand-ins; NEITHER OF THEM CAN TELL THE TWO BUILDS DIFFER, and
# an entire evening of playtest feedback is about the wrong game.
#
# So: a manifest that travels with the bytes, a verify that reads the bytes
# rather than trusting the copy, and a boot assertion that refuses to start.
#
# ONE SCRIPT, THREE CALLERS
# -------------------------
#   host   (macOS/bash)  `manifest` before shipping, `verify` after
#   ship   (rsync)       `verify` over ssh on the remote copy
#   edge   (alpine ash)  `assert`, from /docker-entrypoint.d/ before nginx
# It is POSIX sh with no bashisms so the same file is correct in all three.
#
# THE MANIFEST FORMAT (deliberately not JSON — busybox has no JSON parser):
#   SHIP.sha256   `<sha256>  <relative/path>` per file, LC_ALL=C sorted.
#                 Directly checkable with `sha256sum -c` / `shasum -a 256 -c`.
#   SHIP.txt      key=value summary: set, files, bytes, digest, generated.
#                 `digest` is the sha256 OF SHIP.sha256, so a tampered or
#                 truncated listing is detected without re-reading 84 MB.
# Both live inside the set's own directory and are excluded from their own
# counts.
#
# Usage:
#   ggd-assets.sh manifest <dir> <set-name>   write SHIP.sha256 + SHIP.txt
#   ggd-assets.sh verify   <dir> [--deep]     check a copy against its manifest
#   ggd-assets.sh assert                      edge boot gate (env-driven)
#
# Exit codes: 0 ok, 1 failed/missing/short. Never 0 on a partial set.

set -eu

SELF="ggd-assets.sh"

# ---------------------------------------------------------------- helpers ---

# sha256 of stdin or of a file, on both alpine (sha256sum) and macOS (shasum).
sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 | cut -d' ' -f1
  else echo "$SELF: no sha256sum or shasum available" >&2; exit 1
  fi
}

# Emit `<sha256>  <relpath>` for every file under $1, excluding the manifest
# itself, LC_ALL=C sorted so the listing is byte-stable across machines.
listing_of() {
  dir="$1"
  ( cd "$dir" && \
    find . -type f ! -name 'SHIP.sha256' ! -name 'SHIP.txt' -print \
    | LC_ALL=C sort \
    | while IFS= read -r f; do
        if command -v sha256sum >/dev/null 2>&1; then sha256sum "$f"
        else shasum -a 256 "$f"
        fi
      done )
}

# File count of a set (manifest files excluded).
count_of() {
  find "$1" -type f ! -name 'SHIP.sha256' ! -name 'SHIP.txt' -print | wc -l | tr -d ' '
}

# Files of a set that EXIST but cannot be READ. POSIX find has no `-readable`
# (that is GNU findutils; busybox does not have it either), so the test is the
# shell's own `[ -r ]`, one file at a time — 556 builtin tests cost nothing next
# to hashing 87 MB. Same newline-in-filename assumption as listing_of().
unreadable_in() {
  find "$1" -type f ! -name 'SHIP.sha256' ! -name 'SHIP.txt' -print \
  | while IFS= read -r f; do
      [ -r "$f" ] || echo "$f"
    done
}

# Total bytes of a set. `cat | wc -c` rather than stat, because stat's flags
# differ between BSD (-f%z) and GNU (-c%s) and this must be identical on both.
#
# ⛔ THE `2>/dev/null` ON THE `cat` IS GONE ON PURPOSE (#749). It had TWO layers
# of swallow: EACCES went to /dev/null, and the exit code of `find | wc | tr`
# comes from the TAIL of the pipeline (`tr`, always 0), so `set -eu` could not
# see it either. A file this process cannot open therefore surfaced ONLY as
# "'blizzard' is 87,3xx,xxx B, manifest says 87,403,869 B" — a BYTE SHORTFALL —
# and the operator went hunting for a truncated rsync instead of a mode bit.
# This runs as the edge boot gate, so that is the wrong diagnosis you get at 3am
# with nginx refusing to start.
#
# Contract: byte count of the READABLE remainder still goes to stdout (so the
# caller can go on to report the shortfall as well), the offending paths go to
# stderr, and the return code is 1.
# GGD_ASSET_STRICT_READ=0 restores the old behaviour byte for byte.
bytes_of() {
  case "${GGD_ASSET_STRICT_READ:-1}" in
    0|no|off|false)
      find "$1" -type f ! -name 'SHIP.sha256' ! -name 'SHIP.txt' -exec cat {} + 2>/dev/null | wc -c | tr -d ' '
      return 0
      ;;
  esac
  unreadable=$(unreadable_in "$1")
  find "$1" -type f ! -name 'SHIP.sha256' ! -name 'SHIP.txt' -exec cat {} + | wc -c | tr -d ' '
  [ -n "$unreadable" ] || return 0
  echo "$SELF: 讀取失敗 (READ FAILED) — these files exist but this process cannot open them, so their bytes are NOT counted. This is a PERMISSION problem, not a short copy:" >&2
  echo "$unreadable" | head -n 10 | sed 's/^/  /' >&2
  return 1
}

# Read key=value out of a SHIP.txt.
field_of() {
  # $1 = file, $2 = key
  sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1
}

# Group digits with commas: 87403869 -> 87,403,869. awk rather than sed because
# BSD sed (macOS) has no `\|` alternation in BREs and the classic sed one-liner
# for this silently no-ops there — which would have made every one of this
# script's numbers subtly different on the owner's Mac than in the container.
commas() {
  echo "$1" | awk '{ n=$0; out=""; while (length(n) > 3) { out = "," substr(n, length(n)-2) out; n = substr(n, 1, length(n)-3) } print n out }'
}

# ------------------------------------------------------------- subcommands ---

cmd_manifest() {
  dir="${1:?usage: $SELF manifest <dir> <set-name>}"
  name="${2:?usage: $SELF manifest <dir> <set-name>}"
  [ -d "$dir" ] || { echo "$SELF: $dir does not exist" >&2; exit 1; }

  # Readability is checked BEFORE anything is written (#749): a manifest whose
  # `bytes=` was computed over files the generator could not open is a lie that
  # every later verify inherits — and, because both sides skip the same file, it
  # is a lie that VERIFIES GREEN. Bail before SHIP.sha256 exists, so there is no
  # half-written manifest to mistake for a good one.
  read_ok=1
  bytes=$(bytes_of "$dir") || read_ok=0
  if [ "$read_ok" -ne 1 ]; then
    echo "$SELF: FAIL — refusing to write a manifest for '$name' while files in it cannot be read (paths above)." >&2
    exit 1
  fi

  listing_of "$dir" > "$dir/SHIP.sha256"
  files=$(count_of "$dir")
  digest=$(sha256_stdin < "$dir/SHIP.sha256")

  {
    echo "set=$name"
    echo "files=$files"
    echo "bytes=$bytes"
    echo "digest=$digest"
    echo "generated=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$dir/SHIP.txt"

  echo "$SELF: manifest for '$name' — $files files / $(commas "$bytes") B"
  echo "  $dir/SHIP.sha256"
  echo "  $dir/SHIP.txt   digest=$digest"
}

cmd_verify() {
  dir="${1:?usage: $SELF verify <dir> [--deep]}"
  deep="${2:-}"
  man="$dir/SHIP.txt"
  lst="$dir/SHIP.sha256"

  if [ ! -f "$man" ] || [ ! -f "$lst" ]; then
    echo "$SELF: FAIL — no manifest in $dir (expected SHIP.txt + SHIP.sha256)." >&2
    echo "  Generate it at the SOURCE with: $SELF manifest $dir <set-name>" >&2
    return 1
  fi

  want_files=$(field_of "$man" files)
  want_bytes=$(field_of "$man" bytes)
  want_digest=$(field_of "$man" digest)
  set_name=$(field_of "$man" set)

  got_files=$(count_of "$dir")
  got_digest=$(sha256_stdin < "$lst")

  rc=0
  # `|| read_ok=0` rather than a bare assignment: under `set -e` a failing
  # command substitution would abort the whole verify here, and "which of the
  # four checks is unhappy" is this function's entire diagnostic value.
  read_ok=1
  got_bytes=$(bytes_of "$dir") || read_ok=0
  if [ "$read_ok" -ne 1 ]; then
    echo "$SELF: FAIL — '$set_name' could not be read in full (paths above). A byte total computed over files this process cannot open is not evidence." >&2
    rc=1
  fi
  if [ "$got_digest" != "$want_digest" ]; then
    echo "$SELF: FAIL — SHIP.sha256 does not match its own recorded digest (the listing was truncated or edited in transit)." >&2
    rc=1
  fi
  if [ "$got_files" != "$want_files" ]; then
    echo "$SELF: FAIL — '$set_name' has $got_files files, manifest says $want_files (short by $((want_files - got_files)))." >&2
    rc=1
  fi
  if [ "$got_bytes" != "$want_bytes" ]; then
    echo "$SELF: FAIL — '$set_name' is $(commas "$got_bytes") B, manifest says $(commas "$want_bytes") B." >&2
    rc=1
  fi
  # ⛔ NO `[ "$rc" -eq 0 ] || return 1` HERE (#749). It used to sit exactly on
  # this line, in front of the --deep block, which meant the per-file "WHICH
  # files are wrong" naming below could ONLY run when count and bytes both
  # already agreed — i.e. never in the one case where you most want the names.
  # A short or unreadable set now pays the extra hashing pass (about a second on
  # 87 MB, at a boot that happens rarely) and gets told which files.
  if [ "$deep" = "--deep" ]; then
    # The real thing: re-read every byte and compare content hashes. This is
    # what "verify what arrived rather than trusting the copy" means — rsync
    # reporting success is rsync's opinion, not evidence. It is also the ONLY
    # check that catches a file which is the right LENGTH and the wrong bytes;
    # count+bytes above catch a short set, not a corrupt one.
    #
    # NO QUIET FLAG — this cost a boot failure on a perfectly good overlay. The
    # edge image is nginxinc/nginx-unprivileged:alpine, i.e. busybox, whose
    # sha256sum is `[-c[sw]] [FILE]...`: it rejects `--quiet` outright
    # ("sha256sum: unrecognized option: quiet", rc=1). GNU coreutils accepts
    # --quiet/--status but has no `-s`, so there is NO flag spelling that is
    # correct on both. Redirect instead and read the exit code, which both
    # implementations set identically — then keep the captured output, because
    # it names the offending files and "how many" is the whole point.
    hashlog="${TMPDIR:-/tmp}/ggd-assets-deep.$$"
    if ( cd "$dir" && \
         if command -v sha256sum >/dev/null 2>&1; then sha256sum -c SHIP.sha256
         else shasum -a 256 -c SHIP.sha256
         fi ) > "$hashlog" 2>&1; then
      rm -f "$hashlog"
    else
      # Count only the per-file failures. sha256sum -c also writes ONE trailing
      # "WARNING: N computed checksum(s) did NOT match" summary to the log (both
      # busybox and GNU do); matching ': FAILED' — the per-file verdict both emit
      # — excludes that summary so the tally is the real file count, not N+1.
      n_bad=$(grep -c ': FAILED' "$hashlog" 2>/dev/null || echo 0)
      if [ "$rc" -eq 0 ]; then
        echo "$SELF: FAIL — '$set_name' is CORRUPT, not merely short: $n_bad of $got_files files do not match their recorded hash." >&2
      else
        # Reachable only because the early return above is gone (#749): the set
        # is already known short or unreadable, and this is the per-file verdict
        # for it — missing, unopenable or wrong bytes, named one by one.
        echo "$SELF: FAIL — '$set_name' — per-file verdict for the mismatch reported above: $n_bad listed files are missing, unreadable or corrupt." >&2
      fi
      grep ': FAILED' "$hashlog" 2>/dev/null | head -n 10 | sed 's/^/  /' >&2
      # `if` rather than `[ … ] &&`: this is no longer the last statement before
      # a `return`, so a false test must not become the block's exit status.
      if [ "$n_bad" -gt 10 ] 2>/dev/null; then echo "  … and $((n_bad - 10)) more" >&2; fi
      rm -f "$hashlog"
      rc=1
    fi
  fi

  [ "$rc" -eq 0 ] || return 1

  if [ "$deep" = "--deep" ]; then
    echo "$SELF: OK (deep) — '$set_name' $got_files files / $(commas "$got_bytes") B, every hash matches."
  else
    echo "$SELF: OK — '$set_name' $got_files files / $(commas "$got_bytes") B, digest $got_digest."
  fi
  return 0
}

# ------------------------------------------------------------- the assert ---
#
# Runs at EDGE BOOT, before nginx. Active only when this deploy has declared
# itself full-asset, which it does by mounting the family tier directory.
# Silence is the failure mode this whole task exists to eliminate, so this
# never warns: it prints to stderr and exits 1, and the family compose sets
# `restart: "no"` on the edge so the container stays down and visible.
cmd_assert() {
  tier_dir="${GGD_TIER_DIR:-/etc/nginx/ggd-tier}"
  overlay="${GGD_OVERLAY_DIR:-/srv/blizzard-overlay}"
  imported="${GGD_IMPORTED_DIR:-/srv/content/assets/models/imported}"
  min_imported="${GGD_MIN_IMPORTED_GLB:-129}"

  # Not a family deploy → nothing to assert. A gated edge is allowed to have no
  # overlay; that is its whole point.
  if [ ! -f "$tier_dir/00-full-assets.geo.conf" ]; then
    echo "[ggd-assets] tier=gated — no full-asset assertion (no $tier_dir/00-full-assets.geo.conf)"
    return 0
  fi

  echo "[ggd-assets] tier=FAMILY — asserting full assets before nginx starts"
  failed=0

  if [ ! -d "$overlay" ]; then
    cat >&2 <<EOF

================================ FATAL =================================
This deploy declares GGD_DEPLOY_TIER=family (FULL ASSETS), but the
Blizzard overlay is NOT MOUNTED at $overlay.

Expected: 556 files / 87,403,869 B (511 .wav, 40 .glb, 5 .json)
Found:    the directory does not exist

WHAT YOUR FAMILY WOULD HAVE SEEN IF THIS HAD BEEN A WARNING:
  * 40 of 113 champions rendered as one of four generic stand-ins
  * 97 of 113 champions completely silent when clicked
  * no error anywhere — the deploy would have looked perfectly healthy

FIX:  make family-ship            (same machine — checks the bind mount)
      make family-ship HOST=<host>  (remote — rsync + verify)
========================================================================

EOF
    failed=1
  else
    # DEEP BY DEFAULT (#177). It was opt-in, which meant the only check that
    # catches a right-length/wrong-bytes file had never run anywhere — and,
    # because of the busybox flag bug fixed in cmd_verify, could not have passed
    # if it had. Hashing 87,403,869 B costs about a second, once, at container
    # start; a family edge boots rarely and the whole point of this gate is that
    # it is not fooled by a copy that merely looks the right shape.
    # GGD_ASSET_DEEP_VERIFY=0 opts out.
    case "${GGD_ASSET_DEEP_VERIFY:-1}" in
      0|no|off|false) deep_flag="" ;;
      *)              deep_flag="--deep" ;;
    esac
    if ! cmd_verify "$overlay" "$deep_flag"; then
      cat >&2 <<EOF

================================ FATAL =================================
This deploy declares GGD_DEPLOY_TIER=family (FULL ASSETS), but the
Blizzard overlay at $overlay is MISSING OR SHORT
(details immediately above).

40 of 113 champions would render as generic stand-ins and 97 of 113
would have no voice, with nothing logged and nothing broken-looking.
That is why this is a boot failure and not a warning.

FIX:  make family-ship HOST=<host>
========================================================================

EOF
      failed=1
    fi
  fi

  # The imported/anime champion GLBs. These ARE tracked in git, so they reach a
  # host — but the family tier promises them to every peer, and an image built
  # from a partial checkout (or a content/ mount that did not land) is exactly
  # as invisible as a missing overlay.
  if [ -d "$imported" ]; then
    n_glb=$(find "$imported" -type f -name '*.glb' | wc -l | tr -d ' ')
  else
    n_glb=0
  fi
  if [ "$n_glb" -lt "$min_imported" ]; then
    cat >&2 <<EOF

================================ FATAL =================================
Full-asset deploy, but only $n_glb imported champion GLBs are present at
$imported (expected at least $min_imported).

Those champions keep their procedural voxel figure instead of their real
model — again, silently. Check that content/ is mounted read-only into
the edge (docker/compose.yaml mounts ../content:/srv/content:ro).
========================================================================

EOF
    failed=1
  else
    echo "[ggd-assets] imported champion models: $n_glb glb (>= $min_imported) OK"
  fi

  if [ "$failed" -ne 0 ]; then
    echo "[ggd-assets] refusing to start nginx — a full-asset deploy that is not full is the failure this check exists to prevent." >&2
    exit 1
  fi
  echo "[ggd-assets] full-asset assertion PASSED — every declared asset set is present and intact"
  return 0
}

# ------------------------------------------------------------------- main ---

case "${1:-assert}" in
  manifest) shift; cmd_manifest "$@" ;;
  verify)   shift; cmd_verify "$@" ;;
  assert)   shift 2>/dev/null || true; cmd_assert ;;
  *)
    echo "usage: $SELF {manifest <dir> <set-name>|verify <dir> [--deep]|assert}" >&2
    exit 2
    ;;
esac

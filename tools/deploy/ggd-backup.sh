#!/bin/sh
# tools/deploy/ggd-backup.sh — SCHEDULED, OFF-MACHINE backup of the platform
# data tree (GH#123).
#
# ---------------------------------------------------------------------------
# WHAT THIS IS, AND WHAT IT IS *NOT*
# ---------------------------------------------------------------------------
# It is NOT a second archive format. #243 already built the whole thing —
# apps/platform/internal/platformarchive + the /platformarchive binary baked
# into the platform image. That code knows which collections are durable truth,
# which are derived, and which are secrets that must never travel; it has a
# manifest, an `inspect`, a `plan`, and an `apply` that has been exercised.
# Re-serialising data/ by hand here would mean a SECOND restore path that
# nobody has ever run.
#
# What #243 does NOT have is the two words in the issue title: **scheduled**
# and **off-machine**. Its export is a button a human presses, and every byte it
# writes lands on the same disk as the original. That is this script's entire
# job: run that exporter unattended, get the bytes OFF the VM, and then prove
# they arrived.
#
#   #243  = the archive format + the restore path   (a human presses a button)
#   this  = the schedule + the off-machine copy     (cron presses it)
#
# ---------------------------------------------------------------------------
# THE FAILURE MODE THIS EXISTS TO PREVENT — AND THE ONE IT MUST NOT BECOME
# ---------------------------------------------------------------------------
# The disaster is "the VM is gone and the family's accounts / 藍水晶 /
# 排行榜 / 邀請碼 / 錄影 went with it".
#
# The disaster's evil twin is "we had a backup job, it ran green every night for
# five months, and the files were 0 bytes / never left the box / could not be
# restored". So every step below either verifies its own result or fails loudly:
#
#   * `run` refuses to start when no off-machine destination is configured.
#     A local-only copy is the exact bug this file was opened for, so it is a
#     configuration ERROR, not a quiet degradation.
#   * The freshly written archive is size-checked and then handed back to
#     `platformarchive inspect`, which parses the manifest. A truncated stream
#     (the classic `exec … > file` failure: the shell creates the file before
#     the command fails) cannot survive that.
#   * After the upload the script reads back what ARRIVED — size, and a hash
#     where the destination can produce one — instead of trusting the copy
#     tool's opinion. Same discipline as ggd-assets.sh's `verify`.
#   * Only after that does it write the success stamp. `status` reports the age
#     of that stamp and exits non-zero when it is stale, so "the job silently
#     stopped running" is a question with an answer.
#
# ---------------------------------------------------------------------------
# WHY THE CONFIG IS A FILE ON THE HOST AND NOT THE ADMIN CONSOLE
# ---------------------------------------------------------------------------
# The project rule is 「所有開發都要以編輯器可以彈性設定為準，尤其是決策點」, and
# every decision point below IS settable — schedule, groups, destination,
# retention, staleness threshold, even which container the exporter runs in.
# They live in an env file (default /etc/ggd/backup.env) rather than in the
# 後台 for three reasons, in order of how much they hurt:
#
#   1. The console's settings are stored in DATA_DIR. Putting the backup's
#      configuration inside the thing the backup exists to rescue means a
#      restore has to succeed before you can find out where the backups are.
#   2. This script runs on the HOST, outside every container, under cron. It
#      cannot authenticate to the platform API, and if the platform is the thing
#      that is broken, that is precisely the night the backup must still run.
#   3. #241: config written through the 後台 does not reach every consumer. The
#      rule's own caveat is 「先確認讀的那一側真的讀得到」 — the reader here is
#      /bin/sh, and what /bin/sh can always read is a file.
#
# A read-only 備份狀態 card in the console is a good idea and is written up in
# docs/runbooks/offsite-backup.md § 後台整合(提案) — it needs a platform
# endpoint, which is another lane's file.
#
# ---------------------------------------------------------------------------
# USAGE
# ---------------------------------------------------------------------------
#   ggd-backup.sh run       take a backup, ship it off-machine, verify, prune
#   ggd-backup.sh status    when did the last VERIFIED backup finish? (exit 1 = stale)
#   ggd-backup.sh verify    re-download the newest off-machine copy and inspect it
#                           (--deep additionally restores it into a scratch dir)
#   ggd-backup.sh config    print the effective configuration and where it came from
#   ggd-backup.sh cron      print the crontab line to install (does NOT install it)
#
# Full runbook (繁體中文): docs/runbooks/offsite-backup.md
set -eu

# ---------------------------------------------------------------------------
# Locate the repo. The script lives at <repo>/tools/deploy/ggd-backup.sh.
# ---------------------------------------------------------------------------
_self_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GGD_BACKUP_REPO=${GGD_BACKUP_REPO:-$(CDPATH= cd -- "$_self_dir/../.." && pwd)}

# ---------------------------------------------------------------------------
# Configuration. Precedence: environment > config file > default.
#
# The config file is sourced, so the environment is re-applied on top of it
# afterwards — otherwise `GGD_BACKUP_DEST=dir ggd-backup.sh run` would be
# silently overridden by the file, and a one-off override is exactly what an
# operator reaches for at 2am.
# ---------------------------------------------------------------------------
# Two candidate locations, checked in order. The per-user one is second in
# preference but FIRST in practicality on the family host: `sudo` there needs a
# password, so a runbook step that writes to /etc is a step the operator cannot
# finish over ssh. Whichever exists wins; when neither does, the per-user path
# is the one the error messages name.
GGD_BACKUP_CONF_DEFAULT_SYSTEM=/etc/ggd/backup.env
GGD_BACKUP_CONF_DEFAULT_USER=$HOME/.config/ggd/backup.env
if [ -z "${GGD_BACKUP_CONF:-}" ]; then
  if   [ -f "$GGD_BACKUP_CONF_DEFAULT_SYSTEM" ]; then GGD_BACKUP_CONF=$GGD_BACKUP_CONF_DEFAULT_SYSTEM
  elif [ -f "$GGD_BACKUP_CONF_DEFAULT_USER" ];   then GGD_BACKUP_CONF=$GGD_BACKUP_CONF_DEFAULT_USER
  else GGD_BACKUP_CONF=$GGD_BACKUP_CONF_DEFAULT_USER
  fi
fi

_env_snapshot=$(
  for v in GGD_BACKUP_SOURCE GGD_BACKUP_GROUPS GGD_BACKUP_DEST GGD_BACKUP_DEST_URI \
           GGD_BACKUP_STAGING GGD_BACKUP_STATE GGD_BACKUP_KEEP_LOCAL \
           GGD_BACKUP_KEEP_REMOTE GGD_BACKUP_MAX_AGE_HOURS GGD_BACKUP_MIN_BYTES \
           GGD_BACKUP_INSPECT GGD_BACKUP_SCHEDULE GGD_BACKUP_PREFIX \
           GGD_BACKUP_COMPOSE_FILES GGD_BACKUP_ENV_FILE GGD_BACKUP_SERVICE \
           GGD_BACKUP_DOCKER GGD_BACKUP_GCLOUD GGD_BACKUP_RSYNC GGD_BACKUP_SSH \
           GGD_BACKUP_DATA_DIR GGD_BACKUP_CONTENT_DIR; do
    eval "val=\${$v-__GGD_UNSET__}"
    [ "$val" = "__GGD_UNSET__" ] || printf '%s=%s\n' "$v" "$val"
  done
)

CONF_SOURCE="(none — defaults + environment only)"
if [ -f "$GGD_BACKUP_CONF" ]; then
  # shellcheck disable=SC1090
  . "$GGD_BACKUP_CONF"
  CONF_SOURCE=$GGD_BACKUP_CONF
fi
# Re-apply the environment over the file.
if [ -n "$_env_snapshot" ]; then
  # A value may contain spaces; read line-wise, split on the FIRST '='.
  printf '%s\n' "$_env_snapshot" > /dev/null # (kept for readability of the eval below)
  OLD_IFS=$IFS
  IFS='
'
  for line in $_env_snapshot; do
    _k=${line%%=*}
    _v=${line#*=}
    eval "$_k=\$_v"
  done
  IFS=$OLD_IFS
fi

# --- DECISION POINTS (every one of these is meant to be changed) ------------

# WHERE THE BYTES GO. `none` is the default ON PURPOSE: a backup that stays on
# the machine is the bug, so the operator has to say out loud where it goes.
#   dir    <path>                 another disk, an NFS mount, a USB stick
#   rsync  user@host:/path        another machine over ssh
#   gcs    gs://bucket/prefix     a GCS bucket in the same project
GGD_BACKUP_DEST=${GGD_BACKUP_DEST:-none}
GGD_BACKUP_DEST_URI=${GGD_BACKUP_DEST_URI:-}

# WHAT TRAVELS. platformarchive group names. `all` = core + matches + history +
# audit + replays. `core` alone is ~20 KB and covers accounts/水晶/白名單/邀請碼;
# replays are the bulk. The owner counted 錄影 as irreplaceable, so `all` is the
# default — drop to `core,matches,history,audit` if the bucket bill ever matters.
GGD_BACKUP_GROUPS=${GGD_BACKUP_GROUPS:-all}

# HOW THE EXPORTER IS INVOKED.
#   auto  — exec into the running platform container; if that fails, start a
#           throwaway one from the same image (--no-deps). auto exists because a
#           crash-looping platform is a night you still want a backup.
#   exec  — only the running container.
#   run   — only a throwaway container.
#   local — `go run ./cmd/platformarchive` from a checkout (laptop / tests).
GGD_BACKUP_SOURCE=${GGD_BACKUP_SOURCE:-auto}

# HOW MANY COPIES SURVIVE.
#   local  = staging copies kept on the VM (a cache, not the backup)
#   remote = copies kept off-machine. 0 disables script-side pruning, which is
#            what you want once a GCS lifecycle rule owns retention — that rule
#            keeps working after the VM is gone, and this script does not.
GGD_BACKUP_KEEP_LOCAL=${GGD_BACKUP_KEEP_LOCAL:-3}
GGD_BACKUP_KEEP_REMOTE=${GGD_BACKUP_KEEP_REMOTE:-30}

# WHEN `status` STARTS SHOUTING. Daily schedule + one missed run + slack.
GGD_BACKUP_MAX_AGE_HOURS=${GGD_BACKUP_MAX_AGE_HOURS:-36}

# The schedule itself. Only `cron` reads it; it is here so the number lives in
# the same file as everything else the operator tunes.
GGD_BACKUP_SCHEDULE=${GGD_BACKUP_SCHEDULE:-17 4 * * *}

# Smallest believable archive. An empty `core` export is ~1 KB of manifest, so
# anything under this is a truncated stream, not a small platform.
GGD_BACKUP_MIN_BYTES=${GGD_BACKUP_MIN_BYTES:-1024}

# Parse the archive back before shipping it. Off only for the rare host where
# the exporter binary is unavailable for the readback.
GGD_BACKUP_INSPECT=${GGD_BACKUP_INSPECT:-1}

# --- plumbing ---------------------------------------------------------------
# Only `local` source reads these; the container modes always use the paths the
# compose file mounts (/data, /srv/content), because those are the paths that
# exist inside the image regardless of where the repo sits on the host.
GGD_BACKUP_DATA_DIR=${GGD_BACKUP_DATA_DIR:-$GGD_BACKUP_REPO/data}
GGD_BACKUP_CONTENT_DIR=${GGD_BACKUP_CONTENT_DIR:-$GGD_BACKUP_REPO/content}
GGD_BACKUP_STAGING=${GGD_BACKUP_STAGING:-$HOME/ggd-backups}
GGD_BACKUP_STATE=${GGD_BACKUP_STATE:-$GGD_BACKUP_STAGING/.state}
GGD_BACKUP_PREFIX=${GGD_BACKUP_PREFIX:-ggd-platform}
GGD_BACKUP_COMPOSE_FILES=${GGD_BACKUP_COMPOSE_FILES:--f docker/compose.yaml -f docker/compose.family.yaml}
GGD_BACKUP_ENV_FILE=${GGD_BACKUP_ENV_FILE:-docker/.env}
GGD_BACKUP_SERVICE=${GGD_BACKUP_SERVICE:-platform}
GGD_BACKUP_DOCKER=${GGD_BACKUP_DOCKER:-docker}
GGD_BACKUP_GCLOUD=${GGD_BACKUP_GCLOUD:-gcloud}
GGD_BACKUP_RSYNC=${GGD_BACKUP_RSYNC:-rsync}
GGD_BACKUP_SSH=${GGD_BACKUP_SSH:-ssh}

STATE_FILE="$GGD_BACKUP_STATE/last-success.json"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
say()  { printf '%s\n' "$*"; }
warn() { printf '%s\n' "$*" >&2; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

# sha256 of a file. Linux ships sha256sum, macOS ships shasum. Neither is
# guaranteed, so a host with neither degrades to "size only" rather than to a
# crash — but it says so, because a silent downgrade of a verification step is
# how you end up trusting an unverified backup.
HASHER=""
if command -v sha256sum >/dev/null 2>&1; then HASHER=sha256sum
elif command -v shasum   >/dev/null 2>&1; then HASHER="shasum -a 256"
fi
sha256_of() {
  [ -n "$HASHER" ] || { printf '%s' ""; return 0; }
  # shellcheck disable=SC2086
  $HASHER "$1" | awk '{print $1}'
}

# Portable "size in bytes". stat's flags differ between GNU and BSD; wc -c is
# the same everywhere and is exact for a regular file.
size_of() { wc -c < "$1" | tr -d ' '; }

now_epoch() { date -u +%s; }
stamp()     { date -u +%Y%m%dT%H%M%SZ; }

json_str() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# ---------------------------------------------------------------------------
# The exporter. Three ways to reach the same binary; all of them stream the ZIP
# to stdout so the container never writes to the host filesystem itself.
# ---------------------------------------------------------------------------
compose_cmd() {
  # Word-splitting on GGD_BACKUP_COMPOSE_FILES is intentional: it is a flag list.
  # shellcheck disable=SC2086
  printf '%s' "$GGD_BACKUP_DOCKER compose $GGD_BACKUP_COMPOSE_FILES --env-file $GGD_BACKUP_ENV_FILE"
}

export_via_exec() {
  out=$1
  # shellcheck disable=SC2086
  ( cd "$GGD_BACKUP_REPO" && $GGD_BACKUP_DOCKER compose $GGD_BACKUP_COMPOSE_FILES \
      --env-file "$GGD_BACKUP_ENV_FILE" exec -T "$GGD_BACKUP_SERVICE" \
      /platformarchive export -data /data -content /srv/content -out - \
      -groups "$GGD_BACKUP_GROUPS" ) > "$out"
}

export_via_run() {
  out=$1
  # --no-deps: do not drag redis up just to read a directory.
  # --entrypoint: the image's ENTRYPOINT is the server, which would boot instead.
  # shellcheck disable=SC2086
  ( cd "$GGD_BACKUP_REPO" && $GGD_BACKUP_DOCKER compose $GGD_BACKUP_COMPOSE_FILES \
      --env-file "$GGD_BACKUP_ENV_FILE" run --rm --no-deps -T \
      --entrypoint /platformarchive "$GGD_BACKUP_SERVICE" \
      export -data /data -content /srv/content -out - \
      -groups "$GGD_BACKUP_GROUPS" ) > "$out"
}

export_via_local() {
  out=$1
  ( cd "$GGD_BACKUP_REPO" && go -C apps/platform run ./cmd/platformarchive export \
      -data "$GGD_BACKUP_DATA_DIR" -content "$GGD_BACKUP_CONTENT_DIR" -out - \
      -groups "$GGD_BACKUP_GROUPS" ) > "$out"
}

make_archive() {
  out=$1
  case "$GGD_BACKUP_SOURCE" in
    exec)  export_via_exec  "$out" ;;
    run)   export_via_run   "$out" ;;
    local) export_via_local "$out" ;;
    auto)
      if export_via_exec "$out" 2>"$out.err"; then
        rm -f "$out.err"
      else
        warn "→ exec into the running $GGD_BACKUP_SERVICE failed; falling back to a throwaway container"
        [ -s "$out.err" ] && sed 's/^/    /' "$out.err" >&2
        rm -f "$out.err"
        export_via_run "$out"
      fi
      ;;
    *) die "GGD_BACKUP_SOURCE=$GGD_BACKUP_SOURCE is not one of auto|exec|run|local" ;;
  esac
}

# Hand the archive BACK to the tool that wrote it. This is the step that turns
# "the command exited 0" into "the bytes on disk are a parseable archive".
inspect_archive() {
  f=$1
  case "$GGD_BACKUP_SOURCE" in
    local)
      ( cd "$GGD_BACKUP_REPO" && go -C apps/platform run ./cmd/platformarchive \
          inspect -in - ) < "$f"
      ;;
    *)
      # shellcheck disable=SC2086
      ( cd "$GGD_BACKUP_REPO" && $GGD_BACKUP_DOCKER compose $GGD_BACKUP_COMPOSE_FILES \
          --env-file "$GGD_BACKUP_ENV_FILE" exec -T "$GGD_BACKUP_SERVICE" \
          /platformarchive inspect -in - ) < "$f"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# OFF-MACHINE COPY. This is the whole point of the file; everything above it
# only produces the bytes and everything below it only proves they arrived.
#
# Each destination implements two operations:
#   copy_offsite  <local file> <basename>   → puts it there
#   remote_size   <basename>                → what is ACTUALLY there now, in bytes
# `remote_size` is deliberately a separate read-back rather than a return value
# from the copy: a copy tool reporting success is the copy tool's opinion.
# ---------------------------------------------------------------------------
dest_uri_for() {
  base=$1
  case "$GGD_BACKUP_DEST" in
    dir)   printf '%s/%s' "${GGD_BACKUP_DEST_URI%/}" "$base" ;;
    rsync) printf '%s/%s' "${GGD_BACKUP_DEST_URI%/}" "$base" ;;
    gcs)   printf '%s/%s' "${GGD_BACKUP_DEST_URI%/}" "$base" ;;
    *)     printf '' ;;
  esac
}

copy_offsite() {
  src=$1; base=$2
  case "$GGD_BACKUP_DEST" in
    dir)
      target=${GGD_BACKUP_DEST_URI%/}
      mkdir -p "$target"
      # Write to a temp name and rename: a reader (or a prune) can never see a
      # half-written archive under its final name.
      cp "$src" "$target/.$base.part"
      mv "$target/.$base.part" "$target/$base"
      ;;
    rsync)
      # user@host:/path — rsync creates neither the host nor the directory, so
      # the directory is made first over ssh.
      rhost=${GGD_BACKUP_DEST_URI%%:*}
      rpath=${GGD_BACKUP_DEST_URI#*:}
      $GGD_BACKUP_SSH "$rhost" "mkdir -p '${rpath%/}'"
      $GGD_BACKUP_RSYNC -a --partial "$src" "$rhost:${rpath%/}/$base"
      ;;
    gcs)
      $GGD_BACKUP_GCLOUD storage cp "$src" "${GGD_BACKUP_DEST_URI%/}/$base"
      ;;
    *)
      die "internal: copy_offsite called with GGD_BACKUP_DEST=$GGD_BACKUP_DEST"
      ;;
  esac
}

remote_size() {
  base=$1
  case "$GGD_BACKUP_DEST" in
    dir)
      f="${GGD_BACKUP_DEST_URI%/}/$base"
      [ -f "$f" ] || { printf '%s' ""; return 0; }
      size_of "$f"
      ;;
    rsync)
      rhost=${GGD_BACKUP_DEST_URI%%:*}
      rpath=${GGD_BACKUP_DEST_URI#*:}
      $GGD_BACKUP_SSH "$rhost" "wc -c < '${rpath%/}/$base' 2>/dev/null || true" | tr -d ' \n'
      ;;
    gcs)
      $GGD_BACKUP_GCLOUD storage ls -l "${GGD_BACKUP_DEST_URI%/}/$base" 2>/dev/null \
        | awk 'NF>=3 && $1 ~ /^[0-9]+$/ {print $1; exit}'
      ;;
    *)
      printf '%s' ""
      ;;
  esac
}

# Newest-first listing of the archives already off-machine. Used by pruning and
# by `verify`, which pulls the newest one back. The stamp is in the filename and
# is UTC and fixed-width, so a lexical sort IS a chronological sort.
remote_list() {
  case "$GGD_BACKUP_DEST" in
    dir)
      ls -1 "${GGD_BACKUP_DEST_URI%/}" 2>/dev/null \
        | grep "^${GGD_BACKUP_PREFIX}-.*\.zip$" | sort -r || true
      ;;
    rsync)
      rhost=${GGD_BACKUP_DEST_URI%%:*}
      rpath=${GGD_BACKUP_DEST_URI#*:}
      $GGD_BACKUP_SSH "$rhost" "ls -1 '${rpath%/}' 2>/dev/null" \
        | grep "^${GGD_BACKUP_PREFIX}-.*\.zip$" | sort -r || true
      ;;
    gcs)
      $GGD_BACKUP_GCLOUD storage ls "${GGD_BACKUP_DEST_URI%/}/${GGD_BACKUP_PREFIX}-*.zip" 2>/dev/null \
        | sed 's#.*/##' | sort -r || true
      ;;
    *)
      true
      ;;
  esac
}

remote_delete() {
  base=$1
  case "$GGD_BACKUP_DEST" in
    dir)   rm -f "${GGD_BACKUP_DEST_URI%/}/$base" ;;
    rsync)
      rhost=${GGD_BACKUP_DEST_URI%%:*}
      rpath=${GGD_BACKUP_DEST_URI#*:}
      $GGD_BACKUP_SSH "$rhost" "rm -f '${rpath%/}/$base'"
      ;;
    gcs)   $GGD_BACKUP_GCLOUD storage rm "${GGD_BACKUP_DEST_URI%/}/$base" >/dev/null ;;
  esac
}

remote_fetch() {
  base=$1; out=$2
  case "$GGD_BACKUP_DEST" in
    dir)   cp "${GGD_BACKUP_DEST_URI%/}/$base" "$out" ;;
    rsync)
      rhost=${GGD_BACKUP_DEST_URI%%:*}
      rpath=${GGD_BACKUP_DEST_URI#*:}
      $GGD_BACKUP_RSYNC -a "$rhost:${rpath%/}/$base" "$out"
      ;;
    gcs)   $GGD_BACKUP_GCLOUD storage cp "${GGD_BACKUP_DEST_URI%/}/$base" "$out" ;;
    *)     die "no off-machine destination configured" ;;
  esac
}

require_dest() {
  case "$GGD_BACKUP_DEST" in
    dir|rsync|gcs) ;;
    none)
      die "GGD_BACKUP_DEST is 'none' — refusing to run.
  A copy that never leaves this machine is the failure GH#123 is about: when the
  VM dies it dies with it. Pick a destination in $GGD_BACKUP_CONF, e.g.
      GGD_BACKUP_DEST=gcs
      GGD_BACKUP_DEST_URI=gs://<bucket>/ggd
  See docs/runbooks/offsite-backup.md § 2."
      ;;
    *) die "GGD_BACKUP_DEST=$GGD_BACKUP_DEST is not one of none|dir|rsync|gcs" ;;
  esac
  [ -n "$GGD_BACKUP_DEST_URI" ] || die "GGD_BACKUP_DEST=$GGD_BACKUP_DEST needs GGD_BACKUP_DEST_URI"
}

# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------
cmd_run() {
  require_dest

  mkdir -p "$GGD_BACKUP_STAGING" "$GGD_BACKUP_STATE"
  st=$(stamp)
  base="$GGD_BACKUP_PREFIX-$st.zip"
  local_file="$GGD_BACKUP_STAGING/$base"

  say "→ exporting (source=$GGD_BACKUP_SOURCE, groups=$GGD_BACKUP_GROUPS) → $local_file"
  if ! make_archive "$local_file"; then
    rm -f "$local_file"
    die "the exporter failed — no archive was produced"
  fi

  # --- the archive is real, not a 0-byte success ---------------------------
  [ -f "$local_file" ] || die "the exporter exited 0 but wrote no file"
  bytes=$(size_of "$local_file")
  if [ "$bytes" -lt "$GGD_BACKUP_MIN_BYTES" ]; then
    rm -f "$local_file"
    die "archive is $bytes B, below GGD_BACKUP_MIN_BYTES=$GGD_BACKUP_MIN_BYTES — treating it as a truncated stream"
  fi

  if [ "$GGD_BACKUP_INSPECT" = "1" ]; then
    say "→ reading the archive back with \`platformarchive inspect\`"
    if ! inspect_archive "$local_file" > "$GGD_BACKUP_STATE/last-inspect.txt" 2>&1; then
      sed 's/^/    /' "$GGD_BACKUP_STATE/last-inspect.txt" >&2 || true
      rm -f "$local_file"
      die "the archive does not parse — it is not a usable backup"
    fi
  fi

  local_hash=$(sha256_of "$local_file")

  # --- OFF THE MACHINE -----------------------------------------------------
  say "→ shipping off-machine: $GGD_BACKUP_DEST $(dest_uri_for "$base")"
  copy_offsite "$local_file" "$base"

  # --- verify WHAT ARRIVED, not what the copy tool claims ------------------
  rsize=$(remote_size "$base")
  [ -n "$rsize" ] || die "nothing is readable at $(dest_uri_for "$base") after the copy —
  the copy tool reported success and the object is not there."
  [ "$rsize" = "$bytes" ] || die "size mismatch off-machine: local $bytes B vs remote $rsize B at $(dest_uri_for "$base")"

  remote_hash=""
  if [ "$GGD_BACKUP_DEST" = "dir" ] && [ -n "$HASHER" ]; then
    remote_hash=$(sha256_of "${GGD_BACKUP_DEST_URI%/}/$base")
    [ "$remote_hash" = "$local_hash" ] || die "sha256 mismatch off-machine at $(dest_uri_for "$base")"
  fi
  say "✓ verified off-machine: $rsize B at $(dest_uri_for "$base")"

  # --- only now is it a success -------------------------------------------
  cat > "$STATE_FILE" <<EOF
{
  "stamp": "$(json_str "$st")",
  "finishedAtEpoch": $(now_epoch),
  "artifact": "$(json_str "$base")",
  "bytes": $bytes,
  "sha256": "$(json_str "$local_hash")",
  "groups": "$(json_str "$GGD_BACKUP_GROUPS")",
  "dest": "$(json_str "$GGD_BACKUP_DEST")",
  "destUri": "$(json_str "$(dest_uri_for "$base")")",
  "remoteBytes": $rsize
}
EOF

  prune_local
  prune_remote
  say "✓ backup complete — $STATE_FILE updated"
}

prune_local() {
  [ "$GGD_BACKUP_KEEP_LOCAL" -gt 0 ] || return 0
  # shellcheck disable=SC2012
  ls -1 "$GGD_BACKUP_STAGING" 2>/dev/null \
    | grep "^${GGD_BACKUP_PREFIX}-.*\.zip$" | sort -r \
    | awk -v k="$GGD_BACKUP_KEEP_LOCAL" 'NR>k' \
    | while IFS= read -r old; do
        say "  · pruning local $old"
        rm -f "$GGD_BACKUP_STAGING/$old"
      done
}

prune_remote() {
  [ "$GGD_BACKUP_KEEP_REMOTE" -gt 0 ] || {
    say "  · off-machine retention left to the destination (GGD_BACKUP_KEEP_REMOTE=0)"
    return 0
  }
  remote_list | awk -v k="$GGD_BACKUP_KEEP_REMOTE" 'NR>k' | while IFS= read -r old; do
    [ -n "$old" ] || continue
    say "  · pruning off-machine $old"
    remote_delete "$old"
  done
}

# ---------------------------------------------------------------------------
# status — "is the job still running?" is a question the schedule cannot answer
# ---------------------------------------------------------------------------
cmd_status() {
  if [ ! -f "$STATE_FILE" ]; then
    warn "✗ no verified backup has ever completed (no $STATE_FILE)"
    return 1
  fi
  fin=$(sed -n 's/.*"finishedAtEpoch": *\([0-9]*\).*/\1/p' "$STATE_FILE" | head -1)
  [ -n "$fin" ] || { warn "✗ $STATE_FILE is unreadable"; return 1; }
  age=$(( $(now_epoch) - fin ))
  hours=$(( age / 3600 ))
  say "last verified backup: $(sed -n 's/.*"stamp": *"\([^"]*\)".*/\1/p' "$STATE_FILE" | head -1)  (${hours}h ago)"
  sed -n 's/.*"destUri": *"\([^"]*\)".*/  at: \1/p' "$STATE_FILE" | head -1
  sed -n 's/.*"bytes": *\([0-9]*\).*/  bytes: \1/p' "$STATE_FILE" | head -1
  if [ "$hours" -ge "$GGD_BACKUP_MAX_AGE_HOURS" ]; then
    warn "✗ STALE — older than GGD_BACKUP_MAX_AGE_HOURS=$GGD_BACKUP_MAX_AGE_HOURS"
    return 1
  fi
  say "✓ fresh"
}

# ---------------------------------------------------------------------------
# verify — a backup nobody has restored is a rumour.
#   (default) pull the newest off-machine copy back and parse it
#   --deep    additionally APPLY it into a scratch DATA_DIR and count accounts
# ---------------------------------------------------------------------------
cmd_verify() {
  deep=0
  [ "${1:-}" = "--deep" ] && deep=1
  require_dest

  newest=$(remote_list | head -1)
  [ -n "$newest" ] || die "no $GGD_BACKUP_PREFIX-*.zip found at ${GGD_BACKUP_DEST_URI}"
  say "→ newest off-machine archive: $newest"

  tmp=$(mktemp -d "${TMPDIR:-/tmp}/ggd-verify.XXXXXX")
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT INT TERM

  remote_fetch "$newest" "$tmp/$newest"
  say "  fetched $(size_of "$tmp/$newest") B"
  inspect_archive "$tmp/$newest"

  if [ "$deep" = "1" ]; then
    say "→ deep: restoring into a scratch DATA_DIR ($tmp/restore)"
    mkdir -p "$tmp/restore"
    case "$GGD_BACKUP_SOURCE" in
      local)
        ( cd "$GGD_BACKUP_REPO" && go -C apps/platform run ./cmd/platformarchive apply \
            -in - -data "$tmp/restore" -content "$GGD_BACKUP_CONTENT_DIR" ) < "$tmp/$newest"
        ;;
      *)
        # The scratch dir must be reachable from INSIDE the container, so it is
        # mounted in explicitly rather than assuming a shared path.
        $GGD_BACKUP_DOCKER run --rm -i -v "$tmp/restore:/restore" \
          --entrypoint /platformarchive \
          "$($GGD_BACKUP_DOCKER compose $GGD_BACKUP_COMPOSE_FILES --env-file "$GGD_BACKUP_ENV_FILE" images -q "$GGD_BACKUP_SERVICE" | head -1)" \
          apply -in - -data /restore < "$tmp/$newest"
        ;;
    esac
    n=$(find "$tmp/restore/accounts" -maxdepth 1 -name '*.json' 2>/dev/null | grep -vc '_index.json' || true)
    say "✓ restore drill: $n account document(s) came back"
    [ "${n:-0}" -gt 0 ] || die "the restore produced NO account documents — this archive would not save you"
  fi
  say "✓ verify passed"
}

# ---------------------------------------------------------------------------
# config / cron
# ---------------------------------------------------------------------------
cmd_config() {
  say "config file : $CONF_SOURCE"
  say "repo        : $GGD_BACKUP_REPO"
  say "source      : $GGD_BACKUP_SOURCE"
  say "groups      : $GGD_BACKUP_GROUPS"
  say "dest        : $GGD_BACKUP_DEST"
  say "dest uri    : ${GGD_BACKUP_DEST_URI:-(unset)}"
  say "data dir    : $GGD_BACKUP_DATA_DIR   (source=local only)"
  say "staging     : $GGD_BACKUP_STAGING"
  say "state       : $GGD_BACKUP_STATE"
  say "keep local  : $GGD_BACKUP_KEEP_LOCAL"
  say "keep remote : $GGD_BACKUP_KEEP_REMOTE  (0 = destination-managed)"
  say "max age (h) : $GGD_BACKUP_MAX_AGE_HOURS"
  say "min bytes   : $GGD_BACKUP_MIN_BYTES"
  say "inspect     : $GGD_BACKUP_INSPECT"
  say "schedule    : $GGD_BACKUP_SCHEDULE"
  say "hasher      : ${HASHER:-(none — size-only verification)}"
}

cmd_cron() {
  say "# GGD off-machine backup (GH#123). Install with: crontab -e"
  say "# Output goes to a log AND to \`$0 status\`, which is what you actually check."
  say "$GGD_BACKUP_SCHEDULE $_self_dir/ggd-backup.sh run >> \$HOME/ggd-backup.log 2>&1"
}

usage() {
  cat >&2 <<'EOF'
ggd-backup.sh — scheduled, off-machine backup of the GGD platform data tree

  ggd-backup.sh run              export → ship off-machine → verify → prune
  ggd-backup.sh status           age of the last VERIFIED backup (exit 1 = stale)
  ggd-backup.sh verify [--deep]  pull the newest off-machine copy back and parse it
                                 (--deep also restores it into a scratch dir)
  ggd-backup.sh config           effective configuration and where it came from
  ggd-backup.sh cron             the crontab line to install

Configuration: /etc/ggd/backup.env (override with GGD_BACKUP_CONF).
Runbook:       docs/runbooks/offsite-backup.md
EOF
}

case "${1:-}" in
  run)    shift; cmd_run "$@" ;;
  status) shift; cmd_status "$@" ;;
  verify) shift; cmd_verify "$@" ;;
  config) shift; cmd_config "$@" ;;
  cron)   shift; cmd_cron "$@" ;;
  -h|--help|help) usage ;;
  *) usage; exit 2 ;;
esac

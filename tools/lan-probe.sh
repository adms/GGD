#!/usr/bin/env bash
# lan-probe.sh — the check that would have caught the live hole (task #102).
#
# WHY A SCRIPT AND NOT ONLY A UNIT TEST. Every other guard in this repo asserts
# something about SOURCE. This one asserts something about the RUNNING MACHINE,
# which is the only place the property actually lives: "can a device on the wifi
# reach a write surface?" is answered by sockets, not by files. A vite config
# can be perfect and a stray `--host`, a leftover `pnpm dev --host 0.0.0.0` in a
# terminal, or a second dev server on an unexpected port can still publish one.
#
# THE MODEL: authorisation by REACHABILITY, not by DETECTION. Nothing decides
# whether a caller "is local" — a non-local caller cannot open the socket. That
# is necessary here because a VITE PROXY LAUNDERS THE SOURCE ADDRESS: a phone
# hitting the LAN-published game server produces a request that arrives at the
# proxied service from 127.0.0.1, so any remote-address check behind that proxy
# says "loopback" about exactly the caller it exists to exclude.
#
# Run it from the dev machine; it probes its OWN LAN address, so it exercises
# the same path a phone on the wifi would.
#
#   ./tools/lan-probe.sh              # auto-detect the LAN IP
#   ./tools/lan-probe.sh 192.168.0.106
#
# Exit code 0 = the LAN sees nothing it should not.

set -uo pipefail

LAN="${1:-$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}"
if [ -z "${LAN:-}" ]; then
  echo "could not determine this machine's LAN address — pass it: $0 <ip>" >&2
  exit 2
fi

GAME_PORT="${GAME_PORT:-39527}"
ADMIN_PORT="${ADMIN_PORT:-60721}"
CAPI_PORT="${CAPI_PORT:-8787}"

fails=0
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fails=$((fails + 1)); }

# HTTP status, or 000 when the connection is refused / times out.
#
# NOTE the deliberate absence of a `|| echo 000` fallback: curl ALREADY prints
# 000 for a refused connection and then exits non-zero, so the fallback would
# concatenate a second one and yield "000000" — which matches no case and turns
# every "correctly unreachable" result into a false alarm. Ask curl once.
status() {
  local c
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@" 2>/dev/null)
  echo "${c:-000}"
}

echo "LAN probe from ${LAN} (this machine, via its own LAN address)"
echo

echo "1. the game client (deliberately LAN-published) must expose NO content-api"
for verb in GET PUT POST DELETE; do
  code=$(status -X "$verb" -H 'content-type: application/json' -d '{}' \
    "http://${LAN}:${GAME_PORT}/content-api/champions/probe")
  # 404 = the tripwire answered. 000 = the server is not running, which is not
  # a pass: it proves nothing about the config.
  case "$code" in
    404) pass "$verb /content-api -> 404 (no route, tripwire held)" ;;
    000) fail "$verb /content-api -> unreachable; start \`client-lan\` and re-run (this probe proves nothing while it is down)" ;;
    *)   fail "$verb /content-api -> $code — A WRITE SURFACE IS EXPOSED TO THE LAN" ;;
  esac
done

echo
echo "2. the admin console (content editor + /content-api proxy) must be unreachable"
code=$(status "http://${LAN}:${ADMIN_PORT}/admin/")
if [ "$code" = "000" ]; then
  pass "admin console :${ADMIN_PORT} -> connection refused from the LAN"
else
  fail "admin console :${ADMIN_PORT} -> $code — THE CONTENT EDITOR IS ON THE WIFI (did something start it with --host?)"
fi

echo
echo "3. the content-api itself must be unreachable"
code=$(status "http://${LAN}:${CAPI_PORT}/content-api/manifest")
if [ "$code" = "000" ]; then
  pass "content-api :${CAPI_PORT} -> connection refused from the LAN"
else
  fail "content-api :${CAPI_PORT} -> $code — UNAUTHENTICATED CONTENT WRITES ARE ON THE WIFI"
fi

echo
echo "4. the game must still work — this is a lock, not a wall"
code=$(status "http://${LAN}:${GAME_PORT}/api/v1/healthz")
case "$code" in
  200) pass "/api/v1/healthz through the game proxy -> 200 (the phone can still play)" ;;
  000) echo "  SKIP  the platform or client is not running" ;;
  *)   fail "/api/v1/healthz -> $code (expected 200)" ;;
esac

# The admin API stays reachable through that proxy ON PURPOSE and stays
# refused: the Go platform never learns to trust an address, so laundering one
# into it buys the same 401 it always did. A 200 here would mean someone taught
# it to.
code=$(status "http://${LAN}:${GAME_PORT}/api/v1/admin/accounts")
case "$code" in
  401) pass "/api/v1/admin/accounts (laundered to a loopback peer) -> 401, as designed" ;;
  000) echo "  SKIP  the platform is not running" ;;
  *)   fail "/api/v1/admin/accounts -> $code — the platform has grown address-based trust" ;;
esac

echo
echo "5. hardening (advisory): the platform should not answer DIRECTLY on the LAN"
# This is defence in depth, not the mechanism — the platform never trusts an
# address, so a direct LAN caller gets the same 401. But there is no reason for
# the dev box to publish it at all, hence PLATFORM_ADDR=127.0.0.1:8080 in
# .claude/launch.json. The CODE default stays :8080 so k8s is unaffected, which
# is why this is a warning and not a failure: it only means "the running
# process predates the pin, restart it".
code=$(status "http://${LAN}:8080/api/v1/healthz")
if [ "$code" = "000" ]; then
  pass "platform :8080 -> not directly reachable from the LAN"
else
  printf '  \033[33mWARN\033[0m  platform :8080 -> %s (still wildcard-bound). Harmless — it has no address-based trust — but restart it to pick up PLATFORM_ADDR=127.0.0.1:8080 from .claude/launch.json.\n' "$code"
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "OK — the LAN sees the game and nothing else."
  exit 0
fi
echo "$fails PROBLEM(S). See docs/todo/admin.md § 內容管理 for the design this violates."
exit 1

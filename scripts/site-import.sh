#!/usr/bin/env bash
# scripts/site-import.sh — 在**目的機**（M4）把搬遷包還原,並證明它真的還原了。
#
#   bash scripts/site-import.sh <bundle>            # 驗 → 還原 → 對帳
#   bash scripts/site-import.sh <bundle> --check    # ⭐ 只驗,⛔ 不寫任何東西
#   bash scripts/site-import.sh <bundle> --no-bulk  # 不還原 replays / blizzard-overlay
#
# ⭐ 這支腳本的整個重點是**最後那一段對帳**:
#   「tar 解得開」⛔ 不是搬遷成功的證據 —— 一個少了一半檔案的 tar 也解得開。
#   證據是「**來源的帳號數 == 目的地的帳號數**」,而那個數字寫在 MANIFEST 裡。
#   ⇒ 這是「驗兩個名詞的關係」,⛔ 不是「驗這個名詞在不在」。
#
# ⛔ 它**永遠不覆蓋**已存在的 data/ —— 目的地有東西就先改名留底（owner:cp 不是 mv）。
set -uo pipefail
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
head_(){ printf '\n%s══ %s%s\n' "$BLD" "$*" "$RST"; }
ok(){ printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn(){ printf '  %s⚠%s %s\n' "$YEL" "$RST" "$*"; }
die(){ printf '\n%s⛔ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }
info(){ printf '    %s\n' "$*"; }
FAIL=0; bad(){ printf '  %s✗%s %s\n' "$RED" "$RST" "$*"; FAIL=$((FAIL+1)); }

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="${1:?用法: $0 <bundle> [--check] [--no-bulk]}"; shift
CHECK=0; NOBULK=0
while [ $# -gt 0 ]; do case "$1" in
  --check) CHECK=1; shift;; --no-bulk) NOBULK=1; shift;; *) die "未知參數 $1";; esac; done
[ -d "$BUNDLE" ] || die "找不到 $BUNDLE"
M="$BUNDLE/MANIFEST.txt"; [ -f "$M" ] || die "⛔ 沒有 MANIFEST.txt —— 這一包驗不了,拒絕匯入"

mval(){ sed -n "s/^$1=//p" "$M" | head -1; }

head_ "1. 這一包是誰、從哪來"
info "來源 $(mval source_host) · $(mval source_arch) · git $(mval git_head) · $(mval stamp)"
[ "$(mval source_arch)" = "$(uname -m)" ] \
  && info "架構同為 $(uname -m)" \
  || warn "來源 $(mval source_arch) → 目的 $(uname -m)：⭐ 這是預期的（資料與架構無關），⛔ 但映像一定要重 build"

head_ "2. 包的完整性（⛔ 在碰任何東西之前）"
if [ -f "$BUNDLE/BUNDLE.sha256" ]; then
  (cd "$BUNDLE" && sha256sum -c BUNDLE.sha256 >/dev/null 2>&1) \
    && ok "tar 校驗和全部相符" || bad "⛔ tar 校驗和不符 —— 這一包在路上壞了,⛔ 不要匯入"
else warn "沒有 BUNDLE.sha256"; fi
[ -f "$BUNDLE/data-core.tar.zst" ] || bad "缺 data-core.tar.zst"
[ -d "$BUNDLE/redis" ] && ok "Redis 快照在" || warn "⛔ 這一包沒有 Redis —— 排行榜與錢包不會回來"
[ -f "$BUNDLE/env.secret" ] && warn "包裡有 secrets（env.secret）—— ⛔ 這一包不可以進 git" \
  || info "（沒帶 secrets ⇒ docker/.env 要手動放）"
EXPECT=$(grep -c '^[0-9a-f]\{64\}' "$M" 2>/dev/null)
info "manifest 記了 $EXPECT 條逐檔校驗和"
[ "$FAIL" -eq 0 ] || die "包本身有問題 —— ⛔ 停在這裡,目的地一個位元組都沒動"

if [ "$CHECK" -eq 1 ]; then head_ "--check 結束 —— ⛔ 沒寫任何東西"; exit 0; fi

head_ "3. 目的地留底（⛔ 永不覆蓋）"
if [ -d "$REPO/data" ] && [ -n "$(ls -A "$REPO/data" 2>/dev/null)" ]; then
  B="$REPO/data.pre-import-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "$REPO/data" "$B" || die "留底失敗 —— ⛔ 不繼續"
  ok "既有 data/ 已留底 → $B"
fi
mkdir -p "$REPO/data"

head_ "4. 還原"
zstd -dq -c "$BUNDLE/data-core.tar.zst" | tar -C "$REPO/data" -xf - || die "core 還原失敗"
ok "core 還原完成"
if [ "$NOBULK" -eq 0 ]; then
  for f in "$BUNDLE"/data-*.tar.zst; do
    case "$f" in *data-core.tar.zst) continue;; esac
    [ -e "$f" ] || continue
    zstd -dq -c "$f" | tar -C "$REPO/data" -xf - && ok "$(basename "$f") 還原完成"
  done
else warn "--no-bulk：⛔ 沒還原 replays / blizzard-overlay"; fi

head_ "5. ⭐ 對帳 —— 這一段才是「搬遷成功」的定義"
# ⛔ 「tar 解得開」不是證據。逐項比對 manifest 記下的計數。
while IFS= read -r line; do
  d=${line%%=*}; d=${d#count.}; want=${line#*=}
  got=$(find "$REPO/data/$d" -type f 2>/dev/null | wc -l | tr -d ' ')
  [ "$got" = "$want" ] && ok "$(printf '%-18s %6s 個檔（來源也是 %s）' "$d" "$got" "$want")" \
                       || bad "$(printf '%-18s %6s 個檔,⛔ 來源是 %s' "$d" "$got" "$want")"
done < <(grep '^count\.' "$M")

head_ "6. 逐檔校驗和（⭐ 數量對不代表內容對）"
MIS=$( (cd "$REPO/data" && grep '^[0-9a-f]\{64\}' "$M" | sha256sum -c - 2>/dev/null | grep -cv ': OK$') || echo 0 )
[ "${MIS:-0}" -eq 0 ] && ok "$EXPECT 條校驗和全部相符" || bad "⛔ $MIS 條校驗和不符"

head_ "7. Redis（⛔ 手動,而且要在 redis 停著的時候）"
if [ -d "$BUNDLE/redis" ]; then
  info "包裡的快照：$(ls "$BUNDLE/redis" 2>/dev/null | tr '\n' ' ')"
  info "來源 key 前綴：$(mval redis_keys)"
  cat <<'STEPS'
    步驟（⭐ 順序不能換 —— redis 活著的時候覆蓋 RDB 會被它自己的存檔蓋回去）：
      1. docker compose stop redis
      2. 把 dump.rdb / appendonlydir 複製進 volume ggd_redis-data
      3. docker compose start redis
      4. 逐前綴數 key,跟上面那一行**逐項**比對（⛔ 不是「總數差不多」）
STEPS
fi

head_ "8. log"
if ls "$BUNDLE/logs/"* >/dev/null 2>&1; then
  info "包裡有壓縮過的舊 log $(ls "$BUNDLE"/logs | wc -l | tr -d ' ') 份 —— ⭐ 它們是**歸檔**,"
  info "⛔ 不要解開放回容器 log 目錄（owner：已經有壓縮檔就不要搬遷原檔）"
fi

printf '\n%s' "$BLD"
if [ "$FAIL" -eq 0 ]; then
  printf '%s對帳全過 —— 資料真的到了%s\n' "$GRN" "$RST"
  info "⚠️ 這只證明**資料**到了。站活不活還要跑 /healthz 與一場實測。"
else
  printf '%s%d 項對不上 —— ⛔ 不要切 DNS%s\n' "$RED" "$FAIL" "$RST"
  info "留底在 data.pre-import-* —— ⭐ 來源機也還沒被動過"
fi
exit $(( FAIL > 0 ))

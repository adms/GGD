#!/usr/bin/env bash
# scripts/redis-snapshot.sh —— 💾 **Redis 停機前的強制快照**（GH#860）。
#
# owner 2026-08-28（逐字）：
# > 「Redis 要停機時也要有備份機制，**不要等待暖開機**，因為我還有**排行榜等資料**
# >  在上面**不只快取**」
#
# ## ⭐ 為什麼這支必須存在（⛔ 不是「反正 AOF 開著」）
# 2026-08-28 的 containerd 搬遷把 Redis 停掉又拉起來，資料**沒有掉** ——
# ⚠️ 而那是**運氣**：AOF 剛好是開的。沒有任何一步是「我先確保它落地了」。
# ⇒ 一個靠設定湊巧正確而活下來的流程，與一個有保護的流程，**在成功的那一天長得一模一樣**。
#
# ## 它上面真的不只是快取（2026-08-28 量到的 key 前綴）
#   `lb:*`        37 個 —— ⭐ **排行榜**（owner 點名的那個）
#   `wallet:*`    50 個 ＋ `walletmeta:*` 70 個 —— **M幣錢包**
#   `idx:*`      140 · `match:*` 530 · `room:*` 4
#   （`refresh:*` 6163 個才是真的快取 —— 登入 token）
# ⇒ 掉了不是「重新暖機就好」，是**玩家的錢與名次不見了**。
#
# ## 做什麼（三步，缺一步就不算保護）
#   ① `BGREWRITEAOF` ＋ `SAVE` —— 把記憶體裡的東西**同步**寫到磁碟
#      ⛔ 不是 `BGSAVE`：那是非同步的，回來的當下檔案可能還沒寫完
#   ② **等它真的落地**（`rdb_bgsave_in_progress` / `aof_rewrite_in_progress` 歸零）
#   ③ 把 `dump.rdb` 與 `appendonlydir` 複製到帶時間戳的落點
#
# ⚠️ ⭐ **落點刻意可以指定**：搬遷時要放到「不會被這次搬遷動到」的碟上。
#
# 用法：
#   bash scripts/redis-snapshot.sh                    # 存到 /data/redis-snapshots/
#   bash scripts/redis-snapshot.sh /somewhere/else    # 指定落點
#   GGD_REDIS_CONTAINER=xxx bash scripts/redis-snapshot.sh
set -euo pipefail

C=${GGD_REDIS_CONTAINER:-ggd-redis-1}
# ⭐ 落點:位置參數 > 環境變數 > 預設。
# ⛔⛔ 在 2026-08-29 之前只認位置參數,而 site-export.sh 用環境變數傳 ——
#   ⇒ 快照**成功寫到預設位置**,而呼叫端以為它進了搬遷包。
#     ⭐ 而那個包 exit 0、印著「✓ 快照完成」,裡面**一個 redis 檔都沒有**。
#   （owner 逐字:「我還有**排行榜**等資料在上面**不只快取**」）
DEST=${1:-${GGD_REDIS_SNAPSHOT_DIR:-/data/redis-snapshots}}
TS=$(date -u +%Y%m%dT%H%M%SZ)

say() { printf '  %s\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

docker inspect "$C" >/dev/null 2>&1 || die "找不到容器 $C"
[ "$(docker inspect -f '{{.State.Running}}' "$C")" = true ] || die "$C 沒有在跑 —— ⛔ 停掉之後就快照不了了，這支要在停機**之前**跑"

# 密碼：從 docker/.env 讀（⛔ 不寫死、⛔ 不印出來）
ENV_FILE=${GGD_ENV_FILE:-$(dirname "$0")/../docker/.env}
PASS=$(grep -E '^(REDIS_PASSWORD|GGD_REDIS_PASSWORD)=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)
RCLI=(docker exec "$C" redis-cli)
[ -n "$PASS" ] && RCLI=(docker exec "$C" redis-cli -a "$PASS" --no-auth-warning)

"${RCLI[@]}" PING >/dev/null 2>&1 || die "redis-cli 連不上（密碼？）—— ⛔ 不要在這種狀態下停機"

BEFORE=$("${RCLI[@]}" DBSIZE 2>/dev/null | tr -d '\r')
say "快照前 DBSIZE = $BEFORE"

# ① 同步落地 —— ⛔ 不是 BGSAVE
say "AOF 重寫 + 同步 SAVE…"
"${RCLI[@]}" BGREWRITEAOF >/dev/null 2>&1 || true
"${RCLI[@]}" SAVE >/dev/null || die "SAVE 失敗 —— ⛔ 不要停機"

# ② 等它真的寫完（⭐ 這一步是「保護」與「祈禱」的差別）
for _ in $(seq 1 60); do
  INFO=$("${RCLI[@]}" INFO persistence 2>/dev/null | tr -d '\r')
  R=$(printf '%s\n' "$INFO" | grep -c '^rdb_bgsave_in_progress:0' || true)
  A=$(printf '%s\n' "$INFO" | grep -c '^aof_rewrite_in_progress:0' || true)
  [ "$R" = 1 ] && [ "$A" = 1 ] && break
  sleep 1
done
STATUS=$("${RCLI[@]}" INFO persistence 2>/dev/null | tr -d '\r' | grep '^rdb_last_bgsave_status:' | cut -d: -f2)
[ "$STATUS" = ok ] || die "rdb_last_bgsave_status=$STATUS —— ⛔ 落地失敗，不要停機"
say "落地完成（rdb_last_bgsave_status=ok）"

# ③ 複製出去
# ⛔⛔ **不要讀 volume 的主機路徑** —— 那在 macOS 上不存在。
#   `docker inspect .Mounts[].Source` 在 Linux 上是真的主機路徑,
#   ⭐ 而在 macOS（OrbStack / Docker Desktop）上 volume 住在**Linux VM 裡**
#     ⇒ 那個路徑在主機的檔案系統上**根本不存在** ⇒ die「找不到資料目錄」。
#   （2026-08-29 在 mini 上實測到,而它擋下了第一份備份。）
#
# ⭐ `docker cp` 兩邊都能用 —— 它走 daemon,⛔ 不假設主機看得到 volume。
OUT="$DEST/redis_$TS"
mkdir -p "$OUT"
SRC="container:$C:/data"
docker cp "$C:/data/dump.rdb" "$OUT/dump.rdb" >/dev/null 2>&1 || die "dump.rdb 複製失敗（docker cp）"
docker cp "$C:/data/appendonlydir" "$OUT/appendonlydir" >/dev/null 2>&1 || true

# ⭐ 驗證落點真的有東西（⛔ 「指令沒報錯」不算）
SZ=$(du -sb "$OUT" | cut -f1)
[ "$SZ" -gt 1024 ] || die "快照只有 $SZ bytes —— ⛔ 那不是一份備份"
printf '%s\n' "dbsize=$BEFORE" "takenAt=$TS" "source=$SRC" > "$OUT/MANIFEST.txt"

printf '\033[32m✓ Redis 快照完成：%s（%s）\033[0m\n' "$OUT" "$(du -sh "$OUT" | cut -f1)"

# 保留最近 10 份（⛔ 不是無上限 —— 那會把碟塞爆，而那正是今天在修的問題）
ls -1dt "$DEST"/redis_* 2>/dev/null | tail -n +11 | while read -r old; do rm -rf "$old"; done

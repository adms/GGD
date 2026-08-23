#!/usr/bin/env bash
# ⏲️ **通用看門狗** —— owner 2026-08-24：「如果工作流跑超過5分鐘，你應該要去看
# 是不會陷入loop了⋯ => **這應該是 script 吧**」「你不是有五分鐘看門狗script?」
#
# ⭐ 在此之前看門狗只住在 ship.mjs 裡面（只保護它自己的 suite）——
#    主 session 手跑的 vitest 繞過它，於是同一晚 `packages/shared` 掛死了**三次**、
#    每次白等 10 分鐘。這支把它變成**每一條長指令的預設外殼**。
#
# 用法：bash scripts/watchdog.sh [--limit-min 8] -- <指令...>
#
# 兩個殺人條件（任一成立就 SIGKILL 整個 process group 並回 124）：
#   ① wall > limit（預設 8 分鐘）
#   ② ⭐ **連續 90 秒 CPU 全 0%**（= worker 卡死。掛住跟還在算在 wall 上看不出來，
#      在 CPU 上一眼就分得開 —— 三次掛死全是這個形狀）
set -o pipefail
LIMIT_MIN=8
if [ "$1" = "--limit-min" ]; then LIMIT_MIN="$2"; shift 2; fi
[ "$1" = "--" ] && shift
[ $# -gt 0 ] || { echo "用法: watchdog.sh [--limit-min N] -- <指令...>" >&2; exit 2; }

"$@" &
PID=$!
DEADLINE=$(( $(date +%s) + LIMIT_MIN*60 ))
IDLE=0
while kill -0 "$PID" 2>/dev/null; do
  sleep 5
  NOW=$(date +%s)
  if [ "$NOW" -ge "$DEADLINE" ]; then
    echo "⏲️ 看門狗：超過 ${LIMIT_MIN} 分鐘 —— SIGKILL（wall 逾時）" >&2
    pkill -KILL -P "$PID" 2>/dev/null; kill -KILL "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; exit 124
  fi
  # ② 0% CPU 偵測：本體 + 全部子孫的 %CPU 總和
  CPU=$(ps -o pcpu= -p "$PID" $(pgrep -P "$PID" | tr '\n' ' ') 2>/dev/null | awk '{s+=$1} END{printf "%d", s*10}')
  if [ "${CPU:-0}" -lt 5 ]; then IDLE=$((IDLE+5)); else IDLE=0; fi
  if [ "$IDLE" -ge 90 ]; then
    echo "⏲️ 看門狗：連續 90 秒 CPU 0% —— worker 卡死,SIGKILL。單獨重跑通常會過。" >&2
    pkill -KILL -P "$PID" 2>/dev/null; kill -KILL "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; exit 125
  fi
done
wait "$PID"

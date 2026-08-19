#!/usr/bin/env bash
# 掃出 `{用途}_temp_{時間戳}` 這一類**暫存檔**,把過時的搬進 legacy。
#
# owner 2026-08-20:
#   「備份規則都是 **{用途}_temp_{timestamp}.md** 給你參考,並且**清理 docs 資料夾文件時,
#    方便被認出是否已經過時要放到 legacy**」
#
# ⚠️ 命名慣例本身只是「看得出來」,那是判準。這支腳本是那條判準的**閘**:
# 一行指令就列得出哪些過時,⛔ 不必有人肉眼掃 docs/。
#
#   bash scripts/temp-sweep.sh            # 只列出(預設 7 天)
#   bash scripts/temp-sweep.sh --days 3   # 改門檻
#   bash scripts/temp-sweep.sh --move     # 真的搬進 docs/legacy/_temp-retired/
set -uo pipefail
cd "$(dirname "$0")/.."
DAYS=7; MOVE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    --move) MOVE=1; shift ;;
    *) echo "用法: $0 [--days N] [--move]" >&2; exit 2 ;;
  esac
done
DEST="docs/legacy/_temp-retired"
# ⛔ 不掃 legacy 自己(那裡本來就是退休區),也不掃 node_modules
# ⚠️ macOS 出貨的是 bash 3.2 —— **沒有 `mapfile`**。用 while-read 才跑得起來。
HITS=()
while IFS= read -r f; do HITS+=("$f"); done < <(
  find docs -path docs/legacy -prune -o \
    -name '*_temp_*' -type f -mtime "+$DAYS" -print 2>/dev/null | sort)
if [ "${#HITS[@]}" -eq 0 ]; then
  echo "✓ 沒有超過 ${DAYS} 天的暫存檔（docs/,不含 legacy）"
  exit 0
fi
echo "找到 ${#HITS[@]} 個超過 ${DAYS} 天的暫存檔："
for f in "${HITS[@]}"; do printf "  %s  (%s)\n" "$f" "$(date -r "$f" '+%Y-%m-%d')"; done
if [ "$MOVE" -eq 1 ]; then
  mkdir -p "$DEST"
  for f in "${HITS[@]}"; do git mv "$f" "$DEST/" 2>/dev/null || mv "$f" "$DEST/"; done
  echo "→ 已搬進 $DEST/（⛔ 沒有刪除任何東西）"
else
  echo "（只列出。要真的搬：加 --move）"
fi

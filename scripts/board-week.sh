#!/usr/bin/env bash
# 📰 戰情表的「對話開票」= **過去一週**的滾動窗；滿一週就把舊的留成時間戳記檔。
#   owner 2026-08-26：「戰情表「對話開票」要收錄過去一週，滿一週則備份時間戳記 md」
#
# 用法：
#   bash scripts/board-week.sh              # 重建現行戰情表的一週窗
#   bash scripts/board-week.sh --check      # 唯讀：窗超過 7 天就回非零（該輪替了）
#
# ⭐ 為什麼是指令不是判準：CLAUDE.md 記過五次「要記得⋯」失效。
#    窗滿了要不要輪替是一個**日期減法**，不是感覺。
set -uo pipefail
cd "$(dirname "$0")/.."
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1

DAILY=docs/_daily
REL=docs/_release
# 現行戰情表 = _release 底下日期最大的那一份
CUR=$(ls "$REL"/戰情版-*.md 2>/dev/null | sort | tail -1)
[ -z "$CUR" ] && { echo "⛔ 找不到任何 $REL/戰情版-*.md"; exit 1; }
CUR_DATE=$(basename "$CUR" | sed 's/[^0-9]//g')          # YYYYMMDD
NEWEST=$(ls "$DAILY"/2026-*.md 2>/dev/null | grep -v memory_temp | sort | tail -1)
NEW_DATE=$(basename "$NEWEST" .md | tr -d '-')

# 天數差（BSD date）
d1=$(date -j -f "%Y%m%d" "$CUR_DATE" "+%s" 2>/dev/null) || d1=0
d2=$(date -j -f "%Y%m%d" "$NEW_DATE" "+%s" 2>/dev/null) || d2=0
SPAN=$(( (d2 - d1) / 86400 ))

if [ "$SPAN" -ge 7 ]; then
  if [ "$CHECK" = 1 ]; then
    echo "⛔ 戰情表的窗已經 ${SPAN} 天（≥7）—— 該輪替了："
    echo "   舊的 $CUR 就是時間戳記備份（它的檔名已帶日期，⛔ 不必另存）"
    echo "   跑：bash scripts/board-week.sh   → 會建 $REL/戰情版-${NEW_DATE}.md"
    exit 1
  fi
  NEXT="$REL/戰情版-${NEW_DATE}.md"
  if [ ! -f "$NEXT" ]; then
    cp "$CUR" "$NEXT"
    echo "📦 輪替：$CUR → 保留為時間戳記備份；新的現行表 = $NEXT"
    CUR="$NEXT"
  fi
else
  [ "$CHECK" = 1 ] && { echo "✓ 戰情表的窗 ${SPAN} 天（<7），不必輪替。"; exit 0; }
fi

# 一週窗 = 現行表日期往前推 6 天起算（含當日共 7 天）
python3 - "$CUR" "$NEW_DATE" <<'PY'
import sys, os, re, datetime
cur, newd = sys.argv[1], sys.argv[2]
end = datetime.datetime.strptime(newd, "%Y%m%d").date()
start = end - datetime.timedelta(days=6)
days = [(start + datetime.timedelta(days=i)) for i in range(7)]
rows = []
for d in days:
    p = f"docs/_daily/{d.isoformat()}.md"
    if not os.path.exists(p): continue
    for line in open(p, encoding="utf-8"):
        if re.match(r"^\| \d\d:\d\d \|", line):
            rows.append((d.isoformat(), line.rstrip()))
print(f"一週窗 {start} → {end}：{len(rows)} 則 owner 訊息，來自 "
      f"{len({d for d,_ in rows})} 個帳本日")
open("/private/tmp/board-week-rows.md", "w", encoding="utf-8").write(
    "\n".join(f"| {d[5:]} {r[2:]}" for d, r in rows) + "\n")
PY
echo "✓ 一週窗的逐則清單寫到 /private/tmp/board-week-rows.md（$(wc -l < /private/tmp/board-week-rows.md) 列）"
echo "  現行戰情表：$CUR"

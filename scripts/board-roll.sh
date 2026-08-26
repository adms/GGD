#!/usr/bin/env bash
# 📰 戰情表：**每天輪替**，輪替前**整份備份**成 `戰情版_temp_{timestamp}.md`。
#
# owner 2026-08-26（兩則，後一則收緊了前一則）：
#   ①「戰情表「對話開票」要收錄**過去一週**，滿一週則備份時間戳記 md」
#   ②「**每天自動輪替，輪替前整份備份 戰情版_temp_{timestamp}.md**」
#      ⇒ 輪替頻率是**每天**（⛔ 不是滿一週才輪）；⭐ 而「對話開票」那一節仍然是**七天滾動窗**。
#         兩者不衝突：檔案每天換一份，窗每天往前滑一天。
#
# 用法：
#   bash scripts/board-roll.sh            # 輪替（含備份）＋重建七天窗
#   bash scripts/board-roll.sh --check    # 唯讀閘：今天那一份不存在／窗過期 ⇒ 回非零
#
# ⭐ 為什麼是指令＋閘不是判準：CLAUDE.md 記過五次「要記得⋯」失效。
#    「今天有沒有輪替」是一個**日期比對**，不是感覺。
set -uo pipefail
cd "$(dirname "$0")/.."
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1

REL=docs/_release
DAILY=docs/_daily
TODAY=$(date +%Y%m%d)
CUR=$(ls "$REL"/戰情版-*.md 2>/dev/null | sort | tail -1)
[ -z "$CUR" ] && { echo "⛔ 找不到任何 $REL/戰情版-*.md"; exit 1; }
CUR_DATE=$(basename "$CUR" .md | sed 's/[^0-9]//g')
TARGET="$REL/戰情版-${TODAY}.md"

if [ "$CUR_DATE" != "$TODAY" ]; then
  if [ "$CHECK" = 1 ]; then
    echo "⛔ 戰情表還停在 ${CUR_DATE}，今天是 ${TODAY} —— **該輪替了**。"
    echo "   跑：bash scripts/board-roll.sh"
    echo "   （會先整份備份成 $REL/戰情版_temp_{時間戳}.md，再開今天那一份）"
    exit 1
  fi
  STAMP=$(date +%Y%m%d-%H%M)
  BAK="$REL/戰情版_temp_${STAMP}.md"
  cp "$CUR" "$BAK"                      # ⭐ 輪替前**整份**備份（owner 逐字）
  cp "$CUR" "$TARGET"
  echo "📦 備份：$CUR → $BAK"
  echo "🔄 輪替：今天那一份 = $TARGET"
fi

# ── 七天滾動窗：以**今天**為右界往前推 6 天 ─────────────────────────────
python3 - "$TARGET" "$TODAY" "$CHECK" <<'PY'
import sys, os, re, datetime, collections
target, today, check = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
end = datetime.datetime.strptime(today, "%Y%m%d").date()
start = end - datetime.timedelta(days=6)

rows, byday = [], collections.Counter()
for i in range(7):
    d = start + datetime.timedelta(days=i)
    p = f"docs/_daily/{d.isoformat()}.md"
    if not os.path.exists(p):
        continue
    for line in open(p, encoding="utf-8"):
        if re.match(r"^\| \d\d:\d\d \|", line):
            rows.append(line.rstrip())
            byday[d.isoformat()[5:]] += 1

issues = set()
unmapped = 0
for r in rows:
    issues.update(int(x) for x in re.findall(r"#(\d{2,4})", r))
    if "⏸ 未對票" in r:
        unmapped += 1

head = f"# 🎫 對話開票（**過去一週**滾動窗：{start.isoformat()} → {end.isoformat()[5:]}）"
stats = (
    f"## 一週窗總量（{start.isoformat()} → {end.isoformat()}，{len(byday)} 個帳本日）\n\n"
    f"| | |\n|---|---:|\n"
    f"| owner 訊息 | **{len(rows)} 則** |\n"
    f"| 引用到的不同票號 | **{len(issues)} 張** |\n"
    f"| ⏸ 未對票 | **{unmapped} 則** |\n\n"
    f"**逐日分佈**：" + " · ".join(f"{d} {n} 則" for d, n in sorted(byday.items()))
)

src = open(target, encoding="utf-8").read()
new = re.sub(r"^# 🎫 對話開票（.*?）$", head, src, count=1, flags=re.M)
new = re.sub(r"^## 一週窗總量（.*?\n\n\|.*?\n\n\*\*逐日分佈\*\*：.*?$",
             stats, new, count=1, flags=re.M | re.S)

if check:
    if new != src:
        print(f"⛔ {target} 的七天窗過期了（窗應為 {start} → {end}，{len(rows)} 則）")
        sys.exit(1)
    print(f"✓ 戰情表 {os.path.basename(target)}：窗 {start} → {end} · {len(rows)} 則 · "
          f"{len(issues)} 張票 · 未對票 {unmapped}")
    sys.exit(0)

if new != src:
    open(target, "w", encoding="utf-8").write(new)
    print(f"✓ 七天窗已重建：{start} → {end} · {len(rows)} 則 · {len(issues)} 張票 · 未對票 {unmapped}")
else:
    print(f"✓ 七天窗已是最新：{start} → {end} · {len(rows)} 則")
PY

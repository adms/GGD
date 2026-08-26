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

# ── ⭐ 固定入口：repo 根目錄的 `GGD戰情版.md` 永遠指向**今天**那一份 ────────
# owner 2026-08-26：「**GGD 戰情版.md 應該在我本機端阿**」
# ⇒ 檔名每天換（那是紀錄），⛔ 但**找它的路徑不可以每天換**。symlink 一行解決，
#   ⛔ 不是複製一份（複製＝同一份知識兩個住處，第〇·四守則）。
LINK=GGD戰情版.md
WANT="$TARGET"
if [ "$CHECK" = 1 ]; then
  HAVE=$(readlink "$LINK" 2>/dev/null || true)
  if [ "$HAVE" != "$WANT" ]; then
    echo "⛔ 根目錄的 $LINK 指向 '${HAVE:-（不存在）}'，應該是 '$WANT'"
    echo "   跑：bash scripts/board-roll.sh"
    exit 1
  fi
else
  ln -sfn "$WANT" "$LINK"
  echo "🔗 固定入口：$LINK → $WANT"
fi

# ── 七天滾動窗：以**今天**為右界往前推 6 天 ─────────────────────────────
python3 - "$TARGET" "$TODAY" "$CHECK" <<'PY'
import sys, os, re, datetime, collections
target, today, check = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
end = datetime.datetime.strptime(today, "%Y%m%d").date()
start = end - datetime.timedelta(days=6)

rows, byday = [], collections.Counter()
# ⭐ owner 2026-08-26：「我也要看到**對話開票 逐訊息對應開的票號 全記錄在裡面**」
#    ⇒ 除了統計，也把**每一則**逐字留在 `perday`，等一下整段內嵌進戰情表。
#    ⛔ 在此之前這一節只寫「逐則原文在 docs/_daily/…」—— 那是一個指標，⛔ 不是紀錄，
#    而 owner 讀的是**這一份**。
perday = collections.OrderedDict()
for i in range(7):
    d = start + datetime.timedelta(days=i)
    p = f"docs/_daily/{d.isoformat()}.md"
    if not os.path.exists(p):
        continue
    for line in open(p, encoding="utf-8"):
        if re.match(r"^\| \d\d:\d\d \|", line):
            rows.append(line.rstrip())
            byday[d.isoformat()[5:]] += 1
            perday.setdefault(d.isoformat(), []).append(line.rstrip())

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

# ── ⭐ 逐訊息全紀錄（owner 2026-08-26 要求「全記錄在裡面」）─────────────────
BEGIN, END = "<!-- BOARD_MSGLOG_BEGIN -->", "<!-- BOARD_MSGLOG_END -->"
blocks = [
    BEGIN,
    "",
    "## 🧾 逐訊息全紀錄（每一則 → 票號）",
    "",
    "> ⭐ owner 2026-08-26：「我也要看到 **對話開票 逐訊息對應開的票號 全記錄在裡面**」",
    "> ⇒ 這一節是**紀錄本身**，⛔ 不是指向 `docs/_daily/` 的指標。",
    "> 來源是 `msgledger:build` 從 session transcript **逐則**撈的，⛔ 不是憑印象重寫；",
    "> 那一格的原文是**截斷**過的（全文在 `docs/_daily/ledger-source_temp_*.md`）。",
    "",
]
for day, lines in perday.items():
    blocks += [f"### {day}（{len(lines)} 則）", "", "| 時間 | owner 說了什麼（逐字） | 票 |", "|---|---|---|"]
    blocks += lines
    blocks.append("")
blocks.append(END)
log_md = "\n".join(blocks)

if BEGIN in new and END in new:
    new = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _m: log_md, new, count=1, flags=re.S)
else:
    # 第一次：插在「一週窗總量」那一節的**後面**（下一個 `## ` 之前）
    m = re.search(r"^## 一週窗總量（.*?$", new, flags=re.M)
    if m:
        nxt = new.find("\n## ", m.end())
        at = len(new) if nxt < 0 else nxt + 1
        new = new[:at] + log_md + "\n\n" + new[at:]
    else:
        new = new.rstrip() + "\n\n" + log_md + "\n"

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

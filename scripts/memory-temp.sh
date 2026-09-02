#!/usr/bin/env bash
# 快照「這個 session 現在知道什麼」到一份可以被下一輪讀回去的 MD。
#
# owner 2026-08-20：
#   「每次 context 要滿的時候先開一個 memory_temp_{timestamp}.md 先存進去吧
#    避免意外要找回」
#
# ⚠️ 這支腳本存在的理由是**元規則**：CLAUDE.md 已經有五次「要記得⋯」失敗的紀錄。
# 「context 快滿了要記得存」如果只是一句散文，它會在 context 真的滿的那一刻失效 ——
# 那正是我最沒有餘裕想起它的時候。所以它是一行指令：想到就跑，成本 ≈ 0。
#
# 它只抓**機械可得**的那一半（git / 工作流 / issue / transcript 大小）。
# ⛔ 另一半（owner 的裁決、卡住的決定、下一步）機器推導不出來，
# 腳本會留下有標記的空欄位，由我當場填 —— 沒填的欄位會在檔案裡**留著問號**，
# 而不是假裝那一段不存在。
#
#   bash scripts/memory-temp.sh              # 寫一份新快照
#   bash scripts/memory-temp.sh --check      # 只回報 transcript 多大、上次存在哪，不寫檔
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT_DIR="${GGD_MEMTEMP_DIR:-$ROOT/docs/_daily}"   # 測試用；出貨一律走 docs/_daily
PROJ="$HOME/.claude/projects/-Users-Takuro-GGD"

TS="$(date '+%Y%m%d-%H%M')"
NOW="$(date '+%Y-%m-%d %H:%M')"
OUT="$OUT_DIR/memory_temp_${TS}.md"

# transcript 大小 = 「context 有多滿」唯一機械可得的代理值
TRANSCRIPT="$(ls -t "$PROJ"/*.jsonl 2>/dev/null | head -1)"
TSIZE_MB="$(du -m "$TRANSCRIPT" 2>/dev/null | cut -f1)"
: "${TSIZE_MB:=?}"
PREV="$(ls -t "$OUT_DIR"/memory_temp_*.md 2>/dev/null | head -1)"

if [ "${1:-}" = "--check" ]; then
  echo "transcript: ${TSIZE_MB}MB  ($(basename "${TRANSCRIPT:-none}"))"
  echo "上一份快照: ${PREV:-（還沒有）}"
  exit 0
fi

mkdir -p "$OUT_DIR"
{
  echo "# memory_temp $NOW"
  echo
  echo "> ⚠️ 這是 **context 溢出前的保命快照**，不是交付文件。"
  echo "> 下一輪接手時：先讀這一份，再讀 \`docs/_session-handover.md\`。"
  echo "> 機械欄位由 \`scripts/memory-temp.sh\` 產生；**「只有我知道」那幾節要手填**，"
  echo "> 留著 \`（待填）\` 的欄位代表這一份快照是不完整的。"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| transcript | ${TSIZE_MB} MB |"
  echo "| 上一份快照 | ${PREV:+$(basename "$PREV")}${PREV:-（這是第一份）} |"
  echo
  echo "## 機械狀態"
  echo
  echo '```'
  echo "HEAD      $(git log --oneline -1)"
  echo "branch    $(git rev-parse --abbrev-ref HEAD)"
  UP="$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo origin/main)"
  echo "未 push   $(git rev-list --count "$UP"..HEAD 2>/dev/null || echo '?') 個 commit（vs ${UP}）"
  echo "工作區    已追蹤改動 $(git status --short | grep -cv '^??' | tr -d ' ') 檔 / 未追蹤 $(git status --short | grep -c '^??' | tr -d ' ') 項"
  echo '```'
  echo
  echo "<details><summary>工作區逐檔</summary>"
  echo
  echo '```'
  git status --short
  echo '```'
  echo
  echo "</details>"
  echo
  echo "## 工作流（這個 session 派出去的）"
  echo
  python3 - "$PROJ" <<'PY'
import json, os, sys, glob
proj = sys.argv[1]
rows = []
for jp in glob.glob(os.path.join(proj, "*", "subagents", "workflows", "*", "journal.jsonl")):
    started = done = 0
    labels = []
    for line in open(jp, encoding="utf-8", errors="replace"):
        try:
            d = json.loads(line)
        except Exception:
            continue
        t = d.get("type")
        if t == "started":
            started += 1
            lb = d.get("label") or d.get("agentLabel")
            if lb:
                labels.append(str(lb))
        elif t == "result":
            done += 1
    if started:
        rows.append((os.path.getmtime(jp), os.path.basename(os.path.dirname(jp)), done, started, labels))
if not rows:
    print("（沒有偵測到工作流）")
else:
    print("| run | 進度 | 狀態 | agents |")
    print("|---|---|---|---|")
    for _, run, done, started, labels in sorted(rows, reverse=True)[:6]:
        state = "✅ 完成" if done >= started else "⏳ **還在跑**"
        print(f"| `{run}` | {done}/{started} | {state} | {', '.join(labels[:8]) or '—'} |")
PY
  echo
  echo "## 今天開/動過的 issue"
  echo
  TODAY="$(date '+%Y-%m-%d')"
  if command -v gh >/dev/null 2>&1; then
    gh issue list --state all --limit 60 \
      --json number,title,state,updatedAt \
      --jq "[.[]|select(.updatedAt>=\"$TODAY\")]|sort_by(.number)|.[]|\"- #\(.number) \(.state|ascii_downcase) — \(.title)\"" 2>/dev/null \
      || echo "（gh 讀不到）"
  else
    echo "（沒有 gh）"
  fi
  echo
  echo "## ⏸ 卡在 owner 身上的決定（待填）"
  echo
  echo "<!-- 一行一個：是什麼 · 選項 · 每個選項的後果。⛔ 不要寫「等回覆」就算了 -->"
  echo "（待填）"
  echo
  echo "## 🧠 owner 今天的裁決 / 更正（待填）"
  echo
  echo "<!-- ⚠️ 逐字引用。這一節是最容易在 compaction 掉的東西，而且掉了會做錯方向 -->"
  echo "（待填）"
  echo
  echo "## ➡️ 下一步（待填）"
  echo
  echo "（待填）"
} > "$OUT"

echo "✓ $OUT"
echo "  transcript ${TSIZE_MB}MB · ⚠️ 三節「（待填）」要現在補，不要留到下一輪"

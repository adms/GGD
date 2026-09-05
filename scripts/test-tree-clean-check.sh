#!/usr/bin/env bash
# 🧹 收工閘（GH#1002）：跑完測試之後，出貨樹必須跟跑之前**一樣乾淨**。
#
# 2026-09-05 量到（⛔ 不是推測）：一次 `pnpm -r --if-present test` 讓
#   · `content/abilities/*.json` **68 份**掉 `castTimeSec`
#   · `tools/skill-remake/heroes/godie-e00s.py` 的 `scatterRadius` 6.0 → 5.25（⭐ 產生器的**來源**）
# 而三支閘（speedlists:check · skillremake:json:check · skillremake:docs:check）的訊息
# 全部指著「內容與產生器不一致」，⛔ 沒有一支說「**有人動了你的樹**」。
#
# ⭐ 這支閘只問一件事：**跑測試前後，這幾個目錄的 `git status` 一不一樣** ——
# ⛔ 而且它刻意**不住在 vitest 裡**：兇手是一支逾時被殺的測試，而 worker 被殺時
# vitest 的 teardown 跟 `finally` 一樣跑不到 ⇒ 閘要站在 process **外面**。
#
#   bash scripts/test-tree-clean-check.sh                       # 嚴格：必須完全乾淨（CI 用，接在 `pnpm -r test` 之後，`if: always()`）
#   bash scripts/test-tree-clean-check.sh snapshot --out F      # 跑測試**之前**拍一張基線
#   bash scripts/test-tree-clean-check.sh --baseline F          # 跑完：只有**新增**的髒才算（本機多 lane 並行用）
#   …  [-- <path>…]           要看的路徑，預設 content/ tools/skill-remake/
#   GGD_TREE_ROOT=<dir>       換一棵樹（守衛 `testTreeCleanCheck.test.ts` 用）
#
# 離開碼：0 乾淨 · 1 髒（逐檔列名）· 2 沒驗到（⚠️ 「沒驗」⛔ 不是「通過」—— 靜默的跳過與全過長得一樣）
#
# ⚠️ baseline 模式的盲區（誠實寫下）：一份**跑之前就髒**的檔在跑的期間被改得更髒，
#   porcelain 那一行不變（` M path`）⇒ 這裡看不出來。⇒ CI 一律用嚴格模式。
set -uo pipefail
ROOT="${GGD_TREE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
MODE=check; OUT=""; BASE=""; PATHS=()
if [ "${1:-}" = "snapshot" ]; then MODE=snapshot; shift; fi
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="${2:?--out 要一個檔}"; shift 2 ;;
    --baseline) BASE="${2:?--baseline 要一個檔}"; shift 2 ;;
    --) shift; PATHS=("$@"); break ;;
    -*) echo "用法: $0 [snapshot --out F] [--baseline F] [-- path…]" >&2; exit 2 ;;
    *) PATHS+=("$1"); shift ;;
  esac
done
# ⚠️ macOS 出貨的是 bash 3.2 —— 空陣列在 `set -u` 下展開會炸，所以先用長度判斷。
[ "${#PATHS[@]}" -gt 0 ] || PATHS=(content/ tools/skill-remake/)

# ⭐ `--untracked-files=all` 逐檔列（⛔ 不是 `?? content/`）；`quotepath=false` 讓中文檔名讀得出來。
status() {
  git -C "$ROOT" -c core.quotepath=false status --porcelain=v1 --untracked-files=all -- "${PATHS[@]}" | LC_ALL=C sort
}
if ! NOW="$(status)"; then
  echo "⛔ git status 跑不起來（$ROOT 不是 git 樹？）—— 這一輪**沒有驗**，⛔ 不是通過。" >&2
  exit 2
fi

if [ "$MODE" = snapshot ]; then
  [ -n "$OUT" ] || { echo "用法: $0 snapshot --out <檔>" >&2; exit 2; }
  printf '%s' "$NOW" | grep . > "$OUT" || : # 乾淨 ⇒ 空檔（⛔ 不是一行空白）
  echo "📸 基線：$(grep -c . "$OUT") 份跑之前就髒的 → $OUT"
  exit 0
fi

DIRT="$NOW"
if [ -n "$BASE" ]; then
  [ -f "$BASE" ] || { echo "⛔ 基線檔不存在：$BASE —— 這一輪**沒有驗**。" >&2; exit 2; }
  DIRT="$(LC_ALL=C comm -13 <(LC_ALL=C sort "$BASE" | grep .) <(printf '%s' "$NOW" | grep .))"
fi
N=$(printf '%s' "$DIRT" | grep -c .)
if [ "$N" -eq 0 ]; then
  echo "✓ 出貨樹乾淨（${PATHS[*]}）${BASE:+ —— 相對於基線 $BASE}"
  exit 0
fi

echo "⛔ 測試把出貨樹弄髒了 —— ${N} 份（${PATHS[*]}）："
printf '%s\n' "$DIRT" | sed 's/^/   /'
cat <<'EOF'
   ⭐ 這**不是**「內容與產生器不一致」—— 是**有人動了你的樹**（GH#1002）。
   ⛔ 不要照著 skillremake:json:check / speedlists:check 的訊息去改 content/ —— 那會把真的出貨值改掉。
   兇手八成是一支在出貨樹上突變的測試（改來源 → 跑產生器 → finally 還原；worker 被殺就留殘骸）
   ⇒ 修法：那支測試改成在 mkdtemp() 副本上跑（前例 apps/content-api/src/testSourceSandbox.ts）。
   看改了什麼：git diff -- <上面的路徑>   ⚠️ 先確認那不是你自己或別條 lane 的改動再還原。
EOF
exit 1

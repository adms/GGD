#!/usr/bin/env bash
# 👁 **「玩家看得到」才叫做完 —— 這一支是那句話的閘。**
#
# owner 2026-08-24（逐字）：
#   「你反省一下 以飛鼠先生的天譴為例 為什麼沒做完 你沒完整驗收 你就跟我說你做完？
#    分析其 root cause 寫到開發守則跟 script，**我不想當你的人肉測試機**」
#
# ── 根因（量出來的，⛔ 不是感想）─────────────────────────────────────────────
# 連鎖閃電這一族從寫出來的那天起**一個像素都沒畫出來過**，而：
#   · sim 真的發了事件            ✅ 有守衛
#   · 事件真的過了 fanout 白名單  ✅ 有守衛
#   · 客戶端真的建出了網格頂點    ✅ 有守衛
#   · 那些頂點真的在抖            ✅ 有守衛
#   · ⛔ **螢幕上真的亮起來了嗎** ⇒ **一條守衛都沒有**
# ⇒ 我把「鏈路接上了」當成「做完了」，而 owner 的驗收標準從頭到尾是**畫面**。
#   四條綠燈全部停在**中間節點**,終點沒有人量 —— 於是「做完」是我說的，
#   而**唯一真的驗收的人是 owner**。那正是他說的「人肉測試機」。
#
# ── 這支腳本做什麼 ─────────────────────────────────────────────────────────
# 它**不**假裝能在 CI 裡跑 WebGL。它做的是把「終點沒人量」變成**會擋下你**的事：
#   ① 這次改動有沒有碰到「畫面」那一層（client 的 vfx/render）？
#   ② 有的話,改動裡有沒有**終端證據**：
#        · 一支帶 `@visual-proof` 標記的測試（斷言的是像素／材質可見性）,或
#        · 一份 `docs/_reports/*_visual-proof_*.md`（A/B 像素數字 + audition 頁路徑）
#   ③ 兩者都沒有 ⇒ **exit 1**,並印出該怎麼補。
#
# 用法：
#   bash scripts/visual-proof.sh              # 檢查工作樹 + HEAD 這一筆
#   bash scripts/visual-proof.sh <ref>        # 檢查 <ref>..HEAD
#   GGD_VISUAL_PROOF_OFF=1 …                  # 逃生口（要在 commit 訊息說為什麼）
set -o pipefail
cd "$(dirname "$0")/.."

if [ "${GGD_VISUAL_PROOF_OFF:-}" = "1" ]; then
  echo "⚠️ visual-proof 被 GGD_VISUAL_PROOF_OFF=1 關掉 —— 請在 commit 訊息裡說明為什麼。"
  exit 0
fi

BASE="${1:-HEAD~1}"
git rev-parse --verify "$BASE" >/dev/null 2>&1 || BASE=HEAD

# 「畫面那一層」——⛔ 逐字列出來,⛔ 不是「client 底下全部」（那會把純資料改動也拖進來）
VISUAL_RE='^apps/client/src/(vfx|render)/'

CHANGED=$(git diff --name-only "$BASE" HEAD; git diff --name-only; git diff --name-only --cached)
CHANGED=$(printf '%s\n' "$CHANGED" | sort -u | sed '/^$/d')

TOUCHED=$(printf '%s\n' "$CHANGED" | grep -E "$VISUAL_RE" | grep -v '\.test\.ts$' || true)
if [ -z "$TOUCHED" ]; then
  echo "✓ visual-proof：這次改動沒有碰到畫面層（apps/client/src/{vfx,render}），不需要像素證據。"
  exit 0
fi

# ② 終端證據：帶 @visual-proof 標記的測試檔（新增或改到），或一份 visual-proof 報告
PROOF_TESTS=$(printf '%s\n' "$CHANGED" | grep -E "$VISUAL_RE.*\.test\.ts$" || true)
HAS_MARK=0
for f in $PROOF_TESTS; do
  [ -f "$f" ] || continue
  if grep -q '@visual-proof' "$f"; then HAS_MARK=1; fi
done
HAS_REPORT=$(printf '%s\n' "$CHANGED" | grep -E '^docs/_reports/.*visual-proof.*\.md$' || true)

if [ "$HAS_MARK" = "1" ] || [ -n "$HAS_REPORT" ]; then
  echo "✓ visual-proof：畫面層有改動,而且帶了終端證據。"
  exit 0
fi

echo "⛔ visual-proof：這次改動碰了**畫面層**,卻沒有任何**終端證據**。" >&2
echo "" >&2
printf '   改到的畫面層檔案：\n%s\n' "$(printf '%s\n' "$TOUCHED" | sed 's/^/     · /')" >&2
echo "" >&2
echo "   ⭐ 「事件有送 / 網格有頂點 / 值算對了」**都不算**終端證據 —— 那些是中間節點。" >&2
echo "   ⭐ 終端是**玩家的螢幕**。二選一：" >&2
echo "" >&2
echo "   ① 在你改到的 test 檔頭寫上 @visual-proof,並讓它斷言**可見性**" >&2
echo "      （材質不會把整片圖元歸零 / UV 不是退化的 / 出生那一刻 emissive×alpha > 0）" >&2
echo "   ② 或做一頁 audition,量 A/B 像素並寫成" >&2
echo "      docs/_reports/<題目>_visual-proof_<時間戳>.md（要有:功能開/關兩組亮像素數）" >&2
echo "" >&2
echo "   逃生口：GGD_VISUAL_PROOF_OFF=1（⛔ 要在 commit 訊息裡說為什麼）" >&2
exit 1

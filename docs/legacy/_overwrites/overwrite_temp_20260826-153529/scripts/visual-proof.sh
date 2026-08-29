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

# ── v2 標記誠實（R3,GH#664）───────────────────────────────────────────────
# 一個帶 `@visual-proof` 標記的測試檔,必須真的斷言**可見性** —— 否則標記本身
# 就是第三守則抓的那種宣稱：「已驗證」四個字掛在一支什麼都沒驗的檔上。
# 判準：檔內至少要出現一個可見性斷言詞彙。⭐ 掃的是**全部**畫面層測試檔
# （含未追蹤的）,⛔ 不只這次改到的 —— 說謊的標記不因為「今天沒動它」就不是謊。
# ⭐ 2026-08-25 追加 `emitRate|isStarted`：粒子系統「有沒有真的在噴」是可見性,
#    而且它抓到過一個 readPixels 抓不到的形狀 —— GH#700 的第一版守衛是綠的,
#    因為 `scene.particleSystems.push(this)` 在平台檢查**之前**,一顆建構失敗的
#    **殘骸**同名躺在場上;量 isStarted()/emitRate 才分得出來。
VOCAB_RE='readPixels|opacityTexture|getVerticesData|emissive|alpha|isEnabled|bright|emitRate|isStarted'
LIARS=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -q '@visual-proof' "$f" && ! grep -Eq "$VOCAB_RE" "$f"; then
    LIARS="$LIARS$f"$'\n'
  fi
done < <(find apps/client/src/vfx apps/client/src/render -name '*.test.ts' 2>/dev/null)
if [ -n "$LIARS" ]; then
  echo "⛔ visual-proof：這些測試檔帶著 @visual-proof 標記,卻沒有任何可見性斷言詞彙" >&2
  echo "   （$VOCAB_RE）—— 標記不是斷言（第三守則）。" >&2
  printf '%s' "$LIARS" | sed 's/^/     · /' >&2
  echo "   ⇒ 要嘛讓它真的斷言可見性,要嘛把標記拿掉。" >&2
  exit 1
fi

CHANGED=$(git diff --name-only "$BASE" HEAD; git diff --name-only; git diff --name-only --cached)
CHANGED=$(printf '%s\n' "$CHANGED" | sort -u | sed '/^$/d')

# ⭐ GH#714 —— 未追蹤檔曾經是這支閘的**盲區**:上面三個來源**全部只列 tracked 檔**,
#    於是一條被規定「⛔ 不碰 git 寫入」的 lane 就算做完了 audition、報告好好躺在硬碟上,
#    閘照樣紅,而且訊息會說「你改了畫面層卻沒有終端證據」——⚠️ **那句話是假的**。
#    ⇒ 閘會被當成雜訊忽略,而**被忽略的閘等於沒有閘**。
#    ⛔ 這是修**盲區**,⛔ 不是放寬判準:它只餵給下面的**證據偵測**,
#    ⛔ 不餵給 TOUCHED —— 隨手放在 vfx/ 底下的一個未追蹤檔不該被算成「這次改了畫面層」。
UNTRACKED=$(git ls-files --others --exclude-standard | sed '/^$/d' | sort -u)
EVIDENCE_POOL=$(printf '%s\n' "$CHANGED" | sort -u | sed '/^$/d')

# ⛔ 這一族在 apps/client/src/render/ 底下,但它們**不畫任何像素** ——
#    它們是「產生 content/ 文件」的離線產生器（node 跑,沒有 scene、沒有材質）。
#    要它們附終端證據等於要求一份與改動無關的截圖 ⇒ 那會讓閘變成橡皮圖章。
#    ⚠️ 判準是**檔名 generate*Content*(產物寫入端)**,⛔ 不是「我覺得這次不用驗」。
GENERATOR_RE='^apps/client/src/render/vfx/generate[A-Za-z]*Content\.ts$'
TOUCHED=$(printf '%s\n' "$CHANGED" | grep -E "$VISUAL_RE" | grep -v '\.test\.ts$' | grep -vE "$GENERATOR_RE" || true)
if [ -z "$TOUCHED" ]; then
  echo "✓ visual-proof：這次改動沒有碰到畫面層（apps/client/src/{vfx,render}），不需要像素證據。"
  exit 0
fi

# ② 終端證據：帶 @visual-proof 標記的測試檔（新增或改到），或一份 visual-proof 報告
#    ⭐ 這裡讀的是 EVIDENCE_POOL（含**未追蹤**）,⛔ 不是 CHANGED —— 見上面 GH#714。
PROOF_TESTS=$(printf '%s\n' "$EVIDENCE_POOL" | grep -E "$VISUAL_RE.*\.test\.ts$" || true)
HAS_MARK=0
MARKED=""
for f in $PROOF_TESTS; do
  [ -f "$f" ] || continue
  if grep -q '@visual-proof' "$f"; then HAS_MARK=1; MARKED="$MARKED$f"$'\n'; fi
done
HAS_REPORT=$(printf '%s\n' "$EVIDENCE_POOL" | grep -E '^docs/_reports/.*visual-proof.*\.md$' || true)

if [ "$HAS_MARK" = "1" ] || [ -n "$HAS_REPORT" ]; then
  echo "✓ visual-proof：畫面層有改動,而且帶了終端證據。"
  # ⚠️ fail-open 沒錯,**靜默**才是缺陷：未追蹤的證據算數,⛔ 但一定要說出來 ——
  #    ⛔ 少了這一行就會複製 2026-08-02 那次事故的形狀（產物 commit 了、來源檔沒 commit
  #    ⇒ 線上內容整份載入失敗）。
  EVID=$(printf '%s%s\n' "$MARKED" "$HAS_REPORT" | sed '/^$/d' | sort -u)
  NOT_ADDED=""
  if [ -n "$UNTRACKED" ] && [ -n "$EVID" ]; then
    NOT_ADDED=$(printf '%s\n' "$EVID" | grep -Fxf <(printf '%s\n' "$UNTRACKED") || true)
  fi
  if [ -n "$NOT_ADDED" ]; then
    echo "⚠️ 這份證據還沒 git add —— 出貨的是 git,不是你這台機器的工作區。"
    printf '%s\n' "$NOT_ADDED" | sed 's/^/     · /'
  fi
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

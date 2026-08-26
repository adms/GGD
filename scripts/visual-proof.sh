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
#   bash scripts/visual-proof.sh --new <題目> # ⭐ 開一份報告骨架,HEAD 自動蓋（GH#795）
#   GGD_VISUAL_PROOF_OFF=1 …                  # 逃生口（要在 commit 訊息說為什麼）
#   GGD_VISUAL_PROOF_HEAD_STRICT=1 …          # 報告沒寫 HEAD ⇒ 從「大聲喊」升級成「擋下」
set -o pipefail
cd "$(dirname "$0")/.."

if [ "${GGD_VISUAL_PROOF_OFF:-}" = "1" ]; then
  echo "⚠️ visual-proof 被 GGD_VISUAL_PROOF_OFF=1 關掉 —— 請在 commit 訊息裡說明為什麼。"
  exit 0
fi

# ── 📅 證據的**時間身分**（GH#795）────────────────────────────────────────────
# ⭐ **一份過期的證據比沒有證據更危險**：沒有證據時我會說「未驗收」;
#   有一份格式完美但**比修復更早**的證據時,我會說「已修」。
#   量到的（2026-08-27 稽核）：#721/#767 的報告驗收 12:00 → 家族重建 13:29 →
#   additive 修正 20:57 ⇒ **報告比它要驗的東西早 89 分鐘,而那只寫在檔名裡**。
#   同一天普查：25 份 `*_visual-proof_*` 報告只有 **2 份**寫得出自己拍攝時的 HEAD
#   ⇒ 另外 23 份「這份證據是不是比修復更早」**永遠判不出來**。
#
# ⇒ 兩半,缺一半都不成立：
#   ① `--new` 開骨架時**自動蓋** `HEAD=<sha>` ＝「**以後產出的都帶**」
#   ② 這次改動附的報告沒寫 HEAD ⇒ **大聲指名**（⛔ 靜默才是缺陷）
# ⛔⛔ **不可以自動幫既有報告補一行 HEAD** —— 替一份不知道何時拍的報告蓋今天的 sha
#     就是**捏造證據**,那比沒有標記更糟。只能要求作者寫。
# ⚠️ 撈法要與 `tools/review/features.mjs::evidenceHeadOf()` **同一套**（⛔ 不是兩套規則）:
#    守衛 `packages/shared/src/ops/visualProofScript.test.ts` 拿**那一支**去撈
#    `--new` 蓋出來的 sha,兩邊哪天漂開就紅。
HEAD_RE='HEAD[[:space:]]*[=＝:：][[:space:]]*`?[0-9a-f]{7,40}|[Cc]ommit[[:space:]]+`?[0-9a-f]{7,40}'
# 骨架的機器可讀哨兵。⭐ 作者填完量測後把那一行刪掉;⛔ 沒刪 ⇒ 它不算證據
# （與 v2 的「空殼標記」同一個病：一份**長得像**證據的空檔）。
SKELETON_MARK='GGD_VISUAL_PROOF_SKELETON'

if [ "${1:-}" = "--new" ]; then
  SLUG="${2:-}"
  if [ -z "$SLUG" ]; then
    echo "用法：bash scripts/visual-proof.sh --new <題目>    # 例：dragonslave" >&2
    exit 2
  fi
  case "$SLUG" in
    *[!A-Za-z0-9_-]*) echo "⛔ 題目只收 [A-Za-z0-9_-]（它會變成資料夾名）：$SLUG" >&2; exit 2 ;;
  esac
  SHA=$(git rev-parse --short=8 HEAD 2>/dev/null || true)
  if [ -z "$SHA" ]; then
    # ⛔ 撈不到就**不生** —— 一份沒有時間身分的報告正是這張票要消滅的東西。
    echo "⛔ 撈不到 HEAD（這裡不是 git repo,或還沒有任何 commit）—— ⛔ 不生一份判不出時間的報告。" >&2
    exit 2
  fi
  # ⚠️ 「工作樹」三個字**不可以省**：在髒工作樹上拍的證據,它要驗的修復可能還沒進歷史,
  #    `evidenceOrder()` 只比 commit 的祖孫關係 ⇒ 結構上分不出來。標出來才叫誠實。
  DIRTY=""
  [ -n "$(git status --porcelain 2>/dev/null)" ] && DIRTY=" 工作樹"
  DIR="docs/_reports/${SLUG}_visual-proof_$(date +%Y%m%d-%H%M)"
  MD="$DIR/frames.md"
  if [ -e "$MD" ]; then
    echo "⛔ 已經有一份了：$MD —— ⛔ 不覆蓋（覆蓋前先備份是硬規則）。" >&2
    exit 2
  fi
  mkdir -p "$DIR"
  {
    printf '# %s — 連續圖片驗收（GH#____）\n\n' "$SLUG"
    printf '> 📅 **證據的時間身分（GH#795）**：`HEAD=%s`%s\n>\n' "$SHA" "$DIRTY"
    printf '> ⭐ 這一行是 `visual-proof.sh --new` **拍攝當下**蓋的,⛔ 不是事後補的。\n'
    printf '> 它回答的是「這份證據是不是比它要驗的修復更早」——⛔ 沒有它,那題永遠判不出來。\n\n'
    printf '<!-- %s：填完下面的量測後**刪掉這一行**,否則這份不算證據 -->\n\n' "$SKELETON_MARK"
    printf '台子：`（⬜ audition 頁的 URL,含 ability id）`\n'
    printf '鏈路：`（⬜ 逐段寫出來,證明沒有一段是台子造的）`\n'
    printf '⭐ **量尺先自證**：`calibrate()` 全亮 quad = **⬜** 亮像素（⛔ 量不到 ⇒ 這台量尺的一切結論作廢）\n'
    printf '亮像素 = max(R,G,B) > 200;lit = > 96。\n\n'
    printf '| 擷圖 | tick | 亮像素 | lit | 說明 |\n'
    printf '|---|--:|--:|--:|---|\n'
    printf '| f0_precast | 0 | ⬜ | ⬜ | 施放前基線 |\n'
    printf '| f1_peak | ⬜ | ⬜ | ⬜ | ⬜ |\n\n'
    printf '## 結論\n\n⬜ A（功能開）vs B（功能關）的亮像素差,以及它為什麼是**終端**證據。\n'
  } > "$MD"
  echo "✓ 開好了：$MD"
  echo "   📅 HEAD=$SHA$DIRTY（拍攝當下蓋的）"
  echo "   ⇒ 量完填進去,並**刪掉** $SKELETON_MARK 那一行 —— 沒刪的骨架⛔ 不算證據。"
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
EVIDENCE_POOL=$(printf '%s\n%s\n' "$CHANGED" "$UNTRACKED" | sort -u | sed '/^$/d')

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

# ── 骨架不算證據（GH#795）─────────────────────────────────────────────────
# ⭐ `--new` 讓「開一份報告」變成一行,⛔ 但那也開了一個新洞：一份**空的**骨架
#   本來會讓這支閘直接轉綠。那正是 v2 關掉的「空殼標記」在報告上的分身。
SKELETON=""
if [ -n "$HAS_REPORT" ]; then
  KEPT=""
  while IFS= read -r r; do
    [ -f "$r" ] || continue
    if grep -q "$SKELETON_MARK" "$r"; then SKELETON="$SKELETON$r"$'\n'; else KEPT="$KEPT$r"$'\n'; fi
  done < <(printf '%s\n' "$HAS_REPORT" | sed '/^$/d')
  HAS_REPORT=$(printf '%s' "$KEPT" | sed '/^$/d')
fi
if [ -n "$SKELETON" ]; then
  echo "⚠️ 這幾份還是 --new 開出來的**骨架**,⛔ 不算終端證據：" >&2
  printf '%s' "$SKELETON" | sed 's/^/     · /' >&2
  echo "   ⇒ 量完 A/B 亮像素填進去,並刪掉 $SKELETON_MARK 那一行。" >&2
fi

# ── 報告有沒有寫出自己拍攝時的 HEAD（GH#795）──────────────────────────────
# ⛔ 這裡**只看這次改動附上的**報告 —— 既有那 23 份不在 EVIDENCE_POOL 裡,
#   ⛔ 這支閘不會（也不該）回頭吼它們,更⛔ 不會幫它們補（那是捏造證據）。
NO_HEAD=""
if [ -n "$HAS_REPORT" ]; then
  while IFS= read -r r; do
    [ -f "$r" ] || continue
    grep -Eq "$HEAD_RE" "$r" || NO_HEAD="$NO_HEAD$r"$'\n'
  done < <(printf '%s\n' "$HAS_REPORT" | sed '/^$/d')
fi
if [ -n "$NO_HEAD" ]; then
  NOW=$(git rev-parse --short=8 HEAD 2>/dev/null || echo "????????")
  NOW_DIRTY=""
  [ -n "$(git status --porcelain 2>/dev/null)" ] && NOW_DIRTY=" 工作樹"
  echo "⚠️ 這幾份報告沒有寫出**拍攝當下的 HEAD** ⇒「證據是不是比修復更早」判不出來（GH#795）：" >&2
  printf '%s' "$NO_HEAD" | sed 's/^/     · /' >&2
  echo "   ⇒ 在報告開頭加一行（⚠️ 要填**拍攝當下**的 sha,⛔ 不是現在這一個,除非它們相同）：" >&2
  echo "     > 📅 **證據的時間身分（GH#795）**：\`HEAD=$NOW\`$NOW_DIRTY" >&2
  echo "   ⭐ 下一次直接用 \`bash scripts/visual-proof.sh --new <題目>\`,它會替你蓋。" >&2
  if [ "${GGD_VISUAL_PROOF_HEAD_STRICT:-}" = "1" ]; then
    echo "⛔ GGD_VISUAL_PROOF_HEAD_STRICT=1 ⇒ 這一項從警示升級成擋下。" >&2
    exit 1
  fi
fi

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

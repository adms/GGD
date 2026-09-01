#!/usr/bin/env bash
# 🎮 給**玩家**看的 release note ——（預設只預覽；發到 Discord 要 --post）
#
# owner 2026-08-30：「我接下來還會多一個**給玩家看的 release note** 要發佈在 discord」
#
# ⭐ 它與 GitHub 的 release note 是**兩種不同的東西**，⛔ 不是同一份的兩個格式：
#   · GitHub note   → 給**開發**看：守則、突變紀錄、commit、誠實的界線
#   · 這一份         → 給**玩家**看：他按下去會看到什麼不一樣
#
# ⚠️ ⭐ **來源不是 commit 訊息** —— 那是回頭重建，而 2026-08-19 我憑印象重寫工作進度時
#   owner 當場抓到整條線不見了（GH#456）。⇒ 玩家那一句必須在**做完的當下**寫進票裡：
#     bash scripts/ticket-progress.sh write <票號> … --player "<一句玩家看得懂的話>"
#
#   bash scripts/release-note-players.sh                 # 預覽（自動抓上一個 tag 到現在）
#   bash scripts/release-note-players.sh --since v0.31.0
#   bash scripts/release-note-players.sh --post          # ⭐ 真的發到 Discord
set -uo pipefail
cd "$(dirname "$0")/.."

SINCE=""; POST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --since) SINCE="$2"; shift 2;;
    --post) POST=1; shift;;
    *) echo "不認得 $1" >&2; exit 2;;
  esac
done

# 上一個 tag（⛔ 不是 HEAD~N —— 那會因為 commit 密度而漂）
[ -n "$SINCE" ] || SINCE=$(git tag --sort=-v:refname | sed -n '2p')
NOW=$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD)
[ -n "$SINCE" ] || { echo "⛔ 找不到上一個 tag，用 --since <tag>" >&2; exit 2; }

echo "🎮 玩家公告草稿：$SINCE → $NOW"
echo

# ── 這一段期間關掉的票 ────────────────────────────────────────────────────
# ⚠️ ⭐ 拿**完整 ISO 時間戳**比，⛔ 不是日期字串：
#   `updatedAt`（`2026-08-30T02:11:44Z`）>= `"2026-08-30"` 在字串序上是 true，
#   ⛔ 但 `>= "2026-08-30"` 對**同一天稍早**更新的票會誤判 ——
#   ⭐ 而更糟的是：上一版的 tag 就在今天 ⇒ 撈到 **0 張**，
#   而結果讀起來是「這一版沒有玩家可見的改動」（⛔ 又一個空轉的綠燈）。
# ⇒ 用 tag 自己的時間戳，並**往前抓一天**當緩衝（真正的篩選在下面的 commit 祖先檢查）。
SINCE_DATE=$(git log -1 --format=%cI "$SINCE" 2>/dev/null | cut -c1-10)
SINCE_DATE=$(date -j -v-1d -f %Y-%m-%d "$SINCE_DATE" +%Y-%m-%d 2>/dev/null \
             || date -d "$SINCE_DATE -1 day" +%Y-%m-%d 2>/dev/null || echo "$SINCE_DATE")
# ⚠️ ⭐ **判準是「出貨了沒」，⛔ 不是「票關了沒」**（2026-08-30 量到）：
#   #401 是 PARTIAL、票還開著，⛔ 而它的修復**已經隨版本出貨** —— 玩家看得到它。
#   ⇒ 只掃 closed 會漏掉每一個「做了一半但那一半已經上線」的改動。
# ⭐ 改成看**進度標記裡的 commit 有沒有落在這一段**（`SINCE..NOW`）。
# ⭐ `GGD_PLAYERNOTE_NO_GH=1` —— 跳過 gh 查詢（票清單為空）。
#   ⚠️ ⭐ 它**不是**一個假的通道：後面的 fallback 走的是**同一段出貨程式碼**，
#     而這裡唯一被跳過的是「去 GitHub 撈票」這個 I/O。
#   ⇒ 存在的理由是**閘**：`playerNoteNeverEmpty.test.ts` 要驗「沒有任何玩家句時仍然出一行」，
#     ⛔ 而真的打 gh 要 2 分鐘 —— 一條會 timeout 的閘等於一條永遠會過的閘（2026-08-30 實測）。
if [ "${GGD_PLAYERNOTE_NO_GH:-0}" = 1 ]; then
  CLOSED=""
else
CLOSED=$(gh issue list --state all --limit 300 --json number,updatedAt \
          -q ".[] | select(.updatedAt >= \"${SINCE_DATE}\") | .number" 2>/dev/null) || {
  echo "⚠️ gh 連不上 —— **沒有產生草稿**（⛔ 這不是「這一版沒有玩家可見的改動」）" >&2; exit 1; }
fi

LINES=""; MISSING=""; UNSCOPED=""
for N in $CLOSED; do
  # ⚠️ ⭐ 只讀**最新一則進度標記**，⛔ 不是「所有留言裡第一個命中的」：
  #   2026-08-30 量到 —— 我把 #866 的玩家那一句**清空**（它是後台的事，玩家無感），
  #   而反序 join 後 `grep -m1` 就往下找到了**上一則**的舊句子
  #   ⇒ ⭐ 一句已經被撤回的話又被發出去。**撤回要真的撤得掉。**
  B=$(gh issue view "$N" --json comments -q '[.comments[].body] | reverse | .[]' 2>/dev/null \
        | awk '/🧭 進度標記/{f=1} f{print} f&&/^---$/{exit}') || continue
  [ -n "$B" ] || continue
  P=$(printf '%s' "$B" | grep -m1 '🎮 玩家看得到的' | sed 's/.*）\*\*：//')
  # ⭐ 那一句對應的 commit 有沒有**落在這一段**？（⛔ 不然舊版的會一直重發）
  if [ -n "$P" ]; then
    # ⛔⛔ **寫入端與消費端的格式對不上**（2026-08-30 量到，⭐ 同一天第二次）：
    #   `ticket-progress.sh:70` 寫的是 `| **commit** | fe252e8aa |`（⛔ **沒有**反引號），
    #   而這裡在此之前找的是 `` | **commit** | `fe252e8aa` | ``（要反引號）
    #   ⇒ ⭐ **永遠對不上** ⇒ 每一張票都被判成「定位不到版本」⇒ 玩家公告永遠是空的。
    #
    # ⚠️ ⭐ 而它看起來完全正常：正則沒錯、欄位在、標記也寫進去了 ——
    #   ⛔ 錯的只有「兩端對同一個格式的想像不一樣」。
    #   （第一次是進度欄：寫入端是**表格** `| **狀態** | \`完成\` |`，而我找 `狀態:`。）
    #
    # ⇒ ⭐ 反引號改成**可有可無**，⛔ 而 sha 本身仍然嚴格（7–40 個 hex）。
    SHA=$(printf '%s' "$B" | grep -m1 -oE '\| \*\*commit\*\* \| `?[0-9a-f]{7,40}`?' | grep -oE '[0-9a-f]{7,40}' || true)
    if [ -n "$SHA" ] && git cat-file -e "$SHA" 2>/dev/null; then
      git merge-base --is-ancestor "$SHA" "$NOW" 2>/dev/null || P=""      # 還沒進這一版
      [ -n "$P" ] && { git merge-base --is-ancestor "$SHA" "$SINCE" 2>/dev/null && P=""; }  # 上一版就有了
    else
      # ⛔⛔ **沒有 commit ⇒ 這一句無法定位到任何一版** —— 2026-08-30 量到的實際後果:
      #   同一天發了 **9 個版本**,而 #742/#722/#721/#866 的標記都沒帶 `--commit`
      #   ⇒ 祖先過濾整段被跳過 ⇒ ⭐ **同樣八行被排進每一版的公告**。
      #   ⚠️ 而它看起來完全正常 —— 一份「這一版做了什麼」的清單,
      #     ⛔ 而它其實是「這一天做了什麼」。
      # ⇒ ⭐ **不可以靜默收進去**(玩家收到重複公告 ＝ 噪音),
      #   ⛔ 也不可以靜默丟掉(一個真的改動會消失)⇒ **移到 fail-loud 那一欄**。
      UNSCOPED="${UNSCOPED}  · #$N ${P}
"
      P=""
    fi
  fi
  T=$(gh issue view "$N" --json title -q .title 2>/dev/null | sed 's/\[[^]]*\]//g' | sed 's/^ *//')
  if [ -n "$P" ]; then
    LINES="${LINES}- ${P}
"
  else
    # ⭐ 只有**玩家看得到的類型**才算漏；infra/test/docs 本來就不該有
    case "$(gh issue view "$N" --json title -q .title 2>/dev/null)" in
      *"[feature]"*|*"[fix]"*|*"[improve]"*|*"[bug]"*)
        MISSING="${MISSING}  · #$N $T
";;
    esac
  fi
done

if [ -z "$LINES" ]; then
  # ⭐⭐ owner 2026-08-30（逐字，⭐ 常設指令）：
  #
  #   > 「如果沒有對玩家有差別的改版你還是要發 **系統優化更新**」
  #
  # ⚠️ ⭐ 為什麼這條是必要的：**不發 ＝ 讓玩家以為沒動靜**。
  #   一個持續在更新的專案，如果只在「有新東西」那幾天出聲，
  #   ⛔ 其餘每一天看起來都像停擺 —— 而那與真的停擺**長得一模一樣**。
  #   ⇒ ⭐ 判準不是「這一版有沒有新東西」，是「**這一版有沒有出貨**」。出貨就要說。
  #
  # ⛔ 而它**不可以**寫成「這一版沒有玩家可見的改動」——那是給我自己看的話。
  #   ⭐ 玩家要的是「它有沒有變好」，⛔ 不是「有沒有東西給我玩」。
  LINES="- 系統優化更新：穩定性與速度的例行維護。
"
  echo "  （這一版沒有任何票寫了玩家那一句 ⇒ ⭐ 發**系統優化更新**，owner 2026-08-30）"
  printf '%s' "$LINES"
else
  printf '%s' "$LINES"
fi

# ⚠️ ⭐ fail-loud（一）：**定位不到版本**的那幾句 —— ⛔ 它們不會進公告
if [ -n "$UNSCOPED" ]; then
  echo
  echo "⚠️ 這幾句**定位不到版本**（進度標記沒帶 \`--commit\`）——⛔ 不發，避免每一版重複："
  printf '%s' "$UNSCOPED"
  echo "  ⭐ 修法：bash scripts/ticket-progress.sh write <票號> … --commit <sha>"
  echo "     ⚠️ 沒有 sha 的那一句，永遠答不出「它是哪一版出貨的」⇒ 只能每一版都發或都不發。"
fi

# ⚠️ ⭐ fail-loud（二）：漏掉的要**說出來**，⛔ 不是靜默省略（安靜的跳過與全過長得一樣）
if [ -n "$MISSING" ]; then
  echo
  echo "⚠️ 這幾張是 feature/fix/improve 卻**沒寫玩家那一句** —— ⛔ 它們不會出現在公告裡："
  printf '%s' "$MISSING"
  echo "  ⇒ 補：bash scripts/ticket-progress.sh write <票號> --state 完成 \\"
  echo "        --baseline … --next … --player \"<一句玩家看得懂的話>\""
fi

# ── ⭐ 實作細節的閘（owner 2026-08-30：「記得**不要講實作細節**」）─────────
#
# ⚠️ 為什麼是閘不是判準：「記得不要 X」是判準，⛔ 而這份 repo 記錄了五次判準失效。
# ⭐ 而我自己第一版就違反了它 —— 寫了「**後台**每一頁多了…」，
#   ⛔ 後台根本不是玩家看得到的東西。
#
# 判準：一行裡出現**只有開發看得懂的東西** ⇒ 擋下並指名那個詞。
DETAIL_RE='[A-Za-z_][A-Za-z0-9_]*\.(ts|tsx|json|py|mjs|md)|godie-[a-z0-9]|\bj:[0-9]|commit|\b[0-9a-f]{7,40}\b|第[〇一二三四五六七八九]+·?[〇一二三四五六七八九]*守則|--check|genrun|schema|Zod|vitest|突變|棘輪|後台|admin|dataset|API|webhook|#[0-9]{2,4}'
BAD_LINES=$(printf '%s' "$LINES" | grep -nE "$DETAIL_RE" || true)
if [ -n "$BAD_LINES" ]; then
  echo
  echo "⛔ 這幾行有**實作細節**（owner：「記得不要講實作細節」）——⛔ 不發："
  printf '%s\n' "$BAD_LINES" | sed 's/^/  · /'
  echo "  ⭐ 玩家公告只講：**他按下去會看到什麼不一樣**。"
  echo "     ⛔ 不講：檔名 · commit · 欄位名 · 守則 · 閘／測試 · 票號 · **後台**（那不是玩家看得到的）"
  echo "  ⇒ 改：bash scripts/ticket-progress.sh write <票號> … --player \"<改寫過的一句>\""
  exit 1
fi

[ "$POST" -eq 1 ] || { echo; echo "⭐ 這是**預覽**。要真的發到 Discord：加 --post"; exit 0; }

# ── 發布（⭐ 對外動作，所以它是一個明確的旗標，⛔ 不是預設）──────────────
HOOK="${GGD_DISCORD_WEBHOOK:-}"
[ -n "$HOOK" ] || { echo "⛔ 沒設 GGD_DISCORD_WEBHOOK —— 去 Discord 伺服器設定→整合→Webhook 建一個" >&2; exit 1; }
[ -n "$LINES" ] || { echo "⛔ 沒有內容可發（零張票寫了玩家那一句）" >&2; exit 1; }

# ── ⭐ 已經公告過就不要再發一次（GH#907）─────────────────────────────
#
# ⚠️ 這一段在 2026-09-01 之前不存在,而缺它的代價是**玩家收到重複訊息**:
#   BMPNDD 自己就呼叫這支腳本**兩次**(1/4 push 那一段 + 3/4 公告那一段),
#   ⇒ 同一則「系統優化更新」在 Discord 出現兩則,⛔ 而兩次都回 HTTP 204「成功」。
#
# ⭐ 判準是**帳本**,⛔ 不是「腳本自己記得跑過沒有」——
#   帳本是跨行程的(bmpndd 的兩次呼叫是兩個獨立的 shell),
#   而「這一版發過了嗎」這個問題只有帳本答得出來。
#
# ⚠️ ⛔ 刻意**不**靜默跳過(fail-open 沒錯,靜默才是缺陷):
#   它印出帳本上那一列,讓讀的人看得出來「為什麼這一次沒發」。
# ⭐ 逃生口 GGD_ANNOUNCE_FORCE=1 —— 真的要補發時用(例:上一次發到錯的頻道)。
if [ "${GGD_ANNOUNCE_FORCE:-0}" != "1" ]; then
  _LG="${GGD_ANNOUNCE_LEDGER:-docs/_release/_announced.tsv}"
  if [ -f "$_LG" ] && grep -q "^${NOW}	" "$_LG"; then
    echo "⭐ $NOW 已經公告過了 ⇒ ⛔ 不重複發"
    echo "    帳本: $(grep -m1 "^${NOW}	" "$_LG" | cut -f1,2)"
    echo "    真的要補發: GGD_ANNOUNCE_FORCE=1 $0 --post"
    exit 0
  fi
fi

BODY=$(printf '## 🎮 %s 更新\n\n%s' "$NOW" "$LINES")
JSON=$(python3 -c 'import json,sys; print(json.dumps({"content": sys.stdin.read()[:1900]}))' <<< "$BODY")
CODE=$(curl -s -o /tmp/dc.out -w '%{http_code}' -H 'Content-Type: application/json' -d "$JSON" "$HOOK")
case "$CODE" in
  20*)
    echo "✓ 已發到 Discord（HTTP $CODE）"
    # ⭐⭐ 發成功就**自己記帳** —— ⛔ 這一行在 2026-09-01 之前不存在。
    #
    # ⚠️ 而缺它的形狀正是失敗形態⑪（兩條對的守衛，組合是空的）：
    #   · 這支腳本**真的發得出去**（HTTP 204）           ✅
    #   · `everyTagAnnounced.test.ts` **真的讀得到帳本**   ✅
    #   ⇒ ⛔ 而**沒有人寫那個帳本** ⇒ 閘只能靠人手打滿足
    #     ＝ 一個「要記得」的判準，⛔ 不是閘（元規則：判準 0/4 全破）。
    #
    # ⭐ 記的是 `SINCE`（不含）到 `NOW`（含）之間**每一個** tag ——
    # ⛔ 不是只記 `NOW`：一次補發常常涵蓋好幾個版號（這一次就是 v0.34.11＋v0.34.12），
    #   只記最新那一個會讓中間的版號永遠留在帳本外，而閘會**一直紅**。
    # ⭐ 路徑可注入,⛔ 只為了讓守衛跑得起來(它要在**真的 repo** 上跑真的這一支,
    #   而 ⛔ 不可以動到出貨的帳本)。出貨時它就是預設那一份。
    LEDGER="${GGD_ANNOUNCE_LEDGER:-docs/_release/_announced.tsv}"
    if [ -f "$LEDGER" ]; then
      TODAY=$(date +%Y-%m-%d)
      # ⚠️ ⭐ `cut -c` 在這裡切的是**位元組** ⇒ 中文會被切在半個字元中間
      #   （2026-09-01 實際發生：帳本第三欄留下一個壞掉的 UTF-8 序列）。
      #   ⇒ 用 python3 切**字元**（這支腳本本來就依賴 python3 做 JSON）。
      FIRSTLINE=$(printf '%s' "$LINES" | sed -n '1s/^[[:space:]·*-]*//p' \
        | python3 -c 'import sys;print(sys.stdin.read().replace("\t"," ")[:60].strip())')
      for T in $(git tag --sort=v:refname | awk -v a="$SINCE" -v b="$NOW" '
            $0==a{seen=1; next} seen{print} $0==b{exit}'); do
        grep -q "^${T}	" "$LEDGER" || printf '%s\t%s\t%s\n' "$T" "$TODAY" "${FIRSTLINE:-玩家公告}" >> "$LEDGER"
      done
      grep -q "^${NOW}	" "$LEDGER" || printf '%s\t%s\t%s\n' "$NOW" "$TODAY" "${FIRSTLINE:-玩家公告}" >> "$LEDGER"
      echo "  ✓ 已記進 $LEDGER"
    fi
    ;;
  *)   echo "⛔ 發布失敗 HTTP $CODE：$(head -c 200 /tmp/dc.out)" >&2; exit 1;;
esac

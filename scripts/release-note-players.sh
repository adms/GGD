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
#   bash scripts/release-note-players.sh --since v0.37.2 --until v0.38.0   # 重算一個舊區間（只預覽）
#   bash scripts/release-note-players.sh --post          # ⭐ 真的發到 Discord
#
# ⭐ 開關（GH#1021）：
#   GGD_PLAYERNOTE_SCOPE=commits（預設）—— 一張票只有在「SINCE..NOW 裡有 commit 指名它」時才算這一版的
#   GGD_PLAYERNOTE_SCOPE=updated          —— 舊行為：最近被動過（留言／關票）就算，⛔ 只為一鍵回頭
#   GGD_PLAYERNOTE_TRACE=1                —— 每一張候選票在 stderr 印 `🔎 #N sha=… → 去向`（給閘讀）
set -uo pipefail
cd "$(dirname "$0")/.."

SINCE=""; UNTIL=""; POST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --since) SINCE="$2"; shift 2;;
    --until) UNTIL="$2"; shift 2;;
    --post) POST=1; shift;;
    *) echo "不認得 $1" >&2; exit 2;;
  esac
done

# 上一個 tag（⛔ 不是 HEAD~N —— 那會因為 commit 密度而漂）
[ -n "$SINCE" ] || SINCE=$(git tag --sort=-v:refname | sed -n '2p')
NOW=${UNTIL:-$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD)}
[ -n "$SINCE" ] || { echo "⛔ 找不到上一個 tag，用 --since <tag>" >&2; exit 2; }

echo "🎮 玩家公告草稿：$SINCE → $NOW"
echo

# ── 這一段期間關掉的票 ────────────────────────────────────────────────────
# ⚠️ ⭐ 拿**完整 ISO 時間戳**比，⛔ 不是日期字串：
#   `updatedAt`（`2026-08-30T02:11:44Z`）>= `"2026-08-30"` 在字串序上是 true，
#   ⛔ 但 `>= "2026-08-30"` 對**同一天稍早**更新的票會誤判 ——
#   ⭐ 而更糟的是：上一版的 tag 就在今天 ⇒ 撈到 **0 張**，
#   而結果讀起來是「這一版沒有玩家可見的改動」（⛔ 又一個空轉的綠燈）。
# ⇒ 用 tag 自己的時間戳，並**往前抓一天**當緩衝。
# ⚠️ ⭐ 這只是**候選**（省 gh 呼叫），⛔ 不是「這一版做了它」的證據 ——
#   那個問題在下面的「這張票在這一版嗎」才被問（GH#1021）。
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

# ── ⭐⭐ 這張票**在這一版嗎**？（GH#1021）─────────────────────────────────
#
# ⛔ 在此之前這個問題**從來沒被問過**。上面的 `updatedAt` 是候選，⛔ 不是答案 ——
#   而下面的祖先檢查只管「**這一句**要不要發」，⛔ 不管「**這張票**在不在這一版」：
#   · 玩家句為空        ⇒ 祖先檢查整段跳過 ⇒ 直接落進 MISSING（#838 就是這樣）
#   · 玩家句的 commit 是**上一版**的 ⇒ 句子被清空 ⇒ ⛔ 然後**照樣落進 MISSING**（#971／#916）
#   ⇒ 2026-09-05 v0.39.0：三張 09-02／09-03 關的票擋住公告，理由是「沒寫玩家那一句」——
#     ⭐ 而其中兩張早就寫了，只是那一句屬於上一版。
#
# ⭐ 判準是**關係**，⛔ 不是名詞：「這張票**被 SINCE..NOW 裡的某個 commit 指名**」
#   （commit 訊息含 `#N`）**或**「它進度標記裡的 commit **落在** SINCE..NOW」。
#   ⚠️ 第二條不可省：#916 的 commit 在 v0.37.2..v0.38.0 裡，⛔ 而那個區間沒有任何 commit 訊息提到 #916
#   ⇒ 只看 commit 訊息會把 v0.38.0 那一行黑龍波弄丟（驗收第 2 條就是為了它）。
# ⛔ 不改成「只掃 closed」（上面 49 行說了為什麼）、⛔ 不放寬「沒寫玩家句就不發」那條閘。
SCOPE="${GGD_PLAYERNOTE_SCOPE:-commits}"
case "$SCOPE" in commits|updated) :;; *) echo "⛔ GGD_PLAYERNOTE_SCOPE 只收 commits|updated（收到「${SCOPE}」）" >&2; exit 2;; esac
NAMED=$(git log --format='%s%n%b' "${SINCE}..${NOW}" 2>/dev/null | grep -oE '#[0-9]+' | sort -u | tr '\n' ' ')
trace() { [ "${GGD_PLAYERNOTE_TRACE:-0}" = 1 ] && echo "🔎 #$1 sha=${2:--} → $3" >&2; return 0; }
# ⭐ 一顆 commit 在 SINCE..NOW 裡 ⇔ 是 NOW 的祖先 **且** 不是 SINCE 的祖先
in_range() { git cat-file -e "$1" 2>/dev/null && git merge-base --is-ancestor "$1" "$NOW" 2>/dev/null && ! git merge-base --is-ancestor "$1" "$SINCE" 2>/dev/null; }

LINES=""; MISSING=""; UNSCOPED=""; DECLARED=""; DUP=""

# ⛔⛔ **第二個資料來源：這一版的 commit 真的動了什麼**（owner 2026-09-09 揪到）
#
# ⭐ 根因鏈（三環，量到的）：
#   ① 這支腳本**只讀票的進度標記** —— 它的整個宇宙是「票說了什麼」，
#      ⛔ 不是「這一版出貨了什麼」。沒有人寫 ⇒ 它就以為沒事發生。
#   ② 被擋住時它給兩個出口（寫一句／答「無」）⇒ ⭐ 最便宜的是「無」，
#      而我一次答了 13 張。**這道閘把人訓練成發罐頭。**
#   ③ ⭐ 而帳本本身是**窄的**：117 列裡 63 列罐頭；54 句真內容中
#      介面 14 · 戰鬥 13，⛔ 而「角色上架／造型」只有 **1** 句、編輯器 3、效能 3。
#      ⇒ 讀著它長大的人（我）就把「玩家看得到」學成了「戰鬥或按鈕」。
#
# ⭐ 量到的代價：**v0.41.5 有 26 顆玩家面向的 commit，而它發出去的是「系統優化更新」。**
#
# ⇒ 這一段問 commit：出貨程式碼動了而沒有人寫一句 ⇒ ⛔ 擋下，並**把那幾行印出來**。
#   ⚠️ ⭐ 它刻意**印出 commit 標題**：⛔ 答「無」之前你得先看見這一版做了什麼。
PLAYER_SCOPES='client|render|ui|sim|economy|hero|community|editor|icons|forge|game|ugc|draft|templates|assets'
SHIPPED=$(git log --format='%s' "${SINCE}..${NOW}" 2>/dev/null \
  | grep -E "^(feat|fix)\((${PLAYER_SCOPES})\)" || true)
SHIPPED_N=$(printf '%s' "$SHIPPED" | grep -c . || true)
for N in $CLOSED; do
  # ⭐ title＋comments **一次**撈完（在此之前每張票打 2–3 次 gh：50 張 58 秒）
  # ⭐ `GGD_PLAYERNOTE_CACHE=<dir>` —— **補發專用**的唯讀快取（GH#1152）。
  #   ⚠️ 為什麼需要它：這一段對**每一張候選票**打一次 `gh issue view`（約 1–2 秒）。
  #     一次 21 版的補發 ＝ 21 × 約 50 張 ⇒ ⭐ 實測**單一版本就跑不完 600 秒**。
  #   ⛔ 它**不是**預設 —— 平時一版一發時票是活的，快取會讓一則剛寫好的進度標記讀不到。
  #   ⭐ 補發時票是**靜止**的（那幾版早就出貨了），所以快取在那個情境下是等價的。
  _CJ="${GGD_PLAYERNOTE_CACHE:+${GGD_PLAYERNOTE_CACHE}/${N}.json}"
  if [ -n "$_CJ" ] && [ -s "$_CJ" ]; then
    J=$(cat "$_CJ")
  else
    J=$(gh issue view "$N" --json title,comments 2>/dev/null) || continue
    [ -n "$_CJ" ] && { mkdir -p "${GGD_PLAYERNOTE_CACHE}"; printf '%s' "$J" > "$_CJ"; }
  fi
  RAW_T=$(printf '%s' "$J" | jq -r '.title // ""')
  # ⚠️ ⭐ 只讀**最新一則進度標記**，⛔ 不是「所有留言裡第一個命中的」：
  #   2026-08-30 量到 —— 我把 #866 的玩家那一句**清空**（它是後台的事，玩家無感），
  #   而反序 join 後 `grep -m1` 就往下找到了**上一則**的舊句子
  #   ⇒ ⭐ 一句已經被撤回的話又被發出去。**撤回要真的撤得掉。**
  B=$(printf '%s' "$J" | jq -r '[.comments[].body] | reverse | .[]' \
        | awk '/🧭 進度標記/{f=1} f{print} f&&/^---$/{exit}')
  # ⛔⛔ **這一行在此之前是 `[ -n "$B" ] || continue`**（2026-09-09 owner 揪到）：
  #   沒有進度標記的票**整個消失** ⇒ ⭐ 它既不進 `LINES`，也**不進 `MISSING`**
  #   ⇒ 那道「有玩家可見的票卻沒寫玩家句 ⇒ ⛔ 不發」的閘**看不到它**
  #   ⇒ fallback 誠實地印「這一版**真的**沒有玩家可見的票」——⛔ **而那是假的**。
  #
  # ⚠️ ⭐ 代價量到了：**v0.41.0–v0.42.15 共 21 版，Discord 收到的全是罐頭**，
  #   其中至少 3 版真的有玩家看得到的東西（v0.41.5 的新減益「連段拘束」·
  #   v0.42.9 的三選一背包滿標示 · v0.42.13 的 107 張圖示重畫）。
  #
  # ⭐ 而這支腳本**自己的註解**（下面那段）逐字寫著相反的意圖：
  #   「⚠️ ⭐『沒有標記』的那一種**仍然要求** —— 那可能是一次真的落地而沒人寫標記,
  #     ⛔ 正是這條閘的用途。」
  #   ⇒ ⭐ **意圖與實作對不上，而中間隔著這一行 `continue`。**
  #
  # ⇒ 沒有標記 ⇒ `P` 與 `SHA` 都空，⭐ 而它**繼續往下走**：
  #   `named`（commit 提到它）就有資格被要求一句玩家的話。
  if [ -z "$B" ]; then P=""; SHA=""; fi
  [ -n "$B" ] && P=$(printf '%s' "$B" | grep -m1 '🎮 玩家看得到的' | sed 's/.*）\*\*：//') || P=""
  # ⭐ 標記寫「無（…）」／「—」＝這張票玩家看不到 ⇒ ⛔ 不發那一行
  #   （⛔ 不要把「無（後台的事）」發成一行公告；2026-09-06 第一波 13 張這樣寫）
  #
  # ⛔⛔ **而在此之前它與「根本沒寫」被判成同一件事**（2026-09-09 owner 揪到的第二層）：
  #   下面那道閘的訊息**自己**逐字寫著「兩種都要人回答，⛔ 不可以預設成後者」——
  #   ⭐ 而寫了「無（後台的事）」的人**已經回答了**。把他的答案當成沒回答 ⇒
  #   ⭐ 這道閘變成**答不出來的**：唯一的出路是去改票的**類型標籤**（把 [fix] 拿掉），
  #     ⛔ 而那是為了讓閘閉嘴去竄改一張票 —— 一次比沉默更糟的失真。
  #
  # ⚠️ ⭐ 量到的代價：v0.41.0–v0.42.15 之間 **14/22 版**被這道閘擋住，
  #   而擋住它們的 18 張票裡**絕大多數是 infra／編輯器／測試** ——
  #   ⇒ 正確答案是「人說一聲：這張玩家看不到」，⛔ 不是改標籤、也⛔ 不是編一句假話。
  #
  # ⇒ ⭐ 拆成兩個變數：`P`（要發的那一句）與 `ANS`（**人答過了沒**）。
  ANS=""
  case "$P" in 無*|—*|-) ANS=declared; P="";; "") ANS="";; esac
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
  [ -n "$B" ] && SHA=$(printf '%s' "$B" | grep -m1 -oE '\| \*\*commit\*\* \| `?[0-9a-f]{7,40}`?' | grep -oE '[0-9a-f]{7,40}' || true) || SHA=""
  # ⭐ 這張票在這一版嗎？（兩個證據任一；⛔ 都沒有 ⇒ 它是別的版本的，⛔ 不進任何一欄）
  if [ "$SCOPE" = commits ]; then
    case " $NAMED " in *" #$N "*) IN=named;; *) IN="";; esac
    [ -n "$IN" ] || { [ -n "$SHA" ] && in_range "$SHA" && IN=landed; }
    [ -n "$IN" ] || { trace "$N" "$SHA" "drop（不在 ${SINCE}..${NOW}）"; continue; }
  fi
  WHY=""
  # ⭐ 那一句對應的 commit 有沒有**落在這一段**？（⛔ 不然舊版的會一直重發）
  if [ -n "$P" ]; then
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
      P=""; WHY="unscoped"
    fi
  fi
  T=$(printf '%s' "$RAW_T" | sed 's/\[[^]]*\]//g' | sed 's/^ *//')
  # ⛔⛔ **這一句已經公告過了嗎？**（2026-09-09 量到，⭐ 同一天發生兩次）
  #
  # ⚠️ 玩家那一句住在**票**上，⛔ 而票會被再次動到（補標記、改 commit、關票）
  #   ⇒ ⭐ 它會落進**下一版**的區間，於是同一句話被發第二次。
  #   實例：#1129 的「107 張舊畫風的圖示重畫了」在 v0.42.13 發過，
  #   而我把它的進度標記 commit 更新成本輪的稽核 commit ⇒ v0.42.17 **又發了一次**。
  #
  # ⭐ 而分辨它**不需要新資訊**：帳本 `_announced.tsv` 第三欄就記著「哪一版發過哪一句」。
  #   ⇒ 這支腳本一直**答得出來**，⛔ 只是沒有人問它。
  #
  # ⚠️ ⭐ 比對的是**前 60 個字元**（帳本第三欄就是那樣切的，見下面記帳那一段）——
  #   ⛔ 不是整句：帳本存的本來就是截短的。
  if [ -n "$P" ]; then
    _LG0="${GGD_ANNOUNCE_LEDGER:-docs/_release/_announced.tsv}"
    _HEAD=$(printf '%s' "$P" | python3 -c 'import sys;print(sys.stdin.read().replace("\t"," ")[:60].strip())' 2>/dev/null || true)
    # ⛔⛔ **⛔ 不可以把「這一版自己那一列」算成重複**（2026-09-09 當場踩到）：
    #   一次刻意的補發（`--until v0.42.13` 而帳本第 v0.42.13 列就是那一句）
    #   會被自己擋掉 ⇒ ⭐ **真內容退化成罐頭**，而且帳本被罐頭覆寫回去。
    #   ⇒ 只比對**別的版號**那幾列。
    _PREVROWS=$(awk -F'\t' -v now="$NOW" '$1!=now{print $3}' "$_LG0" 2>/dev/null || true)
    if [ -n "$_HEAD" ] && [ -f "$_LG0" ] && printf '%s\n' "$_PREVROWS" | grep -qxF "$_HEAD"; then
      DUP="${DUP}  · #$N ${P}
"
      trace "$N" "$SHA" "dup（這一句帳本上已經發過）"
      P=""; WHY="dup"
    fi
  fi
  if [ -n "$P" ]; then
    LINES="${LINES}- ${P}
"
    trace "$N" "$SHA" lines
  else
    # ⭐ 只有**玩家看得到的類型**才算漏；infra/test/docs 本來就不該有
    case "$RAW_T" in
      *"[feature]"*|*"[fix]"*|*"[improve]"*|*"[bug]"*)
        # ⭐⭐ GH#1109 —— 「被 commit 提到」⛔ 不等於「這一版改了它」。
        #
        # ⚠️ `IN=named` 的意思只是**票號出現在這一段的某一則 commit 訊息裡**
        #   （`Refs #NNN`）。而一個**純驗收／協作／記帳**的版本必然會提到一堆票 ——
        #   ⇒ ⛔ 那些票會被判成「有玩家看得到的改動而沒人寫玩家那一句」,
        #   而正確答案是**第三個**：這一版沒有改它們。
        #
        # ⚠️ ⭐ 連續三版撞到（v0.40.3 · v0.40.8 · v0.41.0）,每一次都要人手動
        #   `GGD_PLAYERNOTE_NO_GH=1` 繞過去 —— ⛔ 而一個要人記得繞過的閘,
        #   下一次就會被繞過**在它該說話的時候**。
        #
        # ⇒ ⭐ 判準改成 `IN=landed`：那張票的**進度標記的 commit** 真的落在
        #   `SINCE..NOW`。⛔ `named` 仍然收得進 `LINES`（有寫玩家句就發它）,
        #   ⭐ 只是它**不再有資格要求**一句。
        # ⭐ 判準：`named`（只是被 commit 提到）＋ 進度標記的 commit **不在這一段**
        #   ⇒ 這一版沒有改它。⚠️ ⭐ 「沒有標記」的那一種**仍然要求** ——
        #   那可能是一次真的落地而沒人寫標記,⛔ 正是這條閘的用途。
        # ⚠️ ⭐ `${IN:-}` 是必要的,⛔ 不是防禦性寫法：這支腳本是 `set -u`,
        #   而 `IN` **只在 `SCOPE=commits` 那一段被賦值** ——
        #   `SCOPE=updated`（舊行為）從來不進那一段 ⇒ 裸的 `$IN` 會讓整支在**第一張票**就死
        #   （`line 171: IN: unbound variable`）。
        #   ⭐ 2026-09-09 我就是這樣弄壞了 `releaseNotePlayersRange.test.ts` 的**校準**斷言,
        #   而我先前**只在 `commits` scope 測過** —— ⛔ 一把只驗過單邊的尺。
        if [ "${IN:-}" = named ] && [ -n "$SHA" ] && ! in_range "$SHA"; then
          trace "$N" "$SHA" "skip（只是被 commit 提到,這一版沒有改它 —— GH#1109）"
        elif [ "${WHY:-}" = dup ]; then
          # ⭐ 它**發過了** —— ⛔ 那不是「沒寫玩家句」,⛔ 不可以擋住這一版的公告。
          trace "$N" "$SHA" "dup ⇒ ⛔ 不進 MISSING"
        elif [ "$ANS" = declared ]; then
          # ⭐ 人**答過了**：這張票玩家看不到 ⇒ ⛔ 不進 MISSING（它不擋公告）,
          #   ⭐ 但仍然印出來 —— 一個被靜默吞掉的答案與沒有答案長得一樣。
          DECLARED="${DECLARED}  · #$N $T
"
          trace "$N" "$SHA" "declared-none（人答過：這張票玩家看不到）"
        else
        MISSING="${MISSING}  · #$N $T
"
        trace "$N" "$SHA" "missing${WHY:+ ($WHY)}"
        fi;;
      *) trace "$N" "$SHA" "skip（不是玩家看得到的類型${WHY:+，$WHY}）";;
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
  # ⭐⭐ GH#976 —— **「沒有玩家可見的改動」與「沒有人寫那一句」是兩件事。**
  #
  # owner 2026-09-04（逐字）：
  #   > 「discord 不要老是 系統優化更新⋯明明每個版本都有些對玩家的影響
  #   >   例如 tab 鍵可以看到全部角色狀態了 之類 你為何會退化成都沒有更新訊息」
  #
  # ⛔ 在此之前這個 fallback 對**兩種情況**發同一句話：
  #   (a) 這一版真的沒有玩家可見的改動 ⇒ ⭐ 發它是**對的**（owner 2026-08-30 的常設指令）
  #   (b) 這一版**有** N 張 feature/fix/improve 的票，⛔ 而沒有一張寫了玩家那一句
  #       ⇒ ⭐⭐ 這時候發「例行維護」是一句**假話** —— 玩家那一版真的多了東西。
  #
  # ⚠️ ⭐ 而分辨它們**不需要新資訊**：`MISSING` 在上面第 111 行就算好了。
  #   ⇒ 這支腳本一直**知道**自己在說謊，⛔ 只是沒有人問它。
  #
  # ── ⭐ 為什麼是 `exit 1` 而不是再印一行警告 ──────────────────────────────
  # ⚠️ 同一支腳本對「玩家句裡有**實作細節**」是 `exit 1` **不發**，
  # ⛔ 而對「**一句都沒有**」只印一行警告然後照發 —— ⭐ 兩個失敗，相反的待遇，
  #   而被放過的那一個產出的是**假話**（第一·五守則：⛔ 不放任何無效說明）。
  # ⇒ 對齊成同一個待遇。⛔ 它擋的是**發公告**，⛔ 不是部署（BMPNDD 的 D 是另一步）。
  # ⛔⛔ **出貨程式碼動了，而沒有人寫一句** —— ⭐ 這一條問的是 commit，⛔ 不是票。
  if [ "${SHIPPED_N:-0}" -gt 0 ]; then
    echo
    echo "⛔⛔ 這一版有 **${SHIPPED_N} 顆玩家面向的 commit**，⛔ 而沒有一句玩家公告 ——"
    echo "   ⇒ ⭐ 這時候發「系統優化更新」是**假話**，⛔ 不發。"
    printf '%s\n' "$SHIPPED" | sed 's/^/  · /' | head -30
    echo
    echo "  ⭐ 玩家想知道的**不只是戰鬥**（owner 2026-09-09 逐字舉的例）："
    echo "     · 動畫更順了嗎        · 網路更快響應了嗎"
    echo "     · 編輯器多支援什麼    · 哪些角色**設計好了正在審查**"
    echo "     · 哪些角色**上架成功**  · 哪些角色**換了造型**"
    echo "  ⚠️ ⛔ 不要只挑「戰鬥／按鈕」那一類 —— 帳本上歷史句子就是這樣偏的"
    echo "     （117 列裡「角色上架／造型」只有 1 句），⭐ 而那份偏見會傳染給下一個人。"
    echo
    echo "  ⇒ 補：bash scripts/ticket-progress.sh write <票號> … --player \"<一句玩家看得懂的話>\""
    echo "  ⇒ 真的一顆都不影響玩家 ⇒ 答一聲：--player \"無（<為什麼>）\"（⭐ 要看過上面那幾行再答）"
    exit 1
  fi

  if [ -n "$MISSING" ]; then
    echo
    echo "⛔⛔ 這一版有**玩家看得到**的票，⛔ 而沒有一張寫了玩家那一句 ——"
    echo "   ⇒ ⭐ 這時候發「系統優化更新」是**假話**，⛔ 不發。"
    printf '%s' "$MISSING"
    echo "  ⇒ 補（一張就夠，⛔ 不必每一張都補）："
    echo "     bash scripts/ticket-progress.sh write <票號> --state 完成 \\"
    echo "       --baseline … --next … --commit <sha> --player \"<一句玩家看得懂的話>\""
    echo "  ⚠️ ⭐ 真的玩家看不到（infra／編輯器／測試／文件）⇒ ⭐ **答一聲**就好："
    echo "     bash scripts/ticket-progress.sh write <票號> … --player \"無（<為什麼玩家看不到>）\""
    echo "     ⭐ 那算**回答過**，⛔ 不擋公告 —— ⛔ 不必為了讓這道閘閉嘴去改票的類型標籤。"
    echo "  ⇒ 兩種都要人回答，⛔ 不可以預設成後者。"
    exit 1
  fi
  LINES="- 系統優化更新：穩定性與速度的例行維護。
"
  echo "  （這一版**真的**沒有玩家可見的票 ⇒ ⭐ 發**系統優化更新**，owner 2026-08-30）"
  printf '%s' "$LINES"
else
  printf '%s' "$LINES"
fi

# ⚠️ ⭐ fail-loud（負一）：**這一句帳本上已經發過** —— ⛔ 不重複發，⭐ 但要說出來
if [ -n "$DUP" ]; then
  echo
  echo "ℹ️ 這幾句**已經在更早的版本公告過** ⇒ ⛔ 不重複發（⭐ 票被再次動到才落進這一版）："
  printf '%s' "$DUP"
fi

# ⚠️ ⭐ fail-loud（〇）：**人答過「這張票玩家看不到」**的那幾張 —— ⛔ 它們不擋公告
#   ⭐ 但要印出來：一個被靜默吞掉的答案，與**沒有答案**長得一模一樣。
if [ -n "$DECLARED" ]; then
  echo
  echo "ℹ️ 這幾張**人答過了**「玩家看不到」（進度標記寫「無（…）」）——⛔ 不擋公告："
  printf '%s' "$DECLARED"
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
    echo "✓ 已發到 Discord（HTTP ${CODE}）"
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
      # ⛔⛔ **補發時要更新那一列，⛔ 不是跳過**（2026-09-09 量到）：
      #   在此之前這裡一律是 `grep -q … || printf … >>` ⇒ ⭐ **已經在帳本上的版號永遠不會被改**。
      #   ⇒ 一次 `GGD_ANNOUNCE_FORCE=1` 的補發把**真的內容**發了出去，
      #     ⛔ 而帳本第三欄還留著那句被取代掉的罐頭 ——
      #   ⭐ 於是下一個讀帳本的人（含我自己）會得出「那一版本來就沒有玩家可見的改動」。
      #   ⚠️ 那正是本 repo 一再記錄的形狀：**一個看起來已經量過的東西，量的不是你以為的那個。**
      # ⇒ ⭐ 只有 `GGD_ANNOUNCE_FORCE=1`（＝明確的補發）才覆寫既有列；平常照舊只追加。
      TAGS_IN_RANGE=$(git tag --sort=v:refname | awk -v a="$SINCE" -v b="$NOW" '
            $0==a{seen=1; next} seen{print} $0==b{exit}')
      # ⭐ 邏輯住 `tools/release/ledger_merge.py`（⛔ 不是這裡的一段 heredoc）——
      #   一段沒有辦法被單獨呼叫的邏輯，只能靠「真的發一次」來驗。
      python3 tools/release/ledger_merge.py "$LEDGER" "$TODAY" "${FIRSTLINE:-玩家公告}" \
        "${GGD_ANNOUNCE_FORCE:-0}" $TAGS_IN_RANGE "$NOW"
      echo "  ✓ 已記進 $LEDGER"
    fi
    ;;
  *)   echo "⛔ 發布失敗 HTTP ${CODE}：$(head -c 200 /tmp/dc.out)" >&2; exit 1;;
esac

#!/usr/bin/env bash
# owner 給了一個裁決 → **一個動作同時寫進票與帳本**。
#
# owner 2026-08-20：
#   「可不可以**每次我回答你以後，就馬上去更新 github issue 的內容**，
#    避免我要重複講，作為**開發守則**」
#
# ⚠️ 為什麼要做成指令：這條在 2026-08-20 之前是散文，而它失效了**四次** ——
# 同一個問題（吞噬內部冷卻）我問了三遍以上，而答案就寫在我自己的
# `docs/_daily/2026-08-19.md:116`。⇒ 問題不是「不知道要記」，是**記錄的成本高於當下的注意力**。
# 這支腳本把成本壓到一行，跳過它就沒有藉口。
#
#   bash scripts/ruling.sh 419 <<'EOF'
#   吞噬改被動要一個內部冷卻的數字 => 已經跟你說過了 跟主動一樣就好
#   EOF
#
#   bash scripts/ruling.sh 404,423 <<'EOF'   # 一個裁決同時管多張票
#   yes，跟殭屍一樣只是不會移動，加上屬於施展技能方，加上有生命週期時限
#   EOF
set -uo pipefail

# ⭐ 任何一次 gh 寫入失敗都要讓**離開碼**說出來 —— 第二守則:fail-open 沒錯,**靜默**才是缺陷。
FAILED=0
cd "$(dirname "$0")/.."
[ $# -lt 1 ] && { echo "用法: $0 <票號[,票號…]> [<<'EOF' 逐字原話 EOF]" >&2; exit 2; }

ISSUES="$1"; shift
TEXT="$(cat)"
[ -z "${TEXT// }" ] && { echo "⛔ 沒有內容 —— 裁決要**逐字**貼進來,⛔ 不要憑印象改寫" >&2; exit 2; }

# ⭐ GH#1028 A：帳本的列鍵是**訊息時間**（`message-ledger.sh` 檔頭 :16-17 自己宣告的鍵），
#   ⛔ 不是我跑這支指令的時間。在此之前兩個寫入端用**不同的時間**當鍵 ⇒ 同一句話兩列、
#   一列永遠 ⏸ 未對票 ⇒ 隔天 `msgledger:check` 必紅（2026-09-06 量到三對）。
# ⭐ 解析 transcript 的程式**只有一份**（`message-ledger.sh --find-time`），這裡只是問它；
#   找不到（太短、還沒進 transcript、離線）⇒ 退回執行時間，⛔ 但要**說出來**。
# ⚠️ 測試模式（`GGD_LEDGER_DIR` 指到暫存目錄）預設**不掃**真的 12GB transcript；
#   守衛要驗就給 `GGD_TRANSCRIPT_DIR` 一份假的。`GGD_RULING_MSGTIME_OFF=1` 一律用執行時間（回頭的開關）。
MSG_DAY=""; MSG_HHMM=""
if [ "${GGD_RULING_MSGTIME_OFF:-0}" != "1" ] && { [ -n "${GGD_TRANSCRIPT_DIR:-}" ] || [ -z "${GGD_LEDGER_DIR:-}" ]; }; then
  FOUND="$(bash scripts/message-ledger.sh --find-time "$TEXT" 2>/dev/null)" || FOUND=""
  if [[ "$FOUND" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})\ ([0-9]{2}:[0-9]{2})$ ]]; then
    MSG_DAY="${BASH_REMATCH[1]}"; MSG_HHMM="${BASH_REMATCH[2]}"
  fi
fi
if [ -n "$MSG_HHMM" ]; then
  NOW="$MSG_DAY $MSG_HHMM"; TODAY="$MSG_DAY"; ROW_TIME="$MSG_HHMM"
  echo "  ⏱ 列鍵＝訊息時間 ${NOW}（transcript）"
else
  NOW="$(date '+%Y-%m-%d %H:%M')"; TODAY="$(date '+%Y-%m-%d')"; ROW_TIME="$(date '+%H:%M')"
  echo "  ⏱ transcript 裡找不到這句原話 ⇒ 列鍵退回**執行時間** ${NOW}（⚠️ 建置器補列時會靠 15 分鐘窗併掉）"
fi
# ⛔⛔ **不要寫死 `/private/tmp`** —— 那是 **macOS 專屬**的路徑（`/tmp` 是它的 symlink）。
#   在 Linux 上 `/private` 根本不存在,而且非 root **建不出來**（實測 EACCES）
#   ⇒ 下面那幾個 `> …` 重導**靜靜失敗**（這支刻意沒有 `set -e`）
#   ⇒ `gh --body-file` 拿到一個不存在的檔 ⇒ ⭐ **票沒被更新,而離開碼仍然是 0**。
#   （GH#979,2026-09-05 在 CI 上量到:`ENOENT … edit-body.md`。同族:host-deploy.sh:609）
TMPD="${TMPDIR:-/tmp}"; TMPD="${TMPD%/}"
DAY="${GGD_LEDGER_DIR:-docs/_daily}/${TODAY}.md"   # 測試用;出貨一律 docs/_daily
QUOTED="$(printf '%s\n' "$TEXT" | sed 's/^/> /')"

IFS=',' read -ra NS <<< "$ISSUES"
for n in "${NS[@]}"; do
  n="${n// /}"

  # ① 逐張票留言(時間軸:第幾次講的、什麼時候講的)
  printf '## ⭐ owner 裁決 %s（逐字）\n\n%s\n\n---\n⚠️ 由 `scripts/ruling.sh` 在**收到當下**寫入 —— ⛔ 不要再就這一點詢問 owner。\n若這則裁決推翻了票裡先前的內容,以**本則為準**（第〇·六守則：同一層新的贏）。\n' \
    "$NOW" "$QUOTED" > "$TMPD/ruling-body.md" \
    || { echo "⛔ 寫不進 $TMPD —— 裁決一個字都沒送出" >&2; exit 2; }
  # ⭐ 閘 D：**票不存在就當場停**，⛔ 不是寫失敗印一行警告然後照樣說「兩處都寫了」。
  # 前科 2026-08-21：`ruling.sh 500` 對一張**根本不存在**的票跑完，兩次 gh 寫入都失敗、
  # 兩行警告都印了，而最後一行仍然說「⭐ 兩處都寫了」且**離開碼 0** ——
  # 於是那則裁決只活在當日帳本裡，release note 的 `#500` 連結是 **404**。
  if ! gh issue view "$n" --json number >/dev/null 2>&1; then
    echo "  ⛔ #$n **這張票不存在** —— 先 \`gh issue create\` 開票再跑一次" >&2
    FAILED=$((FAILED + 1)); continue
  fi
  if gh issue comment "$n" --body-file "$TMPD/ruling-body.md" >/dev/null 2>&1; then
    echo "  ✓ #$n 留言"
  else
    echo "  ⛔ #$n 留言失敗" >&2; FAILED=$((FAILED + 1))
  fi

  # ②（閘 C）**同一則也要前置到 body 最上面**。
  #
  # ⛔ 這一步以前不存在,而那正是「為何每次都拿到錯的資訊」的機制:
  # `gh issue view N` **只印 body**,留言要 `--comments`。於是 owner 的更正躺在留言裡、
  # **原始的錯誤留在 body**,下一輪 agent 讀到的是錯的那一份。
  # (實例:#447/#446 的 body 至今仍寫「Lv18 中位有效血量 9,048」,而更正只在留言。)
  #
  # ⚠️ 先取回原 body 再**前置**,⛔ 不是覆蓋 —— 第一·五守則:另存/保留,⛔ 不是壓縮取代。
  # ⚠️ 取不回來就**整步跳過**:一個只含更正區塊的 body 會把整張票的原文洗掉,
  #    而那是不可逆的(GitHub body 沒有版本控制在我們手上)。
  BODY_OUT="$TMPD/ruling-issue-body-$n.md"
  if OLD="$(gh issue view "$n" --json body --jq '.body' 2>/dev/null)"; then
    {
      printf '## ⛔ 已被更正（%s）：以下面這則 owner 逐字裁決為準\n\n%s\n\n' "$TODAY" "$QUOTED"
      printf '⚠️ 由 `scripts/ruling.sh` **前置到 body 最上面** —— 因為 `gh issue view %s` 只印 body,\n' "$n"
      printf '留言要 `--comments`。**只活在留言裡的更正等於不存在。**\n'
      printf '⛔ 下面的原文一個字都沒有刪(第一·五守則:另存/保留,⛔ 不是壓縮取代);\n'
      printf '它與本塊衝突時,以**本塊**為準(第〇·六守則:同一層新的贏)。\n\n---\n\n'
      printf '%s\n' "$OLD"
    } > "$BODY_OUT"
    if gh issue edit "$n" --body-file "$BODY_OUT" >/dev/null 2>&1; then
      echo "  ✓ #$n body 已前置更正"
    else
      echo "  ⛔ #$n body 更新失敗(原文未被動到) —— 手動貼: $BODY_OUT" >&2; FAILED=$((FAILED + 1))
    fi
  else
    echo "  ⛔ #$n 讀不到原 body —— **跳過 body 更新**,⛔ 不可以用只含更正的內容覆蓋原文" >&2; FAILED=$((FAILED + 1))
  fi
done

# ② 同一則也進當日帳本(context 斷掉之後唯一還讀得到的地方)
#
# ⛔ **這裡以前是 `>> "$DAY"`,而那是一個 bug**:它用 `grep -q '^## 逐則對票'`
# 確認表格存在,然後把新列附加到**檔尾** —— 於是 2026-08-20 的七則裁決落在
# `## ⏸️ 真正還卡在你身上的` 那張兩欄表底下與檔尾一段沒有表頭的孤兒表格,
# 兩處都在 `## 逐則對票` 區段外面,`gen_board.py` 的 `section()` 一列都讀不到。
# ⇒ 插入位置交給 `scripts/ledger_table.py`(與 message-ledger.sh 共用同一份邏輯)。
# ⭐ 列鍵 `$ROW_TIME` ＝ 訊息時間（GH#1028 A，上面決定的）；ledger_table.py 再以「文字相同且時間相近」
#   找既有列 —— 建置器先補過列 ⇒ 這裡只併票號，⛔ 不多一列。
printf '%s' "$TEXT" | python3 scripts/ledger_table.py \
  "$DAY" "$ROW_TIME" "$(echo "$ISSUES" | tr ',' ' ' | sed 's/\([0-9]\+\)/#\1/g')"

# ③ ⭐ 帳本是 `board:roll` 與 `board:build` 的**輸入** —— 寫入端自己重生成（GH#1026 ①）。
#
# ⛔ 在此之前這裡沒有這一段:每記一次裁決,`docs/_daily` 就變,兩支 board 的產物就過期,
#   `skills:check`（⇒ CI 的 contract job）就紅一次 —— 2026-09-06 一夜紅了**三次**,
#   ⭐ 而三次擋的都是 **Codex 的 PR**,⛔ 不是寫入端自己。
# ⭐ 步驟清單與「什麼時候不跑」**只有一份**:`ledger_table.regenerate_boards()` —— 三個寫入端
#   （這裡 · `ledger_table.py --map/--dedupe` · `message-ledger.sh` 建置）共用它。走 `genrun.sh`
#   （解鎖→跑→重鎖）,⛔ 不直接叫產生器。
# ⚠️ 測試模式（`GGD_LEDGER_DIR` 指到暫存目錄 ⇒ 帳本不在 docs/_daily）預設**不跑**真的產生器；
#   守衛要驗「有沒有叫」就給 `GGD_GENRUN` 一支 stub。`GGD_LEDGER_NO_REGEN=1` 一律跳過。
python3 scripts/ledger_table.py --regen "$DAY"
echo
if [ "$FAILED" -gt 0 ]; then
  echo "⛔ 帳本寫了,但**票沒寫全**($FAILED 次 gh 寫入失敗) —— ⚠️ 只活在帳本裡的裁決,下一輪讀不到。" >&2
  exit 1
fi
echo "⭐ 兩處都寫了。⛔ 這一點以後不要再問 owner —— 要查就跑 scripts/asked-before.sh"

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
cd "$(dirname "$0")/.."
[ $# -lt 1 ] && { echo "用法: $0 <票號[,票號…]> [<<'EOF' 逐字原話 EOF]" >&2; exit 2; }

ISSUES="$1"; shift
TEXT="$(cat)"
[ -z "${TEXT// }" ] && { echo "⛔ 沒有內容 —— 裁決要**逐字**貼進來,⛔ 不要憑印象改寫" >&2; exit 2; }

NOW="$(date '+%Y-%m-%d %H:%M')"
TODAY="$(date '+%Y-%m-%d')"
DAY="${GGD_LEDGER_DIR:-docs/_daily}/${TODAY}.md"   # 測試用;出貨一律 docs/_daily
QUOTED="$(printf '%s\n' "$TEXT" | sed 's/^/> /')"

IFS=',' read -ra NS <<< "$ISSUES"
for n in "${NS[@]}"; do
  n="${n// /}"

  # ① 逐張票留言(時間軸:第幾次講的、什麼時候講的)
  printf '## ⭐ owner 裁決 %s（逐字）\n\n%s\n\n---\n⚠️ 由 `scripts/ruling.sh` 在**收到當下**寫入 —— ⛔ 不要再就這一點詢問 owner。\n若這則裁決推翻了票裡先前的內容,以**本則為準**（第〇·六守則：同一層新的贏）。\n' \
    "$NOW" "$QUOTED" > /private/tmp/ruling-body.md
  if gh issue comment "$n" --body-file /private/tmp/ruling-body.md >/dev/null 2>&1; then
    echo "  ✓ #$n 留言"
  else
    echo "  ⛔ #$n 留言失敗" >&2
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
  BODY_OUT="/private/tmp/ruling-issue-body-$n.md"
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
      echo "  ⛔ #$n body 更新失敗(原文未被動到) —— 手動貼: $BODY_OUT" >&2
    fi
  else
    echo "  ⛔ #$n 讀不到原 body —— **跳過 body 更新**,⛔ 不可以用只含更正的內容覆蓋原文" >&2
  fi
done

# ② 同一則也進當日帳本(context 斷掉之後唯一還讀得到的地方)
#
# ⛔ **這裡以前是 `>> "$DAY"`,而那是一個 bug**:它用 `grep -q '^## 逐則對票'`
# 確認表格存在,然後把新列附加到**檔尾** —— 於是 2026-08-20 的七則裁決落在
# `## ⏸️ 真正還卡在你身上的` 那張兩欄表底下與檔尾一段沒有表頭的孤兒表格,
# 兩處都在 `## 逐則對票` 區段外面,`gen_board.py` 的 `section()` 一列都讀不到。
# ⇒ 插入位置交給 `scripts/ledger_table.py`(與 message-ledger.sh 共用同一份邏輯)。
printf '%s' "$TEXT" | python3 scripts/ledger_table.py \
  "$DAY" "$(date '+%H:%M')" "$(echo "$ISSUES" | sed 's/[0-9]\+/#&/g')"
echo
echo "⭐ 兩處都寫了。⛔ 這一點以後不要再問 owner —— 要查就跑 scripts/asked-before.sh"

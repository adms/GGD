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
DAY="docs/_daily/$(date '+%Y-%m-%d').md"
QUOTED="$(printf '%s\n' "$TEXT" | sed 's/^/> /')"

# ① 逐張票留言
IFS=',' read -ra NS <<< "$ISSUES"
for n in "${NS[@]}"; do
  n="${n// /}"
  printf '## ⭐ owner 裁決 %s（逐字）\n\n%s\n\n---\n⚠️ 由 `scripts/ruling.sh` 在**收到當下**寫入 —— ⛔ 不要再就這一點詢問 owner。\n若這則裁決推翻了票裡先前的內容,以**本則為準**（第〇·六守則：同一層新的贏）。\n' \
    "$NOW" "$QUOTED" > /private/tmp/ruling-body.md
  if gh issue comment "$n" --body-file /private/tmp/ruling-body.md >/dev/null 2>&1; then
    echo "  ✓ #$n"
  else
    echo "  ⛔ #$n 寫入失敗" >&2
  fi
done

# ② 同一則也進當日帳本(context 斷掉之後唯一還讀得到的地方)
if [ ! -f "$DAY" ]; then
  printf '# %s\n\n## 逐則對票\n\n| 時間 | owner 說了什麼（逐字） | 票 |\n|---|---|---|\n' \
    "$(date '+%Y-%m-%d')" > "$DAY"
elif ! grep -q '^## 逐則對票' "$DAY"; then
  printf '\n## 逐則對票\n\n| 時間 | owner 說了什麼（逐字） | 票 |\n|---|---|---|\n' >> "$DAY"
fi
ONE_LINE="$(printf '%s' "$TEXT" | tr '\n' ' ' | sed 's/|/\\|/g')"
printf '| %s | %s | %s |\n' "$(date '+%H:%M')" "$ONE_LINE" "$(echo "$ISSUES" | sed 's/[0-9]\+/#&/g')" >> "$DAY"
echo "  ✓ $DAY"
echo
echo "⭐ 兩處都寫了。⛔ 這一點以後不要再問 owner —— 要查就跑 scripts/asked-before.sh"

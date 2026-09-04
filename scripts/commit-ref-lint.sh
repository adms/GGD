#!/usr/bin/env bash
# 🏷️ commit 訊息裡的 `(#123)` 到底是票號還是 lane 代號 —— GH#663
#
# 量到的（2026-08-24，近三天 commit）：`(#xxx)` 同時被用在兩件完全不同的東西上，
# GitHub 票號 `(#644)` 與 lane 代號 `#A1 #D4 #E4 / A2 L10 M7`。後果不是潔癖：
# 複驗時發現 **11 條 owner 說過的事「沒有票」**，而其中 9 條其實做完了 ——
# 它們掛在 lane 代號上，`gh issue list` 找不到，於是 owner **又說了一次**。
#
# ⭐ 這與「我的推測會變成他的需求」是同一個病：**兩種東西長得一樣就會被混用**。
# 用格式把它們分開（lane 一律寫 `(lane:A5)`），再用一條會紅的閘守住格式。
#
# 用法:
#   scripts/commit-ref-lint.sh --message-file <檔>   # commit-msg hook 的形狀
#   scripts/commit-ref-lint.sh --recent [N]          # 稽核最近 N 個 commit（預設 50）
#   scripts/commit-ref-lint.sh --refresh-cache       # 只更新本地票號快取
#   echo "msg" | scripts/commit-ref-lint.sh          # 讀 stdin
#
# 離開碼:
#   0 = 過，或**沒驗到**（離線且快取缺這個號 ⇒ 警告後放行）
#   1 = 紅：票號對不到任何一張 issue，或 lane 代號寫成了 `#A5` 這種會被誤讀的形狀
#
# ⚠️ 為什麼「缺票 = 警告」而「lane 代號 = 硬紅」（這是本閘唯一的判斷分岔）：
#   · 票號對不到**可能只是快取過期**（剛開的票）⇒ 硬紅會把剛開票的人卡死，
#     而一個會擋人的閘會被關掉，被關掉的閘等於沒有閘（同備份 hook 的理由）。
#   · lane 代號的形狀**不需要任何外部知識**就判得出來 ⇒ 沒有誤判的可能 ⇒ 可以硬紅。
#   ⛔ 兩種情況都**不可以安靜地跳過**：安靜的跳過與全過長得一樣。
set -o pipefail
cd "$(dirname "$0")/.."

# ⚠️ 一行一個號碼,⛔ 不是手寫的（`--refresh-cache` 產生）。
# `GGD_TICKET_CACHE` 讓守衛能在暫存樹上演「快取缺席」那條路 —— ⛔ 不是給人日常用的。
CACHE="${GGD_TICKET_CACHE:-tools/ticket-cache/issue-numbers.txt}"
CACHE_MAX_AGE_H="${GGD_TICKET_CACHE_MAX_AGE_H:-24}"

refresh_cache() { # -> 0 抓到了 / 1 沒抓到（離線、沒有 gh、沒有權限…）
  command -v gh >/dev/null 2>&1 || return 1
  mkdir -p "$(dirname "$CACHE")"
  local tmp; tmp="$(mktemp)"
  if gh issue list --state all --limit 2000 --json number \
       --jq '.[].number' > "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    sort -n "$tmp" > "$CACHE"; rm -f "$tmp"; return 0
  fi
  rm -f "$tmp"; return 1
}

cache_is_fresh() {
  [ -s "$CACHE" ] || return 1
  # ⛔⛔ **`stat -f %m` 在 GNU 上不是「失敗然後 fallback」** —— GNU 的 `-f` 是
  #   「印**檔案系統**狀態」⇒ 它 **exit 0** 並吐出一份多行報告 ⇒ `||` 那條路
  #   **永遠到不了**,而 `$(( … ))` 拿到一整段文字後炸開。
  #   ⇒ ⭐ 在 Linux 上這支腳本每一次跑都噴一段 shell 算術錯誤,而 `cache_is_fresh`
  #     的答案是垃圾（GH#979,2026-09-05 在容器裡量到）。
  #   ⇒ **GNU 的 `-c` 先試**（BSD 對 `-c` 是乾淨地 illegal option ⇒ 才輪到 `-f`）。
  local mt; mt=$(stat -c %Y "$CACHE" 2>/dev/null) \
         || mt=$(stat -f %m "$CACHE" 2>/dev/null) || mt=0
  case "$mt" in ''|*[!0-9]*) mt=0 ;; esac
  local age=$(( ( $(date +%s) - mt ) / 3600 ))
  [ "$age" -lt "$CACHE_MAX_AGE_H" ]
}

MODE=stdin; ARG=""
case "${1:-}" in
  --message-file) MODE=file; ARG="${2:?--message-file 要一個檔名}" ;;
  --recent)       MODE=recent; ARG="${2:-50}" ;;
  --refresh-cache) refresh_cache && { echo "✓ 票號快取 $CACHE（$(wc -l < "$CACHE" | tr -d ' ') 筆）"; exit 0; }
                   echo "⚠️ 抓不到 issue 清單（gh 不在或連不上）—— **沒驗到**，快取沒動" >&2; exit 0 ;;
  "") ;;
  *) echo "認不得的參數: $1" >&2; exit 2 ;;
esac

REFRESHED=0
if ! cache_is_fresh; then
  REFRESHED=1
  refresh_cache >/dev/null 2>&1 || true
fi
HAVE_CACHE=0; [ -s "$CACHE" ] && HAVE_CACHE=1

rc=0; warned=0
lint_one() { # $1=一行標籤（顯示用） $2=訊息全文
  local label="$1" msg="$2" n
  # ① lane 代號冒充票號:`#A5` `(#D10)` —— ⛔ 硬紅（形狀本身就判得出來）
  local lanes
  lanes=$(printf '%s' "$msg" | grep -oE '#[A-Z]+[0-9]+' | sort -u | tr '\n' ' ')
  if [ -n "$lanes" ]; then
    echo "✗ $label: lane 代號被寫成票號的形狀: $lanes" >&2
    echo "   ⇒ 改寫成 (lane:A5) —— 兩種東西長得一樣就會被混用（GH#663）" >&2
    rc=1
  fi
  # ② `(#123)` 要對得到一張真的 issue
  # ⚠️ 一次 miss 最多觸發**一次**網路呼叫（整份快取重抓），⛔ 不是每個號碼問一次 ——
  #    一支會在每次 commit 上打 N 次 API 的閘，最後會被人用 --no-verify 繞過去。
  for n in $(printf '%s' "$msg" | grep -oE '#[0-9]+' | tr -d '#' | sort -un); do
    if [ "$HAVE_CACHE" = 1 ] && grep -qx "$n" "$CACHE"; then continue; fi
    if [ "$REFRESHED" = 0 ]; then             # 快取可能只是過期（剛開的票）
      REFRESHED=1
      refresh_cache >/dev/null 2>&1 && HAVE_CACHE=1
      [ "$HAVE_CACHE" = 1 ] && grep -qx "$n" "$CACHE" && continue
    fi
    if [ "$HAVE_CACHE" = 1 ]; then
      echo "✗ $label: (#$n) 對不到任何一張 issue" >&2; rc=1
    else
      echo "⚠️ $label: (#$n) **沒驗到** —— 沒有票號快取也連不上 GitHub（⛔ 不擋你）" >&2
      warned=1
    fi
  done
}

case "$MODE" in
  file)   lint_one "$(basename "$ARG")" "$(cat "$ARG")" ;;
  stdin)  lint_one "(stdin)" "$(cat)" ;;
  recent) while IFS= read -r line; do
            lint_one "${line%% *}" "${line#* }"
          done < <(git log --format='%h %s' -n "$ARG") ;;
esac

if [ "$rc" = 0 ]; then
  # ⛔ 有「沒驗到」的時候**不可以**印一個乾淨的 ✓ —— 那正是「安靜的跳過與全過長得一樣」。
  [ "$warned" = 1 ] \
    && echo "⚠️ lane 代號那一半過了；票號那一半**沒驗到**（跑 --refresh-cache 或連上 GitHub）" \
    || echo "✓ commit 訊息裡的票號/lane 代號沒有互相冒充"
fi
exit "$rc"

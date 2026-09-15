#!/usr/bin/env bash
# 被 source 的：載入部署主機身分。⭐ 用法 `source "$(dirname "$0")/_hosts.sh"`
#
# 順序：① 既有環境變數（最高,也是 rollback 的辦法）② scripts/hosts.local.sh（⛔ 不進 git）
#       ③ ⭐ 本工作樹沒有 ⇒ **主工作樹**的 scripts/hosts.local.sh（GH#1236 合併後補）
# ⛔ 刻意**沒有**寫死的預設值 —— 那正是這支存在的理由。
#
# ⚠️ ③ 為什麼要有：hosts.local.sh 被 .gitignore 擋 ⇒ 它**只活在建它的那一個工作樹**。
#   而 lane 與合併用的都是 `git worktree`（/private/tmp/ggd-*）⇒ 在那裡跑 BMPNDD，
#   ship-it.sh 的 `ggd_host` 就死、D 步驟失敗 —— 可是這台機器明明已經填過一份。
#   ⭐ 同一個 repo 的工作樹共用 `git rev-parse --git-common-dir` ⇒ 它的上一層就是主工作樹。
#   ⛔ 只印「讀了哪一份」，⛔ 不印任何值。關掉：GGD_HOSTS_INHERIT=0（只看本工作樹）。
_ggd_hosts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_ggd_hosts_file="$_ggd_hosts_dir/hosts.local.sh"
if [ ! -f "$_ggd_hosts_file" ] && [ "${GGD_HOSTS_INHERIT:-1}" = 1 ]; then
  _ggd_common="$(git -C "$_ggd_hosts_dir" rev-parse --git-common-dir 2>/dev/null)"
  case "$_ggd_common" in /*) ;; ?*) _ggd_common="$_ggd_hosts_dir/$_ggd_common" ;; esac
  if [ -n "$_ggd_common" ] && [ -f "$_ggd_common/../scripts/hosts.local.sh" ]; then
    _ggd_hosts_file="$(cd "$_ggd_common/.." && pwd)/scripts/hosts.local.sh"
    echo "ℹ️ 本工作樹沒有 scripts/hosts.local.sh ⇒ 讀主工作樹那一份（GGD_HOSTS_INHERIT=0 關掉）" >&2
  fi
fi
# shellcheck source=/dev/null
[ -f "$_ggd_hosts_file" ] && . "$_ggd_hosts_file"

# ggd_host <變數名> <這台是什麼> —— 沒設就**死**並說清楚要做什麼（⛔ 不靜默退回預設）
ggd_host() {
  local var="$1" what="$2" val="${!1-}"
  case "$val" in
    "" | *"<"*)   # 空的,或還留著 .example 的 <佔位>
      echo "⛔ $var 沒有設 —— 它是「$what」的位址。" >&2
      echo "   ⭐ 修法：cp scripts/hosts.local.sh.example scripts/hosts.local.sh 然後填它" >&2
      echo "   （或一次性覆寫：$var=<值> 再跑一次）" >&2
      return 1
      ;;
  esac
  printf '%s' "$val"
}

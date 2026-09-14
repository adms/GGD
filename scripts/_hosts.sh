#!/usr/bin/env bash
# 被 source 的：載入部署主機身分。⭐ 用法 `source "$(dirname "$0")/_hosts.sh"`
#
# 順序：① 既有環境變數（最高,也是 rollback 的辦法）② scripts/hosts.local.sh（⛔ 不進 git）
# ⛔ 刻意**沒有**寫死的預設值 —— 那正是這支存在的理由。
_ggd_hosts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[ -f "$_ggd_hosts_dir/hosts.local.sh" ] && . "$_ggd_hosts_dir/hosts.local.sh"

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

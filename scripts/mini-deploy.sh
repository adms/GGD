#!/usr/bin/env bash
# scripts/mini-deploy.sh — 從這台 Mac 部署到 Mac mini（GH#861）
#
#   bash scripts/mini-deploy.sh check     # ⭐ 預設,唯讀 —— 能不能部署
#   bash scripts/mini-deploy.sh bootstrap # 第一次:裝 repo、對齊前置條件
#   bash scripts/mini-deploy.sh deploy    # pull → build → up → ⭐ 驗站真的活著
#   bash scripts/mini-deploy.sh logs [服務]
#
#   GGD_MINI_HOST=…   目標（預設見下）
#   GGD_MINI_USER=…   使用者名稱（⛔ 沒有預設 —— 猜錯會卡在難懂的錯誤上）
#
# ═══ ⭐ 為什麼預設用 `.local` 而不是 IP ═══
# mini 同時有兩個位址（實測 2026-08-29）:
#   169.254.166.33  ← 直連的網卡（RTT 0.59 ms,100 Mbps 硬上限）
#   192.168.0.133   ← Wi-Fi（RTT 9.18 ms）
# ⭐ mDNS 會自己挑當下通的那一條 ⇒ 拔線、換網段、換 DHCP 位址都不會壞。
# ⛔ 寫死 IP 的話,owner「有時候會把 mini 放在同一個區網」那句話就會變成一個 bug。
#
# ═══ ⛔ 這支腳本**永遠不碰正式站** ═══
# GCP（34.81.104.163 / ggd.adms.ai）走 scripts/host-deploy.sh。
# 這一支只對 mini 說話,而且開頭會拒絕任何看起來像正式站的目標。
set -uo pipefail
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
head_(){ printf '\n%s══ %s%s\n' "$BLD" "$*" "$RST"; }
ok(){ printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn(){ printf '  %s⚠%s %s\n' "$YEL" "$RST" "$*"; }
die(){ printf '\n%s⛔ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }
info(){ printf '    %s\n' "$*"; }
FAIL=0; bad(){ printf '  %s✗%s %s\n' "$RED" "$RST" "$*"; FAIL=$((FAIL+1)); }

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${GGD_MINI_HOST:-GenieAccelerdeMac-mini-2.local}"
USER_="${GGD_MINI_USER:-}"
REMOTE_REPO="${GGD_MINI_REPO:-\$HOME/GGD}"

# ⛔ 硬柵欄:這支腳本不可以對正式站說話
case "$HOST" in
  *ggd.adms.ai*|34.81.104.163|*adms.ai*)
    die "⛔ $HOST 看起來是正式站 —— 這支腳本只對 mini 說話。正式站走 scripts/host-deploy.sh" ;;
esac
[ -n "$USER_" ] || { echo "$RED⛔ 請設 GGD_MINI_USER（在 mini 上跑 whoami 就知道）$RST" >&2; exit 2; }
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 "$USER_@$HOST")
r(){ "${SSH[@]}" "$@"; }

# ═══════════════════════════════════════ check
cmd_check() {
  head_ "1. 走得到嗎（⭐ 以及走的是哪一條）"
  local ip; ip=$(python3 -c "
import socket,sys
try: print(socket.getaddrinfo('$HOST',22,socket.AF_INET,socket.SOCK_STREAM)[0][4][0])
except Exception: print('')" 2>/dev/null)
  [ -n "$ip" ] && info "$HOST → $ip（$(route -n get "$ip" 2>/dev/null | awk '/interface/{print $2}')）" \
               || bad "$HOST 解析不到"
  local rtt; rtt=$(ping -c 5 -i 0.2 "$HOST" 2>/dev/null | awk -F'/' '/round-trip/{printf "%.2f",$5}')
  [ -n "$rtt" ] && ok "RTT ${rtt} ms" || warn "ping 不回（⛔ 不一定是壞的 —— 隱形模式）"

  head_ "2. SSH"
  if r true 2>/dev/null; then ok "免密碼登入 OK（$USER_@$HOST）"
  else
    bad "SSH 登不進去"
    info "⇒ ssh-copy-id -i ~/.ssh/id_rsa.pub $USER_@$HOST"
    info "  （它會問 mini 的密碼 —— ⛔ 那一步只能你自己跑）"
    return 1
  fi

  head_ "3. mini 上的前置條件"
  r 'command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1' \
    && ok "docker 通了（$(r 'docker info --format "{{.Architecture}} {{.NCPU}} 核"' 2>/dev/null)）" \
    || bad "⛔ docker 不通 —— 裝 OrbStack,並確認**自動登入**已開（它是使用者層程式）"
  r "test -d $REMOTE_REPO/.git" && ok "repo 在 $(r "echo $REMOTE_REPO")" \
    || warn "repo 還沒有 ⇒ 跑 bootstrap"
  r "test -f $REMOTE_REPO/docker/.env" && ok "docker/.env 在" \
    || bad "⛔ 缺 docker/.env —— ⚠️ 它有 secrets,⛔ 不進 git,要**手動**放上去"
  r "test -d $REMOTE_REPO/data/accounts" && ok "帳號資料在" \
    || warn "data/ 還沒有 ⇒ scripts/site-export.sh + site-import.sh"
  # ⭐ 這一條是 owner 的機器才有的死因,check 一定要問
  local au; au=$(r 'defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null' 2>/dev/null)
  [ -n "$au" ] && ok "自動登入已開（$au）" \
    || bad "⛔ 沒有自動登入 —— 重開機會停在登入畫面,而 docker 是使用者層程式 ⇒ 站不會回來"
  local sl; sl=$(r 'pmset -g | awk "\$1==\"sleep\"{print \$2}"' 2>/dev/null)
  [ "${sl:-1}" = 0 ] && ok "不睡" || bad "⛔ 會睡（sleep=${sl:-?}）⇒ sudo pmset -a sleep 0 disablesleep 1"

  [ "$FAIL" -eq 0 ] && printf '\n%s可以部署%s\n' "$GRN" "$RST" \
                    || printf '\n%s%d 項不過%s\n' "$RED" "$FAIL" "$RST"
  return "$FAIL"
}

# ═══════════════════════════════════════ bootstrap
cmd_bootstrap() {
  cmd_check >/dev/null 2>&1
  r "test -d $REMOTE_REPO/.git" || {
    head_ "clone"
    local url; url=$(git -C "$REPO" remote get-url origin 2>/dev/null)
    [ -n "$url" ] || die "本機沒有 origin remote"
    r "git clone '$url' $REMOTE_REPO" || die "clone 失敗（mini 上的 git 有沒有存取權?）"
    ok "clone 完成"
  }
  head_ "⛔ 只能你自己做的兩件"
  info "① docker/.env —— 有 secrets,⛔ 不進 git："
  info "     scp $REPO/docker/.env $USER_@$HOST:$REMOTE_REPO/docker/.env"
  info "② data/ —— 帳號、錢包、排行榜："
  info "     bash scripts/site-export.sh          # 在來源機"
  info "     # 搬過去之後在 mini 上： bash scripts/site-import.sh <bundle>"
}

# ═══════════════════════════════════════ deploy
cmd_deploy() {
  cmd_check || die "前置條件沒過 —— ⛔ 不部署"

  head_ "1. 同步程式（git，⛔ 不是 rsync 工作區）"
  # ⭐ 出貨的是 git,⛔ 不是這台機器的工作區 —— 2026-08-02 的生產事故就是後者
  #   （未追蹤的來源被烘進產物,而來源沒進版控）。
  local head_local; head_local=$(git -C "$REPO" rev-parse --short HEAD)
  r "cd $REMOTE_REPO && git fetch --all --tags -q && git checkout -q $head_local" \
    || die "checkout $head_local 失敗（⛔ 那個 commit push 了嗎?）"
  ok "mini 對到 $head_local"

  head_ "2. build（arm64）"
  r "cd $REMOTE_REPO && docker compose -f docker/compose.yaml -f docker/compose.family.yaml --env-file docker/.env build" \
    2>&1 | tail -4 | sed 's/^/    /'
  r "cd $REMOTE_REPO && docker image inspect ggd-edge --format '{{.Architecture}}'" 2>/dev/null \
    | grep -q arm64 && ok "映像是 arm64" || warn "⛔ 映像不是 arm64?"

  head_ "3. up"
  r "cd $REMOTE_REPO && docker compose -f docker/compose.yaml -f docker/compose.family.yaml --env-file docker/.env up -d" \
    2>&1 | tail -4 | sed 's/^/    /'

  head_ "4. ⭐ 驗站真的活著（⛔ 不是「compose 沒報錯」）"
  # ⚠️ edge 是 restart:"no" —— 它可以**乾淨地退出**而 compose 一句話都不說
  local i up=0
  for i in $(seq 1 30); do
    r 'curl -fsS -m 3 -o /dev/null http://127.0.0.1:8088/' 2>/dev/null && { up=1; break; }
    /bin/sleep 2
  done
  if [ "$up" -eq 1 ]; then
    ok "edge 回應了"
    r 'curl -fsS -m 5 http://127.0.0.1:2567/healthz' 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin); c=d.get("content",{}); rp=d.get("replay",{})
print(f"  {\"OK\" if c.get(\"ok\") else \"BAD\"} content.ok={c.get(\"ok\")} champions={c.get(\"champions\")}")
print(f"  {\"OK\" if rp.get(\"ok\") else \"BAD\"} replay.ok={rp.get(\"ok\")}")' 2>/dev/null
  else
    bad "⛔ 容器起來了但站沒有回應"
    info "已退出：$(r "cd $REMOTE_REPO && docker ps -a --filter 'name=ggd-' --filter 'status=exited' --format '{{.Names}}'" 2>/dev/null | tr '\n' ' ')"
    info "⭐ edge 是 restart:\"no\" —— 乾淨退出通常是 blizzard-overlay 缺失或短少"
    info "   （⚠️ macOS 上最常見的是 .DS_Store 讓檔案數**多**出來,見 ggd-assets.sh 的 EXTRA 訊息）"
    return 1
  fi
}

cmd_logs(){ r "cd $REMOTE_REPO && docker compose -f docker/compose.yaml -f docker/compose.family.yaml logs --tail 60 ${1:-}"; }

case "${1:-check}" in
  check) cmd_check ;; bootstrap) cmd_bootstrap ;; deploy) cmd_deploy ;; logs) shift; cmd_logs "$@" ;;
  *) echo "用法: $0 {check|bootstrap|deploy|logs}"; exit 2 ;;
esac

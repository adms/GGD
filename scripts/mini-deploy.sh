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
# ⛔⛔ 非互動 SSH 拿到的是**最小 PATH** —— macOS 上它由 /etc/paths 決定,
#   而 OrbStack/Docker Desktop 的 CLI 住在 `~/.orbstack/bin`（以及 /usr/local/bin）。
#   2026-08-29 實測:`docker info` 在互動 shell 裡好好的,而這支腳本說「docker 不通」
#   ⇒ ⭐ 一個**看起來像環境壞掉、實際上是我沒設 PATH** 的假紅燈。
#   ⚠️ 這一族的危險在於它會讓人去修**沒有壞的東西**（重裝 OrbStack、查授權…）。
REMOTE_PATH='export PATH="$HOME/.orbstack/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"; '
r(){ "${SSH[@]}" "$REMOTE_PATH$*"; }

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
  if r "test -f $REMOTE_REPO/package.json"; then
    ok "repo 在（版本 $(r "cat $REMOTE_REPO/DEPLOYED_COMMIT 2>/dev/null | cut -c1-8" || echo "?")）"
  else warn "repo 還沒有 ⇒ 跑 deploy（它會用 git archive 推過去）"; fi
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
  # ⛔ 不 clone —— deploy 會用 git archive 推過去（mini 不需要 git）
  r "mkdir -p $REMOTE_REPO/docker" && ok "$REMOTE_REPO 已建立"
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

  head_ "1. 同步程式（git，⭐ 與 GCP 同一套）"
  # ⭐⭐ 用 `git fetch + checkout`,⛔ 不是 rsync —— owner 2026-08-29 問「why 不直接 git pull
  #   跟 GCP 一樣」,而我原本的理由（**mini 上的 git 是 CLT stub**）**已經過期**（CLT 已裝）。
  #
  # git 這條贏在三點：
  #   ① ⭐ mini 上有 `.git` ⇒ `git describe` 直接可用
  #      ⇒ ⛔ 不必從本機傳版本戳（那正是 `UNSTAMPED-BUILD` 的根因）
  #   ② ⭐「出貨的是 git,⛔ 不是工作區」由**構造**保證,⛔ 不是靠我在本機展開 archive
  #      （2026-08-02 的生產事故就是「未追蹤的來源被烘進產物」）
  #   ③ 與 GCP 同一個心智模型 —— ⛔ 少一套要記的流程
  #
  # ⚠️ 代價:**必須先 push**。⭐ 而那是更好的紀律 ——
  #   ⛔ 不會部署到一個不在 repo 裡的東西。
  local head_local; head_local=$(git -C "$REPO" rev-parse HEAD)
  git -C "$REPO" merge-base --is-ancestor "$head_local" origin/main 2>/dev/null \
    || die "⛔ HEAD（$(echo "$head_local" | cut -c1-8)）還沒 push 到 origin/main
   ⭐ git 這條路的前提是「部署的東西在 repo 裡」⇒ 先 push,⛔ 不要繞過去。
   （owner 常設：工作中的 session 不要自己 push —— ⇒ 請 owner 確認）"
  git -C "$REPO" diff --quiet HEAD 2>/dev/null \
    || warn "⚠️ 工作區有未提交的改動 —— ⭐ 它們**不會**被部署"

  # 第一次:clone。之後:fetch + checkout。
  if ! r "test -d $REMOTE_REPO/.git"; then
    info "mini 上還沒有 .git ⇒ clone（一次性,repo 約 650 MB）"
    local url; url=$(git -C "$REPO" remote get-url origin)
    r "rm -rf ${REMOTE_REPO}.old && ([ -d $REMOTE_REPO ] && mv $REMOTE_REPO ${REMOTE_REPO}.old || true) \
       && git clone -q '$url' $REMOTE_REPO" || die "clone 失敗（mini 有沒有 repo 存取權?）"
    # ⭐ 把不在 git 裡、但服務要的東西搬回來（⛔ 漏一個站就起不來）
    r "for d in data docker/.env; do [ -e ${REMOTE_REPO}.old/\$d ] && cp -a ${REMOTE_REPO}.old/\$d $REMOTE_REPO/\$(dirname \$d)/ || true; done" || true
    ok "clone 完成,並搬回 data/ 與 docker/.env"
  fi
  r "cd $REMOTE_REPO && git fetch -q --all --tags && git checkout -q $head_local" \
    || die "checkout $head_local 失敗"
  local remote_head; remote_head=$(r "cd $REMOTE_REPO && git rev-parse HEAD" 2>/dev/null)
  [ "$remote_head" = "$head_local" ] \
    && ok "mini 對到 $(echo "$head_local" | cut -c1-8)（⭐ git,有 .git ⇒ 版本戳自己算得出來）" \
    || die "⛔ 同步後版本對不上（mini=$remote_head 本機=$head_local）"

  head_ "2. build（arm64）"
  # ⛔⛔ **裸的 `docker compose build` 會掉版本戳**。
  #   `GGD_BUILD_STAMP` 是 Makefile 算好再插進 compose 的 build arg,
  #   而 mini 上沒有 make ⇒ 徽章顯示 `UNSTAMPED-BUILD`
  #   ⇒ ⭐ **「這是哪一版」失去唯一的答案**（CLAUDE.md 部署協定的地雷 #4,task #66）。
  #   2026-08-29 實際發生:搬完之後 footer 就是 UNSTAMPED-BUILD。
  # ⭐ 在**這台**算（有 git、有 tag）,再傳進去 —— ⛔ 不要在 mini 上算,
  #   它沒有 .git（我們用 rsync 推的是 archive 的內容）。
  # ⭐ 版本戳由 **mini 自己**算 —— 它現在有 `.git` 了（⛔ 不必從本機傳）
  local stamp; stamp=$(r "cd $REMOTE_REPO && echo \"\$(git describe --tags --always --dirty) \$(date -u +%F)\"" 2>/dev/null)
  info "版本戳（mini 自己算的）：$stamp"
  r "cd $REMOTE_REPO && GGD_BUILD_STAMP='$stamp' docker compose -f docker/compose.yaml -f docker/compose.family.yaml --env-file docker/.env build" \
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

  # ⛔⛔ 2026-08-29 的停機教訓：`edge 回應了` **不代表站活著**。
  #   那次 caddy 因為 Caddyfile 的巢狀變數起不來 ⇒ 80/443 沒有人聽
  #   ⇒ ⭐ **ggd.adms.ai 從網際網路完全連不上,而 edge 與 /healthz 全綠**。
  #   ⇒ 我驗了每一個**名詞**（game 在、content 在、容器在跑）,
  #     ⛔ 而沒有驗**那條路**（外面 → caddy → edge → game）。
  #
  # ⭐ 判準:驗收要走**玩家真正走的那條路**,⛔ 不是最靠近伺服器的那一段。
  head_ "5. ⭐ 前門（caddy）—— ⛔ edge 通不代表玩家連得到"
  local pub="${GGD_PUBLIC_HOST:-}"
  if r "nc -z -G 3 127.0.0.1 443" >/dev/null 2>&1; then
    ok "mini 的 :443 有人在聽"
  else
    bad "⛔ :443 沒有人在聽 —— caddy 沒起來?"
    r "docker logs --tail 6 ggd-caddy-1" 2>&1 | grep -iE "error|Error" | head -3 | sed 's/^/    /'
  fi
  if [ -n "$pub" ]; then
    # ⭐ 從**外部**驗,⛔ 不從 mini 自己（NAT 迴環會騙人）
    local code
    code=$(curl -fsS -m 20 -o /dev/null -w '%{http_code}' "https://$pub/" 2>/dev/null || echo 000)
    [ "$code" = 200 ] && ok "https://$pub/ → HTTP 200（⭐ 玩家真正走的路）" \
                      || bad "⛔ https://$pub/ → HTTP $code —— 前門不通,⚠️ 而 edge 是好的"
  else
    warn "⚠️ 沒設 GGD_PUBLIC_HOST ⇒ **沒有從外部驗過** —— ⛔ 這一段是這次停機沒抓到的那一段"
    info "⇒ GGD_PUBLIC_HOST=ggd.adms.ai bash $0 deploy"
  fi
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

# ═══════════════════════════════════════ tunnel —— Cloudflare Tunnel（GH#861）
# ⭐ 走 tunnel 時 edge **零發佈埠**（compose.tunnel.yaml 的 `ports: !reset []`），
#   而 caddy 不跑（`--scale caddy=0`）—— 它會去跟 Let's Encrypt 要憑證,
#   ⛔ 而家用機沒有 inbound 80/443 ⇒ 失敗重試 ⇒ ⚠️ 撞到速率限制要等一週。
cmd_tunnel() {
  r "grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' $REMOTE_REPO/docker/.env" \
    || die "⛔ mini 的 docker/.env 裡沒有 CLOUDFLARE_TUNNEL_TOKEN
   ⇒ Cloudflare 後台 → Zero Trust → Networks → Tunnels → 建一個 → 複製 token,然後：
     ssh $USER_@$HOST 'echo \"CLOUDFLARE_TUNNEL_TOKEN=<token>\" >> $REMOTE_REPO/docker/.env'"

  head_ "1. 起 tunnel（edge 改為零發佈埠）"
  r "cd $REMOTE_REPO && docker compose -f docker/compose.yaml -f docker/compose.family.yaml \
       -f docker/compose.tunnel.yaml --env-file docker/.env up -d --scale caddy=0" 2>&1 | tail -5 | sed 's/^/    /'

  head_ "2. ⭐ 驗它**真的連上 Cloudflare**（⛔ 不是「容器在跑」）"
  # ⚠️ 一個連不上的 cloudflared 會很開心地一直重試,而站是死的。
  local i ok_=0
  for i in $(seq 1 30); do
    r "docker exec ggd-cloudflared-1 cloudflared tunnel --metrics 127.0.0.1:2000 ready" >/dev/null 2>&1 && { ok_=1; break; }
    /bin/sleep 3
  done
  [ "$ok_" = 1 ] && ok "cloudflared 已連上 Cloudflare" || {
    bad "⛔ cloudflared 沒有連上"
    r "docker logs --tail 20 ggd-cloudflared-1" 2>&1 | sed 's/^/    /'
    return 1
  }

  head_ "3. ⭐ edge 真的不發佈埠了嗎（安全性的那一半）"
  # ⛔⛔ 第一版問 `docker ps --format '{{.Ports}}'`,而它**同時列出 EXPOSE 與發佈**:
  #   未發佈時它印 `8080/tcp`,發佈時才是 `0.0.0.0:8088->8080/tcp`。
  #   ⇒ 我把 EXPOSE 宣告讀成「還在發佈」⇒ ⭐ **一個假紅燈,而 tunnel 其實完全正常**。
  # ⭐ `docker port <容器>` 只列**真的發佈**的映射 —— 回空就是零發佈。
  local pub; pub=$(r "cd $REMOTE_REPO && docker port ggd-edge-1" 2>/dev/null | tr -d ' \n')
  [ -z "$pub" ] && ok "edge 零發佈埠 —— 主機上沒有任何入口（EXPOSE 8080/tcp ⛔ 不算）" \
                || bad "⛔ edge 仍**發佈**：$pub（tunnel overlay 沒吃到?）"

  head_ "4. ⭐ cloudflared → edge 走得通嗎（那才是 tunnel 實際走的路）"
  # ⛔ 第一版在 cloudflared 容器裡跑 `sh -c wget` —— 而它是 **distroless 映像,
  #   沒有 shell 也沒有 wget** ⇒ 探測本身跑不起來,⭐ 而失敗看起來像「連不到」。
  # ⭐ 改成開一個 alpine **加入 cloudflared 的網路命名空間**,從**同一個視角**問。
  r "docker run --rm --network container:ggd-cloudflared-1 alpine:3.21 \
       wget -qO- -T5 http://edge:8080/" 2>/dev/null | head -c 40 | grep -qi "doctype\|html" \
    && ok "cloudflared 的網路裡連得到 edge:8080（拿到真的 HTML）" \
    || bad "⛔ cloudflared 的網路裡連不到 edge:8080"
  info "（⚠️ 主機的 127.0.0.1:8088 連不到是**正確的** —— edge 已不發佈）"

  head_ "下一步"
  info "在 Cloudflare 後台的這個 tunnel 加 Public hostname："
  info "  Subdomain=ggd  Domain=adms.ai  Type=HTTP  URL=edge:8080"
  info "⚠️ 展開 Additional application settings 確認 **WebSocket 沒被關掉**（Colyseus 靠它）"
  info "加完跑： bash scripts/mini-deploy.sh tunnel-verify"
}

# ═══════════════════════════════════════ direct —— 埠轉發那條路（GH#861）
# ⭐⭐ 這支的**整個重點是順序**：
#   Caddy 一啟動就會為它列出的主機名去要 Let's Encrypt 憑證（HTTP-01）
#   ⇒ 那個名字必須**已經指向這台**,而且 **80 埠必須從外面通得到**。
#   ⛔ 條件沒滿足就啟動 ⇒ 失敗重試 ⇒ ⚠️ **速率限制,撞到要等一週**。
#   ⇒ 所以這支腳本**先驗、後啟動**,⛔ 而不是啟動了再看 log。
cmd_direct() {
  local host="${GGD_SITE_HOST:?⛔ 請設 GGD_SITE_HOST（搬遷期間用臨時名字，例如 mini.adms.ai）}"

  head_ "1. ⭐ 這個名字指到哪裡（⛔ 指錯地方就不要啟動）"
  local ip mine
  ip=$(dig +short @1.1.1.1 "$host" A 2>/dev/null | tail -1)
  mine=$(r "curl -fsS -m 8 https://api.ipify.org" 2>/dev/null)
  info "$host → ${ip:-?}   /   mini 的出口 IP → ${mine:-?}"
  [ -n "$ip" ] && [ "$ip" = "$mine" ] \
    && ok "指向這台 ✓" \
    || die "⛔ $host 指向 ${ip:-（查不到）}，而 mini 是 ${mine:-?}
   ⭐ 憑證挑戰會打到**別的機器**上 ⇒ 失敗重試 ⇒ ⚠️ Let's Encrypt 速率限制（撞到等一週）。
   ⇒ 先把 A 記錄指過來（Cloudflare 上要**灰雲 DNS only**，⛔ 橘雲會把流量繞回 CF）"

  head_ "2. ⭐ 80 埠從**外面**真的通嗎（⛔ 不是從家裡測）"
  # ⚠️ NAT 迴環不一定支援 ⇒ 從 mini 自己測會騙人。用外部服務代打。
  local probe
  probe=$(curl -fsS -m 20 "https://api.allorigins.win/raw?url=http://$mine/" -o /dev/null -w '%{http_code}' 2>/dev/null || echo "")
  if r "curl -fsS -m 6 -o /dev/null http://127.0.0.1:80/" 2>/dev/null; then
    info "（mini 本機 :80 有東西在聽）"
  fi
  # 直接從這台（在同一個 NAT 內）測不準,所以只做下界檢查並要求人工確認
  if nc -z -G 6 "$mine" 80 >/dev/null 2>&1; then
    ok "從這台連得到 $mine:80"
  else
    warn "從這台連不到 $mine:80 —— ⚠️ 這**可能**只是 NAT 迴環不支援"
    info "⭐ 請用手機關 Wi-Fi 走 4G/5G 開 http://$mine/ 確認,⛔ 家裡測不準"
  fi

  head_ "3. 起 caddy（⭐ edge 維持零發佈埠 —— caddy 走 docker 內網連它）"
  r "cd $REMOTE_REPO && GGD_SITE_HOST='$host' docker compose \
       -f docker/compose.yaml -f docker/compose.family.yaml -f docker/compose.tunnel.yaml \
       --env-file docker/.env up -d caddy" 2>&1 | tail -4 | sed 's/^/    /'

  head_ "4. ⭐ 憑證真的拿到了嗎（⛔ 不是「caddy 在跑」）"
  local i got=0
  for i in $(seq 1 40); do
    if echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
         | openssl x509 -noout -subject 2>/dev/null | grep -q "$host"; then got=1; break; fi
    /bin/sleep 3
  done
  if [ "$got" = 1 ]; then
    local cert; cert=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
      | openssl x509 -noout -issuer -subject -dates 2>/dev/null | tr '\n' ' ')
    ok "憑證已簽發"
    info "$cert"
  else
    bad "⛔ 120 秒內沒拿到 $host 的憑證"
    r "docker logs --tail 25 ggd-caddy-1" 2>&1 | grep -iE "error|challenge|rate|obtain" | tail -6 | sed 's/^/    /'
    info "⚠️ 若看到 rate limit ⇒ **停下來**，⛔ 不要重試（會加深）"
    return 1
  fi

  head_ "5. 對外實測"
  GGD_PUBLIC_HOST="$host" cmd_tunnel_verify
}

# ⭐ 對外實測 —— ⛔ 不因為文件說支援 WebSocket 就當它通了
cmd_tunnel_verify() {
  local host="${GGD_PUBLIC_HOST:-ggd.adms.ai}"
  head_ "從網際網路驗 $host"
  curl -fsS -m 15 -o /dev/null -w "  首頁          HTTP %{http_code}  TLS %{time_appconnect}s  總計 %{time_total}s\n" "https://$host/" 2>&1
  curl -fsS -m 30 -o /dev/null -w "  bundle.json   HTTP %{http_code}  %{size_download} bytes\n" "https://$host/content/bundle.json" 2>&1
  curl -fsS -m 15 -o /dev/null -w "  whitelist     HTTP %{http_code}\n" "https://$host/api/v1/curation/whitelist" 2>&1
  echo
  # ⭐⭐ WebSocket 這一條要**對照正式站**,⛔ 不是拿一個絕對值去比。
  #
  # ⛔ 第一版打 `/colyseus/` 期望 101,拿到 404 就判 tunnel 壞了。
  #   ⭐ 而**正式站對同一個請求也回 404** —— 那個路徑在兩邊都不存在,
  #     我拿了一個不存在的路徑去測,然後把 404 讀成「tunnel 沒開 WebSocket」。
  #   ⚠️ 真正的 Colyseus 入口是 `/matchmake/...`（見 nginx 的 location 與客戶端）。
  #
  # ⭐ 判準:**與正式站比對**。兩邊一樣 ⇒ tunnel 是透明的（那就是要驗的東西）;
  #   ⛔ 「絕對值等於 101」是我對協定的假設,而它剛剛就是錯的。
  local ref="${GGD_REF_HOST:-ggd.adms.ai}"
  local wsp="${GGD_WS_PATH:-/matchmake/joinOrCreate/arena}"
  _ws() {
    curl -s -o /dev/null -m 12 -w '%{http_code}' \
      -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
      -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
      "https://$1$wsp" 2>/dev/null
  }
  local mine ref_code
  mine=$(_ws "$host"); ref_code=$(_ws "$ref")
  if [ "$mine" = "$ref_code" ]; then
    ok "WebSocket 升級路徑與正式站一致（兩邊都是 HTTP $mine）—— ⭐ tunnel 是透明的"
  else
    bad "⛔ WebSocket 升級：本站 $mine ≠ 正式站 $ref_code（$wsp）"
    info "⇒ 去 tunnel 的 Additional application settings 確認 WebSocket 沒被關掉"
  fi
  echo
  info "⚠️ 這只證明**路徑通**。真的一場比賽還要玩家實際連一次。"
}

case "${1:-check}" in
  check) cmd_check ;; bootstrap) cmd_bootstrap ;; deploy) cmd_deploy ;; logs) shift; cmd_logs "$@" ;;
  tunnel) cmd_tunnel ;; tunnel-verify) cmd_tunnel_verify ;; direct) cmd_direct ;;
  *) echo "用法: $0 {check|bootstrap|deploy|tunnel|tunnel-verify|direct|logs}"; exit 2 ;;
esac

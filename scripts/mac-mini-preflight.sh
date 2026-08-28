#!/usr/bin/env bash
# scripts/mac-mini-preflight.sh — 把「站能不能搬到 Mac mini」從**相信**變成**量到**。
#
#   bash scripts/mac-mini-preflight.sh          # 全部
#   bash scripts/mac-mini-preflight.sh arch     # 只驗架構（本機就能跑,⛔ 不用 Mac mini）
#   bash scripts/mac-mini-preflight.sh host     # 只驗這台 Mac 的主機條件
#   bash scripts/mac-mini-preflight.sh net      # 只驗網路可達性
#   bash scripts/mac-mini-preflight.sh io       # 只量 bind mount 的 I/O（要 docker）
#
# ⭐ 這支腳本的每一條都回答「**兩個名詞的關係**」,⛔ 不是「這個東西在不在」——
#   「Docker 裝了」證明不了「重開機它會回來」;「編得過」證明不了「產物是 arm64」。
set -uo pipefail
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
FAIL=0; WARN=0
head_(){ printf '\n%s══ %s%s\n' "$BLD" "$*" "$RST"; }
ok(){   printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
bad(){  printf '  %s✗%s %s\n' "$RED" "$RST" "$*"; FAIL=$((FAIL+1)); }
warn(){ printf '  %s⚠%s %s\n' "$YEL" "$RST" "$*"; WARN=$((WARN+1)); }
info(){ printf '    %s\n' "$*"; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ═══════════════════════════════════════════════════ arch —— 本機就能跑
sec_arch() {
  head_ "A. 架構:linux/arm64 這一側（⭐ 本機 arm64 就驗得完,⛔ 不用等 Mac mini）"

  # A1 base image 有沒有被釘死在 amd64
  local pins
  pins=$(grep -rhnE '^\s*FROM\s+--platform=' "$ROOT"/docker/*.Dockerfile 2>/dev/null)
  [ -z "$pins" ] && ok "沒有任何 FROM --platform= 釘死架構" || bad "有 --platform 釘死:$pins"

  # A2 ⭐ 有沒有寫死 amd64 的下載（curl/wget 抓 x86 二進位是最常見的 arm64 地雷）
  local dl
  dl=$(grep -rhnE '(curl|wget|ADD).*(x86_64|amd64|linux-x64)' "$ROOT"/docker/*.Dockerfile 2>/dev/null)
  [ -z "$dl" ] && ok "Dockerfile 沒有寫死 amd64 的下載" || bad "寫死 amd64 的下載:$dl"

  # A3 lockfile 的原生相依有沒有 arm64 變體
  #    ⛔ 「有 arm64 的套件」不夠 —— 要問「**每一個** x64 的都有對應的 arm64」
  if [ -f "$ROOT/pnpm-lock.yaml" ]; then
    python3 - "$ROOT/pnpm-lock.yaml" <<'PY'
import re, sys, collections
txt = open(sys.argv[1]).read()
names = set(re.findall(r'(@[a-z0-9._-]+/[a-z0-9._-]*linux-(?:x64|arm64)[a-z0-9._-]*)', txt))
fam = collections.defaultdict(set)
for n in names:
    fam[re.sub(r'linux-(x64|arm64)', 'linux-ARCH', n)].add('x64' if 'x64' in n else 'arm64')
missing = [k for k, v in fam.items() if 'x64' in v and 'arm64' not in v]
if not fam:
    print("  \033[33m⚠\033[0m lockfile 找不到平台變體套件（可能 lockfile 格式不同）")
elif missing:
    print(f"  \033[31m✗\033[0m {len(missing)} 個原生相依只有 x64:" + ", ".join(missing[:5]))
    sys.exit(1)
else:
    print(f"  \033[32m✓\033[0m {len(fam)} 族原生相依,x64 有的 arm64 全部都有")
PY
    [ $? -ne 0 ] && FAIL=$((FAIL+1))
  fi

  # A4 ⭐ uWebSockets.js 是 git tarball,⛔ 不受 lockfile 的 cpu/os 保護 —— 要自己看檔案
  #    Node 22 = ABI 127。⛔ 少了它 game-server 在 arm64 上**啟動時**才死。
  local uws
  uws=$(find "$ROOT/node_modules/.pnpm" -maxdepth 3 -type d -name 'uWebSockets.js' 2>/dev/null | head -1)
  if [ -n "$uws" ]; then
    # ⛔ 第一版讀 `node -p process.versions.modules` —— 那是**本機** node 的 ABI（141）,
    #    而容器跑的是 Dockerfile 裡的 node:22-alpine（ABI 127）⇒ 量錯了對象（失敗形態④）。
    # ⭐ 改成問**對等性**:x64 有的每一個 ABI,arm64 是不是都有?
    #    它從 tarball 自己的檔名推導 ⇒ ⛔ 不需要一張會過期的「node 版本 → ABI」對照表。
    python3 - "$uws" <<'PY2'
import os, re, sys
d = sys.argv[1]
have = {}
for f in os.listdir(d):
    m = re.match(r'uws_linux_(x64|arm64)_(\d+)\.node$', f)
    if m: have.setdefault(m.group(1), set()).add(m.group(2))
x, a = have.get('x64', set()), have.get('arm64', set())
if not x:
    print("  \033[33m⚠\033[0m uWebSockets.js 找不到 linux 預建 —— 這一條沒驗到"); sys.exit(0)
miss = sorted(x - a)
if miss:
    print(f"  \033[31m✗\033[0m uWebSockets.js: x64 有 ABI {sorted(x)} 而 arm64 缺 {miss} ⇒ 那些 Node 版本在 arm64 會**啟動時**死")
    sys.exit(1)
print(f"  \033[32m✓\033[0m uWebSockets.js: linux x64 的 ABI {sorted(x)} arm64 全部都有")
PY2
    [ $? -ne 0 ] && FAIL=$((FAIL+1))
    # ⭐ 再問一次真正要用的那一個:Dockerfile 指定的 node major 有沒有被涵蓋
    local ndmaj; ndmaj=$(grep -ohE 'FROM node:([0-9]+)' "$ROOT"/docker/*.Dockerfile 2>/dev/null | grep -oE '[0-9]+' | sort -u | tr '\n' ' ')
    info "Dockerfile 指定的 Node major: ${ndmaj:-?}（arm64 預建涵蓋 $(ls "$uws" 2>/dev/null | grep -c 'uws_linux_arm64_') 個 ABI）"
  else
    warn "找不到 uWebSockets.js（沒 pnpm install?）—— 這一條沒驗到"
  fi

  # A5 ⭐ Go 真的交叉編譯得過,而且產物真的是 aarch64（⛔ 不是「指令沒報錯」）
  if command -v go >/dev/null 2>&1 && [ -d "$ROOT/apps/platform" ]; then
    local tmp; tmp=$(mktemp -d); local n=0 f=0
    for c in platform seed opstate platformarchive ownerreset; do
      [ -d "$ROOT/apps/platform/cmd/$c" ] || continue
      n=$((n+1))
      if (cd "$ROOT/apps/platform" && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
           go build -trimpath -ldflags="-s -w" -o "$tmp/$c" "./cmd/$c" >/dev/null 2>&1); then
        file "$tmp/$c" 2>/dev/null | grep -q "ARM aarch64" || { bad "$c 編得過但**不是** aarch64"; f=$((f+1)); }
      else bad "$c 交叉編譯失敗"; f=$((f+1)); fi
    done
    [ "$f" -eq 0 ] && [ "$n" -gt 0 ] && ok "$n 支 Go 二進位交叉編譯成 linux/arm64,file 確認是 ARM aarch64"
    rm -rf "$tmp"
  else
    warn "本機沒有 go 或找不到 apps/platform —— Go 那一側沒驗到"
  fi

  # A6 APFS 大小寫不敏感會不會咬
  local dup
  dup=$(cd "$ROOT" && git ls-files | tr 'A-Z' 'a-z' | sort | uniq -d | head -5)
  [ -z "$dup" ] && ok "沒有只差大小寫的檔名（APFS 大小寫不敏感不會咬）" \
                || bad "只差大小寫的檔名 —— APFS 上會互相覆蓋:$dup"
}

# ═══════════════════════════════════════════════════ host —— 這台 Mac 的條件
sec_host() {
  head_ "B. 主機:這台 Mac 撐不撐得住無人值守"
  [ "$(uname -s)" = Darwin ] || { warn "不是 macOS —— B 段跳過"; return; }

  info "$(sysctl -n machdep.cpu.brand_string 2>/dev/null)  $(sysctl -n hw.ncpu) 核  $(( $(sysctl -n hw.memsize) / 1073741824 ))GB"
  df -h / | tail -1 | awk '{printf "    開機碟 共 %s / 已用 %s / 剩 %s\n", $2,$3,$4}'

  # B1 ⭐ 睡眠 —— 一台會睡的伺服器等於一台間歇性離線的伺服器
  local sl; sl=$(pmset -g custom 2>/dev/null | awk '/^AC Power/,0' | awk '$1=="sleep"{print $2; exit}')
  [ "${sl:-1}" = 0 ] && ok "AC 電源下不睡（sleep 0）" || bad "AC 電源下會睡（sleep=${sl:-?}）⇒ sudo pmset -a sleep 0 disablesleep 1"
  local ds; ds=$(pmset -g 2>/dev/null | awk '$1=="disksleep"{print $2}')
  [ "${ds:-1}" = 0 ] && ok "硬碟不睡" || warn "disksleep=${ds:-?} ⇒ sudo pmset -a disksleep 0"

  # B2 ⭐ 斷電回來會不會自己開機（家用機的第一個死因）
  local ar; ar=$(pmset -g 2>/dev/null | awk '$1=="autorestart"{print $2}')
  [ "${ar:-0}" = 1 ] && ok "斷電回復後自動開機（autorestart 1）" || bad "⛔ 斷電回來**不會**自己開機 ⇒ sudo pmset -a autorestart 1"

  # B3 ⭐⭐ 自動登入 —— 這是最容易漏的一條:
  #     Docker Desktop / OrbStack 都是「登入時啟動」的**使用者層**程式。
  #     沒有自動登入 ⇒ 重開機停在登入畫面 ⇒ Docker 永遠不起來 ⇒ 站永遠是死的,
  #     ⭐ 而 Mac 本身完全健康、ssh 進得去、看起來一切正常。
  local au; au=$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)
  [ -n "$au" ] && ok "自動登入已開（$au）" || bad "⛔ 沒有自動登入 —— 重開機會停在登入畫面而 Docker 是使用者層程式 ⇒ 站不會回來"

  # B4 容器 runtime
  if command -v orbctl >/dev/null 2>&1 || [ -d /Applications/OrbStack.app ]; then
    ok "OrbStack 已裝（⭐ 建議:它的檔案共享比 Docker Desktop 快)"
  elif [ -d /Applications/Docker.app ]; then
    warn "只有 Docker Desktop —— bind mount 走 virtiofs 會慢;建議改 OrbStack 並跑 io 段對照"
  else
    bad "⛔ 沒有容器 runtime"
  fi
  if docker info >/dev/null 2>&1; then
    ok "docker 通了（arch=$(docker version --format '{{.Server.Arch}}' 2>/dev/null)）"
  else
    bad "⛔ docker 不通"
  fi

  # B5 ⭐ 同一顆炸彈會跟著搬過來:外接碟沒掛上 ⇒ daemon 起一套空的 store。
  #    macOS 沒有 systemd 的 RequiresMountsFor ⇒ 只能靠啟動腳本自己先驗。
  if [ -n "${GGD_DATA_VOLUME:-}" ]; then
    [ -d "$GGD_DATA_VOLUME" ] && mount | grep -q " on $GGD_DATA_VOLUME " \
      && ok "資料碟 $GGD_DATA_VOLUME 已掛載" \
      || bad "⛔ 資料碟 $GGD_DATA_VOLUME 沒掛上 —— ⛔ 不要在這個狀態啟動 daemon"
  else
    info "（沒設 GGD_DATA_VOLUME ⇒ 資料放內建 SSD;若用外接碟要設它並在啟動腳本裡先驗）"
  fi
}

# ═══════════════════════════════════════════════════ net —— 網路可達性
sec_net() {
  head_ "C. 網路:家用線路能不能當伺服器（⭐ 這是唯一的硬阻塞）"

  # C1 現況（搬遷的分母）
  local cur; cur=$(dig +short ggd.adms.ai 2>/dev/null | tail -1)
  info "ggd.adms.ai → ${cur:-?}（現況:A 記錄直接指主機,前面沒有 CDN）"

  # C2 ⭐ 出口 IP 與內網 IP 一不一樣 ⇒ 一樣才有可能做埠轉發
  local pub loc
  pub=$(curl -fsS -m 8 https://api.ipify.org 2>/dev/null)
  loc=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
  info "對外 IP ${pub:-?} / 本機 IP ${loc:-?}"
  case "${pub:-}" in
    100.6[4-9].*|100.[7-9][0-9].*|100.1[0-1][0-9].*|100.12[0-7].*)
      bad "⛔ 對外 IP 落在 CGNAT 區段（100.64/10）⇒ **沒有任何 inbound**,埠轉發不可能 ⇒ 必須走 tunnel" ;;
    "") warn "量不到對外 IP" ;;
    *)  ok "對外 IP 不在 CGNAT 區段 —— 埠轉發**有可能**（還要 ISP 沒擋 80/443）" ;;
  esac

  # C3 ⭐ 真的量 inbound,⛔ 不要問「路由器設了嗎」
  #    ⚠️ 這一條要外部幫忙才驗得準;這裡只做「本機有沒有在聽」的下界。
  local p
  for p in 80 443; do
    if nc -z -G 3 "${pub:-127.0.0.1}" "$p" 2>/dev/null; then ok "對外 :$p 通"
    else warn ":$p 從這台自己連不到（NAT 迴環常常本來就不通 ⇒ ⛔ 這不代表外面連不到,要從外部網路實測）"; fi
  done

  # C4 tunnel 方案裝了沒
  command -v cloudflared >/dev/null 2>&1 && ok "cloudflared 已裝" || info "（未裝 cloudflared —— 建議方案）"
  command -v tailscale   >/dev/null 2>&1 && ok "tailscale 已裝"   || true

  # C5 ⭐ 上傳頻寬是玩家體驗的分母,⛔ 不是下載
  info "⚠️ 上傳頻寬要自己量（家用線路常常上下不對稱,而伺服器吃的是**上傳**）"

  # ─────────────────────────────────────────────────────────────────────────
  # C6 ⭐⭐ 這台機器**會換網段**（owner 2026-08-29:「有時候會放在同一個區網」）
  #    ⇒ 「站現在開在哪些介面上」是一個**每換一次網路就要重問**的問題。
  # ─────────────────────────────────────────────────────────────────────────
  head_ "C-LAN. 這台現在在哪個網段,而站開給誰"
  local iface
  for iface in en0 en1 en5 en6; do
    local a; a=$(ipconfig getifaddr "$iface" 2>/dev/null) || continue
    [ -n "$a" ] && info "$iface  $a  /  閘道 $(route -n get default 2>/dev/null | awk '/gateway/{print $2}')"
  done

  # ⭐ 出貨的 edge 是 `${GGD_BIND:-0.0.0.0}:${GGD_PORT:-8088}:8080` ——
  #   而 0.0.0.0 在一台**會換網路**的機器上,意思是「它加入的**每一個**網路」。
  #   ⚠️ family tier 是刻意沒有存取閘的 ⇒ 那個網段上的任何人都進得來。
  local bind
  bind=$(sed -n 's/^GGD_BIND=//p' "$ROOT/docker/.env" 2>/dev/null | tr -d '"'"'"'\r' | head -1)
  if [ -z "$bind" ] || [ "$bind" = "0.0.0.0" ]; then
    bad "⛔ edge 會綁 0.0.0.0（GGD_BIND ${bind:-未設 ⇒ 走預設}）—— 這台加入的**每一個**網路都看得到站"
    info "⭐ 走 tunnel 的話正解是**完全不發佈埠**：加上 -f docker/compose.tunnel.yaml"
    info "   （cloudflared 在同一個 docker 網路裡直接連 edge:8080，⛔ 不需要 host 的埠）"
    info "⭐ 要在同一區網走直連：-f docker/compose.lan.yaml 並寫出 GGD_LAN_BIND=<網卡IP>"
  else
    ok "edge 綁在 $bind（⛔ 不是 0.0.0.0）"
  fi

  # ⭐ 直連 vs 繞出去再繞回來 —— ⛔ 不要猜「應該差不多」
  if [ -n "${GGD_LAN_BIND:-}" ]; then
    local d t
    d=$(curl -fsS -m 5 -o /dev/null -w '%{time_total}' "http://$GGD_LAN_BIND:${GGD_LAN_PORT:-8088}/" 2>/dev/null)
    t=$(curl -fsS -m 8 -o /dev/null -w '%{time_total}' "https://${GGD_PUBLIC_HOST:-ggd.adms.ai}/" 2>/dev/null)
    if [ -n "$d" ] && [ -n "$t" ]; then
      awk -v d="$d" -v t="$t" 'BEGIN{
        printf "    直連 %.0f ms   經 tunnel %.0f ms   差 %.0f ms\n", d*1000, t*1000, (t-d)*1000
        if ((t-d)*1000 < 15) print "  ⭐ 差 <15ms ⇒ ⛔ 不值得為快路多維護一條組態"
        else                 print "  ⭐ 差得夠多 ⇒ 同一區網時值得開 compose.lan.yaml" }'
    # ⭐ 2026-08-29 在 owner 的網段上實測過一次,結論是**不做**:
    #   LAN 直連 6.51ms · CF edge 7.62ms · 今天的 GCP 9.84ms
    #   ⇒ tunnel ≈ 15.2ms（家用上行被算兩次）⇒ 快路只省 8.7ms < 15ms 門檻。
    #   ⚠️ 那是 Wi-Fi;改有線後差距約 14ms,仍在門檻邊緣,判斷不變。
    else
      info "（量不到兩邊 —— 站還沒起來,或 GGD_LAN_BIND 不對）"
    fi
  else
    info "⚠️ 沒設 GGD_LAN_BIND ⇒ **沒有量**直連 vs tunnel 的差。⛔ 不要憑感覺決定要不要開快路"
  fi
}

# ═══════════════════════════════════════════════════ io —— bind mount 的代價
sec_io() {
  head_ "D. I/O:macOS 的 bind mount 走 virtiofs,⭐ 這是搬過去最可能變慢的一項"
  docker info >/dev/null 2>&1 || { warn "docker 不通 —— D 段跳過"; return; }
  local img=alpine:3.21
  docker pull -q "$img" >/dev/null 2>&1
  local tmp; tmp=$(mktemp -d)
  # 小檔隨機寫:這正是 data/*.json 每場比賽在做的事
  local bind vol
  bind=$( { time -p docker run --rm -v "$tmp:/w" "$img" \
      sh -c 'i=0; while [ $i -lt 2000 ]; do echo x > /w/f$i; i=$((i+1)); done' ; } 2>&1 | awk '/^real/{print $2}')
  docker volume create ggd-io-probe >/dev/null 2>&1
  vol=$( { time -p docker run --rm -v ggd-io-probe:/w "$img" \
      sh -c 'i=0; while [ $i -lt 2000 ]; do echo x > /w/f$i; i=$((i+1)); done' ; } 2>&1 | awk '/^real/{print $2}')
  docker volume rm -f ggd-io-probe >/dev/null 2>&1; rm -rf "$tmp"
  info "2000 個小檔寫入:bind(virtiofs) ${bind}s   named volume ${vol}s"
  if [ -n "$bind" ] && [ -n "$vol" ]; then
    awk -v b="$bind" -v v="$vol" 'BEGIN{
      if (v>0 && b/v > 3) printf "  \033[31m✗\033[0m bind 慢 %.1f× ⇒ data/ 應改成 named volume（連帶要改備份路徑）\n", b/v;
      else if (v>0)       printf "  \033[32m✓\033[0m bind 只慢 %.1f× ⇒ 維持 bind 可接受\n", b/v; }'
  fi
}

case "${1:-all}" in
  arch) sec_arch ;; host) sec_host ;; net) sec_net ;; io) sec_io ;;
  all)  sec_arch; sec_host; sec_net; sec_io ;;
  *) echo "用法: $0 {all|arch|host|net|io}"; exit 2 ;;
esac
printf '\n%s' "$BLD"
[ "$FAIL" -eq 0 ] && printf '%s通過（%d 個 ⚠ 待人工確認）%s\n' "$GRN" "$WARN" "$RST" \
                  || printf '%s%d 個 ✗ —— ⛔ 不要開始搬%s\n' "$RED" "$FAIL" "$RST"
exit $(( FAIL > 0 ))

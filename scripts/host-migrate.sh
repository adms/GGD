#!/usr/bin/env bash
# scripts/host-migrate.sh — 把 docker/containerd/log 從開機碟搬到 SSD，並把搬完之後
# 會靜默失效的那幾件事關起來。
#
#   bash scripts/host-migrate.sh plan     # ⭐ 預設,唯讀 —— 量現況並印出計畫
#   bash scripts/host-migrate.sh run      # 真的搬（會停 daemon）
#   bash scripts/host-migrate.sh verify   # 只驗後置條件
#   bash scripts/host-migrate.sh harden   # 只做加固（不搬,不停 daemon）
#   bash scripts/host-migrate.sh reclaim  # 刪掉已驗證過的舊來源（要打字確認）
#
# ⛔ 這支腳本存在的理由是「憑記憶重打一個多步序列」已經出過事（CLAUDE.md 部署協定）。
#    2026-08-28 那次搬遷是手打的,而它踩到的三件事現在全部寫在下面。
#
# ═══ owner 的兩條硬規矩（逐字）═══
#   > 「！記得要使用 **cp 而不是 mv** 避免用戶終端後的資料不完整」
#   > 「請注意伺服器上的**註冊帳號資料**等都要保留好喔」
#
# ⇒ 這支腳本**永遠不會**對來源下 mv / rm / rsync --delete。刪除是一個**分開的**
#   子指令（reclaim）,而且要人打字確認。搬遷失敗的正確樣子是「兩份都在」。
#
# ═══ 2026-08-28 手動搬遷量到的三件事（⛔ 不是假設）═══
#   ① 先 prune build cache:  44.2G 裡 39.5G 是可回收的 build cache,而 image 只有 1.9G。
#      prune 之後檔案數 2.4M → 259k、複製速率 9 → 57 MB/s、估時 77 分 → 2 分。
#      ⭐ 「要搬多少」這一題的答案不是量出來的那個數字,是 prune 之後的那個。
#   ② Docker 29 用 containerd image store ⇒ 映像層住 /var/lib/containerd,
#      ⛔ 不在 DockerRootDir。只搬 DockerRootDir 會搬到一個 3.6G 的空殼。
#   ③ overlayfs 的硬連結只在**一次 cp 呼叫內**保得住 ⇒ 一個目錄一次 cp -a,
#      ⛔ 不可以逐子目錄分次複製（會把 155k 個硬連結展開成 155k 份實體檔）。
set -uo pipefail

# ─────────────────────────────────────────────────────────── 設定（可用環境變數覆寫）
DEST_ROOT="${GGD_MIGRATE_DEST:-/data}"          # 目的碟的掛載點
BUILD_CACHE_CAP="${GGD_BUILD_CACHE_CAP:-40GB}"  # prune 的位元組上限
MIN_FREE_GB="${GGD_MIN_FREE_GB:-20}"            # 目的碟至少要剩這麼多
LOG_MAX_SIZE="${GGD_LOG_MAX_SIZE:-64m}"         # 每個容器 log 檔上限
LOG_MAX_FILE="${GGD_LOG_MAX_FILE:-3}"           # 輪替份數
JOURNAL_CAP="${GGD_JOURNAL_CAP:-512M}"          # journald 上限

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
say()  { printf '%s\n' "$*"; }
head_() { printf '\n%s══ %s%s\n' "$BLD" "$*" "$RST"; }
ok()   { printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$YEL" "$RST" "$*"; }
die()  { printf '\n%s⛔ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }

FAILED=0
bad()  { printf '  %s✗%s %s\n' "$RED" "$RST" "$*"; FAILED=1; }

need_root() { [ "$(id -u)" -eq 0 ] || SUDO=sudo; : "${SUDO:=}"; }
need_root

# ═══════════════════════════════════════════════════════════ 共用量測
# ⭐ 這一段是「搬什麼」的唯一答案來源。⛔ 不要在別的地方再寫一份路徑清單 ——
#    第〇·四守則:同一個知識只有一個住處。
declare -a MOVE_SRC MOVE_DST MOVE_KIND
add_move() { MOVE_SRC+=("$1"); MOVE_DST+=("$2"); MOVE_KIND+=("$3"); }

discover() {
  MOVE_SRC=(); MOVE_DST=(); MOVE_KIND=()
  # containerd root —— Docker 29 的映像層真正的家
  local cd_root
  cd_root=$($SUDO containerd config dump 2>/dev/null | sed -n 's/^root = .\(.*\).$/\1/p' | head -1)
  cd_root="${cd_root:-/var/lib/containerd}"
  add_move "/var/lib/containerd" "$DEST_ROOT/containerd" "containerd 映像層與 snapshot"
  # docker root —— 容器、volume、container log
  local dk_root
  dk_root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)
  add_move "/var/lib/docker" "$DEST_ROOT/docker" "docker 容器/volume/log"
  # 其餘 owner 點名過的路徑,存在才算
  [ -d /var/lib/rancher ] && add_move "/var/lib/rancher" "$DEST_ROOT/rancher" "k3s/rancher（若有）"
  export DISCOVERED_CD_ROOT="$cd_root" DISCOVERED_DK_ROOT="$dk_root"
}

# ⭐ 「搬完了沒」的判準是**跑著的設定指向哪裡**,⛔ 不是「舊目錄還在不在」——
#    cp-not-mv 的整個重點就是舊目錄會留著,拿它當判準會把「已完成」讀成「還沒開始」。
#    （2026-08-28 實測:containerd 早就搬完了,而只看目錄的版本說它還沒搬。）
#    $1 = 來源路徑  $2 = 目的路徑
already_moved() {
  local s="$1" d="$2"
  [ -d "$d" ] || return 1                       # 目的地要真的有東西
  [ -L "$s" ] && [ "$(readlink -f "$s")" = "$(readlink -f "$d")" ] && return 0   # symlink 指過去了
  case "$d" in
    */containerd) [ "$(readlink -f "$DISCOVERED_CD_ROOT")" = "$(readlink -f "$d")" ] && return 0 ;;
    */docker)     [ "$(readlink -f "$DISCOVERED_DK_ROOT")" = "$(readlink -f "$d")" ] && return 0 ;;
  esac
  return 1
}
not_yet_moved() { ! already_moved "$1" "$2" && [ -d "$1" ] && [ -n "$($SUDO ls -A "$1" 2>/dev/null | head -1)" ]; }

# ═══════════════════════════════════════════════════════════ plan（唯讀）
cmd_plan() {
  discover
  head_ "0. 目的碟"
  mountpoint -q "$DEST_ROOT" && ok "$DEST_ROOT 是獨立掛載點" || bad "$DEST_ROOT ⛔ 不是掛載點 —— 搬過去等於沒搬"
  df -h "$DEST_ROOT" | tail -1 | awk '{printf "    %s  共 %s / 已用 %s / 剩 %s\n", $1,$2,$3,$4}'
  df -h / | tail -1 | awk '{printf "    %-14s 共 %s / 已用 %s / 剩 %s  ← 開機碟\n", $1,$2,$3,$4}'

  head_ "1. build cache（⭐ 先 prune,別先估時）"
  docker system df 2>/dev/null | sed 's/^/    /'
  say "    ⇒ 上面那張表如果 Build Cache 的 RECLAIMABLE 很大,那**不是要搬的東西**。"

  head_ "2. 要搬的路徑"
  local i
  for i in "${!MOVE_SRC[@]}"; do
    local s="${MOVE_SRC[$i]}" d="${MOVE_DST[$i]}"
    if not_yet_moved "$s" "$d"; then
      printf "    %-24s → %-22s %s  [%s]\n" "$s" "$d" "$($SUDO du -sh "$s" 2>/dev/null | cut -f1)" "${MOVE_KIND[$i]}"
    else
      ok "$s 已搬 → ${d}（$( [ -L "$s" ] && echo "symlink" || echo "設定指向" )）"
    fi
  done

  head_ "3. 搬完之後會靜默失效的（harden 會關掉）"
  check_hardening
  head_ "4. 舊來源（reclaim 的對象,⛔ 現在不會被動）"
  for i in "${!MOVE_SRC[@]}"; do
    local s="${MOVE_SRC[$i]}"
    if already_moved "$s" "${MOVE_DST[$i]}" && [ -d "$s" ] && [ ! -L "$s" ] && [ -n "$($SUDO ls -A "$s" 2>/dev/null | head -1)" ]; then
      warn "$s 仍佔 $($SUDO du -sh "$s" 2>/dev/null | cut -f1) —— 目的地也在 ⇒ 這是**刻意留的**副本"
    fi
  done
  say ""
  [ "$FAILED" -eq 0 ] && say "${GRN}計畫可執行${RST} ⇒ bash $0 run" || say "${RED}先修上面的 ✗${RST}"
  return "$FAILED"
}

# ═══════════════════════════════════════════════════════════ 加固檢查（plan 與 verify 共用）
check_hardening() {
  # ⓐ ⭐ 最重要的一條:daemon 有沒有宣告「我需要那顆碟掛上」
  #    fstab 的 nofail + 空的底層目錄 + 沒有 RequiresMountsFor
  #    ⇒ 碟掛不上時 dockerd 會在 / 上建一套**全新的空 store**,而它完全健康。
  #      症狀:docker ps 空的、volume 全沒、網站 502 —— 看起來像有人刪了東西。
  local rmf
  rmf=$(systemctl show docker.service -p RequiresMountsFor --value 2>/dev/null)
  case " $rmf " in
    *" $DEST_ROOT "*) ok "docker.service 宣告了 RequiresMountsFor=$DEST_ROOT" ;;
    *) bad "docker.service ⛔ 沒有 RequiresMountsFor=$DEST_ROOT —— 碟掛不上會起一套空的 store 而不報錯" ;;
  esac
  rmf=$(systemctl show containerd.service -p RequiresMountsFor --value 2>/dev/null)
  case " $rmf " in
    *" $DEST_ROOT "*) ok "containerd.service 宣告了 RequiresMountsFor=$DEST_ROOT" ;;
    *) bad "containerd.service ⛔ 沒有 RequiresMountsFor=$DEST_ROOT" ;;
  esac

  # ⓑ container log 上限。2026-08-28 量到 caddy 一個容器的 log 就 2.3G,
  #    比整個 image store 還大,而且只會長不會縮。
  if [ -f /etc/docker/daemon.json ] && grep -q '"max-size"' /etc/docker/daemon.json 2>/dev/null; then
    ok "docker 有 log 上限（daemon.json）"
  else
    bad "docker log ⛔ 無上限（json-file 預設）—— 已量到單一容器 2.3G"
  fi

  # ⓒ journald 上限。預設是「4G 或該碟 15%」,而它住在開機碟。
  if grep -qE '^\s*SystemMaxUse=' /etc/systemd/journald.conf 2>/dev/null; then
    ok "journald 有上限（$(grep -oE '^\s*SystemMaxUse=.*' /etc/systemd/journald.conf | tr -d ' '))"
  else
    bad "journald ⛔ 無上限 —— 目前 $($SUDO du -sh /var/log/journal 2>/dev/null | cut -f1) 在開機碟"
  fi
}

# ═══════════════════════════════════════════════════════════ run
cmd_run() {
  discover
  mountpoint -q "$DEST_ROOT" || die "$DEST_ROOT 不是掛載點 —— 搬過去等於沒搬"

  head_ "0. Redis 先落地（⛔ 不要靠 AOF 剛好開著）"
  if [ -x "$(dirname "$0")/redis-snapshot.sh" ]; then
    bash "$(dirname "$0")/redis-snapshot.sh" || warn "Redis 快照失敗 —— ⛔ 繼續搬,但你現在沒有那份保險"
  else
    warn "找不到 redis-snapshot.sh —— 跳過（#860）"
  fi

  head_ "1. prune build cache（⭐ 這一步決定了後面要跑幾分鐘）"
  local before after
  before=$(df -k / | tail -1 | awk '{print $4}')
  docker builder prune -f --max-used-space "$BUILD_CACHE_CAP" 2>&1 | tail -3 | sed 's/^/    /'
  after=$(df -k / | tail -1 | awk '{print $4}')
  ok "釋出 $(( (after - before) / 1024 / 1024 ))G（⛔ 零停機,這一步不用停 daemon）"

  head_ "2. 空間夠不夠"
  local need_kb free_kb i
  need_kb=0
  for i in "${!MOVE_SRC[@]}"; do
    not_yet_moved "${MOVE_SRC[$i]}" "${MOVE_DST[$i]}" || continue
    need_kb=$(( need_kb + $($SUDO du -sk "${MOVE_SRC[$i]}" 2>/dev/null | cut -f1) ))
  done
  free_kb=$(df -k "$DEST_ROOT" | tail -1 | awk '{print $4}')
  say "    要搬 $(( need_kb/1024/1024 ))G,目的地剩 $(( free_kb/1024/1024 ))G"
  [ "$free_kb" -gt $(( need_kb + MIN_FREE_GB*1024*1024 )) ] \
    || die "目的地空間不足（要 $(( need_kb/1024/1024 ))G + 保留 ${MIN_FREE_GB}G）"

  head_ "3. 停 daemon"
  say "    ⚠️ 從這一刻起網站是停的。"
  $SUDO systemctl stop docker.socket docker.service containerd.service || die "停不下來"
  sleep 2
  pgrep -x dockerd >/dev/null && die "dockerd 還活著 —— ⛔ 不要在它還開著檔的時候複製"
  ok "daemon 已停"

  head_ "4. 複製（⭐ cp 不是 mv;一個目錄一次呼叫）"
  for i in "${!MOVE_SRC[@]}"; do
    local s="${MOVE_SRC[$i]}" d="${MOVE_DST[$i]}"
    not_yet_moved "$s" "$d" || { ok "$s 已搬,跳過"; continue; }
    [ -e "$d" ] && die "$d 已存在 —— ⛔ 拒絕覆蓋（先確認它是不是上一次搬到一半的）"
    say "    $s → $d …"
    # -a 保 mode/owner/timestamp/symlink;--preserve=all 連 xattr 與硬連結
    # ⭐ 一個 cp 呼叫涵蓋整棵樹,硬連結才保得住（跨呼叫保不住）
    $SUDO cp -a --preserve=all "$s" "$d" || die "複製失敗 —— ⛔ 來源一個位元組都沒動,直接重跑"
    ok "$s 複製完成"
  done

  head_ "5. 驗證兩邊一致（⭐ 驗完才切,⛔ 不是切完才驗）"
  for i in "${!MOVE_SRC[@]}"; do
    [ -d "${MOVE_SRC[$i]}" ] && [ ! -L "${MOVE_SRC[$i]}" ] || continue
    verify_copy "${MOVE_SRC[$i]}" "${MOVE_DST[$i]}" || die "驗證失敗 —— ⛔ 不切換,來源完好"
  done

  head_ "6. 切換設定"
  for i in "${!MOVE_SRC[@]}"; do
    local s="${MOVE_SRC[$i]}"
    [ -L "$s" ] && continue
    not_yet_moved "$s" "${MOVE_DST[$i]}" || continue
    # ⛔ 不刪來源。改名成 .pre-migrate,reclaim 才刪。
    $SUDO mv "$s" "${s}.pre-migrate-$(date -u +%Y%m%dT%H%M%SZ)" || die "改名失敗"
    $SUDO ln -s "${MOVE_DST[$i]}" "$s" || die "建 symlink 失敗"
    ok "$s → symlink → ${MOVE_DST[$i]}（舊的留在 ${s}.pre-migrate-*）"
  done
  # containerd 的 root 是設定檔,不是 symlink —— 兩個都做,少一個就會分裂成兩份
  if ! $SUDO grep -qE "^root = \"$DEST_ROOT/containerd\"" /etc/containerd/config.toml 2>/dev/null; then
    $SUDO cp -a /etc/containerd/config.toml "/etc/containerd/config.toml.bak-$(date -u +%Y%m%dT%H%M%SZ)"
    if $SUDO grep -qE '^root = ' /etc/containerd/config.toml; then
      $SUDO sed -i "s|^root = .*|root = \"$DEST_ROOT/containerd\"|" /etc/containerd/config.toml
    else
      $SUDO sed -i "0,/^\[/s||root = \"$DEST_ROOT/containerd\"\n\n[|" /etc/containerd/config.toml
    fi
    ok "containerd root = $DEST_ROOT/containerd"
  fi

  head_ "7. 加固（⛔ 這一步不是可選的 —— 見 check_hardening 的註解）"
  do_harden

  head_ "8. 起 daemon"
  $SUDO systemctl daemon-reload
  $SUDO systemctl start containerd.service docker.service || die "起不來 —— journalctl -u docker -n 50"
  sleep 3
  ok "daemon 起來了"

  head_ "9. 後置條件"
  cmd_verify
}

# ═══════════════════════════════════════════════════════════ 複製驗證
# ⭐ 三個軸,缺一個就抓不到已知的故障:
#   檔案數 → 抓「複製到一半就斷了」
#   硬連結 → 抓「跨 cp 呼叫複製 ⇒ 155k 個硬連結被展開成實體檔」（大小會爆但檔案數一樣）
#   xattr  → 抓「overlayfs 的 trusted.overlay.* 沒帶過去 ⇒ 映像層讀不出來」
verify_copy() {
  local s="$1" d="$2" sf df_ sl dl
  sf=$($SUDO find "$s" -mount 2>/dev/null | wc -l); df_=$($SUDO find "$d" -mount 2>/dev/null | wc -l)
  [ "$sf" -eq "$df_" ] && ok "檔案數 $sf = $df_" || { bad "檔案數 $sf ≠ $df_"; return 1; }
  sl=$($SUDO find "$s" -mount -type f -links +1 2>/dev/null | wc -l)
  dl=$($SUDO find "$d" -mount -type f -links +1 2>/dev/null | wc -l)
  [ "$sl" -eq "$dl" ] && ok "硬連結 $sl = $dl" || { bad "硬連結 $sl ≠ $dl —— ⛔ 被展開了"; return 1; }
  # xattr:用 python 讀,⛔ 不要靠 getfattr（attr 套件常常沒裝,而它「失敗」看起來像
  #      「檔案系統不支援」—— 2026-08-28 我就這樣誤報了一次）
  python3 - "$s" "$d" <<'PY' || return 1
import os, sys
def scan(root):
    n = t = 0
    for dp, dns, fns in os.walk(root):
        for name in list(dns) + fns:
            p = os.path.join(dp, name)
            try:
                a = os.listxattr(p, follow_symlinks=False)
            except OSError:
                continue
            if a: n += 1; t += len(a)
    return n, t
a = scan(sys.argv[1]); b = scan(sys.argv[2])
print(f"  {'✓' if a==b else '✗'} xattr {a[0]} 個節點/{a[1]} 條 = {b[0]}/{b[1]}")
sys.exit(0 if a == b else 1)
PY
}

# ═══════════════════════════════════════════════════════════ harden
do_harden() {
  # ⓐ RequiresMountsFor —— 讓「碟沒掛上」變成一個**拒絕啟動**,⛔ 不是一套空的 store
  local u
  for u in docker containerd; do
    $SUDO mkdir -p "/etc/systemd/system/${u}.service.d"
    $SUDO tee "/etc/systemd/system/${u}.service.d/ggd-datadisk.conf" >/dev/null <<EOF
# GGD scripts/host-migrate.sh —— ⛔ 不要手改,重跑 harden
# 資料住 ${DEST_ROOT}。沒掛上就**不要啟動** —— 起一套空的 store 比不啟動糟得多:
# daemon 健康、docker ps 空的、網站 502,而看起來像有人把東西刪了。
[Unit]
RequiresMountsFor=$DEST_ROOT
EOF
  done
  # ⭐ 寫檔 ≠ systemd 讀到了。⛔ 少這一行的話 check_hardening 會紅,而檔案是對的 ——
  #    那正是「只驗名詞會綠而且是錯的」的反面:這裡驗的是**關係**,所以它抓得到。
  $SUDO systemctl daemon-reload
  ok "RequiresMountsFor=$DEST_ROOT 已寫進 docker/containerd 的 drop-in 並 daemon-reload"

  # ⓑ container log 上限
  local tmp; tmp=$(mktemp)
  if [ -f /etc/docker/daemon.json ]; then
    python3 - "$LOG_MAX_SIZE" "$LOG_MAX_FILE" >"$tmp" <<'PY'
import json, sys
try: d = json.load(open("/etc/docker/daemon.json"))
except Exception: d = {}
d["log-driver"] = "json-file"
d.setdefault("log-opts", {}).update({"max-size": sys.argv[1], "max-file": sys.argv[2]})
json.dump(d, sys.stdout, indent=2)
PY
  else
    printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "%s", "max-file": "%s" }\n}\n' "$LOG_MAX_SIZE" "$LOG_MAX_FILE" >"$tmp"
  fi
  $SUDO install -m 0644 "$tmp" /etc/docker/daemon.json && rm -f "$tmp"
  ok "docker log 上限 ${LOG_MAX_SIZE} × ${LOG_MAX_FILE}"
  warn "⚠️ log 上限只對**新建的容器**生效 —— 既有的要 docker compose up -d --force-recreate"

  # ⓒ journald 上限
  if ! grep -qE '^\s*SystemMaxUse=' /etc/systemd/journald.conf 2>/dev/null; then
    $SUDO sed -i "s|^#\?SystemMaxUse=.*|SystemMaxUse=$JOURNAL_CAP|" /etc/systemd/journald.conf
    grep -qE '^\s*SystemMaxUse=' /etc/systemd/journald.conf \
      || echo "SystemMaxUse=$JOURNAL_CAP" | $SUDO tee -a /etc/systemd/journald.conf >/dev/null
    $SUDO systemctl restart systemd-journald 2>/dev/null
    ok "journald 上限 $JOURNAL_CAP"
  else
    ok "journald 已有上限"
  fi
}
cmd_harden() { head_ "加固"; do_harden; head_ "複驗"; FAILED=0; check_hardening; return "$FAILED"; }

# ═══════════════════════════════════════════════════════════ verify（後置條件）
# ⭐ 每一條都問「**兩個名詞的關係**」,⛔ 不是「這個名詞在不在」——
#   2026-08-02 的生產事故就是四項只驗名詞的後置條件全綠而網站不能玩。
cmd_verify() {
  FAILED=0
  discover
  head_ "① daemon 認得新家嗎（⛔ 不是「目錄在不在」）"
  local dk cd_
  dk=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)
  cd_=$($SUDO containerd config dump 2>/dev/null | sed -n 's/^root = .\(.*\).$/\1/p' | head -1)
  [ "$(readlink -f "$dk")" = "$(readlink -f "$DEST_ROOT/docker")" ] \
    && ok "DockerRootDir → $dk" || bad "DockerRootDir = ${dk}（期望 $DEST_ROOT/docker）"
  [ "$(readlink -f "$cd_")" = "$(readlink -f "$DEST_ROOT/containerd")" ] \
    && ok "containerd root = $cd_" || bad "containerd root = ${cd_}（期望 $DEST_ROOT/containerd）"

  head_ "② ⭐ 承重驗證:真的寫一次,看位元組落在哪一顆碟"
  # ⛔ 「設定寫對了」證明不了「它真的往那裡寫」。拉一顆小映像,量兩邊的增量。
  local b_new b_old a_new a_old
  b_new=$($SUDO du -sk "$DEST_ROOT/containerd" 2>/dev/null | cut -f1)
  b_old=$($SUDO du -sk /var/lib/containerd.pre-migrate-* 2>/dev/null | awk '{s+=$1} END{print s+0}')
  docker pull -q hello-world:latest >/dev/null 2>&1
  a_new=$($SUDO du -sk "$DEST_ROOT/containerd" 2>/dev/null | cut -f1)
  a_old=$($SUDO du -sk /var/lib/containerd.pre-migrate-* 2>/dev/null | awk '{s+=$1} END{print s+0}')
  say "    新家 +$(( (a_new-b_new)/1024 ))M   舊來源 +$(( (a_old-b_old)/1024 ))M"
  [ $(( a_new - b_new )) -gt 0 ] && [ $(( a_old - b_old )) -eq 0 ] \
    && ok "位元組真的落在新家,舊來源零增量" \
    || bad "⛔ 拉映像沒有寫進新家（或舊來源還在被寫）—— 設定沒有真的生效"
  docker rmi -f hello-world:latest >/dev/null 2>&1

  head_ "③ 加固"
  check_hardening

  head_ "④ 服務"
  local c
  for c in $(docker ps -a --format '{{.Names}}' 2>/dev/null | grep '^ggd-'); do
    local st; st=$(docker inspect "$c" --format '{{.State.Status}}')
    [ "$st" = running ] && ok "$c $st" || warn "$c $st"
  done
  # ⭐ 「容器在跑」≠「站是活的」—— 兩個名詞的關係要自己問一次
  if curl -fsS -m 5 http://127.0.0.1:2567/healthz -o /tmp/hz.$$ 2>/dev/null; then
    python3 - </tmp/hz.$$ <<'PY'
import json,sys
try: d=json.load(sys.stdin)
except Exception: print("  ⚠ /healthz 不是 JSON"); sys.exit(0)
c=d.get("content",{}); r=d.get("replay",{})
print(f"  {'✓' if c.get('ok') else '✗'} content.ok={c.get('ok')} champions={c.get('champions')}")
print(f"  {'✓' if r.get('ok') else '✗'} replay.ok={r.get('ok')}")
PY
    rm -f /tmp/hz.$$
  else
    warn "/healthz 沒回應（game shard 沒起來?）"
  fi

  head_ "⑤ 離站備份（GH#857）"
  # ⭐ 搬遷會**放大**這個風險:搬完之後唯一的副本會在新機器上。
  #   ⇒ 在搬遷的驗證裡問一次,⛔ 不是「之後再說」。
  if [ -x "$(dirname "$0")/offsite-backup.sh" ]; then
    bash "$(dirname "$0")/offsite-backup.sh" audit 2>&1 | sed -n '2,4p' | sed 's/^/  /'
  else
    warn "找不到 offsite-backup.sh"
  fi

  head_ "⑥ 開機碟現況"
  df -h / | tail -1 | awk '{printf "    已用 %s（%s）剩 %s\n", $3,$5,$4}'
  local i
  for i in "${!MOVE_SRC[@]}"; do
    local leftovers; leftovers=$(ls -d "${MOVE_SRC[$i]}".pre-migrate-* 2>/dev/null)
    [ -n "$leftovers" ] && warn "舊來源仍在:${leftovers}（$($SUDO du -sh $leftovers 2>/dev/null | cut -f1)）⇒ 驗完可 reclaim"
  done
  say ""
  [ "$FAILED" -eq 0 ] && say "${GRN}後置條件全過${RST}" || say "${RED}有 ✗ —— ⛔ 不要 reclaim${RST}"
  return "$FAILED"
}

# ═══════════════════════════════════════════════════════════ reclaim
cmd_reclaim() {
  head_ "刪除已驗證的舊來源"
  say "  ⛔ 這是唯一會刪東西的子指令,而且它先跑一次完整 verify。"
  cmd_verify >/dev/null 2>&1 || die "verify 沒過 —— ⛔ 拒絕刪除"
  ok "verify 通過"
  discover
  local -a targets=() i
  for i in "${!MOVE_SRC[@]}"; do
    local g; for g in "${MOVE_SRC[$i]}".pre-migrate-*; do [ -e "$g" ] && targets+=("$g"); done
  done
  [ "${#targets[@]}" -gt 0 ] || { ok "沒有東西要刪"; return 0; }
  local t; for t in "${targets[@]}"; do say "    $t  $($SUDO du -sh "$t" 2>/dev/null | cut -f1)"; done
  say ""
  read -r -p "  打 DELETE 確認（其餘一律取消）: " ans
  [ "$ans" = "DELETE" ] || die "取消 —— 一個位元組都沒動"
  for t in "${targets[@]}"; do $SUDO rm -rf "$t" && ok "已刪 $t"; done
}

case "${1:-plan}" in
  plan)    cmd_plan ;;
  run)     cmd_run ;;
  verify)  cmd_verify ;;
  harden)  cmd_harden ;;
  reclaim) cmd_reclaim ;;
  *) die "用法: $0 {plan|run|verify|harden|reclaim}" ;;
esac

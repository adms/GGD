#!/usr/bin/env bash
# scripts/mac-boot-guard.sh — Mac mini 開機時把站帶起來,而且**壞掉要說話**。
#
#   bash scripts/mac-boot-guard.sh check      # 只驗前置條件（唯讀）
#   bash scripts/mac-boot-guard.sh start      # 驗 → compose up → 驗站活著
#   bash scripts/mac-boot-guard.sh install    # 裝成 launchd（開機自動跑）
#   bash scripts/mac-boot-guard.sh uninstall
#   bash scripts/mac-boot-guard.sh status
#
# ═══ 它為什麼必須存在（三個 Linux 上有、macOS 上沒有的東西）═══
#
# ① ⭐ `RequiresMountsFor` 在 macOS 上**不存在**。
#    正式機那顆炸彈是:資料碟掛不上 ⇒ dockerd 在原地建**一套全新的空 store**
#    ⇒ 容器全沒、站 502,⭐ **而 daemon 完全健康**。
#    Linux 用 systemd drop-in 讓它「碟沒掛就拒絕啟動」;macOS 只能靠這支腳本先驗。
#
# ② ⭐ `edge` 是 `restart: "no"`,而那是**刻意的**（compose.family.yaml:248 ——
#    overlay 缺失時要大聲失敗,⛔ 不是無限重啟）。代價是**重開機不會自己回來**。
#    GCP 幾乎不重開,⛔ 但家用機會斷電 ⇒ 需要有人在開機時跑一次 compose up。
#
# ③ ⭐ Docker Desktop / OrbStack 是**使用者層**程式 ⇒ 沒有自動登入的話它根本不啟動,
#    而 Mac 看起來完全正常（ssh 進得去、風扇在轉）。
#
# ═══ fail-loud（CLAUDE.md:「fail-open 沒錯,靜默才是缺陷」）═══
#   這支腳本失敗時做四件事,⛔ 不是寫一行沒有人讀的 log:
#     1. exit 非零（launchd 記得到）
#     2. 寫 data/boot-status.json（含**失敗原因**,⛔ 不是只有 ok:false）
#     3. macOS 通知（有 GUI session 時看得到）
#     4. GGD_ALERT_WEBHOOK 有設就打過去
#   ⚠️ **誠實說**:沒設 webhook 的話,一台無人值守的機器失敗仍然是**安靜的**。
#     ⇒ 設 webhook 是這條防線唯一真正有效的那一半。
set -uo pipefail
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
head_(){ printf '\n%s══ %s%s\n' "$BLD" "$*" "$RST"; }
ok(){ printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn(){ printf '  %s⚠%s %s\n' "$YEL" "$RST" "$*"; }
info(){ printf '    %s\n' "$*"; }

REPO="${GGD_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
# ⛔ launchd 給的 PATH 不含 OrbStack 的 CLI（同 mini-deploy.sh 踩過的那個）
export PATH="$HOME/.orbstack/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
LABEL="ai.adms.ggd.boot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="${GGD_BOOT_LOG:-$HOME/Library/Logs/ggd-boot.log}"
STATUS="$REPO/data/boot-status.json"
REASONS=()
fail(){ printf '  %s✗%s %s\n' "$RED" "$RST" "$1"; REASONS+=("$1"); }

# ⭐ 大聲說出來 —— 四個管道,⛔ 不是一行 log
announce() {
  local state="$1"; shift
  local msg="$*"
  mkdir -p "$(dirname "$STATUS")" 2>/dev/null
  # ⛔⛔ 這裡**曾經**用 python3 寫 JSON,而 macOS 上的 /usr/bin/python3 是
  #   **Command Line Tools 的 stub** —— 沒裝 CLT 時它不但失敗,還會**彈一個 GUI 對話框**。
  #   ⇒ 2026-08-29 實測:守衛印著「站起來了」,而 `boot-status.json` **是空的**
  #     ⭐ 一個報告成功、而心跳從來沒寫過的守衛 —— 而 `status` 與備份稽核都讀它。
  # ⭐ 判準:**開機時要跑的東西,只能用系統保證存在的工具**（sh / awk / sed / date）。
  #   ⛔ python3 / git / make / cc 在乾淨的 macOS 上**都不是**。
  printf '{\n  "ok": %s,\n  "state": "%s",\n  "reason": "%s",\n  "at": "%s",\n  "host": "%s"\n}\n' \
    "$([ "$state" = ok ] && echo true || echo false)" \
    "$state" \
    "$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$(hostname -s 2>/dev/null || echo '?')" \
    > "$STATUS" 2>/dev/null
  if [ "$state" != ok ]; then
    osascript -e "display notification \"$msg\" with title \"GGD 開機守衛\" sound name \"Basso\"" >/dev/null 2>&1
    # ⛔ 同上 —— ⛔ 不用 python3。訊息是我們自己產的,只需要逃掉引號與換行。
    if [ -n "${GGD_ALERT_WEBHOOK:-}" ]; then
      esc=$(printf '%s' "GGD 開機守衛：$msg" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
      curl -fsS -m 10 -X POST -H 'content-type: application/json' \
        --data "{\"text\":\"$esc\"}" "$GGD_ALERT_WEBHOOK" >/dev/null 2>&1
    fi
  fi
}

# ═══════════════════════════════════════ check
cmd_check() {
  head_ "前置條件"
  REASONS=()

  # ⓐ ⭐ 資料碟 —— macOS 版的 RequiresMountsFor
  if [ -n "${GGD_DATA_VOLUME:-}" ]; then
    if mount | grep -q " on $GGD_DATA_VOLUME "; then ok "資料碟 $GGD_DATA_VOLUME 已掛載"
    else fail "資料碟 $GGD_DATA_VOLUME **沒掛上** —— ⛔ 現在啟動 daemon 會建一套空的 store"; fi
  else
    info "（沒設 GGD_DATA_VOLUME ⇒ 資料在內建 SSD,這一條不適用）"
  fi

  # ⓑ ⭐ repo 與資料真的在（⛔ 不是「路徑存在」,是「裡面真的有帳號」）
  if [ -d "$REPO/data/accounts" ] && [ -n "$(ls -A "$REPO/data/accounts" 2>/dev/null | head -1)" ]; then
    ok "帳號資料在（$(find "$REPO/data/accounts" -type f 2>/dev/null | wc -l | tr -d ' ') 個檔）"
  else
    fail "$REPO/data/accounts 是空的或不存在 —— ⛔ 這通常表示資料碟掛錯地方"
  fi

  # ⓒ ⭐ docker —— ⛔ 不只是「檢查」,而是**負責把它弄起來**
  #
  # ⛔⛔ 2026-08-29 的重開機實測:自動登入成功、GUI session 在、守衛也跑了,
  #   ⭐ **而 OrbStack 是 0 個程序** ⇒ docker 不通 ⇒ 守衛 exit 1 ⇒ 站沒回來。
  #   根因:OrbStack 是 GUI App,用 `cp` 裝進 /Applications **不會**註冊成登入項目。
  #
  # ⭐ 修法是讓守衛**自己啟動它**,⛔ 不是去依賴一個要人在 GUI 裡勾的設定 ——
  #   那個勾在重灌、換帳號、App 更新之後都可能消失,而它消失的樣子是**站不會回來**。
  #   （這與整份 CLAUDE.md 的「閘,⛔ 不是判準」是同一條。）
  ensure_docker() {
    docker info >/dev/null 2>&1 && return 0
    local app
    for app in /Applications/OrbStack.app "$HOME/Applications/OrbStack.app" /Applications/Docker.app; do
      [ -d "$app" ] || continue
      info "啟動 $(basename "$app")…"
      open "$app" >/dev/null 2>&1
      # ⚠️ 開機後 VM 要一段時間才好 —— 給它 90 秒,⛔ 不是試一次就放棄
      local i
      for i in $(seq 1 45); do
        docker info >/dev/null 2>&1 && return 0
        /bin/sleep 2
      done
    done
    return 1
  }
  if ensure_docker; then
    ok "docker 通了（$(docker info --format '{{.Architecture}} {{.NCPU}} 核' 2>/dev/null)）"
  else
    fail "docker 起不來 —— 檢查 /Applications 裡有沒有 OrbStack.app,以及 GUI session 在不在"
  fi

  # ⓓ secrets（compose 的 ${VAR:?} 會擋,但擋的時候訊息很難懂）
  [ -f "$REPO/docker/.env" ] && ok "docker/.env 在" || fail "缺 docker/.env —— compose 會以難懂的訊息失敗"

  # ⭐ 離站備份的年齡（GH#857）—— ⛔ **不進 REASONS**:備份壞了不該讓站起不來,
  #   但它必須在**有人會看到的地方**出現。#857 的整個教訓是「它死掉那天,
  #   沒有任何東西變得不一樣」—— 而開機是這台機器每次都會經過的路。
  if [ -x "$REPO/scripts/offsite-backup.sh" ]; then
    bash "$REPO/scripts/offsite-backup.sh" audit >/dev/null 2>&1 \
      && ok "離站備份是新的" \
      || warn "⛔ 離站備份過期或從來沒成功過 —— bash scripts/offsite-backup.sh audit"
  fi

  [ "${#REASONS[@]}" -eq 0 ]
}

# ═══════════════════════════════════════ start
cmd_start() {
  exec 3>&1
  if ! cmd_check; then
    local why; why=$(printf '%s；' "${REASONS[@]}")
    announce blocked "$why"
    printf '\n%s⛔ 前置條件沒過 —— ⛔ 不啟動（啟動只會製造更難查的狀態）%s\n' "$RED" "$RST"
    return 1
  fi

  head_ "啟動"
  ( cd "$REPO" && docker compose -f docker/compose.yaml -f docker/compose.family.yaml \
      --env-file docker/.env up -d ) || { announce failed "compose up 失敗"; return 1; }

  # ⭐ 「compose up 沒報錯」⛔ 不等於站活著 —— edge 是 restart:"no",它可以**乾淨地退出**
  head_ "驗站真的活著（⛔ 不是「指令沒報錯」）"
  local i up=0
  for i in $(seq 1 30); do
    curl -fsS -m 3 -o /dev/null http://127.0.0.1:8088/ 2>/dev/null && { up=1; break; }
    /bin/sleep 2
  done
  if [ "$up" -eq 0 ]; then
    local dead; dead=$(docker ps -a --filter 'name=ggd-' --filter 'status=exited' --format '{{.Names}}' | tr '\n' ' ')
    announce failed "edge 沒有回應；已退出的容器：${dead:-（無）}"
    printf '\n%s⛔ 容器起來了但站沒有回應%s\n' "$RED" "$RST"
    info "已退出：${dead:-（無）}　⇒ docker logs <name> 看原因"
    info "⭐ edge 是 restart:\"no\" —— 它**乾淨地退出**通常表示 blizzard-overlay 缺失或短少"
    return 1
  fi
  ok "edge 回應了"
  # ⛔ 不用 python3（見上）—— healthz 是扁平的 JSON,tr+grep 就夠
  curl -fsS -m 5 http://127.0.0.1:2567/healthz 2>/dev/null \
    | tr ',' '\n' | grep -E '"ok":|champions|writable' | head -5 | sed 's/^/    /'
  announce ok "站已啟動"
  printf '\n%s站起來了%s\n' "$GRN" "$RST"
}

# ═══════════════════════════════════════ install / uninstall / status
cmd_install() {
  mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$REPO/scripts/mac-boot-guard.sh</string><string>start</string></array>
  <key>RunAtLoad</key><true/>
  <!-- ⭐ KeepAlive 只在**失敗**時重試,⛔ 不是常駐 —— start 成功之後就該結束 -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <!-- ⚠️ 重試要有間隔:docker 在開機後要一兩分鐘才會好,⛔ 不要每秒炸一次 -->
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key><dict>
    <key>GGD_REPO</key><string>$REPO</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
$([ -n "${GGD_DATA_VOLUME:-}" ] && printf '    <key>GGD_DATA_VOLUME</key><string>%s</string>\n' "$GGD_DATA_VOLUME")
$([ -n "${GGD_ALERT_WEBHOOK:-}" ] && printf '    <key>GGD_ALERT_WEBHOOK</key><string>%s</string>\n' "$GGD_ALERT_WEBHOOK")
  </dict>
</dict></plist>
PLIST_EOF
  launchctl unload "$PLIST" >/dev/null 2>&1
  launchctl load  "$PLIST" && ok "已裝 $LABEL" || { warn "launchctl load 失敗"; return 1; }
  info "plist $PLIST"
  info "log   $LOG"
  [ -n "${GGD_ALERT_WEBHOOK:-}" ] || warn "⛔ 沒設 GGD_ALERT_WEBHOOK —— 失敗時這台機器**不會通知任何人**（誠實說:這條防線只剩一半）"
}
cmd_uninstall(){ launchctl unload "$PLIST" >/dev/null 2>&1; rm -f "$PLIST" && ok "已移除"; }
cmd_status(){
  launchctl list 2>/dev/null | grep -q "$LABEL" && ok "launchd 有註冊 $LABEL" || warn "launchd **沒有**註冊 —— 重開機不會自己起來"
  [ -f "$STATUS" ] && { info "上一次："; sed 's/^/      /' "$STATUS"; } || info "（還沒跑過）"
}

case "${1:-check}" in
  check) cmd_check && printf '\n%s前置條件全過%s\n' "$GRN" "$RST" || { printf '\n%s%d 項不過%s\n' "$RED" "${#REASONS[@]}" "$RST"; exit 1; } ;;
  start) cmd_start ;;
  install) cmd_install ;;
  uninstall) cmd_uninstall ;;
  status) cmd_status ;;
  *) echo "用法: $0 {check|start|install|uninstall|status}"; exit 2 ;;
esac

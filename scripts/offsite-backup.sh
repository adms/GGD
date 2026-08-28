#!/usr/bin/env bash
# scripts/offsite-backup.sh — 定期把「不能重建的那一份」送出這台機器,
#                             ⭐ 而且讓它的**缺席可見**。
#
#   bash scripts/offsite-backup.sh run       # 匯出 → 送走 → 修剪 → 記心跳
#   bash scripts/offsite-backup.sh audit     # ⭐ 只問「上一次成功是多久以前」（唯讀,可當閘）
#   bash scripts/offsite-backup.sh install   # 排程（Linux=cron / macOS=launchd）
#   bash scripts/offsite-backup.sh uninstall
#
# ═══ #857 的根因**不是**「沒有排程」═══
# 2026-08-28 量到:離站備份已經死了 **31 天**（最後一份 data-20260728T122404Z.tgz）,
# crontab 是空的、沒有 systemd timer、⭐ 而且所有備份都躺在**開機碟上**（從來沒離站）。
#
# ⭐ 真正的缺陷是:**它死掉的那一天,沒有任何東西變得不一樣。**
#   ⇒ 光是「重新排程」會在下一次靜默死亡時完全重演。
#   ⇒ 所以這支腳本的一半是傳輸,**另一半是心跳**:
#     每次成功寫 `data/backup-status.json`,而 `audit` 讀它的年齡並在**過期時回非零**。
#     把 audit 掛進任何一條會被人看到的閘（ship:check / 開機守衛 / cron 自己）
#     ⇒ 「備份死了」就變成一件**會紅的事**,⛔ 不是一件沒有人發現的事。
#
# ═══ 目的地（⭐ 一定要離開這台機器）═══
#   GGD_BACKUP_DEST  必填。任何 rsync 認得的目標:
#       user@host:/path            （另一台機器 —— 最低限度）
#       /Volumes/BackupSSD/ggd     （外接碟 —— ⚠️ 同一棟樓,火災/失竊擋不住）
#   ⛔ 目的地在**同一顆碟上**會被拒絕 —— 那不叫備份,那叫第二份副本。
set -uo pipefail
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
head_(){ printf '\n%s══ %s%s\n' "$BLD" "$*" "$RST"; }
ok(){ printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn(){ printf '  %s⚠%s %s\n' "$YEL" "$RST" "$*"; }
die(){ printf '\n%s⛔ %s%s\n' "$RED" "$*" "$RST" >&2; alert "$*"; exit 1; }
info(){ printf '    %s\n' "$*"; }

REPO="${GGD_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
DEST="${GGD_BACKUP_DEST:-}"
KEEP="${GGD_BACKUP_KEEP:-7}"
MAX_AGE_H="${GGD_BACKUP_MAX_AGE_HOURS:-30}"     # 每日一次 ⇒ 30 小時還沒成功就是壞了
STATUS="$REPO/data/backup-status.json"
STAGE="${GGD_BACKUP_STAGE:-${TMPDIR:-/tmp}/ggd-backup-stage}"
LABEL="ai.adms.ggd.backup"

# ⭐ 大聲 —— #857 死掉時唯一缺的就是這個
alert() {
  local msg="$*"
  osascript -e "display notification \"$msg\" with title \"GGD 離站備份\" sound name \"Basso\"" >/dev/null 2>&1
  local hook="${GGD_ALERT_WEBHOOK:-${GGD_SLACK_WEBHOOK_URL:-}}"
  [ -n "$hook" ] && curl -fsS -m 10 -X POST -H 'content-type: application/json' \
      --data "{\"text\":\"$(printf '%s' "GGD 離站備份：$msg" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')\"}" \\
      "$hook" >/dev/null 2>&1
  logger -t ggd-backup "$msg" 2>/dev/null
}

stamp_status() {
  mkdir -p "$(dirname "$STATUS")" 2>/dev/null
  # ⛔ 不用 python3 —— macOS 上它是 CLT stub（會失敗且彈 GUI 對話框）。
  # ⭐ 排程跑的東西只能用系統保證存在的工具（sh/sed/date）。
  _po=$(sed -n 's/.*"last_success"[ ]*:[ ]*"\([^"]*\)".*/\1/p' "$STATUS" 2>/dev/null | head -1)
  _pe=$(sed -n 's/.*"last_success_epoch"[ ]*:[ ]*\([0-9]*\).*/\1/p' "$STATUS" 2>/dev/null | head -1)
  _now=$(date -u +%Y-%m-%dT%H:%M:%SZ); _nowe=$(date +%s)
  if [ "$1" = ok ]; then _po="$_now"; _pe="$_nowe"; fi
  printf '{\n  "state": "%s",\n  "dest": "%s",\n  "note": "%s",\n  "at": "%s",\n  "at_epoch": %s,\n  "last_success": "%s",\n  "last_success_epoch": %s\n}\n' \
    "$1" "$2" "${3:-}" "$_now" "$_nowe" "${_po:-}" "${_pe:-0}" > "$STATUS" 2>/dev/null
}

# ═══════════════════════════════════════ audit —— ⭐ 這一段才是 #857 的修法
cmd_audit() {
  head_ "離站備份的年齡"
  if [ ! -f "$STATUS" ]; then
    printf '  %s✗%s ⛔ 從來沒成功過（沒有 %s）\n' "$RED" "$RST" "$STATUS"
    info "⭐ 這正是 #857 的樣子:沒有任何東西變紅,而備份已經死了 31 天。"
    return 1
  fi
  # ⛔ 不用 python3（見 stamp_status）
  local _e _now age
  _e=$(sed -n 's/.*"last_success_epoch"[ ]*:[ ]*\([0-9]*\).*/\1/p' "$STATUS" 2>/dev/null | head -1)
  _now=$(date +%s)
  if [ -z "$_e" ] || [ "$_e" = 0 ]; then age=-1; else age=$(( (_now - _e) / 3600 )); fi
  if [ "${age:--1}" -lt 0 ]; then
    printf '  %s✗%s ⛔ 沒有成功紀錄\n' "$RED" "$RST"; return 1
  fi
  info "上一次成功：$(sed -n 's/.*"last_success"[ ]*:[ ]*"\\([^"]*\\)".*/\\1/p' "$STATUS" 2>/dev/null | head -1)（${age} 小時前）"
  if [ "$age" -le "$MAX_AGE_H" ]; then ok "在 ${MAX_AGE_H} 小時的門檻內"; return 0
  else
    printf '  %s✗%s ⛔ 已經 %s 小時沒有成功的離站備份（門檻 %s）\n' "$RED" "$RST" "$age" "$MAX_AGE_H"
    alert "已經 ${age} 小時沒有成功的離站備份"
    return 1
  fi
}

# ═══════════════════════════════════════ run
cmd_run() {
  [ -n "$DEST" ] || die "⛔ 沒設 GGD_BACKUP_DEST —— 一份沒有目的地的備份不是備份"

  # ⭐ 目的地在同一顆碟上 ＝ 第二份副本,⛔ 不是備份。火災/失竊/檔案系統毀損一起帶走。
  case "$DEST" in
    *:*) : ;;   # 遠端,一定不同碟
    *)
      local dev_src dev_dst
      dev_src=$(df -P "$REPO" 2>/dev/null | tail -1 | awk '{print $1}')
      dev_dst=$(df -P "$(dirname "$DEST")" 2>/dev/null | tail -1 | awk '{print $1}')
      [ -n "$dev_dst" ] && [ "$dev_src" = "$dev_dst" ] \
        && die "⛔ 目的地與來源在同一顆碟（$dev_src）—— 那不叫備份,那叫第二份副本"
      ;;
  esac

  head_ "1. 匯出"
  rm -rf "$STAGE"; mkdir -p "$STAGE"
  GGD_EXPORT_OUT="$STAGE" GGD_REPO="$REPO" bash "$REPO/scripts/site-export.sh" --with-secrets >/dev/null 2>&1 \
    || { stamp_status failed "$DEST" "site-export.sh 非零"; die "匯出失敗"; }
  local B; B=$(ls -d "$STAGE"/ggd-export_temp_* 2>/dev/null | tail -1)
  [ -n "$B" ] || { stamp_status failed "$DEST" "沒有產出包"; die "匯出沒有產出包"; }
  ok "$(basename "$B")  $(du -sh "$B" | cut -f1)"
  warn "⚠️ 這一包含 secrets（--with-secrets）⇒ 目的地必須是**你信任的地方**"

  head_ "2. 送走"
  rsync -a --partial "$B" "$DEST/" 2>&1 | tail -3 \
    || { stamp_status failed "$DEST" "rsync 非零"; die "傳輸失敗"; }
  # ⭐ 「rsync 沒報錯」⛔ 不等於「東西到了」—— 遠端問一次
  case "$DEST" in
    *:*) local h="${DEST%%:*}" pth="${DEST#*:}"
         ssh -o ConnectTimeout=15 "$h" "test -f '$pth/$(basename "$B")/MANIFEST.txt'" \
           || { stamp_status failed "$DEST" "遠端讀不到 MANIFEST"; die "傳輸「成功」但遠端讀不到 MANIFEST —— ⛔ 這不是備份"; } ;;
    *) [ -f "$DEST/$(basename "$B")/MANIFEST.txt" ] \
           || { stamp_status failed "$DEST" "目的地讀不到 MANIFEST"; die "目的地讀不到 MANIFEST"; } ;;
  esac
  ok "已到達並驗到 MANIFEST"

  head_ "3. 修剪（保留最近 $KEEP 份）"
  case "$DEST" in
    *:*) ssh -o ConnectTimeout=15 "${DEST%%:*}" \
           "ls -1dt '${DEST#*:}'/ggd-export_temp_* 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -rf" \
           && ok "遠端已修剪" ;;
    *) ls -1dt "$DEST"/ggd-export_temp_* 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -rf && ok "已修剪" ;;
  esac
  rm -rf "$STAGE"
  stamp_status ok "$DEST" "$(basename "$B")"
  head_ "完成"; info "心跳寫進 $STATUS ⇒ ⭐ 用 `$0 audit` 問它的年齡"
}

# ═══════════════════════════════════════ install
cmd_install() {
  [ -n "$DEST" ] || die "⛔ 先設 GGD_BACKUP_DEST 再裝"
  if [ "$(uname -s)" = Darwin ]; then
    local P="$HOME/Library/LaunchAgents/$LABEL.plist"
    mkdir -p "$(dirname "$P")" "$HOME/Library/Logs"
    cat > "$P" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$REPO/scripts/offsite-backup.sh</string><string>run</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>17</integer></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/ggd-backup.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/ggd-backup.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>GGD_REPO</key><string>$REPO</string>
    <key>GGD_BACKUP_DEST</key><string>$DEST</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
$([ -n "${GGD_ALERT_WEBHOOK:-}" ] && printf '    <key>GGD_ALERT_WEBHOOK</key><string>%s</string>\n' "$GGD_ALERT_WEBHOOK")
  </dict>
</dict></plist>
PL
    launchctl unload "$P" >/dev/null 2>&1; launchctl load "$P" && ok "launchd 已裝（每天 04:17）"
  else
    local line="17 4 * * * GGD_REPO='$REPO' GGD_BACKUP_DEST='$DEST' bash '$REPO/scripts/offsite-backup.sh' run >> /var/log/ggd-backup.log 2>&1"
    ( crontab -l 2>/dev/null | grep -v offsite-backup.sh; echo "$line" ) | crontab - && ok "cron 已裝（每天 04:17）"
  fi
  warn "⭐ 裝完**立刻跑一次 run** —— 一個從來沒成功過的排程與沒有排程沒有差別"
  [ -n "${GGD_ALERT_WEBHOOK:-${GGD_SLACK_WEBHOOK_URL:-}}" ] \
    || warn "⛔ 沒有告警管道 —— 它下次靜默死掉時,你仍然不會知道（＝#857 重演）"
}
cmd_uninstall() {
  if [ "$(uname -s)" = Darwin ]; then
    launchctl unload "$HOME/Library/LaunchAgents/$LABEL.plist" >/dev/null 2>&1
    rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
  else crontab -l 2>/dev/null | grep -v offsite-backup.sh | crontab -; fi
  ok "已移除"
}

case "${1:-audit}" in
  run) cmd_run ;; audit) cmd_audit ;; install) cmd_install ;; uninstall) cmd_uninstall ;;
  *) echo "用法: $0 {run|audit|install|uninstall}"; exit 2 ;;
esac

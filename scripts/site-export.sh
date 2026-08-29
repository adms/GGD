#!/usr/bin/env bash
# scripts/site-export.sh — 把「不能重建的那一份」打包成一個**可驗證**的搬遷包。
#
#   bash scripts/site-export.sh                      # 打包到 /data/site-export/
#   bash scripts/site-export.sh --out /path          # 指定落點
#   bash scripts/site-export.sh --with-secrets       # ⚠️ 連 docker/.env 一起（預設**不**帶）
#   bash scripts/site-export.sh --dry-run            # 只列清單與大小
#
# ⭐ 這支腳本的產出**不是一包 tar**,是「一包 tar ＋ 一份 manifest」——
#   而 manifest 裡放的是**驗收條件**（帳號數、redis key 數、逐檔校驗和）,
#   讓對面的 site-import.sh 有東西可以對。
#   ⛔ 「tar 解得開」不是搬遷成功的證據;「兩邊的帳號數一樣」才是。
#
# ═══ owner 的規矩（逐字）═══
#   > 「請注意伺服器上的**註冊帳號資料**等都要保留好喔」
#   > 「！記得要使用 **cp 而不是 mv** 避免用戶終端後的資料不完整」
#   > 「如果**已經有壓縮檔 就不要搬遷原檔** 沒必要也不影響運作」   ← 2026-08-28
set -uo pipefail
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
head_(){ printf '\n%s══ %s%s\n' "$BLD" "$*" "$RST"; }
ok(){ printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn(){ printf '  %s⚠%s %s\n' "$YEL" "$RST" "$*"; }
die(){ printf '\n%s⛔ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }
info(){ printf '    %s\n' "$*"; }

# ⛔⛔ REPO **不可以**只從自己的位置推。2026-08-28 實測:把這支腳本 scp 到 /tmp 再跑,
#   REPO 解成 "/" ⇒ 每一個目錄都「不存在」⇒ 它印了一份**全空的清單然後 exit 0**。
#   ⭐ 而「資料全沒了」與「路徑算錯了」長得**一模一樣** —— 對一支搬遷工具來說,
#     這是最糟的 fail-open:它會產出一個空包,而那個包看起來完全正常。
find_repo() {
  local c
  for c in "${GGD_REPO:-}" "$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)" \
           "$HOME/GGD" /home/can/GGD /data/GGD "$PWD"; do
    [ -n "$c" ] || continue
    # ⭐ 判準是「它看起來像不像 GGD」,⛔ 不是「這個路徑在不在」
    [ -f "$c/docker/compose.yaml" ] && [ -d "$c/content" ] && { echo "$(cd "$c" && pwd)"; return 0; }
  done
  return 1
}
REPO="$(find_repo)" || die "⛔ 找不到 GGD repo（試過 \$GGD_REPO、腳本上一層、~/GGD、/home/can/GGD、/data/GGD、\$PWD）
   ⇒ 設 GGD_REPO=/path/to/GGD 再跑。⛔ 拒絕在猜不到 repo 的情況下產出一個空包。"
OUT="${GGD_EXPORT_OUT:-/data/site-export}"
WITH_SECRETS=0; DRY=0
while [ $# -gt 0 ]; do case "$1" in
  --out) OUT="$2"; shift 2;;
  --with-secrets) WITH_SECRETS=1; shift;;
  --dry-run) DRY=1; shift;;
  *) die "未知參數 $1";; esac; done

SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO=sudo
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BUNDLE="$OUT/ggd-export_temp_$STAMP"
[ "$DRY" -eq 1 ] || { mkdir -p "$BUNDLE" || die "建不了 $BUNDLE"; }

# ═══════════════════════════════════════ 分類:什麼要搬,什麼不要
# ⭐ 判準只有一句:**它毀了能不能重新做出來?** ⛔ 不是「它大不大」。
#
#   不可重建 → 搬,而且要逐檔校驗和
#   可重建   → ⛔ 不搬（映像、build cache、TLS 憑證都在這一格）
#   已壓縮   → ⭐ owner 2026-08-28:「已經有壓縮檔就不要搬遷原檔」
#              ⇒ log 這一類:壓一份進包,**原檔留在原地**
CARRY=(accounts matches match-stats rankings walletmeta friends invites
       admin-audit curation content-overlay history review-verdicts)
# ⭐ `journal` 是一格**開關**（2026-08-30）—— 預設**不帶**，理由見 LEAVE_BEHIND。
#   ⛔⛔ 在此之前它無條件在 CARRY 裡，而**三份出貨的東西都說不要帶它**：
#     · `scope.go:161` 的 ExcludedItems（ZIP 那條路）
#     · `docs/runbooks/offsite-backup.md:43` 與 `:93`（兩處）
#   而三份的理由是同一句：「結算 WAL；帶去新主機會**重播舊結算**」。
#   ⇒ ⭐ 一條備份路徑帶它、另一條刻意不帶 —— ⛔ 而沒有任何東西會紅。
#   ⚠️ `site-import.sh` 全檔沒有 journal 的特別處理 ⇒ 它會**照樣還原**
#     ⇒ 新主機開機時重播沒有 commit marker 的 intent（＝重複結算）。
#   ⭐ 開關保留「我就是要那份 WAL 做鑑識」的路：`GGD_EXPORT_CARRY_JOURNAL=1`。
[ "${GGD_EXPORT_CARRY_JOURNAL:-0}" = 1 ] && CARRY+=(journal)
# ⛔⛔ `match-stats` 是 2026-08-30 補上的 —— 在此之前它**靜默地留在舊機**。
#   量到的證據有三份，而三份都說它該被帶走：
#     ① `docs/runbooks/offsite-backup.md:37` 逐字把它列為 **❌ 不可再生**
#        （「後台覆盤帳本空白」）
#     ② `apps/platform/internal/platformarchive/scope.go:318` **刻意**帶
#        `match-stats/<YYYY>/<MM>`（#207 的逐場分析帳本）
#     ③ 本機量到 **14 MB** 真的躺在 `data/match-stats/`
#   ⇒ ⭐ ZIP 那條路帶它、runbook 說不可再生、而**真正用來搬機器的這支腳本沒帶** ——
#     兩條備份路徑對同一份資料給出相反的答案，⛔ 而沒有任何東西會紅。

# ⭐⭐ **刻意不帶**的清單（名字＋理由）—— #857 的核心修法。
# owner 的問題是「有沒有**包含到所有資料**」，而在此之前這支腳本回答不了它：
#   `data/` 底下只要出現一個不在 CARRY/BULK/CRITICAL_BULK 裡的目錄，
#   它就會**安靜地**不進包 —— ⛔ 而「我刻意不帶它」與「我忘了它」長得一模一樣。
#
# ⭐ 判準（與 `scope.go` 的 `ExcludedItems()` 同一條）：
#   **「它不在備份裡」永遠不可以和「我忘了」長得一樣。**
#   ⇒ 每一格都要寫得出一個**可以被反駁的**理由，⛔ 不是「還沒收」。
LEAVE_BEHIND=(
  "content-backups|dev content-api 的本機備份，正式主機根本沒跑（scope.go 的 ExcludedItems 同一個理由）"
  "icon-src-original|本機素材產線的存檔，來源在 repo 的 tools/ 裡，可重新產生"
  "redis-snapshots|Redis 快照落點；它自己就是備份，⛔ 不該再被備份一次（而且落點預設在 data/ 外）"
  "backup-status.json|離站備份的心跳，描述的是**這台機器**的狀態 —— 搬過去會謊報新機器備份過"
  "journal|結算 WAL：沒有 commit marker 的 intent 會在新主機開機時重播舊結算（scope.go:161 與 runbook 逐字同一句）。要帶：GGD_EXPORT_CARRY_JOURNAL=1"
)
# ⛔⛔ blizzard-overlay **不是**「可接受損失」—— 它是 edge 的**開機必要條件**。
#   2026-08-28 在 arm64 上實測:overlay 短少 ⇒ edge 逐字說
#   「refusing to start nginx — a full-asset deploy that is not full」⇒ exit 1
#   ⇒ 而 edge 是 `restart:"no"` ⇒ ⭐ **整站 502,而且不會自己回來**。
#   （這個 assert 是刻意的:少了它 40/113 英雄變替身、97/113 沒語音,
#     而那**不會有任何東西看起來壞掉** —— 所以它選擇不開機。）
#   ⇒ 這一格從「體積大,可接受損失」改成「⭐ 少了它站起不來」。
BULK=(replays)
CRITICAL_BULK=(blizzard-overlay)

head_ "1. 盤點（⭐ 判準是「毀了能不能重做」,⛔ 不是大小）"
TOTAL=0
# ⛔ 第一版把整個 CARRY 丟給 tar,而其中幾格在這台機器上不存在 ⇒ tar 非零 ⇒ 整包失敗。
# ⭐ 而修法**不只是跳過** —— 缺席的那幾格要記進 manifest,
#   否則匯入端分不出「**來源本來就沒有**」與「**路上掉了**」,
#   而後者正是這整支腳本存在的理由。
PRESENT=(); ABSENT=()
for d in "${CARRY[@]}"; do
  [ -d "$REPO/data/$d" ] || { warn "data/$d 不存在,跳過"; ABSENT+=("$d"); continue; }
  PRESENT+=("$d")
  sz=$(du -sk "$REPO/data/$d" 2>/dev/null | cut -f1); TOTAL=$((TOTAL+sz))
  printf "    %-18s %8s  %s\n" "$d" "$(du -sh "$REPO/data/$d" 2>/dev/null | cut -f1)" "⭐ 不可重建"
done
for d in "${CRITICAL_BULK[@]}"; do
  if [ -d "$REPO/data/$d" ]; then
    sz=$(du -sk "$REPO/data/$d" 2>/dev/null | cut -f1); TOTAL=$((TOTAL+sz))
    printf "    %-18s %8s  %s\n" "$d" "$(du -sh "$REPO/data/$d" 2>/dev/null | cut -f1)" "⭐ 少了它 edge 拒絕開機"
  else
    die "⛔ 缺 data/$d —— 少了它 edge **拒絕開機**（exit 1,而且 restart:\"no\" ⇒ 不會自己回來）"
  fi
done
for d in "${BULK[@]}"; do
  [ -d "$REPO/data/$d" ] || continue
  sz=$(du -sk "$REPO/data/$d" 2>/dev/null | cut -f1); TOTAL=$((TOTAL+sz))
  printf "    %-18s %8s  %s\n" "$d" "$(du -sh "$REPO/data/$d" 2>/dev/null | cut -f1)" "體積大,可接受損失"
done
info "合計 ≈ $((TOTAL/1024)) MB（⛔ 不含映像 9.4G —— arm64 一定要重 build）"
# ⭐ 空包必須是**錯誤**,⛔ 不是一份報告。一個 exit 0 的空包會在對面「還原成功」。
[ "$TOTAL" -gt 0 ] || die "⛔ 一個目錄都沒找到（repo=$REPO）—— 這不是「沒有資料」,是**路徑錯了**。
   ⇒ 確認 $REPO/data/ 底下真的有 accounts/ matches/ 等目錄。"
info "repo = $REPO"

# ═══════════════════════ 1.2 ⭐⭐ 反方向再掃一次（#857 的核心修法）
# ⛔⛔ 上面那個迴圈是從**清單**那一頭走的：「CARRY 上的每一格，實體在不在？」
#   ⇒ 它**結構上**看不到反方向的那一種缺陷：**實體在，而清單上沒有它**。
#   ⚠️ 那正是 CLAUDE.md 的失敗形態⑫：
#     「從『宣告』走 ⇒ 一定漏掉『有實體而無宣告』的。⇒ ⭐ **兩頭都要走**。」
#
# ⭐ 2026-08-30 第一次跑這一段就抓到 **3 個**（本機 `data/` 13 個目錄）：
#     match-stats（14 MB，⭐ 真的該帶 ⇒ 已補進 CARRY）
#     icon-src-original（16 MB）· content-backups（16 K）（⇒ 已進 LEAVE_BEHIND）
#   ⇒ 也就是說，在這一段之前，**每一次搬遷都靜默漏掉一份覆盤帳本**。
#
# ⚠️ 為什麼是 `die` 而不是 `warn`：這支腳本的產出會被拿去**退役舊主機**。
#   一個「不知道自己漏了什麼」的備份，在對面會**還原成功**
#   —— ⛔ 那比失敗更糟（fail-open 沒錯，**靜默**才是缺陷）。
#   ⭐ 逃生口 `GGD_EXPORT_ALLOW_UNDECLARED=1`（會印出來，⛔ 不靜默）。
head_ "1.2 ⭐ 反方向：data/ 底下有沒有**沒人宣告**的東西"
DECLARED=" ${CARRY[*]} ${BULK[*]} ${CRITICAL_BULK[*]} "
for e in "${LEAVE_BEHIND[@]}"; do DECLARED="$DECLARED${e%%|*} "; done
UNDECLARED=""
for p in "$REPO"/data/*; do
  [ -e "$p" ] || continue
  n=$(basename "$p")
  # `_` 開頭的一律不是合法 collection（jsonstore 的規則，scope.go 同款）
  case "$n" in _*|.*) continue;; esac
  case "$DECLARED" in *" $n "*) continue;; esac
  UNDECLARED="$UNDECLARED$n "
  printf "  %s✗%s %-20s %8s  ⛔ 不在任何清單裡\n" "$RED" "$RST" "$n" \
    "$(du -sh "$p" 2>/dev/null | cut -f1)"
done
if [ -n "$UNDECLARED" ]; then
  [ "${GGD_EXPORT_ALLOW_UNDECLARED:-0}" = 1 ] \
    && warn "⚠️ GGD_EXPORT_ALLOW_UNDECLARED=1 ⇒ 照樣產出，⛔ 但這幾格**不會**在包裡：$UNDECLARED" \
    || die "⛔ data/ 底下有 $(printf '%s' "$UNDECLARED" | wc -w | tr -d ' ') 個目錄不在任何清單裡：$UNDECLARED
   ⭐ 這一包會**安靜地**把它們留在舊機上，而對面會「還原成功」。
   ⇒ 二選一，⛔ 沒有第三條路：
     ① 它該被帶走      ⇒ 加進 CARRY（或 BULK）
     ② 它刻意不帶      ⇒ 加進 LEAVE_BEHIND 並**寫下一個可以被反駁的理由**
   （真的要先產出：GGD_EXPORT_ALLOW_UNDECLARED=1，⚠️ 它會被記進 MANIFEST）"
else
  ok "data/ 底下每一個目錄都被宣告過（帶走 或 寫明為什麼不帶）"
fi
for e in "${LEAVE_BEHIND[@]}"; do
  n=${e%%|*}
  # ⚠️ 開關可能把某一格拉回 CARRY（例：GGD_EXPORT_CARRY_JOURNAL=1）——
  #   ⛔ 那時候不可以還印「刻意不帶」，⭐ 否則報告會同時說兩句相反的話。
  case " ${CARRY[*]} " in *" $n "*) continue;; esac
  [ -e "$REPO/data/$n" ] && info "⛔ 刻意不帶  $n —— ${e#*|}"
done
true

# ═══════════════════════════════════════ 1.5 ⭐⭐ 讀得到嗎（⛔ 在寫任何東西之前）
# 2026-08-29 在正式機上量到：`data/` 底下的檔案**全部屬於 65532:65532**
#   （distroless 容器的 nonroot 使用者，platform 寫進 bind mount 的），
#   而 ssh 進去的 `can` **1998 個檔只讀得到 889 個（44%）** ——
#   ⭐ **213 個帳號檔裡讀得到 2 個**，`walletmeta`/`friends`/`invites` 是 0。
#
# ⛔⛔ 沒有這一段的話會發生什麼：`tar` 跳過讀不到的檔，
#   而 **manifest 是從同一個讀不到的視角算的** ⇒ 兩邊會**互相同意，而一起是錯的**。
#   ⭐ 那正是 CLAUDE.md 記了一整輪的「一把只驗過單邊的尺」。
#
# ⚠️ 而這個教訓這個 repo **早就學過**：`tools/deploy/ggd-assets.sh` 逐字寫著
#   「refusing to write a manifest for '$name' while files in it cannot be read
#    (paths above). A byte total computed over files this process cannot open
#    is not evidence.」（GH#749）—— ⛔ 我沒有把它帶過來，這一段就是補上。
head_ "1.5 ⭐ 讀得到嗎（⛔ 在寫任何東西之前）"
UNREADABLE=0; TOTALF=0
for d in "${PRESENT[@]}" "${CRITICAL_BULK[@]}" "${BULK[@]}"; do
  [ -d "$REPO/data/$d" ] || continue
  # ⚠️ 用 `-readable` 問的是**這個行程**讀不讀得到,⛔ 不是「檔案存不存在」
  # ⛔⛔ `-readable` 是 **GNU find 專屬**。BSD find（macOS）不認得它,
  #   而它**不會報錯到 stderr 以外** ⇒ `wc -l` 數到的是錯誤訊息的行數
  #   ⇒ 2026-08-29 在 mini 上實測:整段印「**0 個檔全部讀得到**」——
  #     ⭐ 一個**假綠燈**,而這條檢查存在的唯一理由就是抓「讀不到」。
  # ⭐ `-exec test -r {} \; -print` 兩邊都能用（POSIX）。
  # ⛔⛔ 這裡**不可以無條件用 sudo**。2026-08-29 在 mini 上實測:
  #   非互動 SSH 下 `sudo` 要密碼 ⇒ `sudo find` 直接失敗 ⇒ `all=0`
  #   ⇒ 而 `mine` 也是 0 ⇒ `0 == 0` ⇒ ⭐ **假綠燈「0 個檔全部讀得到」**。
  #   ⚠️ 而 mini 上的檔案本來就屬於執行者（genieacceler）—— **根本不需要 sudo**。
  # ⭐ 判準:先用**自己的身分**數;數得到就用它,數不到才升級 sudo。
  #   ⛔ 「有 sudo 就用 sudo」會在沒有免密碼 sudo 的機器上把檢查變成空轉。
  all=$(find "$REPO/data/$d" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "${all:-0}" -eq 0 ] && [ -n "$SUDO" ]; then
    all=$($SUDO find "$REPO/data/$d" -type f 2>/dev/null | wc -l | tr -d ' ')
  fi
  mine=$(find "$REPO/data/$d" -type f -exec test -r {} \; -print 2>/dev/null | wc -l | tr -d ' ')
  TOTALF=$((TOTALF + all)); UNREADABLE=$((UNREADABLE + all - mine))
  [ "$all" -eq "$mine" ] || printf "  %s✗%s %-18s %s/%s 讀不到（擁有者 %s）\n" "$RED" "$RST" "$d" \
      "$((all-mine))" "$all" "$($SUDO find "$REPO/data/$d" -type f -printf '%u:%g\n' 2>/dev/null | sort -u | head -1)"
done
if [ "$UNREADABLE" -gt 0 ]; then
  die "⛔ $TOTALF 個檔裡有 $UNREADABLE 個**這個行程讀不到**。
   ⭐ 一份跳過讀不到的檔而產出的包,它的 manifest 也是從同一個瞎掉的視角算的
     ⇒ 匯入端會「對帳通過」而資料其實少了一半。⛔ 拒絕產出。
   ⇒ 用 sudo 重跑：  sudo -E bash $0 $*
     （data/ 屬於容器的 nonroot 使用者,而 ssh 進來的帳號讀不到它）"
fi
ok "$TOTALF 個檔全部讀得到"

# ═══════════════════════════════════════ 2. Redis（⛔ 不要靠 AOF 剛好開著）
head_ "2. Redis"
REDIS_KEYS=""
if [ "$DRY" -eq 0 ] && [ -x "$REPO/scripts/redis-snapshot.sh" ]; then
  # ⭐ 落點用**位置參數**傳（⛔ 不是環境變數 —— 2026-08-29 就是這樣掉了 Redis）
  bash "$REPO/scripts/redis-snapshot.sh" "$BUNDLE/redis" >/dev/null 2>&1 || true
  # ⛔⛔ **不信離開碼** —— 驗檔案真的在包裡。
  #   那一次快照 exit 0（它成功了),只是寫到了別的地方,
  #   而呼叫端照著離開碼印了「✓ 快照完成 → <包>/redis」= 一句假話。
  #   ⭐ 判準:驗**我要的那個結果**,⛔ 不是「指令有沒有報錯」。
  RDB=$(find "$BUNDLE/redis" -name 'dump.rdb' -o -name 'appendonly*' 2>/dev/null | head -1)
  if [ -n "$RDB" ]; then
    ok "Redis 快照在包裡（$(du -sh "$BUNDLE/redis" 2>/dev/null | cut -f1)）"
  else
    # ⭐ 這是 owner 點名的資料（排行榜 lb=37 / 錢包 wallet+walletmeta=120）
    #   ⇒ 缺它必須 die,⛔ 不是 warn。一包沒有 Redis 的「成功」比失敗更糟:
    #     它會在對面「還原成功」,而排行榜與 M 幣消失無聲。
    die "⛔ Redis 快照**沒有進到包裡**（$BUNDLE/redis 是空的）。
   ⭐ 這一包會讓排行榜與錢包無聲消失 ⇒ 拒絕產出。
   ⇒ 單獨跑一次看錯在哪：bash scripts/redis-snapshot.sh $BUNDLE/redis"
  fi
fi
# ⭐ 逐前綴數 key —— 這是給對面對帳用的,⛔ 不是「總數對就好」
# ⚠️ redis 的密碼是**命令列參數**（`--requirepass`）,⛔ 不在容器的 env 裡 ——
#   第一版寫 `-a "$REDIS_PASSWORD"` 在容器內展開成空字串 ⇒ 靜默回傳零個 key,
#   ⭐ 而「零個 key」跟「redis 是空的」長得一模一樣。
#   ⇒ 從 docker/.env 讀（compose 也是從那裡讀,第〇·四守則:⛔ 不造第二個住處）。
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q ggd-redis; then
  RP=$(sed -n 's/^REDIS_PASSWORD=//p' "$REPO/docker/.env" 2>/dev/null | tr -d '"'"'"'\r' | head -1)
  if [ -n "$RP" ]; then
    REDIS_KEYS=$(docker exec -e RP="$RP" ggd-redis-1 sh -c \
        'redis-cli --no-auth-warning -a "$RP" --scan 2>/dev/null' \
        | sed 's/:.*//' | sort | uniq -c | sort -rn | awk '{printf "%s=%s;", $2, $1}')
    if [ -n "$REDIS_KEYS" ]; then info "key 前綴：$REDIS_KEYS"
    else warn "⛔ 數到零個 key —— 這**不正常**（排行榜與錢包應該在）,去查 redis 通不通"; fi
  else
    warn "⛔ 讀不到 docker/.env 的 REDIS_PASSWORD —— key 數沒量到,對面就**沒有東西可以對帳**"
  fi
fi

# ═══════════════════════════════════════ 3. log:壓一份,⛔ 原檔留在原地
head_ "3. log（⭐ owner:「已經有壓縮檔就不要搬遷原檔」）"
LOGSUM=""
# ⛔ 不要寫死 /var/lib/docker —— 正式機那條已經是 symlink 到 /data/docker,
#   而 Mac 上的 DockerRootDir 又在 VM 裡。⭐ 問 daemon,⛔ 不要猜。
DOCKER_ROOT=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)
if command -v docker >/dev/null 2>&1; then
  for c in $(docker ps -a --format '{{.Names}}' 2>/dev/null | grep '^ggd-'); do
    cid=$(docker inspect "$c" --format '{{.Id}}' 2>/dev/null) || continue
    # ⛔⛔ 存在性檢查必須**在 sudo 裡面**跑。第一版寫 `[ -e "$lf" ]`,而
    #   /data/docker/containers 是 root-only（710）⇒ 非 root 的 `-e` 一律 false
    #   ⇒ 它報告「沒有 >10MB 的 log」,⭐ **而 caddy 當時有 2.37GB**。
    #   ⚠️ 這與「量尺在特定方向上是瞎的」同族:它證明得了「有」,證明不了「沒有」。
    lf="$DOCKER_ROOT/containers/$cid/$cid-json.log"
    raw=$($SUDO stat -c %s "$lf" 2>/dev/null) || continue
    [ "${raw:-0}" -gt 10485760 ] || continue      # <10MB 的不值得單獨處理
    if [ "$DRY" -eq 0 ]; then
      mkdir -p "$BUNDLE/logs"
      # ⭐ 壓的是**副本**,⛔ 全程不碰原檔（owner:cp 不是 mv）
      # ⭐ 為什麼是 gzip ⛔ 不是 zstd -19（2026-08-28 在正式機上的 2.21GB caddy log 量到）:
      #     gzip -9   92.0 MB  24.6×   **15 秒**
      #     zstd -19  59.3 MB  38.2×   **736 秒**
      #   ⇒ zstd 小 33 MB 而慢 **49 倍**。33 MB 在 295G 的碟上等於零,
      #     而且連傳輸時間都補不回來（家用上傳 20Mbps:多 13 秒 vs 多 12 分鐘）。
      #   ⚠️ 要極致體積時才 GGD_LOG_ZSTD=1（例:一次性的離站歸檔且頻寬很貴）。
      if [ "${GGD_LOG_ZSTD:-0}" = 1 ] && command -v zstd >/dev/null 2>&1; then
        $SUDO nice -n 19 cat "$lf" | nice -n 19 zstd -q -19 --long=27 -T0 -c > "$BUNDLE/logs/$c.log.zst" 2>/dev/null
      else
        $SUDO nice -n 19 cat "$lf" | nice -n 19 gzip -9 -c > "$BUNDLE/logs/$c.log.gz" 2>/dev/null
      fi
      z=$(stat -c %s "$BUNDLE/logs/$c.log."* 2>/dev/null | head -1)
      LOGSUM="$LOGSUM$c=$raw/$z;"
      awk -v r="$raw" -v z="${z:-0}" -v n="$c" 'BEGIN{
        if(z>0) printf "  \033[32m✓\033[0m %-16s %.0f MB → %.1f MB (%.1f×)  ⭐ 原檔留在原地\n", n, r/1048576, z/1048576, r/z}'
    else
      printf "    %-16s %s（會壓縮進包,原檔留在原地）\n" "$c" "$(numfmt --to=iec-i --suffix=B "$raw" 2>/dev/null || echo "$raw")"
      LOGSUM="$LOGSUM$c=$raw/?;"
    fi
  done
fi
[ -n "$LOGSUM" ] || info "（沒有 >10MB 的 log）"

# ═══════════════════════════════════════ 4. secrets
head_ "4. secrets"
if [ "$WITH_SECRETS" -eq 1 ]; then
  [ -f "$REPO/docker/.env" ] && { [ "$DRY" -eq 0 ] && cp -a "$REPO/docker/.env" "$BUNDLE/env.secret"; \
    chmod 600 "$BUNDLE/env.secret" 2>/dev/null; warn "docker/.env 已放進包 —— ⛔ 這包不可以進 git、不可以走公開通道"; }
else
  warn "⛔ **沒有**帶 docker/.env（預設）。M4 那邊要手動搬 —— 加 --with-secrets 才會帶"
fi

# ═══════════════════════════════════════ 5. 打包 ＋ manifest
if [ "$DRY" -eq 1 ]; then head_ "dry-run 結束 —— ⛔ 一個位元組都沒寫"; exit 0; fi

head_ "5. 打包"
# ⛔⛔ 壓法要**看目的地吃不吃得下**,⛔ 不是看來源有什麼。
#   實測（2026-08-29）:目的機 Mac mini **沒有 zstd**,而且 macOS 的 `tar` 也不支援它
#   ⇒ 一包 `.tar.zst` 在那台上完全解不開。
#   ⚠️ 而事後轉檔會讓 `BUNDLE.sha256` 對不上（它是對檔名算的）
#     ⇒ ⭐ 要在**產生的時候**就選對,⛔ 不是搬完再轉。
#   GGD_EXPORT_COMPRESS=gzip 給沒有 zstd 的目的地;預設 zstd（更小更快）。
COMPRESS="${GGD_EXPORT_COMPRESS:-zstd}"
case "$COMPRESS" in
  zstd) command -v zstd >/dev/null 2>&1 || die "⛔ 這台沒有 zstd ⇒ 用 GGD_EXPORT_COMPRESS=gzip"
        EXT=tar.zst; C_CORE=(zstd -q -12 -T0 -c); C_BULK=(zstd -q -3 -T0 -c) ;;
  gzip) EXT=tar.gz;  C_CORE=(gzip -9 -c);        C_BULK=(gzip -1 -c) ;;
  *) die "⛔ GGD_EXPORT_COMPRESS 只認 zstd / gzip" ;;
esac
info "壓法：$COMPRESS（.$EXT）"

[ "${#PRESENT[@]}" -gt 0 ] || die "⛔ 一個 core 目錄都沒有 —— 拒絕產出空包"
tar -C "$REPO/data" --numeric-owner -cf - "${PRESENT[@]}" | "${C_CORE[@]}" > "$BUNDLE/data-core.$EXT" \
  || die "core 打包失敗"
ok "data-core.$EXT $(du -h "$BUNDLE/data-core.$EXT" | cut -f1)"
for d in "${CRITICAL_BULK[@]}" "${BULK[@]}"; do
  [ -d "$REPO/data/$d" ] || continue
  tar -C "$REPO/data" --numeric-owner -cf - "$d" 2>/dev/null | "${C_BULK[@]}" > "$BUNDLE/data-$d.$EXT" \
    && ok "data-$d.$EXT $(du -h "$BUNDLE/data-$d.$EXT" | cut -f1)"
done

head_ "6. manifest（⭐ 這才是搬遷成功的判準）"
# ⛔ 「tar 解得開」不是證據。manifest 記的是**兩邊要對得起來的數字**。
{
  echo "# ggd site export manifest"
  echo "stamp=$STAMP"
  echo "source_host=$(hostname)"
  echo "source_arch=$(uname -m)"
  echo "git_head=$(cd "$REPO" && git rev-parse --short HEAD 2>/dev/null)"
  echo "redis_keys=$REDIS_KEYS"
  echo "logs_raw_over_compressed=$LOGSUM"
  # ⭐⭐ .env 的 **key 名**（⛔ 絕不是值）。2026-08-28 實測到的缺口:
  #   在一台 .env 少了 6 個 key 的機器上,platform **拒絕開機**,而訊息是
  #   「this deploy is networked with the invite gate ON but the first-owner claim OPEN」
  #   —— ⭐ 一句完全看不出「你少了一個環境變數」的話。
  #   ⇒ 把來源需要哪些 key 記下來,import 端才能在**開機之前**指名缺哪一個。
  # ⭐ 來源**本來就沒有**的那幾格。⛔ 沒有這一行,匯入端會把「來源沒有」
  #   讀成「還原時掉了」,或者反過來安靜地不檢查它。
  # ⭐ 容器以哪個 UID 寫 data/。匯入端還原成別的 UID ⇒ 容器**寫不進去**,
  #   而症狀是「站起來了但存不了檔」—— ⛔ 一個不會在啟動時報錯的缺陷。
  echo "data_owner=$($SUDO find "$REPO/data/accounts" -type f -printf '%u:%g\n' 2>/dev/null | sort -u | head -1)"
  # ⚠️ `set -u` 下,空陣列展開會噴 unbound variable（bash 4.3 以前的語意,
  #   而 macOS 內建的 bash 是 3.2）⇒ 用 ${ARR[@]+"${ARR[@]}"} 的慣用法。
  echo "absent_at_source=$(printf '%s,' ${ABSENT[@]+"${ABSENT[@]}"})"
  # ⭐ **刻意不帶**的要逐格寫進來（#857）。⛔ 沒有這幾行，匯入端只看得到
  #   「這個 collection 不在包裡」—— 而那與「路上掉了」長得一模一樣。
  for e in ${LEAVE_BEHIND[@]+"${LEAVE_BEHIND[@]}"}; do
    echo "left_behind.${e%%|*}=${e#*|}"
  done
  # ⭐ 逃生口用過就要留下痕跡 —— 一個「我知道我漏了什麼」的包，
  #   與一個「我不知道」的包，⛔ 不可以長得一樣。
  echo "undeclared_at_source=${UNDECLARED:-}"
  echo "env_keys=$(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' "$REPO/docker/.env" 2>/dev/null | sort | tr '\n' ',')"
  echo "# ── 逐項計數（import 端要逐條對上）──"
  for d in "${PRESENT[@]}"; do
    echo "count.$d=$(find "$REPO/data/$d" -type f 2>/dev/null | wc -l | tr -d ' ')"
  done
  echo "# ── 逐檔校驗和 ──"
  (cd "$REPO/data" && find "${PRESENT[@]}" -type f 2>/dev/null | sort | xargs -r shasum -a 256) 2>/dev/null
} > "$BUNDLE/MANIFEST.txt"
(cd "$BUNDLE" && sha256sum ./*.$EXT > BUNDLE.sha256 2>/dev/null)
ACC=$(grep -c ' accounts/' "$BUNDLE/MANIFEST.txt" 2>/dev/null; true)
ok "MANIFEST.txt  帳號檔 $ACC 個 · 逐檔校驗和 $(grep -c '^[0-9a-f]\{64\}' "$BUNDLE/MANIFEST.txt") 條"

head_ "完成"
info "$BUNDLE  （$(du -sh "$BUNDLE" | cut -f1)）"
info "下一步：搬過去之後在 M4 上跑  bash scripts/site-import.sh $BUNDLE"
printf '  %s⚠%s ⛔ 來源一個位元組都沒動 —— 這一包是**副本**（owner：cp 不是 mv）\n' "$YEL" "$RST"

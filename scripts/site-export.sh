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
CARRY=(accounts matches rankings walletmeta friends invites journal
       admin-audit curation content-overlay history review-verdicts)
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
for d in "${CARRY[@]}"; do
  [ -d "$REPO/data/$d" ] || { warn "data/$d 不存在,跳過"; continue; }
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

# ═══════════════════════════════════════ 2. Redis（⛔ 不要靠 AOF 剛好開著）
head_ "2. Redis"
REDIS_KEYS=""
if [ "$DRY" -eq 0 ] && [ -x "$REPO/scripts/redis-snapshot.sh" ]; then
  GGD_REDIS_SNAPSHOT_DIR="$BUNDLE/redis" bash "$REPO/scripts/redis-snapshot.sh" >/dev/null 2>&1 \
    && ok "快照完成 → $BUNDLE/redis" || warn "快照失敗 —— ⛔ 這一包**沒有** Redis"
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
tar -C "$REPO/data" -cf - "${CARRY[@]}" 2>/dev/null | zstd -q -12 -T0 -o "$BUNDLE/data-core.tar.zst" \
  || die "core 打包失敗"
ok "data-core.tar.zst $(du -h "$BUNDLE/data-core.tar.zst" | cut -f1)"
for d in "${CRITICAL_BULK[@]}" "${BULK[@]}"; do
  [ -d "$REPO/data/$d" ] || continue
  tar -C "$REPO/data" -cf - "$d" 2>/dev/null | zstd -q -3 -T0 -o "$BUNDLE/data-$d.tar.zst" \
    && ok "data-$d.tar.zst $(du -h "$BUNDLE/data-$d.tar.zst" | cut -f1)"
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
  echo "env_keys=$(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' "$REPO/docker/.env" 2>/dev/null | sort | tr '\n' ',')"
  echo "# ── 逐項計數（import 端要逐條對上）──"
  for d in "${CARRY[@]}"; do
    [ -d "$REPO/data/$d" ] || continue
    echo "count.$d=$(find "$REPO/data/$d" -type f 2>/dev/null | wc -l | tr -d ' ')"
  done
  echo "# ── 逐檔校驗和 ──"
  (cd "$REPO/data" && find "${CARRY[@]}" -type f 2>/dev/null | sort | xargs -r sha256sum) 2>/dev/null
} > "$BUNDLE/MANIFEST.txt"
(cd "$BUNDLE" && sha256sum ./*.tar.zst > BUNDLE.sha256 2>/dev/null)
ACC=$(grep -c '^accounts/' "$BUNDLE/MANIFEST.txt" 2>/dev/null || echo 0)
ok "MANIFEST.txt  帳號檔 $ACC 個 · 逐檔校驗和 $(grep -c '^[0-9a-f]\{64\}' "$BUNDLE/MANIFEST.txt") 條"

head_ "完成"
info "$BUNDLE  （$(du -sh "$BUNDLE" | cut -f1)）"
info "下一步：搬過去之後在 M4 上跑  bash scripts/site-import.sh $BUNDLE"
printf '  %s⚠%s ⛔ 來源一個位元組都沒動 —— 這一包是**副本**（owner：cp 不是 mv）\n' "$YEL" "$RST"

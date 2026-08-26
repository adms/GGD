#!/usr/bin/env bash
#
# host-deploy.sh — ggd.adms.ai 的部署程序，寫成程式而不是散文。
#
# ─────────────────────────────────────────────────────────────────────────────
# 為什麼有這個檔案 (2026-08-02)
#
# 在這之前，正確的部署順序只存在於**三份彼此看不到對方的散文**裡：
#   · Makefile 的 family-up      —— 唯一寫成程式的那份，**但 host 上沒有 make**
#   · CLAUDE.md 的 host 地雷清單  —— 人要記住的那份
#   · docker/compose.yaml 的註解  —— 只有讀到那一行的人才知道的那份
#
# 於是每一次部署都是**憑記憶重新推導一個有五個陷阱的序列**。
# 2026-08-02 我在同一次部署裡踩中其中兩個 —— 而那份地雷清單是我自己
# 幾小時前寫的：
#
#   ✗ `git pull` 不抓 tag        → 版本徽章停在舊版號
#   ✗ 裸的 `docker compose build` → GGD_BUILD_STAMP 空的 → 徽章寫 UNSTAMPED-BUILD
#
# 兩個都是**靜默**的：build 成功、容器起來、網站打得開、遊戲能玩。
# 唯一的破綻是一行沒人會去看的字 —— 跟同一天早上讓選人畫面整個空掉的那次
# 一模一樣的形態（fail-open + 一個沒人讀的訊號）。
#
# 所以這個檔案不只是把指令抄下來。**它會驗證自己的後置條件並且失敗時回非零**，
# 這樣一次做錯的部署不可能長得跟做對的一樣。
#
# ─────────────────────────────────────────────────────────────────────────────
# 用法（在 host 上，repo 根目錄）
#
#   bash scripts/host-deploy.sh              完整部署（拉 + 建 + 起 + 驗）
#   bash scripts/host-deploy.sh --content-only
#                                            只有 content/ 改動時用：content 是
#                                            live bind-mount，client 每次載入都重抓
#                                            bundle.json，所以不必重建映像，
#                                            只要 pull + 重啟 game shard（伺服器
#                                            開機才讀索引）+ 驗證。
#   bash scripts/host-deploy.sh --skip-pull  已經自己 pull 過了
#   bash scripts/host-deploy.sh --verify-only 只跑後置驗證（煙霧測試）
#   bash scripts/host-deploy.sh --rollback   回滾到上一版（映像 + content）
#
# ⛔ 這個腳本刻意**不做** `family-up` 裡的 seed 步驟
#    （`run --rm platform -seed -starter`）—— 那會寫玩家資料。
#    第一次建站以外一律不跑；要跑就自己手動跑，並且知道自己在做什麼。
#
# ─────────────────────────────────────────────────────────────────────────────
# 玩家資料 (owner 2026-08-02:「伺服器上的註冊帳號資料等都要保留好」)
#
# 帳號住在 **host 的 `data/`**（`docker/compose.yaml` 的 `../data:/data`），
# 不在映像裡。所以重建映像、重建容器、回滾映像**都不會動到帳號** ——
# 那些是 host 檔案系統上的檔案，容器只是掛進去。
#
# 真正會弄丟帳號的只有三件事，這個腳本一件都不做：
#   ✗ seed 步驟（`-seed -starter`）—— 會寫進 data/
#   ✗ `docker compose down` 帶上 volume 旗標 —— 會刪具名 volume
#   ✗ 對 `data/` 做遞迴刪除 —— `data/` 有 .gitignore，
#     所以 git 操作碰不到它；但 git clean 帶 -x 會，**永遠不要在 host 上跑它**
#
# 而且這個腳本**每次都會數一次帳號檔**（部署前後各一次），少了就 die。
# 「我以為它不會動到」與「我數過了」是兩回事 —— 這一整天的教訓都是後者才算數。
set -euo pipefail

# ⛔ 一條斷掉的**連線**不可以變成一次做到一半的**部署**（2026-08-16）。
#
# 那天我把部署指令寫成 `ssh … 'bash scripts/host-deploy.sh' | grep … | head -10`。
# head 讀滿 10 行就關掉管道 → 本地 ssh 收到 SIGPIPE 而死 → 遠端這支腳本收到
# SIGHUP → **docker build 死在半路**。半死的 build 留下 80GB 快取把碟塞爆，
# 之後每一次 build 都失敗：edge 容器消失、game 進重啟迴圈，網站 502。
#
# ⚠️ 治不了這件事的是「記得不要接 head」——那是散文，而散文擋不住下一次手滑
# （CLAUDE.md 的元規則）。真正的修法是讓腳本**活過連線死掉**：
# 忽略 HUP，ssh 斷了 build 照樣跑完，留下的是一個完整的狀態而不是一個殘骸。
trap '' HUP PIPE

# ⛔⛔ **這支腳本會在執行中把自己換掉**（2026-08-27，一天騙到我三次）。
#
# 第 1 步 `git pull` 拉的**包含這個檔案自己**。而 bash 是**按位元組偏移逐段讀**
# 腳本的 —— 檔案在它讀到一半時被換掉，它接下來讀到的是**新檔案的那個偏移量**，
# 也就是一段可能對不齊的內容。實際發生的三次都是同一個症狀：
#   · 新加的後置條件**一行都沒印**（看起來像「沒生效」）
#   · 印出來的是**舊版的訊息文字**（看起來像「改動沒上去」）
# ⇒ ⭐ 兩次我都因此誤判，而第三次才想通。⚠️ 更糟的是它**沒有錯誤**，
#   只是安靜地跑了一個半新半舊的東西。
#
# ⭐ 修法：**先把自己複製到 repo 外面，再從那份副本重跑。**
#   副本不會被 `git pull` 動到 ⇒ 整場部署跑的是**同一份**腳本。
#   ⚠️ 用一個 env 旗標避免無限重跑；⛔ 不用 `$0`（它在 `bash <path>` 下才是路徑）。
if [ -z "${GGD_DEPLOY_PINNED:-}" ]; then
  __pin="$(mktemp -t ggd-host-deploy)" || __pin=/tmp/ggd-host-deploy.$$
  cp "${BASH_SOURCE[0]}" "$__pin"
  export GGD_DEPLOY_PINNED="$__pin"
  # ⚠️ 刪除交給 trap：exec 之後這一行不會再跑到。
  trap 'rm -f "$__pin"' EXIT
  exec bash "$__pin" "$@"
fi
[ -n "${GGD_DEPLOY_PINNED:-}" ] && trap 'rm -f "$GGD_DEPLOY_PINNED"' EXIT


COMPOSE_FILES=(-f docker/compose.yaml -f docker/compose.family.yaml)
ENV_FILE=docker/.env
MODE=full
DO_PULL=1

for arg in "$@"; do
  case "$arg" in
    --content-only) MODE=content ;;
    --verify-only)  MODE=verify ;;
    --rollback)     MODE=rollback ;;
    --skip-pull)    DO_PULL=0 ;;
    -h|--help)      sed -n '2,60p' "$0"; exit 0 ;;
    *) echo "✗ 不認得的參數: $arg" >&2; exit 2 ;;
  esac
done

# 回滾要用的落腳點。只記兩件事：上一版的 commit（content/ 是 live bind-mount，
# 所以回滾映像而不回滾 content 會得到一個沒人測過的組合），以及
# 「上一版的映像已經被標記過」這個事實。
PREV_FILE=.deploy-prev-commit
IMAGES=(ggd-edge ggd-game ggd-platform)

say()  { printf '\n\033[1m→ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
# 「這一項無法判定」——不是通過也不是失敗。新加的後置條件在舊映像上一定拿不到，
# 那時候 die 會讓一次正確的部署看起來像壞的，而 ok 會讓一次沒驗到的看起來像驗過。
warn() { printf '\033[33m  ⚠ %s\033[0m\n' "$*"; }

[ -f docker/compose.yaml ] || die "請在 repo 根目錄執行（找不到 docker/compose.yaml）"
[ -f "$ENV_FILE" ] || die "找不到 $ENV_FILE —— 這台不是部署主機，或 secrets 沒建好"

PORT=$(grep -E '^GGD_PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)
PORT=${PORT:-8088}
BASE="http://127.0.0.1:${PORT}"

# ── 0. 玩家資料的事前快照 ────────────────────────────────────────────────────
# owner 2026-08-02:「伺服器上的註冊帳號資料等都要保留好喔」
# 數，不要相信。部署後會再數一次，少了就 die。
accounts_now() { find data/accounts -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' '; }
ACCOUNTS_BEFORE=$(accounts_now)
DEPLOY_T0=$(date +%s)   # ⏱ GH#671 全量部署 wall-clock 的起點
# 現在線上跑的那個 commit —— 一定要在 pull **之前**抓，它是 --rollback 的落腳點。
COMMIT_AT_START=$(git rev-parse HEAD 2>/dev/null || echo "")
[ "$ACCOUNTS_BEFORE" -gt 0 ] 2>/dev/null \
  || die "data/accounts 裡數到 $ACCOUNTS_BEFORE 個帳號 —— 這不對，停在這裡而不是在上面蓋東西"
ok "部署前帳號數: $ACCOUNTS_BEFORE（住在 host 的 data/，不在映像裡）"

# ── 0.5 磁碟閘 ───────────────────────────────────────────────────────────────
# 2026-08-16：一次被 SIGPIPE 打斷的 build 把 build cache 養到 80GB，docker 的碟
# （/data，98G）撞到 100%。之後**每一次** build 都必定失敗 → ggd-edge 容器消失、
# ggd-game 進重啟迴圈 → 網站 502，15 分鐘。
#
# ⚠️ 教訓不是「快取太大」。快取本來就會長，那是它的工作。教訓是：
# **沒有任何東西在 build 開始之前說得出「這台機器建不完」** ——
# 於是失敗發生在最貴的地方（build 到一半、舊容器已經被動過）。
#
# 所以這裡做兩件事，順序不可以反：
#   ① 先把 build cache 夾到一個**位元組**上限。
#      ⛔ 不用 `--filter until=<天數>` —— 那是對**部署頻率**的假設，而
#      2026-08-05 一天發過 5 版。位元組上限不管一天發幾版都成立。
#      LRU 淘汰，所以每次都被重用的那些層（base image / node_modules / Go mod）
#      永遠是最近使用的，一格都不會被丟掉 —— 冷 build 的代價不會回來。
#   ② 再驗**剩餘空間 ≥ 一次 build 要的量**。這是一個**關係**（兩個名詞之間），
#      ⛔ 不是「快取多大」或「碟多大」這種單一名詞 —— 見檔頭 2026-08-02 那次
#      四項後置條件全綠而網站不能玩，根因就是每一項都只驗一個名詞。
#
# ⭐ 位置在**拉取之前**，這是刻意的：`content/` 是 live bind-mount。
# 先 pull 再讓 build 死掉 = 新內容 + 舊映像，那正是 2026-08-02 的生產故障。
# 磁碟不夠的時候，**線上那一版必須一個位元組都沒被動到**。
#
# 兩個數字都是決策點，所以是環境變數而不是寫死（CLAUDE.md 第一守則）。
# owner 2026-08-16 把 docker 那顆碟擴到 300G，於是把快取上限從 25G 放寬到 40G。
# ⚠️ 這兩個數字**問的是不同的問題**，所以擴碟只動得到上面那個：
#   · BUILD_CACHE_CAP —— 「我願意花多少空間換 build 速度」。碟變大 ⇒ 可以更大方
#   · MIN_FREE_GB     —— 「一次 build 要多少空間才跑得完」。⛔ 跟碟多大無關，
#                          所以碟擴到 300G 它照樣是 20 —— 它是**需求**不是**餘裕**
BUILD_CACHE_CAP="${GGD_BUILD_CACHE_CAP:-40GB}"
MIN_FREE_GB="${GGD_MIN_FREE_GB:-20}"
if [ "$MODE" = full ]; then
  say "磁碟閘（build cache 上限 $BUILD_CACHE_CAP，可用空間下限 ${MIN_FREE_GB}G）"
  # `--max-used-space` 要 Docker 28+。舊版沒有這個旗標，退回時間過濾器並說出來
  # ——⛔ 不可以靜默略過，那就等於這個閘不存在（fail-open 必須有人聽得見）。
  if docker builder prune -f --max-used-space "$BUILD_CACHE_CAP" >/dev/null 2>&1; then
    ok "build cache 夾到 $BUILD_CACHE_CAP（LRU）"
    # ⚠️ GH#618 —— containerd store 上，**懸空的映像層不歸 builder prune 管**。
    # `image prune -f` 只刪沒有 tag 也沒有容器在用的那些 ⇒ ⛔ 不會碰到 :prev
    #（回滾落腳點有 tag），⛔ 不會碰到 volume（玩家資料）。
    docker image prune -f >/dev/null 2>&1 || true
  else
    docker builder prune -f --filter "until=168h" >/dev/null 2>&1 || true
    warn "這台 docker 沒有 --max-used-space，退回 until=168h —— 那只是時間假設，擋不住一天多版"
  fi
  # ⛔⛔ docker 的位元組**不一定只住一個地方**,而且 `DockerRootDir` 會說謊。
  #
  # 2026-08-23 實測（GH#618）：這台 Docker **29.6.2 用 containerd image store**
  # （`DriverStatus` 裡的 `driver-type: io.containerd.snapshotter.v1`），
  # 於是映像層與 build cache 真正住在 **`/var/lib/containerd`（sda1）**：
  #     DockerRootDir = /data/docker  →  /data  (sdb)  291G 可用   ⇐ 閘量的是這顆
  #     /var/lib/containerd = 57G     →  /      (sda1)  33G 可用   ⇐ 會滿的是這顆
  # ⇒ **閘每次都綠，而快滿的是另一顆。** 那正是 2026-08-16 那次事故的形狀
  #   （快取塞爆 → build 死在半路 → edge 容器消失 → 網站 502）。
  #
  # ⭐ 修法是**不要猜哪一顆** —— 把每一個 docker 會寫位元組的路徑都量一遍，
  #   閘取**最緊的那一顆**。⛔ 不要寫死 `/var/lib/containerd`：下一版 docker
  #   換一個 store 位置，寫死的那一行就會變成第三次同型故障。
  DOCKER_ROOT=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)
  DISK_PATHS="$DOCKER_ROOT"
  for p in /var/lib/containerd /var/lib/docker "$(pwd)"; do
    [ -d "$p" ] && DISK_PATHS="$DISK_PATHS $p"
  done
  # 逐路徑量 → 取最小 → 記住是哪一顆（訊息要指名它，⛔ 不然沒有人知道要清哪裡）
  FREE_GB=""; TIGHT_PATH=""
  for p in $DISK_PATHS; do
    g=$(df -Pk "$p" 2>/dev/null | awk 'NR==2{printf "%d", $4/1048576}')
    [ -n "$g" ] || continue
    if [ -z "$FREE_GB" ] || [ "$g" -lt "$FREE_GB" ]; then FREE_GB="$g"; TIGHT_PATH="$p"; fi
  done
  DOCKER_ROOT="$TIGHT_PATH"
  [ -n "$FREE_GB" ] || die "量不到任何 docker 路徑的剩餘空間 —— 拒絕在不知道有沒有空間的情況下 build"
  [ "$FREE_GB" -ge "$MIN_FREE_GB" ] 2>/dev/null || die "磁碟不夠建這一版。
     $DOCKER_ROOT 只剩 ${FREE_GB}G，需要 ≥ ${MIN_FREE_GB}G。

     ⭐ 停在這裡是刻意的，而且**現在線上那一版一個位元組都沒被動到** ——
        還沒 pull、還沒 build、容器還在跑。網站是好的。
     ⛔ 不要重跑一次期待它自己好，build 到一半沒空間會讓 edge 容器消失（2026-08-16）。

     清乾淨（純快取，不碰任何資料）：
       docker builder prune -af && docker image prune -f
     ⛔ 不要用 image prune -a  —— 會刪掉 :prev，回滾就沒有落腳點了
     ⛔ 不要碰 volume        —— 玩家資料在裡面

     看是誰在吃空間： docker system df   與   df -h $DOCKER_ROOT
     真的需要放寬：   GGD_MIN_FREE_GB=10 bash scripts/host-deploy.sh"
  ok "$DOCKER_ROOT 可用 ${FREE_GB}G（≥ ${MIN_FREE_GB}G）"
fi

# ── 回滾 ─────────────────────────────────────────────────────────────────────
# 映像回滾靠上一次部署留下的 `:prev` 標籤；content/ 靠記下來的 commit。
# ⛔ 一個字都不碰 `data/`。
if [ "$MODE" = rollback ]; then
  say "回滾到上一版"
  MISSING=""
  for img in "${IMAGES[@]}"; do
    docker image inspect "${img}:prev" >/dev/null 2>&1 || MISSING="$MISSING ${img}:prev"
  done
  [ -z "$MISSING" ] || die "找不到上一版映像:$MISSING
     （只有透過這個腳本部署過至少一次，才會有 :prev 可以回。）"
  for img in "${IMAGES[@]}"; do
    docker tag "${img}:prev" "${img}:latest"
    ok "${img}:prev → :latest"
  done
  if [ -f "$PREV_FILE" ]; then
    PREV_COMMIT=$(cat "$PREV_FILE")
    say "把 content/ 也退回 $PREV_COMMIT（content 是 live bind-mount，只退映像會得到沒人測過的組合）"
    git checkout "$PREV_COMMIT" -- content/
    ok "content/ @ $PREV_COMMIT"
  else
    printf '\033[33m  ! 沒有 %s，只回滾了映像；content/ 維持現狀\033[0m\n' "$PREV_FILE"
  fi
  docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" up -d
  MODE=verify   # 落到下面同一套後置驗證
fi

# ── 1. 拉 ────────────────────────────────────────────────────────────────────
# ⚠️ 陷阱 ①：pull 一定要在**前景**做完。`ssh -A … 'nohup … &'` 一次做完
#    pull+build 會失敗 —— ssh 一斷線轉發的 agent socket 就沒了，而 git 報的是
#    誤導人的「correct access rights / repository exists」。
# ⚠️ 陷阱 ②：`git pull` **不會抓 tag**，而版本徽章是從 tag 算出來的。
# ── 🧑‍⚖️ 批核結果目錄（GH#794）—— ⭐ 一定要在 `compose up` **之前** ────────────
# docker 遇到不存在的 bind mount 來源會**自己建，而且是 root 的** ⇒ 容器（uid 1000）
# 寫不進去 ⇒ owner 在線上按「保留/否決」會失敗。
# ⚠️ 這一段第一版寫在**後置條件的自動修裡**，也就是「等它壞了再修」——
#    實測 2026-08-27：第一次部署就 EACCES，healthz 誠實地喊了，但那本來可以不必發生。
#    ⭐ 建目錄是**前置條件**，⛔ 不是後置修補。
mkdir -p data/review-verdicts 2>/dev/null || true
if [ ! -w data/review-verdicts ] 2>/dev/null; then
  docker exec -u root ggd-review-1 chown -R 1000:1000 /srv/repo/docs/_review/verdicts 2>/dev/null || true
fi

if [ "$MODE" != verify ] && [ "$DO_PULL" = 1 ]; then
  say "拉取（含 tag —— 沒有 tag 版本徽章就會停在舊版號）"
  git fetch --tags origin main
  git merge --ff-only origin/main
  ok "HEAD = $(git rev-parse --short HEAD)  describe = $(git describe --tags 2>/dev/null || echo '(無 tag)')"
fi

# ── 2. 版本戳 ────────────────────────────────────────────────────────────────
# ⚠️ 陷阱 ③：GGD_BUILD_STAMP 是 Makefile 算好再插進 compose 的 build arg。
#    host 上沒有 make，所以裸的 `docker compose build` 會讓它是空的，
#    徽章就寫 UNSTAMPED-BUILD —— 而那是「這是哪一版」的唯一答案（task #66）。
#    這裡**失敗就停**，不接受一個沒有身分的映像被送上線。
if [ "$MODE" = full ]; then
  # ⭐ GH#335 —— **用 `git describe --tags`，不是裸的 short hash**。
  #
  # CLAUDE.md 的煙霧測試逐字寫著「版本徽章要顯示 `v0.9.xx`」，而這一行以前算的是
  # `git rev-parse --short HEAD`，也就是**那個格式永遠產不出來**：v0.19.0 部署完
  # 徽章寫 `df2680e7 2026-08-16`，而同一次部署 host 上的 tag 其實抓到了。
  # ⇒ 文件描述的失敗形態用這支腳本看不出來也不會發生（第三守則的形狀）。
  #
  # `--tags` 在 tag 上回 `v0.19.0`，離開 tag 回 `v0.19.0-3-gabc1234`
  #（＝「這一版是 tag 之後第 3 個 commit」，那正是 CLAUDE.md 要人看出來的事），
  # 抓不到任何 tag 才 fallback 到 `--always` 的短 hash。
  # `--dirty` 取代了下面那三行手寫的 porcelain 檢查（同一件事，少一份會漂走的抄本）。
  GIT_SHA=$(git describe --tags --always --dirty 2>/dev/null || true)
  [ -n "$GIT_SHA" ] || die "拿不到 git 版本身分 —— 拒絕建一個沒有版本身分的映像（徽章會寫 UNSTAMPED-BUILD）"
  export GGD_BUILD_STAMP="${GIT_SHA} $(date -u +%Y-%m-%d)"
  ok "build stamp = $GGD_BUILD_STAMP"

  # ── 建置前：把現役映像標成 :prev，並記下現役 commit ──────────────────────
  # 這是 `--rollback` 唯一的落腳點。要在 build **之前**做 —— build 一跑，
  # `:latest` 就是新的了，舊的沒有名字就再也叫不回來。
  say "保留上一版（回滾用）"
  for img in "${IMAGES[@]}"; do
    if docker image inspect "${img}:latest" >/dev/null 2>&1; then
      docker tag "${img}:latest" "${img}:prev"
      ok "${img}:latest → :prev"
    else
      printf '\033[33m  ! %s:latest 不存在（第一次部署），沒有上一版可留\033[0m\n' "$img"
    fi
  done
  # ⚠️ 記的必須是**這次 pull 之前**那個 commit（＝現在線上跑的那一版），
  #    不是即將部署的這一個。`COMMIT_AT_START` 在腳本最上面、pull 之前就抓好了。
  printf '%s\n' "$COMMIT_AT_START" > "$PREV_FILE"
  ok "上一版 commit 記在 $PREV_FILE: $COMMIT_AT_START"

  say "建置映像（客戶端帶 VITE_GGD_FULL_ASSETS=1）"
  # ⏱ GH#671 —— **量到再說**。這一段的耗時進帳本，讓「變慢了」會被看見。
  #    ⚠️ build 時間是**行為相依**的量（冷快取 vs 熱快取差很多）⇒ 記的是**這一次**，
  #    ⛔ 不是一個代表性數字。分析要看序列，⛔ 不是看單點。
  BUILD_T0=$(date +%s)
  docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" build
  BUILD_SEC=$(( $(date +%s) - BUILD_T0 ))
  ok "映像 build 耗時 ${BUILD_SEC}s"
fi

# ── 3. 起 ────────────────────────────────────────────────────────────────────
# ⛔ 陷阱 ④：這裡**沒有** seed 步驟，而且是刻意的。見檔頭。
if [ "$MODE" = full ]; then
  say "啟動（不含 seed）"
  docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" up -d
elif [ "$MODE" = content ]; then
  say "只改 content：重啟 game shard（伺服器開機才讀索引；client 自己會重抓 bundle）"
  docker restart ggd-game-1 >/dev/null
  ok "ggd-game-1 restarted"
fi

# ── 4. 後置驗證 —— 這一段才是這個腳本存在的理由 ──────────────────────────────
# 「網站打得開」不等於部署成功。2026-08-01 那次登入頁、大廳、版本徽章全部正常，
# bundle.json 回 200、119 隻英雄、白名單 63 隻全在 —— 而選人畫面是空的。
say "驗證（失敗就回非零，一次做錯的部署不可以長得跟做對的一樣）"
sleep 3

CHAMPS=$(curl -fsS -m 30 "$BASE/content/bundle.json" \
  | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["collections"]["champions"]["entries"]))' \
  2>/dev/null || echo 0)
[ "$CHAMPS" -gt 0 ] 2>/dev/null || die "content bundle 沒有英雄（拿到 '$CHAMPS'）—— 客戶端會退回骨架，選人畫面會是空的"
ok "content bundle: $CHAMPS 隻英雄"

WL=$(curl -fsS -m 15 "$BASE/api/v1/curation/whitelist" \
  | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("champions") or []))' \
  2>/dev/null || echo 0)
[ "$WL" -gt 0 ] 2>/dev/null || die "白名單啟用 0 隻英雄 —— 沒有人選得到角色"
ok "白名單: $WL 隻英雄啟用"

# ── 這個映像的程式，讀不讀得懂它掛著的內容？(2026-08-02 的生產故障) ───────────
#
# 上面那兩項在那次故障中**全部是綠的**，而網站完全不能玩：無法鎖定英雄
# （「選擇被拒: unknown champion」）、進場變成體素替身、商店空的。
#
# 根因：線上的 content/ 比映像新。四個 config schema tag（roster / boss-intro /
# item-card / victory-fx）與四組欄位不在已部署映像的 Zod union 裡 → 內容載入
# 整份失敗 → fail-open 退回骨架（2 隻英雄）。
#
# ⚠️ 為什麼前四項看不到它 —— 這才是真正的教訓：
#
#     1. bundle 英雄數  → 讀**檔案**，檔案是好的
#     2. 白名單英雄數    → 讀**平台**，平台是好的
#     3. 版本身分        → 讀**映像**，映像是好的
#     4. 帳號數          → 讀**資料**，資料是好的
#
# **每一項都在驗一個「名詞」，沒有一項在驗兩個名詞之間的「關係」。**
# 壞掉的是「這個映像能解析這份內容」——那是一個**配對**的性質，
# 不可能由分別檢查每一半得到。而部署正是兩個獨立版本化的東西相遇的那一刻。
#
# 這一項讀的是 game shard **自己的登錄表**：那是「映像裡的 Zod」真的跑過
# 「bind-mount 上的內容」之後得到的東西。靜態檔案伺服器會很樂意把一份
# 客戶端解析不了的 bundle 送出去；登錄表不會。
# ⏳ 2026-08-25：**要等它起來**。容器 `Started` 之後還要幾秒才 listen,而這一項
#    在 21 秒時打過去 ⇒ 空回應 ⇒ die。⚠️ 那個紅燈說的是「我來早了」,⛔ 不是
#    「映像解析不了內容」—— 一個會謊報的後置條件比沒有後置條件更糟（它會讓人
#    在下一次真的壞掉時忽略它）。⇒ 重試到 60 秒,逾時才是真的紅。
CONTENT_JSON=""
for _ in $(seq 1 20); do
  CONTENT_JSON=$(curl -fsS -m 5 "http://127.0.0.1:2567/healthz" 2>/dev/null || true)
  [ -n "$CONTENT_JSON" ] && break
  sleep 3
done
if [ -z "$CONTENT_JSON" ]; then
  die "讀不到 game shard 的 /healthz（等了 60 秒）—— 無法確認映像解析得了內容"
fi
CONTENT_OK=$(printf '%s' "$CONTENT_JSON" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin).get("content") or {}; print("1" if d.get("ok") else "0")' \
  2>/dev/null || echo "?")
if [ "$CONTENT_OK" = "?" ]; then
  # 舊映像沒有這一格。不 die —— 這一項是新加的，第一次部署新版之前一定拿不到。
  warn "這個映像的 /healthz 沒有 content 區塊（v0.9.25 之前的映像）—— 這一項略過"
elif [ "$CONTENT_OK" != "1" ]; then
  REASON=$(printf '%s' "$CONTENT_JSON" \
    | python3 -c 'import json,sys; print((json.load(sys.stdin).get("content") or {}).get("reason") or "")' 2>/dev/null)
  die "映像的登錄表是骨架 —— 內容載入失敗過。$REASON"
else
  RC=$(printf '%s' "$CONTENT_JSON" \
    | python3 -c 'import json,sys; print((json.load(sys.stdin).get("content") or {}).get("champions") or 0)' 2>/dev/null)
  ok "映像解析得了內容: 登錄表 $RC 隻英雄（不是骨架）"
fi

# ── 錄影真的寫得進去嗎（GH#170 / owner 2026-08-02「請幫我預設打開」）───────────
# 為什麼這一條要在部署腳本裡，而不是留在 runbook：這台機器上量到過
# **整段時間一場都沒有錄到**，而當時網站、大廳、比賽全都正常。唯一的訊號是
# game shard 開機時真的建一個檔再刪掉的結果（`replay.writable`）。散文治不了
# 「下次記得去 curl 一下 /healthz」，只有一支會自己回非零的程式可以。
#
# ⚠️ 根因（量過的，不是猜的）：`docker/compose.family.yaml` 把 host 的
# `data/replays` bind-mount 到 `/data/replays`。**那個目錄的擁有者不是容器跑的
# 那個 uid**：目錄不存在時由 docker daemon 用 root 建，而 2026-08-03 在線上量到
# 的實際擁有者是 **65532** —— 那是**更早的映像**用的 uid。現在的映像是
# `docker/game.Dockerfile` 第 61 行的 `USER node`（`node:22-alpine` 裡 node 是
# uid 1000）。別人家的目錄，uid 1000 建檔就是 EACCES —— 而且
# `createWriteStream` 是非同步開 fd，所以 `MatchRecorder.open()` 仍然回傳一個
# 看起來完全正常的錄影器。
#
# ── 為什麼 2026-08-03 起腳本自己動手修（GH#269）──────────────────────────────
# 舊版這裡只印一行「請 owner 用 sudo 在 host 上 chown」。兩個問題：
#   · 那個修法**一次只治一次**。擁有者是舊映像留下來的，換映像／重建目錄它就
#     回來 —— 這個缺陷已經復發過。
#   · owner 2026-08-03 對「請你在主機上跑一次 sudo」的回覆是「**無法**」。
#     在那個前提下，「腳本只能說出來」實際上等於「這件事永遠不會被修」。
#
# 而「腳本自己 chown 需要 sudo」這句話**是假的**（第三守則，它在這裡寫了一整天）：
# `docker exec -u root ggd-game-1 chown …` 用的是 **docker 權限**（跑得動
# compose 的人本來就有），是容器自己的 root 改容器自己的掛載點，不是主機提權。
# 腳本仍然一行 `sudo` 都不跑 —— **那條要求沒有變**，變的只是「這件事需要它」。
#
# ⚠️ 修完一定要**重新問一次 /healthz**。只 chown 不重驗，就是把一個沒驗證的
# 修法當成成功 —— 那正是這個專案一再踩到的形態（fail-open + 沒有人讀的訊號）。
# ⛔ 不要用 chmod 777 —— 錄影檔帶著每一位玩家的顯示名稱。
REPLAY_JSON=$(curl -fsS -m 15 "http://127.0.0.1:2567/healthz" 2>/dev/null || true)
if [ -z "$REPLAY_JSON" ]; then
  printf '\033[33m  ! game shard 的 /healthz 打不到（:2567）—— 跳過錄影檢查\033[0m\n'
else
  REPLAY_WRITABLE=$(printf '%s' "$REPLAY_JSON" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("replay",{}).get("writable"))' \
    2>/dev/null || echo None)
  case "$REPLAY_WRITABLE" in
    True) ok "錄影目錄可寫（開機時真的建檔再刪掉）" ;;
    None) printf '\033[33m  ! /healthz 沒有 replay.writable 欄位 —— 這個映像比 GH#170 舊\033[0m\n' ;;
    *)
      # ⚠️ 自動修**只在完整部署／內容部署時做**，`--verify-only` 不做。
      #
      # 理由：修法包含 `docker restart ggd-game-1`，那會**把正在打的人踢掉**。
      # 而 `--verify-only`（煙霧測試）正是你在**有人在線上時**最可能跑的東西 ——
      # 「跑一次檢查可能中斷一場比賽」不是一個檢查該有的權力。
      # 完整部署本來就會重啟，那時候順手修沒有額外代價。
      if [ "$MODE" = "verify" ]; then
        die "錄影目錄寫不進去（writable=$REPLAY_WRITABLE）—— 這台 shard **一場都不會錄到**，
     而遊戲會照常運作，所以沒有人會發現。
     ⚠️ `--verify-only` 刻意**不自動修**：修法要重啟 game shard，會踢掉正在打的人。
     沒有人在線上的話，跑一次完整部署（它會自己修），或手動：
       docker exec -u root ggd-game-1 chown -R 1000:1000 /data/replays
       docker restart ggd-game-1
     完整 runbook：docs/replay-observability.md"
      fi
      # 先自己修，再重驗。不是「印出修法」——見上面那一段。
      warn "錄影目錄寫不進去（writable=$REPLAY_WRITABLE）—— 先自己修擁有者（容器內的 root，不是主機 sudo）"
      docker exec -u root ggd-game-1 chown -R 1000:1000 /data/replays || warn "容器內 chown 沒成功（繼續，讓下面的重驗來裁決）"
      docker exec -u root ggd-game-1 chmod 755 /data/replays || warn "容器內 chmod 沒成功（繼續，讓下面的重驗來裁決）"
      docker restart ggd-game-1 >/dev/null || warn "ggd-game-1 重啟失敗"
      # `writable` 是**開機時**建檔再刪掉的結果，所以一定要等 shard 真的重新起來
      # 再讀 —— 讀太早拿到的是上一輪的答案，或什麼都拿不到。
      sleep 12
      # ⚠️ 這一步才是重點，不是上面的 chown。只修不驗＝把一個沒驗證的修法當成成功。
      REPLAY_RECHECK=$(curl -fsS -m 15 "http://127.0.0.1:2567/healthz" 2>/dev/null \
        | python3 -c 'import json,sys; print(json.load(sys.stdin).get("replay",{}).get("writable"))' \
        2>/dev/null || echo None)
      if [ "$REPLAY_RECHECK" = True ]; then
        ok "錄影目錄本來寫不進去，腳本自己修好了（容器內 chown 1000:1000 + 重啟 + 重讀 /healthz 驗過）"
      else
        die "錄影目錄仍然寫不進去（重驗拿到 '$REPLAY_RECHECK'）—— 這台 shard **一場都不會錄到**，
     而遊戲會照常運作，所以沒有人會發現。
     ⚠️ 擁有者**已經自動修過了**（容器內 root：chown -R 1000:1000 /data/replays + chmod 755
     + 重啟 + 重讀 /healthz），而且重驗還是不過，**所以根因不是擁有者**。往這三個查：
       · 掛載是唯讀的     docker inspect ggd-game-1 --format '{{json .Mounts}}'   看 RW 是不是 false
       · 主機磁碟或 inode 滿了   df -h /   與   df -i /
       · SELinux / AppArmor 擋住   getenforce   有的話 bind mount 要加 :z
     完整 runbook：docs/replay-observability.md"
      fi ;;
  esac
fi

# 版本身分。⚠️ 這一條就是 2026-08-02 沒被擋下來的那個缺陷。
JS=$(curl -fsS -m 15 "$BASE/" | grep -oE '/assets/[^"]+\.js' | head -1 || true)
[ -n "$JS" ] || die "首頁抓不到 client bundle 的路徑 —— edge 可能沒起來"
STAMP_LINE=$(curl -fsS -m 60 "$BASE$JS" | grep -aoE 'BUILD_STAMP:"[^"]*"' | head -1 || true)
[ -n "$STAMP_LINE" ] || die "client bundle 裡找不到 BUILD_STAMP —— 版本徽章會是空的"
case "$STAMP_LINE" in
  *UNSTAMPED-BUILD*)
    die "版本徽章會寫 UNSTAMPED-BUILD —— 這個映像沒有版本身分，兩次部署會分不出來。
     原因幾乎一定是繞過這個腳本、直接跑了裸的 \`docker compose build\`。
     重建：GGD_BUILD_STAMP=\"\$(git rev-parse --short HEAD) \$(date -u +%F)\" docker compose … build edge" ;;
  *) ok "版本身分: $STAMP_LINE" ;;
esac

# ── 🧑‍⚖️ 批核頁的資料面（GH#794）─────────────────────────────────────────
# owner 2026-08-27：「請**同步到線上**，並且**線上批核的結果也同步到本機端**」
#
# ⭐ 這一條**刻意穿過 edge**（$BASE/__review/…），⛔ 不是直接打 127.0.0.1:8790。
#   直接打容器只證明「容器活著」（一個名詞）；穿過 edge 才證明
#   「nginx 的那條 location 真的把請求送到得了那台」（**兩個名詞的關係**）——
#   而 2026-08-02 的教訓正是：只驗名詞的後置條件，在接線壞掉時必然是綠的。
#
# ⚠️ verdicts 是這台線上**唯一寫得動**的目錄，容器以 uid 1000 跑 ⇒ host 那一側
#   要讓 1000 寫得動，否則 owner 在線上按「保留/否決」會靜默失敗。
#   ⚠️ 它住 `data/review-verdicts/`（gitignored）⛔ 不在 repo 的工作樹裡 ——
#   否則容器一寫，下一次 `git merge --ff-only` 就會拒絕合併（＝神秘的部署失敗）。
#   ⭐ 所以下面先問 /healthz 的 verdicts.writable（它是**真的建檔再刪**量出來的），
#   不過才 chown —— ⛔ 不是無條件 chown（那會在每次部署動一次權限）。
REVIEW_JSON=$(curl -fsS -m 15 "$BASE/__review/healthz" 2>/dev/null || true)
if [ -z "$REVIEW_JSON" ]; then
  # ⚠️ 這是 warn ⛔ 不是 die：批核頁掛了**不可以擋住遊戲上線**。
  #    但它必須**出聲** —— 一個沒有人讀的 log 不算（fail-open 沒錯，靜默才是缺陷）。
  warn "批核頁資料面打不到（$BASE/__review/healthz）—— 線上的 🧑‍⚖️ 批次驗收與 13 頁實時資料會是空的。
     查：docker compose ... ps review / logs review。⛔ 不擋部署（遊戲本體不依賴它）。"
else
  REVIEW_OK=$(printf '%s' "$REVIEW_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("ok"))' 2>/dev/null || echo None)
  REVIEW_W=$(printf '%s' "$REVIEW_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("verdicts",{}).get("ok"))' 2>/dev/null || echo None)
  REVIEW_N=$(printf '%s' "$REVIEW_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("material",{}).get("total"))' 2>/dev/null || echo None)
  if [ "$REVIEW_W" = "False" ] && [ "$MODE" != "verify" ]; then
    # ⛔ **一行 sudo 都不跑**（閘：hostDeployScript.test.ts 的「腳本自己跑了 sudo」）。
    #    用**容器自己的 root** 改容器自己的掛載點 —— 那是 docker 權限，⛔ 不是主機提權。
    #    ⚠️ 這與上面錄影目錄那一段是**同一個形狀**：uid 1000 的容器 × host bind mount。
    warn "線上的批核結果目錄寫不進去 —— owner 按「保留/否決」會沒反應。先自己修（容器內的 root，⛔ 不是主機 sudo）"
    mkdir -p data/review-verdicts
    docker exec -u root ggd-review-1 chown -R 1000:1000 /srv/repo/docs/_review/verdicts \
      || warn "容器內 chown 沒成功（繼續，讓下面的重驗來裁決）"
    docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" restart review >/dev/null 2>&1 || true
    sleep 4
    # ⭐ 修完**一定重問一次** —— 只修不重驗，就是把沒驗證的希望當成事實。
    REVIEW_W=$(curl -fsS -m 15 "$BASE/__review/healthz" 2>/dev/null \
      | python3 -c 'import json,sys;print(json.load(sys.stdin).get("verdicts",{}).get("ok"))' 2>/dev/null || echo None)
    [ "$REVIEW_W" = "True" ] && ok "批核結果目錄本來寫不進去，腳本自己修好了（chown 1000 + 重啟 + 重讀 /healthz 驗過）"
  fi
  # ⭐⭐ /__live 要**真的抓一份 dataset**，⛔ 不是信 /healthz 的自我宣告。
  #    2026-08-27 實際發生：sidecar 服務得好好的、healthz 說 live.ok=true，
  #    ⛔ 而 nginx 根本沒有 `location /__live/` ⇒ 請求掉進 SPA fallback ⇒
  #    回 200 + text/html ⇒ 那 13 頁拿到一坨 HTML 當 JSON 解 ⇒ 空白。
  #    ⇒ 「模組載得起來」是名詞；「nginx 送得到」才是關係。這一行問的是後者。
  # ⭐ GH#796 之後這一條期望的是 **401**，⛔ 不是 200 —— 而那**更強**：
  #    · 401 ⇒ nginx **送到了** sidecar（沒送到會掉進 SPA fallback ⇒ 200 + text/html）
  #           **而且** 身分閘在（部署腳本不持有 owner 的憑證，本來就該被擋）
  #    · 200 ⇒ ⚠️ 閘破了（匿名進得來）
  #    · 200 + text/html ⇒ ⛔ nginx 少了 location（#794 那次的形狀）
  #    ⇒ 一個檢查同時罩住兩種相反的故障。⛔ 不要「改成期望 200」——
  #      那等於把身分閘關掉才會綠。
  # ⚠️ ⛔ **不要寫死 `/private/tmp`** —— 那是 macOS 的路徑，而這支腳本跑在
  #    **Linux 主機**上。寫死的後果不是「找不到檔」這種好認的錯：
  #    curl 寫不出 -o 的檔 ⇒ 離開碼非零 ⇒ `|| echo 000` 也跟著印
  #    ⇒ 變數變成 `401000`，於是 case 兩邊都不中、落到「判不出來」。
  #    ⭐ 一個**印得出數字**的誤報比沒有輸出更難查（2026-08-27 實際發生）。
  LIVE_PROBE=$(mktemp) || LIVE_PROBE=/tmp/ggd-live-probe.$$
  LIVE_CODE=$(curl -s -m 30 -o "$LIVE_PROBE" -w '%{http_code}' "$BASE/__live/sfx-map" 2>/dev/null || true)
  LIVE_CODE=${LIVE_CODE:-000}
  LIVE_BODY=$(head -c 80 "$LIVE_PROBE" 2>/dev/null || true)
  rm -f "$LIVE_PROBE"
  case "$LIVE_CODE" in
    401) ok "13 頁實時資料面: $BASE/__live/ 回 401（⭐ nginx 送到了 ＋ 身分閘在 —— 兩件一起驗）" ;;
    200)
      case "$LIVE_BODY" in
        *"<"*) warn "⛔ $BASE/__live/ 回 200 + HTML —— nginx 少了 location /__live/，那 13 頁在線上會空白。" ;;
        *) warn "🔓 $BASE/__live/ 匿名回 200 —— **身分閘破了**（GH#796）。查 GGD_REVIEW_REQUIRE_ADMIN。" ;;
      esac ;;
    *) warn "⚠️ $BASE/__live/ 回 $LIVE_CODE —— 判不出來（sidecar 沒起來？）。⛔ 不擋部署。" ;;
  esac
  if [ "$REVIEW_OK" = "True" ]; then
    ok "批核頁資料面: 材料 $REVIEW_N 批 · 結果可寫（穿過 edge 驗的）"
  else
    warn "批核頁 /healthz 說不健康（ok=$REVIEW_OK, verdicts.writable=$REVIEW_W, 材料=$REVIEW_N）——
     線上的批次驗收頁可能讀不到批次。⛔ 不擋部署。詳情：curl -s $BASE/__review/healthz"
  fi
fi

# 玩家資料。owner 2026-08-02 明確要求。數，不要相信。
ACCOUNTS_AFTER=$(accounts_now)
[ "$ACCOUNTS_AFTER" -ge "$ACCOUNTS_BEFORE" ] 2>/dev/null || die \
  "帳號從 $ACCOUNTS_BEFORE 掉到 $ACCOUNTS_AFTER —— 有東西寫壞了 data/。
     帳號住在 host 的 data/（bind mount），部署本來就碰不到它。
     會弄丟的只有三條路，詳見這支腳本檔頭的「玩家資料」那一段。"
ok "帳號數: $ACCOUNTS_BEFORE → $ACCOUNTS_AFTER（沒有掉）"

# ⏱ GH#671 —— 全量部署的 wall-clock（owner 的目標是 ≤ 3 分鐘 = 180s）。
# ⚠️ `--verify-only` 沒有 build ⇒ 這個秒數量的是「跑幾條 curl」，⛔ 不是部署耗時。
#    報它只會讓帳本裡混進一堆 4 秒的假樣本（第一守則：行為相依的量不可以報單點）。
if [ -n "${DEPLOY_T0:-}" ] && [ "$MODE" != verify ]; then
  DEPLOY_SEC=$(( $(date +%s) - DEPLOY_T0 ))
  if [ "$DEPLOY_SEC" -le 180 ]; then
    ok "全量部署 wall-clock ${DEPLOY_SEC}s（目標 ≤180s ✓）${BUILD_SEC:+ · 其中 build ${BUILD_SEC}s}"
  else
    warn "全量部署 wall-clock ${DEPLOY_SEC}s > 目標 180s（GH#671）${BUILD_SEC:+ · 其中 build ${BUILD_SEC}s}。
     ⛔ 不擋部署 —— 這是一條**計時**，不是一條閘。慢下來要有人看得見，⛔ 不是被擋住。"
  fi
fi

printf '\n\033[32m✓ 部署驗證通過\033[0m\n'
if [ -f "$PREV_FILE" ]; then
  printf '  回滾指令：\033[1mbash scripts/host-deploy.sh --rollback\033[0m  （回到 %s）\n' "$(cut -c1-8 "$PREV_FILE")"
fi
cat <<'NEXT'

⚠️ 腳本驗不到的最後一步（部署協定第 6 步，只有人能做，30 秒）：
   開 https://ggd.adms.ai 的**全新分頁**，看瀏覽器 console 那一行 ——
       [client] content loaded: N champions (cv_…) via bundle      ← 要看到這個
       [client] content load failed (…); falling back to skeleton (2 champions)
                                                                   ← 看到這個就是壞了
   （⛔ 不可以省。它是 2026-08-01 事故之後補的，而那次「網站打得開」卻沒有人能進場，
     唯一的破綻就是這一行。⚠️ 一定要開新分頁：console 緩衝區跨導覽保留，
     在舊分頁重整會把上一次的失敗訊息留在成功訊息上面。）

⛔ 不要在線上手動打一場。owner 2026-08-09：「你不用玩遊戲測試 太浪費時間了」。
   他退掉的是「逐格點擊操作一場比賽」，不是驗證本身 —— 機械的那幾項上面已經跑完了。
NEXT

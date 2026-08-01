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
# 現在線上跑的那個 commit —— 一定要在 pull **之前**抓，它是 --rollback 的落腳點。
COMMIT_AT_START=$(git rev-parse HEAD 2>/dev/null || echo "")
[ "$ACCOUNTS_BEFORE" -gt 0 ] 2>/dev/null \
  || die "data/accounts 裡數到 $ACCOUNTS_BEFORE 個帳號 —— 這不對，停在這裡而不是在上面蓋東西"
ok "部署前帳號數: $ACCOUNTS_BEFORE（住在 host 的 data/，不在映像裡）"

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
  GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || true)
  [ -n "$GIT_SHA" ] || die "拿不到 git sha —— 拒絕建一個沒有版本身分的映像（徽章會寫 UNSTAMPED-BUILD）"
  GIT_DIRTY=""
  [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ] && GIT_DIRTY="-dirty"
  export GGD_BUILD_STAMP="${GIT_SHA}${GIT_DIRTY} $(date -u +%Y-%m-%d)"
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
  docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" build
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

# 玩家資料。owner 2026-08-02 明確要求。數，不要相信。
ACCOUNTS_AFTER=$(accounts_now)
[ "$ACCOUNTS_AFTER" -ge "$ACCOUNTS_BEFORE" ] 2>/dev/null || die \
  "帳號從 $ACCOUNTS_BEFORE 掉到 $ACCOUNTS_AFTER —— 有東西寫壞了 data/。
     帳號住在 host 的 data/（bind mount），部署本來就碰不到它。
     會弄丟的只有三條路，詳見這支腳本檔頭的「玩家資料」那一段。"
ok "帳號數: $ACCOUNTS_BEFORE → $ACCOUNTS_AFTER（沒有掉）"

printf '\n\033[32m✓ 部署驗證通過\033[0m\n'
if [ -f "$PREV_FILE" ]; then
  printf '  回滾指令：\033[1mbash scripts/host-deploy.sh --rollback\033[0m  （回到 %s）\n' "$(cut -c1-8 "$PREV_FILE")"
fi
cat <<'NEXT'

⚠️ 腳本驗不到的最後一步（部署協定第 6 步，只有人能做）：
   開 https://ggd.adms.ai 的瀏覽器 console，確認看到
       [client] content loaded: N champions (cv_…) via bundle
   而不是
       [client] content load failed (…); falling back to skeleton (2 champions)
   然後**在線上真的打一場**，把發現記回 docs/_execution-batches.md。
NEXT

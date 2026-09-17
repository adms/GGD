#!/usr/bin/env bash
# ⏲️ **通用看門狗** —— owner 2026-08-24：「如果工作流跑超過5分鐘，你應該要去看
# 是不會陷入loop了⋯ => **這應該是 script 吧**」「你不是有五分鐘看門狗script?」
#
# ⭐ 在此之前看門狗只住在 ship.mjs 裡面（只保護它自己的 suite）——
#    主 session 手跑的 vitest 繞過它，於是同一晚 `packages/shared` 掛死了**三次**、
#    每次白等 10 分鐘。這支把它變成**每一條長指令的預設外殼**。
#
# 用法（兩種）：
#   bash scripts/watchdog.sh [--limit-min 60] -- <指令...>                       # 包一條指令
#   bash scripts/watchdog.sh --attach <pid> [--pending-file <檔>] [--limit-min N]  # 看住一個已經在跑的行程
#
# 兩個殺人條件（任一成立就 SIGKILL 整棵行程樹）：
#   ① wall > limit（預設 **60** 分鐘 —— 理由見下面 LIMIT_MIN，⛔ 不是拍腦袋）→ 124
#   ② ⭐ **整棵樹連續 90 秒 CPU≈0**（= worker 卡死。掛住跟還在算在 wall 上看不出來，
#      在 CPU 上一眼就分得開 —— 三次掛死全是這個形狀）→ 125
#
# ⭐⭐ GH#1257（2026-09-15）：**它早就寫好了，⛔ 但沒有任何入口預設經過它。**
#   09-13 背景跑的 `npx vitest run --dir packages/shared` 在 0% CPU 卡了 **4 小時 48 分**，
#   而重跑時用的是**當場另寫的第三隻**看門狗（`pkill -9 -f vitest` 殺整台機器）。
#   ⇒ 修法是**接線**，⛔ 不是再寫一隻：`--attach` 讓 vitest 自己在啟動時把主行程交給這支看住
#     （`tools/vitest-watchdog/globalSetup.mjs`，由 `vitest.shared.ts` 的 `VITEST_WATCHDOG`
#      展開進每一份 vitest 設定；閘 `packages/shared/src/ops/everyVitestPackageIsWatched.test.ts`）。
#   ⇒ ⭐ **判死準則仍然只住這一支**：globalSetup 只負責「把 pid 交出來」，reporter 只負責
#     「記下還沒跑完的檔」，⛔ 兩者都不判死。
#   attach 模式開火的形狀：印原因＋未結束檔清單 → SIGKILL 主行程底下整棵子孫 → SIGUSR2 給主行程（globalSetup 在那裡
#     `process.exit(125)`，⭐ 所以 `npx`／`pnpm` 看到的是 125，與「測試紅」的 1 分得開）
#     → 2 秒內沒走就 SIGKILL 它（離開碼變 137）。
#   🔙 rollback：`GGD_VITEST_WATCHDOG_OFF=1`（globalSetup 讀，整隻不掛）。
#   ⚠️ `GGD_VITEST_WATCHDOG_RECORD_ONLY=1`（`ship.mjs` 替它的子行程設）：attach 模式**只印不殺**
#     —— ship.mjs 自己的逐 suite 看門狗負責收，⛔ 兩隻不搶著開火、訊息也不打架。
set -o pipefail
# ⏲️ **wall 上限的預設 = 20 分鐘（⛔ 不是 8）** —— GH#858,2026-08-30 從帳本量出來的。
#
# ⚠️ 8 分鐘在寫下來的當天就已經太緊了,而**沒有任何東西會紅**：
#   `docs/_data/deploy-timings.json` 74 次 `ship:total` —— 中位數 370s,
#   **健康的最慢 463s（7.7 分鐘）** ⇒ 距離 480s 只剩 **3.5% 餘裕**,而它一直在長大。
#   ⇒ `bash scripts/watchdog.sh -- pnpm ship:check` 會在**健康的跑**上開火,
#     而開火的樣子（exit 124）跟「閘紅了」⛔ 分不出來。
#   ⭐ 這與 GH#858 在 ship.mjs 裡修的是**同一個病**：
#     一個寫死的上限坐在一個會長大的實測值旁邊 ⇒ 遲早變成**假紅**,
#     而假紅會蓋掉真紅（08-28 那四次 `packages/shared` 就是這樣把 4 條真的
#     `FAIL` 變成一句「hung,單獨重跑通常會過」）。
#
# ⭐ 這個上限的理由：**wall 上限是備援,⛔ 不是主偵測器** —— 真正分得開
#   「卡死」與「只是慢」的是下面②那個 **90 秒 0% CPU**（90 秒就開火）。
#   ⇒ wall 只要覆蓋得住「還在燒 CPU 的合法長跑」就好。
#   比例：**帳本裡最慢的健康整跑 × 2.6**（與 ship.mjs 的「中位數 ×3」同一個精神）。
#
# ⭐⭐ 2026-09-11（GH#1211）：**同一個病在同一行上復發了**。
#   上一版寫 20 分鐘,依據是當時量到的「健康最慢 **463s**」（463 × 2.6 ≈ 20 分）。
#   ⇒ 今天重量 `docs/_data/deploy-timings.json`（57 次健康整跑）：
#       中位 **6.2 分** · ⛔ **最慢 22.2 分（1,330s）**
#   ⇒ ⭐ 最慢的那一次**已經超過 20 分鐘的上限** ⇒ 看門狗會在**健康的跑**上開火,
#     而 exit 124 跟「閘紅了」⛔ 分不出來 —— ⭐ 假紅會蓋掉真紅（檔頭那四次就是）。
#
#   ⇒ 照**同一條比例**重算：1,330s × 2.6 ≈ 3,458s ≈ 58 分 ⇒ 取 **60**。
#   ⚠️ ⭐ 看起來很寬是**刻意的**：wall 抓的是「整台卡死」,而「卡住但沒死」由
#     90 秒 0% CPU 那一條抓 —— ⛔ 把 wall 調緊不會更早發現卡死,只會製造假紅。
#   ⚠️ 這個數字**還會再過期**（整跑一直在長）⇒ 守衛 `shipScriptWatchdog` 從帳本
#     推導再比對它,⭐ 所以下一次它長大時**會有東西紅**,⛔ 不是靠人記得。
# 🔙 rollback：`--limit-min 20` 一個旗標退回舊行為。
LIMIT_MIN=60
# ② 的門檻。⭐ 預設只住這裡；`GGD_WATCHDOG_IDLE_SEC` 只給守衛縮短等待用（⛔ 不是給人調的旋鈕）。
IDLE_SEC=${GGD_WATCHDOG_IDLE_SEC:-90}
SAMPLE_SEC=5
ATTACH="" PENDING=""
while [ $# -gt 0 ]; do
  case "$1" in
    --limit-min) LIMIT_MIN="$2"; shift 2 ;;
    --attach) ATTACH="$2"; shift 2 ;;
    --pending-file) PENDING="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done
if [ -z "$ATTACH" ] && [ $# -eq 0 ]; then
  echo "用法: watchdog.sh [--limit-min N] -- <指令...> ｜ watchdog.sh --attach <pid> [--pending-file <檔>]" >&2
  exit 2
fi

# 整棵子孫樹（含 root，⛔ 不含這支看門狗自己那一支）—— 每行「pid 累計CPU秒」。
#
# ⛔⛔ 2026-08-24 修的一個會**砍掉健康工作**的 bug：這裡原本是 `pgrep -P "$PID"`,
#     而那只拿得到**直接子行程**。`pnpm ship:check` 的行程樹是
#     watchdog → pnpm → node ship.mjs → pnpm(逐 suite) → vitest → **worker forks**,
#     真正在燒 CPU 的是**孫輩以下** ⇒ 這個總和永遠讀到 ~0% ⇒ 90 秒後把一個
#     滿載 800% CPU 的 build 當成「卡死」砍掉。⭐ 連砍三次(三次都在同一支閘上)。
# ⇒ 走整棵樹:一次 `ps`，從 root 做 BFS 把後代全部收進來（⛔ awk 沒有遞迴，用固定點迭代）。
#
# ⭐ GH#1257：量的是**累計 CPU 時間的差**（`time`），⛔ 不再是 `pcpu`。
#   ⚠️ Linux（CI）的 `pcpu` 是「**一生**的 CPU 時間 ÷ 活了多久」—— 一個先燒過 CPU 再卡死的行程，
#     它的 pcpu 要好幾個小時才會掉到 0.5% 以下 ⇒ 在 CI 上 ② **結構上幾乎永遠不開火**。
#     macOS 的 `pcpu` 是衰減平均，剛好看得見。⇒ 兩邊都用 `time` 的差才是同一把尺。
#   ⚠️ attach 模式下這支是主行程的**子行程**（globalSetup 生的）⇒ 自己那一支（ps／awk／sleep）
#     一定要排除，否則看門狗自己的取樣就讓它永遠「不閒」、開火時還會把自己殺掉。
#
# ⭐ GH#1257 修正輪 —— **量尺的粒度**：Linux（CI）procps 的 `ps -o time=` **只到整秒**。
#   判準是「5 秒一格、低於 25ms」⇒ 整秒粒度下實際變成「連續 90 秒整棵樹不到 1 整秒」（≈1.1%，⛔ 不是 0.5%），
#   而 root 的 5% 容許更失真：一次 +1 整秒 − 250ms 容許 = 750ms ⇒ 前景 TTY 跑在 Linux 上**永遠不開火**。
#   ⇒ 有 `/proc` 就讀 `/proc/<pid>/stat` 的 utime+stime（1/CLK_TCK 秒，通常 10ms）——
#     ⭐ 與 procps 的 `time` 是**同一個數**（utime+stime），只是沒有被捨去成整秒；沒有 `/proc`（macOS）才用 `ps`（百分之一秒）。
#   🔙 `GGD_WATCHDOG_NO_PROC=1` 強制走 `ps`（環境變數，只給作者／CI 退回舊量法）。
HZ=$(getconf CLK_TCK 2>/dev/null); [ -n "$HZ" ] || HZ=100
cpu_table() {   # 每行「pid ppid 累計CPU秒」
  if [ "${GGD_WATCHDOG_NO_PROC:-}" != 1 ] && [ -r /proc/self/stat ]; then
    # comm（第 2 欄）可以含空白與括號 ⇒ 砍到**最後一個** ") " 為止；之後 f[2]=ppid、f[12]=utime、f[13]=stime。
    cat /proc/[0-9]*/stat 2>/dev/null | awk -v hz="$HZ" '
      { r = $0; sub(/.*\) /, "", r); split(r, f, " "); printf "%s %s %.2f\n", $1, f[2], (f[12] + f[13]) / hz }'
  else
    ps -eo pid=,ppid=,time= 2>/dev/null | awk '
      function secs(t,   d, a, n, i, s) {
        d = 0
        if (index(t, "-")) { split(t, a, "-"); d = a[1]; t = a[2] }
        n = split(t, a, ":"); s = 0
        for (i = 1; i <= n; i++) s = s * 60 + a[i]
        return d * 86400 + s
      }
      { printf "%s %s %.2f\n", $1, $2, secs($3) }'
  fi
}
tree() {
  cpu_table | awk -v root="$1" -v self="$$" '
    { pid[NR] = $1; ppid[NR] = $2; cpu[NR] = $3; n = NR }
    END {
      want[root] = 1; changed = 1
      while (changed) {
        changed = 0
        for (i = 1; i <= n; i++)
          if (!want[pid[i]] && want[ppid[i]] && pid[i] != self) { want[pid[i]] = 1; changed = 1 }
      }
      for (i = n; i >= 1; i--) if (want[pid[i]]) printf "%s %.2f\n", pid[i], cpu[i]
    }'
}

# 開火。$1 = 原因、$2 = 離開碼。
# ⛔⛔ **殺乾淨**：vitest 的 worker 是孫輩以下，`pkill -P` 只殺直接子行程。
#     2026-08-24 量到:清理之前機器上躺著 **7 個 13–21 小時前的 vitest worker**,
#     全部 0% CPU —— 前幾次看門狗 SIGKILL 之後**被 re-parent 而逃掉**的孤兒。
# ⇒ 開火**之前**先拍下整棵樹（主行程一走，孤兒就 re-parent 到 1，事後再走 BFS 找不到它們）。
# ⛔ 只殺**這一次執行**的樹 —— ⛔ 不可以 `pkill -f vitest`（會殺掉別條 lane 的測試）。
fire() {
  echo "⏲️ 看門狗：$1" >&2
  if [ -n "$PENDING" ]; then
    if [ -s "$PENDING" ]; then
      echo "   ⭐ 還沒跑完的測試檔（拿去開根因票，⛔ 看門狗不取代根因調查）：" >&2
      sed 's/^/     /' "$PENDING" >&2
    else
      echo "   ⚠️ 沒有未結束檔清單（$PENDING 不存在或是空的 —— pendingReporter 沒載入（CLI 的 --reporter 會蓋掉設定），或卡在任何檔回報之前）" >&2
    fi
  fi
  if [ -n "$ATTACH" ] && [ "${GGD_VITEST_WATCHDOG_RECORD_ONLY:-}" = "1" ]; then
    echo "   （GGD_VITEST_WATCHDOG_RECORD_ONLY=1：只記錄、⛔ 不開火 —— ship.mjs 的逐 suite 看門狗負責收）" >&2
    return 1
  fi
  local victims i
  victims=$(tree "$PID" | awk '{print $1}')
  [ -n "$PENDING" ] && rm -f "$PENDING"
  if [ -z "$ATTACH" ]; then
    # shellcheck disable=SC2086
    kill -KILL $victims 2>/dev/null
    wait "$PID" 2>/dev/null
    exit "$2"
  fi
  # attach：⭐ 先殺子孫、**再**叫主行程走 —— 反過來的話主行程一走 `npx`／`pnpm` 就回來了，
  #   而孤兒 worker 還活著（2026-09-15 實測：離開碼 125 回來的當下 `ps` 還看得到 worker 與它的孫行程）。
  # shellcheck disable=SC2086
  kill -KILL $(printf '%s\n' "$victims" | grep -vx "$PID") 2>/dev/null
  kill -USR2 "$PID" 2>/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    kill -0 "$PID" 2>/dev/null || exit "$2"
    sleep 0.1 </dev/null >/dev/null 2>&1
  done
  kill -KILL "$PID" 2>/dev/null   # 主行程不理 SIGUSR2（事件迴圈被鎖住）⇒ 硬收，離開碼變 137
  exit "$2"
}

if [ -n "$ATTACH" ]; then
  PID=$ATTACH
else
  "$@" &
  PID=$!
fi
DEADLINE=$(( SECONDS + LIMIT_MIN*60 ))
IDLE=0 PREV="" RECORDED="" WALL_RECORDED="" BLIND="" TICK=0
while kill -0 "$PID" 2>/dev/null; do
  # ⭐ 每秒看一次「它還在不在」，每 SAMPLE_SEC 秒才量一次 CPU：attach 模式下這支握著 vitest 的
  #   stdout/stderr，主行程走了之後要**馬上**放手，⛔ 不可以讓 `| tee`、`spawnSync` 多等 5 秒。
  sleep 1 </dev/null >/dev/null 2>&1
  # ⚠️ RECORD_ONLY 時 fire 回 1、迴圈繼續 ⇒ 要像下面 idle 那支一樣記一次就好，
  #   ⛔ 不擋的話逾時之後**每秒**重印一次訊息與未結束檔清單（GH#1257 修正輪，審查抓到的不對稱）。
  if [ "$SECONDS" -ge "$DEADLINE" ] && [ -z "$WALL_RECORDED" ]; then
    fire "超過 ${LIMIT_MIN} 分鐘 —— SIGKILL（wall 逾時）" 124 || WALL_RECORDED=1
  fi
  TICK=$((TICK + 1)); [ $(( TICK % SAMPLE_SEC )) -eq 0 ] || continue
  SAMPLE=$(tree "$PID")
  # ⛔ 量表裡連 root 自己都沒有（沒有 /proc 也沒有 ps —— 例：debian-slim 又設了 GGD_WATCHDOG_NO_PROC=1）⇒ 整棵樹讀起來是 0，
  #   ⛔ 那是**量尺瞎了**、不是閒置 ⇒ 這一格不算、印一次就好（一把靜默的瞎尺會把健康的跑殺掉；GH#1257 修正輪）。
  #   ⚠️ 用 case 比對，⛔ 不用 `printf | grep -q`：pipefail 底下 grep 提早關管道會讓整條管線非零 ⇒ 反而誤判成瞎。
  case $'\n'"$SAMPLE" in
    *$'\n'"$PID "*) ;;
    *) kill -0 "$PID" 2>/dev/null || break   # 只是剛好在量的那一刻走了
       [ -n "$BLIND" ] || echo "⏲️ 看門狗：量不到 pid $PID 的 CPU（沒有 /proc 也沒有 ps？）—— ⛔ 量尺瞎了不等於閒置：不判死" >&2
       BLIND=1; IDLE=0; continue ;;
  esac
  # 這一格的 CPU 毫秒數 = Σ(這次 − 上次)；新出現的 pid 整份算進去，消失的不算。
  # 輸出兩個數：「子孫合計」與「root 自己」。
  read -r DESC_MS ROOT_MS <<<"$(printf '%s\n' "$SAMPLE" | awk -v prev="$PREV" -v root="$PID" '
    BEGIN { n = split(prev, a, " "); for (i = 1; i < n; i += 2) p[a[i]] = a[i + 1] }
    NF == 2 { d = ($1 in p) ? $2 - p[$1] : $2; if (d < 0) d = 0; if ($1 == root) r = d; else s += d }
    END { printf "%d %d\n", s * 1000, r * 1000 }')"
  PREV=$(printf '%s\n' "$SAMPLE" | tr '\n' ' ')
  # CPU≈0 ＝ 這一格低於一顆核的 0.5%（與舊版 `pcpu×10 < 5` 同一條線）。
  # ⚠️ attach 模式的 root 是 **vitest 主行程**（協調者，⛔ 不跑測試）：在終端機前景跑時它的畫面
  #   每 16ms 重畫一次（`createListRenderer` 的 `setInterval(update, 16)`），2026-09-15 實測
  #   卡死的當下它仍吃 **~0.8%** ⇒ 只看合計的話前景跑**永遠不開火**。⇒ root 先扣掉 5% 的容許，
  #   整棵樹扣掉這份容許之後仍然要低於 0.5%。包指令模式的 root 就是在做事的那一支 ⇒ 沒有容許。
  ROOT_ALLOW=0; [ -n "$ATTACH" ] && ROOT_ALLOW=$(( SAMPLE_SEC * 50 ))
  ROOT_OVER=$(( ${ROOT_MS:-0} - ROOT_ALLOW )); [ "$ROOT_OVER" -lt 0 ] && ROOT_OVER=0
  if [ $(( ${DESC_MS:-0} + ROOT_OVER )) -lt $(( SAMPLE_SEC * 5 )) ]; then
    IDLE=$((IDLE + SAMPLE_SEC))
  else
    IDLE=0; RECORDED=""
  fi
  if [ "$IDLE" -ge "$IDLE_SEC" ] && [ -z "$RECORDED" ]; then
    fire "整棵行程樹連續 ${IDLE} 秒 CPU≈0 —— worker 卡死，SIGKILL（pid $PID）" 125 || RECORDED=1
  fi
done
[ -n "$ATTACH" ] && exit 0
wait "$PID"

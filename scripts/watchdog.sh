#!/usr/bin/env bash
# ⏲️ **通用看門狗** —— owner 2026-08-24：「如果工作流跑超過5分鐘，你應該要去看
# 是不會陷入loop了⋯ => **這應該是 script 吧**」「你不是有五分鐘看門狗script?」
#
# ⭐ 在此之前看門狗只住在 ship.mjs 裡面（只保護它自己的 suite）——
#    主 session 手跑的 vitest 繞過它，於是同一晚 `packages/shared` 掛死了**三次**、
#    每次白等 10 分鐘。這支把它變成**每一條長指令的預設外殼**。
#
# 用法：bash scripts/watchdog.sh [--limit-min 20] -- <指令...>
#
# 兩個殺人條件（任一成立就 SIGKILL 整個 process group 並回 124）：
#   ① wall > limit（預設 **20** 分鐘 —— 理由見下面 LIMIT_MIN，⛔ 不是拍腦袋）
#   ② ⭐ **連續 90 秒 CPU 全 0%**（= worker 卡死。掛住跟還在算在 wall 上看不出來，
#      在 CPU 上一眼就分得開 —— 三次掛死全是這個形狀）
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
# ⭐ 20 分鐘的理由：**wall 上限是備援,⛔ 不是主偵測器** —— 真正分得開
#   「卡死」與「只是慢」的是下面②那個 **90 秒 0% CPU**（90 秒就開火）。
#   ⇒ wall 只要覆蓋得住「還在燒 CPU 的合法長跑」就好：463s × 2.6 ≈ 20 分鐘,
#   與 ship.mjs 那邊「帳本中位數 ×3」是同一個比例。
# 🔙 rollback：`--limit-min 8` 一個旗標退回舊行為。
LIMIT_MIN=20
if [ "$1" = "--limit-min" ]; then LIMIT_MIN="$2"; shift 2; fi
[ "$1" = "--" ] && shift
[ $# -gt 0 ] || { echo "用法: watchdog.sh [--limit-min N] -- <指令...>" >&2; exit 2; }


# ⛔⛔ **殺乾淨**：`pkill -P` 只殺**直接子行程**,而 vitest 的 worker 是孫輩以下。
#     2026-08-24 量到:清理之前機器上躺著 **7 個 13–21 小時前的 vitest worker**,
#     全部 0% CPU —— 它們是前幾次看門狗 SIGKILL 之後**被 re-parent 而逃掉**的孤兒。
#     ⭐ 而它們極可能就是 `packages/shared` 反覆卡死的結構性原因:每一個都佔著
#     fork 額度與檔案控制代碼,下一輪 vitest 的 pool 就跟它們搶。
# ⇒ 收整棵樹（與上面 CPU 偵測同一套 BFS）,**由深到淺**殺。
kill_tree() {
  local root=$1
  local pids
  pids=$(ps -eo pid=,ppid= 2>/dev/null | awk -v root="$root" '
    { pid[NR]=$1; ppid[NR]=$2; n=NR }
    END {
      want[root]=1; changed=1
      while (changed) {
        changed=0
        for (i=1;i<=n;i++) if (!want[pid[i]] && want[ppid[i]]) { want[pid[i]]=1; changed=1 }
      }
      for (i=n;i>=1;i--) if (want[pid[i]] && pid[i]!=root) printf "%s ", pid[i]
      printf "%s", root
    }')
  # shellcheck disable=SC2086
  kill -KILL $pids 2>/dev/null
}

"$@" &
PID=$!
DEADLINE=$(( $(date +%s) + LIMIT_MIN*60 ))
IDLE=0
while kill -0 "$PID" 2>/dev/null; do
  sleep 5
  NOW=$(date +%s)
  if [ "$NOW" -ge "$DEADLINE" ]; then
    echo "⏲️ 看門狗：超過 ${LIMIT_MIN} 分鐘 —— SIGKILL（wall 逾時）" >&2
    kill_tree "$PID"; wait "$PID" 2>/dev/null; exit 124
  fi
  # ② 0% CPU 偵測：本體 + **全部子孫**的 %CPU 總和
  #
  # ⛔⛔ 2026-08-24 修的一個會**砍掉健康工作**的 bug：這裡原本是 `pgrep -P "$PID"`,
  #     而那只拿得到**直接子行程**。`pnpm ship:check` 的行程樹是
  #     watchdog → pnpm → node ship.mjs → pnpm(逐 suite) → vitest → **worker forks**,
  #     真正在燒 CPU 的是**孫輩以下** ⇒ 這個總和永遠讀到 ~0% ⇒ 90 秒後把一個
  #     滿載 800% CPU 的 build 當成「卡死」砍掉。⭐ 連砍三次(三次都在同一支閘上),
  #     而 CLAUDE.md 第零守則⏲️ 說得很清楚:同一個閘紅第三次 = 迴圈,要找結構性根因。
  # ⚠️ 而上面那行註解**本來就寫著「全部子孫」** —— 散文說的是對的，程式做的是另一件事
  #     （第三守則:註解會說謊，去驗證）。
  # ⇒ 現在真的走整棵樹:一次 `ps -eo pid,ppid,pcpu`，從 $PID 做 BFS 把後代全部收進來。
  CPU=$(ps -eo pid=,ppid=,pcpu= 2>/dev/null | awk -v root="$PID" '
    { pid[NR]=$1; ppid[NR]=$2; cpu[NR]=$3; n=NR }
    END {
      want[root]=1
      # 樹最深不會超過 n 層;逐層擴散直到沒有新成員(⛔ awk 沒有遞迴，用固定點迭代)
      changed=1
      while (changed) {
        changed=0
        for (i=1;i<=n;i++) if (!want[pid[i]] && want[ppid[i]]) { want[pid[i]]=1; changed=1 }
      }
      s=0
      for (i=1;i<=n;i++) if (want[pid[i]]) s+=cpu[i]
      printf "%d", s*10
    }')
  if [ "${CPU:-0}" -lt 5 ]; then IDLE=$((IDLE+5)); else IDLE=0; fi
  if [ "$IDLE" -ge 90 ]; then
    echo "⏲️ 看門狗：連續 90 秒 CPU 0% —— worker 卡死,SIGKILL。單獨重跑通常會過。" >&2
    kill_tree "$PID"; wait "$PID" 2>/dev/null; exit 125
  fi
done
wait "$PID"

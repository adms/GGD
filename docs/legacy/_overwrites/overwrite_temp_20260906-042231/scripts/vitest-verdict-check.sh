#!/usr/bin/env bash
# 🧾 vitest 裁決帳 —— **已裁決檔數 ＋ 已跳過檔數 ＝＝ 總檔數**（GH#1014）
#
# ⛔⛔ 為什麼要有這支：2026-09-05 CI run 33976263791（attempt 1）
#   apps/game-server   Test Files  152 passed | 1 skipped (154)   ← 152+1 ≠ 154
#                           Tests  906 passed | 2 skipped (918)   ← 908 ≠ 918
#                          Errors  3 errors   ← [vitest-worker]: Timeout calling "onTaskUpdate" ×3
#   ⇒ ⭐ **零個測試失敗，而 job 紅** —— 紅的樣子與真的失敗一模一樣，
#     而「有一個檔沒有裁決」的**唯一**訊號是那個不等式，⛔ 沒有人在看它。
#   ⭐ 機制：worker 的同步區段鎖住事件迴圈 > 60 秒 ⇒ 它自己的 birpc 計時器（60s 硬編碼，
#     vitest 2.1.9 沒有設定可以拉長）比主行程的回覆先被處理 ⇒ 那一檔的最終結果送不出去。
#     ⛔ 它不是測試失敗、⛔ 不是內容缺陷、⛔ 不是產生器過期 —— 它是**搶核**。
#
# 它做什麼：
#   ① 讀一份（或多份）vitest 輸出 log（pnpm -r 的前綴、ANSI 顏色、gh 的 `^[` 轉義都會剝掉）
#   ② 對每一行 `Test Files …(N)` / `Tests …(N)` 摘要：桶加總 ≠ N ⇒ 非零，並指名那一包
#   ③ 帳不平時分類：log 裡有 `[vitest-worker]: Timeout calling` ⇒ 印
#      「這是 worker RPC 逾時，⛔ 不是測試失敗」並指出逾時時正在跑的檔（`originated in "…"`）
#   ④ 一行 `Test Files` 都沒量到 ⇒ 非零（⛔ 空 log 不可以是綠的 —— fail-open 沒錯，靜默才是缺陷）
#
# 用法：bash scripts/vitest-verdict-check.sh <log> [<log>…]
# 離開碼：0 帳平 · 1 帳不平 · 2 用法／檔案不存在 · 3 沒量到任何摘要行
# 🔀 開關（環境變數）：
#   GGD_VERDICT_MIN_SUMMARIES  最少要看到幾行 `Test Files`（預設 1；0 = 允許空 log）
#   GGD_VERDICT_STRICT_RPC=1   帳平但 log 裡有 RPC 逾時也回非零（預設 0：那種情況 vitest 自己已經非零）
#
# 守衛：packages/shared/src/ops/vitestVerdictCheck.test.ts（真的跑這支腳本，兩個方向）
set -uo pipefail

if [ "$#" -lt 1 ]; then
  echo "⛔ 用法：bash scripts/vitest-verdict-check.sh <vitest log> [<log>…]" >&2
  exit 2
fi
for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "⛔ log 不存在：$f —— ⭐ 上一步沒有 tee 進這個路徑（或根本沒跑到）；⛔ 沒有 log 不等於帳平" >&2
    exit 2
  fi
done

python3 - "$@" <<'PY'
import os, re, sys

ANSI = re.compile(r'(?:\x1b|\^\[)\[[0-9;]*[A-Za-z]')
# `gh run view --log` 的前綴：`<job>\t<step>\t<ISO 時間>Z ` —— 餵下載回來的 log 時剝掉，只留 pnpm 的那一段
GH_LOG = re.compile(r'^[^\t]*\t[^\t]*\t\d{4}-\d\d-\d\dT[\d:.]+Z ')
# `<pnpm 前綴> Test Files  152 passed | 1 skipped (154)` —— 前綴可有可無（單包跑沒有前綴）
SUMMARY = re.compile(r'^(?P<pre>.*?)\s*\b(?P<kind>Test Files|Tests)\s+(?P<buckets>.+?)\s*\((?P<total>\d+)\)\s*$')
BUCKET = re.compile(r'(\d+)\s+(failed|passed|skipped|todo|pending)\b')
TIMEOUT = re.compile(r'\[vitest-(?:worker|pool)\]: Timeout calling "([^"]+)"')
ORIGIN = re.compile(r'originated in "([^"]+)"')

min_summaries = int(os.environ.get("GGD_VERDICT_MIN_SUMMARIES", "1"))
strict_rpc = os.environ.get("GGD_VERDICT_STRICT_RPC", "0") == "1"

rows, mismatches, timeouts, origins = [], [], [], []
for path in sys.argv[1:]:
    with open(path, encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = ANSI.sub("", raw.rstrip("\n"))
            m = TIMEOUT.search(line)
            if m:
                timeouts.append(m.group(1))
            m = ORIGIN.search(line)
            if m and m.group(1) not in origins:
                origins.append(m.group(1))
            m = SUMMARY.match(line)
            if not m:
                continue
            buckets = BUCKET.findall(m.group("buckets"))
            if not buckets:
                continue  # 「Test Files  no tests」之類 —— 沒有桶就沒有帳可對
            total = int(m.group("total"))
            summed = sum(int(n) for n, _ in buckets)
            label = re.sub(r'\s*test:\s*$', "", m.group("pre")).strip() or "(這一次執行)"
            shown = f'{label}  {m.group("kind")} {" | ".join(f"{n} {w}" for n, w in buckets)} ({total})'
            rows.append((m.group("kind"), shown))
            if summed != total:
                unit = "個檔" if m.group("kind") == "Test Files" else "個測試"
                mismatches.append(f'{shown} ⇒ {"+".join(n for n, _ in buckets)} = {summed} ≠ {total}'
                                  f'（**{total - summed} {unit}沒有裁決**）')

n_files = sum(1 for k, _ in rows if k == "Test Files")
print(f"🧾 vitest 裁決帳：{n_files} 份 `Test Files` 摘要 · {len(timeouts)} 行 RPC 逾時")
for k, shown in rows:
    if k == "Test Files":
        print(f"   {'✅' if not any(shown in mm for mm in mismatches) else '⛔'} {shown}")

def annotate(msg):
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::error title=vitest verdict (GH#1014)::{msg}")

if n_files < min_summaries:
    msg = (f"沒量到任何 `Test Files` 摘要（要 ≥{min_summaries}）⇒ 這份 log 不是 vitest 的輸出，"
           f"或 tee 沒接上 —— ⛔ 空 log 不可以是綠的")
    print(f"⛔ {msg}")
    annotate(msg)
    sys.exit(3)

rpc_explain = None
if timeouts:
    rpc_explain = (f'log 裡有 {len(timeouts)} 行 `Timeout calling "{timeouts[0]}"` ⇒ ⭐⭐ 這是 **worker RPC 逾時**'
                   f'（birpc 60 秒硬上限；同步區段鎖住事件迴圈 > 60 秒），⛔ **不是測試失敗**')

if mismatches:
    print(f"⛔ 帳不平 ×{len(mismatches)}：")
    for mm in mismatches:
        print(f"   {mm}")
    if rpc_explain:
        print(f"   ⭐ {rpc_explain}")
        if origins:
            print(f"   ⭐ 逾時時正在跑的檔：{', '.join(origins)}")
        print("   ⇒ 處方：分核（apps/game-server/vitest.config.ts 的 GGD_VITEST_MAX_FORKS ·"
              " ci.yml 的 GGD_WORKSPACE_TEST_CONCURRENCY / GGD_VITEST_FORKS_PER_PACKAGE）")
        print("      ⛔ 不要縮短那支測試、⛔ 不要靜音 unhandled rejection、⛔ 不要去查內容／產生器")
    else:
        print("   ⚠️ log 裡沒有 RPC 逾時 ⇒ 去找 `Unhandled` / worker crash / OOM —— 有一個檔沒有裁決")
    annotate(mismatches[0] + (f" — {rpc_explain}" if rpc_explain else ""))
    sys.exit(1)

if rpc_explain:
    print(f"⚠️ 帳平，但 {rpc_explain}")
    if strict_rpc:
        annotate(rpc_explain)
        sys.exit(1)

print("✅ 每一行摘要都帳平：已裁決 ＋ 已跳過 ＝＝ 總數")
PY

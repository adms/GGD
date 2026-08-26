#!/usr/bin/env bash
# 🔒 產物隔離區 —— owner 2026-08-24（逐字）:
#   「這個問題發生上百次了，為什麼總是會改到產物而不是產生器？是否可以把產物放在
#    特定資料夾作為隔離區，只能靠產生器去操作修改產物內容？」
#
# ⭐ 隔離不搬資料夾（500+ 個產物路徑是對外契約,搬了每個消費者都斷）——
#   隔離用**檔案權限**:產物平時 chmod a-w(444),只有產生器執行期間解鎖。
#   ⇒ genguard hook 看不見的那條路（python/node 檔案 API 直寫 —— 上百次事故的
#   真正通道）從此吃 PermissionError,⛔ 不是靜默成功然後被下一次 sync 打回來。
#
# 擁有者表 = tools/parallel-gates/sync-io.json 的 writes（量出來的,⛔ 不是手寫）。
#
# 用法:
#   scripts/product-quarantine.sh lock             # 鎖全部產物(收斂完之後)
#   scripts/product-quarantine.sh unlock           # 解鎖全部(sync 開跑前;sync.mjs 自動呼叫)
#   scripts/product-quarantine.sh lock|unlock --step <name>   # 只動那一支的產物
#   scripts/product-quarantine.sh status           # 幾鎖幾開
# env:GGD_QUARANTINE_IO=<io.json 路徑>（測試用）· GGD_QUARANTINE_OFF=1（逃生口,commit 訊息要說為什麼）
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${GGD_QUARANTINE_OFF:-}" = "1" ] && { echo "⚠️ 隔離區關閉中(GGD_QUARANTINE_OFF=1)"; exit 0; }
IO="${GGD_QUARANTINE_IO:-tools/parallel-gates/sync-io.json}"
MODE="${1:?用法: lock|unlock|status [--step <name>]}"
STEP=""; [ "${2:-}" = "--step" ] && STEP="${3:?--step 要帶名字}"

python3 - "$IO" "$MODE" "$STEP" <<'PY'
import glob as _glob
import json, os, stat, sys
io_path, mode, step = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(io_path, encoding="utf-8"))
files: set[str] = set()
matched = 0
for s in d.get("steps", []):
    if step and s.get("name") != step:
        continue
    matched += 1
    for w in s.get("writes", []) or []:
        # ⭐ GH#771:日期戳家族在戶籍表裡是 glob（merge-io 正規化的）⇒ 展開成現存檔。
        if any(ch in w for ch in "*?["):
            files.update(_glob.glob(w))
        else:
            files.add(w)
# ⭐ 2026-08-26（owner:「追誤會的多個源頭」）—— 兩種靜默都要出聲:
#   ① `--step` 打錯名字 ⇒ 之前**靜默得到空集合**,輸出與成功一模一樣 ⇒ 現在 exit 2 指名。
#   ② step 存在但宣告 0 份產物 ⇒ 之前印「解鎖 0 份」看起來像正常 ⇒ 現在明說那是
#      戶籍洞（GH#771:條件寫入端在已同步的樹上量到 0 寫）,單獨跑它會吃 EACCES。
if step and matched == 0:
    known = ", ".join(sorted((s.get("name") or "?") for s in d.get("steps", [])))
    print(f"⛔ 沒有叫 '{step}' 的步驟 —— 名字打錯或它不在 sync-io 的 {len(d.get('steps',[]))} 步裡。", file=sys.stderr)
    print(f"   有的: {known}", file=sys.stderr)
    sys.exit(2)
if step and matched > 0 and not files:
    print(f"⚠️ 步驟 '{step}' 在戶籍表裡宣告 **0 份產物** —— 若它其實會寫檔,那是量測洞（GH#771）:", file=sys.stderr)
    print(f"   它寫的檔仍然鎖著(444),單獨跑它會吃 EACCES。正解是重量測 sync-io,⛔ 不是手動 chmod。", file=sys.stderr)
locked = unlocked = missing = 0
for f in sorted(files):
    if not os.path.isfile(f):
        missing += 1
        continue
    st = os.stat(f).st_mode
    writable = bool(st & stat.S_IWUSR)
    if mode == "status":
        locked += 0 if writable else 1
        unlocked += 1 if writable else 0
    elif mode == "lock" and writable:
        os.chmod(f, st & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH)); locked += 1
    elif mode == "unlock" and not writable:
        os.chmod(f, st | stat.S_IWUSR); unlocked += 1
scope = f"（step={step}）" if step else ""
if mode == "status":
    print(f"🔒 隔離區{scope}:鎖著 {locked} · 可寫 {unlocked} · 不存在 {missing} / 追蹤 {len(files)}")
elif mode == "lock":
    print(f"🔒 隔離區{scope}:上鎖 {locked} 份（追蹤 {len(files)},缺 {missing}）")
else:
    print(f"🔓 隔離區{scope}:解鎖 {unlocked} 份（追蹤 {len(files)},缺 {missing}）")
PY

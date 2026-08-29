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
# ⭐⭐ GH#707（2026-08-27）——「誰該被鎖」⛔ 不等於「誰被寫過」。
#   sync-io 只知道**誰寫過這個檔**;而**正規化器**（tiers:apply 那一族）是就地改欄位,
#   它認領的檔**是手編的來源**,⛔ 不是它的產物。在此之前這支腳本不認得那個概念
#   ⇒ 把 387 份手編檔一起 chmod 444,而 genguard 對同樣那 387 份說「不擋你」
#   ⇒ **兩個閘意見相左 100%**,合法手編吃 EACCES 而訊息裡零指引。
#   ⇒ 判準改成:**至少有一個非正規化器認領** ⇒ 鎖;**只有正規化器認領** ⇒ 放行(chmod u+w)。
#   ⚠️ 「放行」是主動的,⛔ 不是「跳過」—— 跳過的話那 387 份會永遠停在 444,
#      而且每一次 genrun/sync 收工都要再確認一次。⭐ lock 的語意是
#      「**把隔離區推到正確狀態**」:該鎖的鎖上、該放的放開。
#   ⇒ 於是 genrun.sh 與 sync.mjs 的「解鎖→跑→重鎖」自動就對了(它們走的是同一個 lock)。
#   清單的唯一住處:tools/parallel-gates/normalizers.json（genguard.sh / hook 讀同一份）。
#
# 用法:
#   scripts/product-quarantine.sh lock             # 鎖全部產物(收斂完之後)
#   scripts/product-quarantine.sh unlock           # 解鎖全部(sync 開跑前;sync.mjs 自動呼叫)
#   scripts/product-quarantine.sh lock|unlock --step <name>   # 只動那一支的產物
#   scripts/product-quarantine.sh status           # 幾鎖幾開
# env:GGD_QUARANTINE_IO=<io.json 路徑>（測試用）· GGD_QUARANTINE_NORMALIZERS=<normalizers.json 路徑>
#     · GGD_QUARANTINE_OFF=1（逃生口,commit 訊息要說為什麼）
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${GGD_QUARANTINE_OFF:-}" = "1" ] && { echo "⚠️ 隔離區關閉中(GGD_QUARANTINE_OFF=1)"; exit 0; }
IO="${GGD_QUARANTINE_IO:-tools/parallel-gates/sync-io.json}"
NORM="${GGD_QUARANTINE_NORMALIZERS:-tools/parallel-gates/normalizers.json}"
MODE="${1:?用法: lock|unlock|status [--step <name>]}"
STEP=""; [ "${2:-}" = "--step" ] && STEP="${3:?--step 要帶名字}"

python3 - "$IO" "$MODE" "$STEP" "$NORM" <<'PY'
import glob as _glob
import json, os, stat, sys
io_path, mode, step, norm_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
d = json.load(open(io_path, encoding="utf-8"))

# ⭐ 正規化器清單 —— 唯一住處在 normalizers.json（genguard.sh / PreToolUse hook 讀同一份）。
# ⚠️ 讀不到 ⇒ **空集合＝全部當成作者＝全部鎖**（fail-closed:保護產物那一邊），
#    ⛔ 但一定要大聲 —— 靜默地退回舊行為就是把 GH#707 原地重演一次而輸出看起來正常。
try:
    NORMALIZERS = {str(n["step"]) for n in json.load(open(norm_path, encoding="utf-8")).get("normalizers", [])}
except Exception as exc:  # noqa: BLE001
    NORMALIZERS = set()
    print(f"⚠️⚠️ 讀不到正規化器清單 {norm_path}（{exc}）—— 這一輪把**每一份**被認領的檔都當成產物鎖起來。", file=sys.stderr)
    print("   ⇒ 那會讓正規化器認領的手編檔又變回唯讀（GH#707 的形狀）。先把那份 JSON 修好。", file=sys.stderr)

# ⭐ 「誰認領這個檔」要對**全部**步驟算，⛔ 不是只對 --step 的那一支 ——
#    否則 `lock --step tiers:apply` 會把「tiers:apply ＋ skillremake:json 共同認領」的
#    真產物誤判成正規化器專屬而放行（作者那一半在別的步驟裡）。
def _expand(w: str) -> list[str]:
    return _glob.glob(w) if any(ch in w for ch in "*?[") else [w]

claimants: dict[str, set[str]] = {}
for s in d.get("steps", []):
    for w in s.get("writes", []) or []:
        for f in _expand(w):
            claimants.setdefault(f, set()).add(s.get("name") or "?")

def has_author(f: str) -> bool:
    """⭐ 與 genguard.sh 的 authors.length 判準**逐字一致**。"""
    return bool(claimants.get(f, set()) - NORMALIZERS)

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
released = 0   # ⭐ GH#707:lock 時**主動放行**的正規化器專屬檔（444 → 644）
norm_only = 0  # 追蹤到的正規化器專屬檔總數（status 用）
for f in sorted(files):
    if not os.path.isfile(f):
        missing += 1
        continue
    st = os.stat(f).st_mode
    writable = bool(st & stat.S_IWUSR)
    author = has_author(f)
    if not author:
        norm_only += 1
    if mode == "status":
        locked += 0 if writable else 1
        unlocked += 1 if writable else 0
    elif mode == "lock":
        # ⭐ lock ＝「把隔離區推到正確狀態」,⛔ 不是「一律加鎖」。
        if writable:
            os.chmod(f, st & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH)); locked += 1
        elif not author and not writable:
            os.chmod(f, st | stat.S_IWUSR); released += 1
    elif mode == "unlock" and not writable:
        os.chmod(f, st | stat.S_IWUSR); unlocked += 1
scope = f"（step={step}）" if step else ""
# ⚠️ 這一行是 GH#707 的量尺:**> 0 就是 genguard 與隔離區又意見相左了**。
stuck = sum(
    1 for f in files
    if os.path.isfile(f) and not has_author(f) and not (os.stat(f).st_mode & stat.S_IWUSR)
)
tail = f",正規化器專屬 {norm_only} 份不上鎖" if norm_only else ""
if mode == "status":
    print(f"🔒 隔離區{scope}:鎖著 {locked} · 可寫 {unlocked} · 不存在 {missing} / 追蹤 {len(files)}{tail}")
    if stuck:
        print(f"⚠️ 其中 **{stuck} 份**只被正規化器認領卻是唯讀 —— genguard 說「不擋你」而檔案改不動（GH#707）。", file=sys.stderr)
        print("   ⇒ 跑一次 `bash scripts/product-quarantine.sh lock` 把它們放行。", file=sys.stderr)
elif mode == "lock":
    extra = f",放行 {released} 份正規化器專屬檔" if released else ""
    print(f"🔒 隔離區{scope}:上鎖 {locked} 份（追蹤 {len(files)},缺 {missing}{tail}）{extra}")
else:
    print(f"🔓 隔離區{scope}:解鎖 {unlocked} 份（追蹤 {len(files)},缺 {missing}）")
PY

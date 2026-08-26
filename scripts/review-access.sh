#!/usr/bin/env bash
# scripts/review-access.sh —— 🔐 **批核材料／批核結果的唯一一扇門**（GH#794）。
#
# owner 2026-08-27（逐字）：
# > 「為避免**讀寫混淆**，請將**批核材料跟批核結果分署不同資料夾**，
# >  用**特定存取script的特定存取權限**來管理**避免錯改**」
#
# ┌ 📦 批核材料 docs/_review/material/  ← **我**寫（review:register）· 平時 **444**
# └ 🧑‍⚖️ 批核結果 docs/_review/verdicts/  ← **owner** 按（批核頁 / 線上）· **644**
#
# ⭐ 兩件事這支腳本**做得到**，而散文做不到：
#   ① 材料平時是 444 ⇒ 任何手滑的 `Edit` / `>` / `python open(w)` 吃 **EACCES**
#   ② `guard` 逐條驗**不變量**（欄位不相交 / 權限 / 兩邊都在），紅了指名哪一條
#
# 用法：
#   bash scripts/review-access.sh status              # 兩邊各有什麼、權限對不對
#   bash scripts/review-access.sh guard               # ⭐ 閘：不變量逐條驗（非零＝壞了）
#   bash scripts/review-access.sh register -- <args>  # 登記一批（唯一的材料寫入端）
#   bash scripts/review-access.sh unlock              # ⚠️ 解鎖材料（要說得出為什麼）
#   bash scripts/review-access.sh lock                # 重鎖材料
set -uo pipefail
cd "$(dirname "$0")/.."

MATERIAL_DIR="docs/_review/material"
VERDICT_DIR="docs/_review/verdicts"
MATERIAL="$MATERIAL_DIR/batches.json"

perm() { stat -f "%Lp" "$1" 2>/dev/null || stat -c "%a" "$1" 2>/dev/null; }

cmd="${1:-status}"; shift || true

case "$cmd" in
  status)
    echo "🔐 批核分署（owner 2026-08-27「材料與結果分署不同資料夾」）"
    echo
    if [[ -f "$MATERIAL" ]]; then
      n=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$MATERIAL','utf8')).batches||{}).length)")
      echo "📦 材料 $MATERIAL —— $n 批 · 權限 $(perm "$MATERIAL") $([[ $(perm "$MATERIAL") == 444 ]] && echo '✓ 已鎖' || echo '⚠️ 沒鎖！跑 lock')"
    else
      echo "📦 材料 $MATERIAL —— ⛔ 不存在（跑 node tools/review/split-stores.mjs）"
    fi
    for f in "$VERDICT_DIR"/*.json; do
      [[ -e "$f" ]] || { echo "🧑‍⚖️ 結果 —— ⛔ $VERDICT_DIR 是空的"; break; }
      n=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$f','utf8')).verdicts||{}).length)")
      echo "🧑‍⚖️ 結果 $f —— $n 筆 · 權限 $(perm "$f") $([[ $(perm "$f") == 644 ]] && echo '✓ 可寫（頁面要寫得進去）' || echo '⚠️ 不是 644')"
    done
    echo
    echo "⭐ 線上批核的結果回流：bash scripts/review-sync.sh"
    ;;

  guard)
    # ⭐ 閘的本體。⛔ 每一條都問「兩個名詞的關係」，不是「檔案在不在」。
    fail=0
    [[ -f "$MATERIAL" ]] || { echo "⛔ 材料檔不存在：$MATERIAL"; fail=1; }
    ls "$VERDICT_DIR"/*.json >/dev/null 2>&1 || { echo "⛔ 結果目錄沒有任何檔：$VERDICT_DIR"; fail=1; }
    if [[ -f "$MATERIAL" ]]; then
      p=$(perm "$MATERIAL")
      [[ "$p" == 444 ]] || { echo "⛔ 材料沒鎖（$p，該是 444）—— 手滑的 Edit 會直接寫進去。修：bash scripts/review-access.sh lock"; fail=1; }
      # ⭐ 欄位不相交：材料檔裡出現裁決欄位 = 分署漏了
      if grep -qE '"(verdict|verdictAt|verdictHash)"' "$MATERIAL"; then
        echo "⛔ 材料檔裡有**裁決欄位** —— 分署破了（誰把 owner 的裁決寫進我的檔？）"; fail=1
      fi
    fi
    for f in "$VERDICT_DIR"/*.json; do
      [[ -e "$f" ]] || continue
      if grep -qE '"(rollback|registeredAt|sequenceDir)"' "$f"; then
        echo "⛔ 結果檔 $f 裡有**登記欄位** —— 分署破了（誰把材料寫進 owner 的檔？）"; fail=1
      fi
    done
    if [[ $fail -eq 0 ]]; then echo "✓ 批核分署的四條不變量全過（材料鎖著 · 結果可寫 · 欄位互不相交）"; fi
    exit $fail
    ;;

  unlock)
    [[ -f "$MATERIAL" ]] && chmod 644 "$MATERIAL"
    echo "⚠️ 材料已解鎖（644）。⭐ 改完**一定**要 lock 回去 —— 忘了鎖，下一次手滑就寫得進去了。"
    ;;

  lock)
    [[ -f "$MATERIAL" ]] && chmod 444 "$MATERIAL"
    echo "✓ 材料已鎖（444）"
    ;;

  register)
    [[ "${1:-}" == "--" ]] && shift
    # ⭐ 唯一的材料寫入端。`saveMaterial()` 自己開鎖／重鎖，⛔ 這裡不必手動 chmod。
    node tools/review/register.mjs "$@"
    ;;

  *)
    sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac

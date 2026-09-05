#!/usr/bin/env bash
# 🔒 **main 的 branch protection**（GH#983）—— ⭐ PR 才是閘，⛔ 不是信箱。
#
# ── ⭐ 它守的是一個量到的病 ────────────────────────────────────────────
# `feat/vfx-forge-codex` 至今 **0 張 PR**，而 `ci.yml` 的觸發是
# `on: push:[main] + pull_request` ⇒ ⭐ **`ci` 從未跑過 Codex 的程式**。
# ⇒ 上一輪的 74 個資產 blocker、缺 4 行 COPY、`ai-review/promote` 授權洞、
#   6 支沒登記的產生器 —— 全部是 owner 手動貼給 Main 的。
#
# ── ⭐ `enforce_admins: false` 是**刻意的**（⛔ 不是漏掉）────────────────
# `adms`（Main／owner）今天直接 commit 到 main 一天多次。這一格讓 Codex（write）
# 受管，而 Main ⛔ 不被自己的閘卡死。
# ⭐ 它同時是**回頭的開關**：要把 Main 也管進來 ⇒ 翻成 `true`；
#   要整個撤掉 ⇒ `bash scripts/branch-protection.sh remove`。
#
# ── ⛔ 為什麼 contexts 裡沒有 `regression` ──────────────────────────────
# 它從 2026-07-30 起沒綠過（GH#982：61 列 `done` 的 test_id 在原始碼裡連 beacon 都沒有）。
# ⭐ 把一個永遠紅的 check 列進 required ＝ **沒有人能合併任何東西**
# （CLAUDE.md 失敗形態⑨：一個永遠紅的閘等於一個不存在的閘，⛔ 而這個更糟：它會擋死所有人）。
# ⇒ #982 關掉之後再加。
#
#   bash scripts/branch-protection.sh apply    # 套用（要 admin token）
#   bash scripts/branch-protection.sh check    # 讀回來比對；缺了就非零並列出差在哪
#   bash scripts/branch-protection.sh remove   # 整個撤掉（⭐ 一鍵回頭）
set -uo pipefail
cd "$(dirname "$0")/.."

REPO="${GGD_REPO:-adms/GGD}"
BRANCH="${GGD_PROTECTED_BRANCH:-main}"
# ⭐ 四個 required check（GH#984 加了 `contract`）—— ⛔ `regression` 刻意不在裡面（見檔頭）。
WANT_CONTEXTS='["contract","go-platform","unit","vuln"]'

case "${1:-}" in
  apply)
    cat > /private/tmp/ggd-protection.json <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["unit", "contract", "go-platform", "vuln"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "require_code_owner_reviews": true, "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
    gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input /private/tmp/ggd-protection.json > /dev/null || {
      echo "⛔ 套用失敗 —— 多半是 token 沒有 admin 權限（gh auth refresh -s admin:repo_hook,repo）"; exit 1; }
    echo "✅ branch protection 已套用到 $REPO@$BRANCH"
    echo "   ⭐ 我挑的：enforce_admins=false（那一格叫 \`enforce_admins\`）—— Main 不被自己的閘卡死"
    ;;
  check)
    got=$(gh api "repos/$REPO/branches/$BRANCH/protection" 2>/dev/null) || {
      echo "⚠️ 讀不到 branch protection —— ⛔ 它可能還沒套用，或 token 沒權限。"
      echo "   ⇒ bash scripts/branch-protection.sh apply"
      exit 1; }
    bad=""
    # ⛔⛔ 比**值**，⛔ 不是比**字串**。2026-09-05 實測：apply 成功之後 check 立刻紅，
    #   而唯一的差別是 GitHub 回的 JSON 帶空格
    #   （`["contract", "go-platform", …]` vs 我寫死的 `["contract","go-platform",…]`）
    #   ⇒ ⭐ 一條**永遠不會綠**的閘（CLAUDE.md 失敗形態⑨），而它剛好在說
    #   「你套錯了」—— ⛔ 那是最糟的一種訊息：它指著一個沒有錯的東西。
    # ⭐ 同一個教訓這一夜已經出現過：`--check` 要問「兩份的關係」，⛔ 不是「位元組一不一樣」。
    ctx=$(printf '%s' "$got" | python3 -c 'import json,sys;print(" ".join(sorted((json.load(sys.stdin).get("required_status_checks") or {}).get("contexts") or [])))')
    want=$(printf '%s' "$WANT_CONTEXTS" | python3 -c 'import json,sys;print(" ".join(sorted(json.load(sys.stdin))))')
    [ "$ctx" = "$want" ] && echo "  ✅ required contexts = ${ctx}" || { echo "  ⛔ contexts 是 [${ctx}]，應為 [${want}]"; bad=1; }
    co=$(printf '%s' "$got" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("required_pull_request_reviews") or {}).get("require_code_owner_reviews"))')
    [ "$co" = "True" ] && echo "  ✅ require_code_owner_reviews = true" || { echo "  ⛔ require_code_owner_reviews 是 $co ⇒ CODEOWNERS 形同虛設"; bad=1; }
    [ -f .github/CODEOWNERS ] && echo "  ✅ .github/CODEOWNERS 在" || { echo "  ⛔ .github/CODEOWNERS 不存在 ⇒ 上面那一格沒有東西可以要求"; bad=1; }
    ea=$(printf '%s' "$got" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("enforce_admins") or {}).get("enabled"))')
    echo "  ℹ️ enforce_admins = ${ea}（⭐ false 是刻意的，見本腳本檔頭）"
    [ -n "$bad" ] && exit 1
    echo "✅ branch protection 與 CODEOWNERS 都在"
    ;;
  remove)
    gh api -X DELETE "repos/$REPO/branches/$BRANCH/protection" > /dev/null && \
      echo "✅ 已撤掉 $REPO@$BRANCH 的 branch protection（⭐ 一鍵回頭）"
    ;;
  *)
    echo "用法: bash scripts/branch-protection.sh {apply|check|remove}"; exit 2 ;;
esac

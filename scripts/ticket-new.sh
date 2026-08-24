#!/usr/bin/env bash
# 🎫 開票 scaffold —— owner 2026-08-24:「v1 2 3 都要是 script 能自動化的」。
# 檢查半在 scripts/ticket-lint.sh;這一支是**產生**半:一鍵長出帶齊全部欄位的票。
#
# 用法:
#   scripts/ticket-new.sh "[重要][fix] 標題" [--dry]
#     → 產出完整模板到暫存檔;沒有 --dry 就直接 `gh issue create` 並回傳 URL。
#     標題自己要帶好兩類 tag(lint 會驗;缺了這支腳本直接拒絕,⛔ 不產半張票)。
set -euo pipefail
cd "$(dirname "$0")/.."
TITLE="${1:?用法: scripts/ticket-new.sh \"[優先級][類型] 標題\" [--dry]}"
echo "$TITLE" | grep -qE '\[(緊急|重要|優先|一般)\]' || { echo "⛔ 標題缺優先級 tag" >&2; exit 1; }
echo "$TITLE" | grep -qiE '\[(breaking change|fix|improve|feature|refactor|perf|docs|test|chore|bug|infra)\]' \
  || { echo "⛔ 標題缺類型 tag" >&2; exit 1; }
BODY=$(mktemp /tmp/ticket_new_XXXXXX); mv "$BODY" "$BODY.md"; BODY="$BODY.md"
cat > "$BODY" <<'TPL'
## Objective
<這張票存在的目的,一句>

## Scope
<包含什麼>

## Non-goals
<明確不做什麼>

## Files / modules likely affected
<真的查過的路徑清單>

## Dependencies
<依賴哪張票/機制;沒有寫「無」>

## Implementation constraints
<適用的守則:三個住處/sim purity/Colyseus append-only/genguard/全域鎖/visual-proof…>

## Known risks
<至少一條;真的沒有寫「低」>

## 驗收（acceptance criteria）
<可檢查的完成條件>

## Test / verification criteria
<哪支測試·突變哪一行·量什麼數字;畫面類要 @visual-proof>

---
[思考策略] <__STRATS__>
[解決模板] <__TPLS__>
TPL
# ⭐ 選項清單從 catalog 動態長出（單一住處,⛔ 不在這裡再抄一份）
STRATS=$(python3 -c "import json;print(' / '.join(s['name'] for s in json.load(open('tools/ticket-templates/catalog.json'))['strategies']))")
TPLS=$(python3 -c "import json;print(' / '.join(t['name'] for t in json.load(open('tools/ticket-templates/catalog.json'))['templates']))")
sed -i '' -e "s|__STRATS__|$STRATS|" -e "s|__TPLS__|$TPLS|" "$BODY"
if [ "${2:-}" = "--dry" ]; then
  echo "✓ 模板在 $BODY —— 填完後: gh issue create --title \"$TITLE\" --body-file $BODY"
else
  gh issue create --title "$TITLE" --body-file "$BODY"
  echo "⚠️ 佔位符還在票裡 —— 開完立刻編輯填實,再跑 scripts/ticket-lint.sh 驗。"
fi

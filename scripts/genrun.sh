#!/usr/bin/env bash
# 🔓→▶️→🔒 單獨跑一支產生器的正道:解鎖它的產物 → 跑 → 重新上鎖。
#   scripts/genrun.sh shapes:build
# ⛔ 不要手動 chmod 產物再改內容 —— 那正是隔離區要擋的事。
#
# ⚠️⚠️ **最後一行一定要說成敗** —— 2026-08-25 我連續兩次以為 `content:build` 成功了,
#   而它其實是紅的:我打的是 `bash scripts/genrun.sh content:build 2>&1 | tail -1`,
#   於是 `tail` 吃掉了離開碼,而最後一行剛好是隔離區的「上鎖 21 份」看起來像成功。
#   ⭐ 那正是 CLAUDE.md 記著的陷阱變形①（`cmd | tail; echo $?` 拿到的是 tail 的）。
#   ⇒ 這支腳本擋不住別人接管道,但它可以**讓最後一行自己說話**。
set -uo pipefail
cd "$(dirname "$0")/.."
STEP="${1:?用法: scripts/genrun.sh <pnpm step,例 shapes:build>}"
bash scripts/product-quarantine.sh unlock --step "$STEP"
trap 'bash scripts/product-quarantine.sh lock --step "$STEP" >/dev/null 2>&1 || true' EXIT
pnpm "$STEP"
RC=$?
bash scripts/product-quarantine.sh lock --step "$STEP"
if [ "$RC" -ne 0 ]; then
  echo "✗✗ genrun: \`pnpm $STEP\` 失敗（exit $RC）—— ⛔ 產物**沒有**重新產生。" >&2
  echo "✗✗ genrun: \`pnpm $STEP\` 失敗（exit $RC）—— ⛔ 產物**沒有**重新產生。"
else
  echo "✓ genrun: $STEP 完成（產物已重新上鎖）"
fi
exit "$RC"

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
STEP="${1:?用法: scripts/genrun.sh <pnpm step,例 shapes:build> [要跑的 script,預設同名]}"
# ⭐ GH#815 —— 第二個參數讓「解鎖哪些產物」與「跑哪一支 script」分開。
#   package.json 的公開名（`content:build`）包成 wrapper 之後，真正的指令搬到
#   `content:build:raw`；`--step` 仍然用**公開名**去查 sync-io.json 的 writes。
#   ⛔ 少了這個分離，wrapper 會呼叫自己 ⇒ 無窮遞迴。
RUN="${2:-$STEP}"

# ⭐⭐ GH#815 —— **巢狀防護**。`sync.mjs`（skills:sync）一開始就把整個隔離區解鎖，
#   然後依序跑 38 支。如果每一支都在收工時把**自己的**產物重新上鎖，
#   鏈上後面那些**寫同一批檔**的步驟就會吃 EACCES ——
#   ⭐ 而那是一個「只在鏈裡發生、單獨跑永遠是綠的」的缺陷（本 repo 最難查的那一種）。
#   ⇒ 已經在解鎖上下文裡時，這支腳本**只負責跑**，⛔ 不碰鎖。
if [ "${GGD_QUARANTINE_UNLOCKED:-0}" = "1" ]; then
  pnpm "$RUN"
  RC=$?
  [ "$RC" -eq 0 ] || echo "✗✗ genrun: \`pnpm $RUN\` 失敗（exit $RC）" >&2
  exit "$RC"
fi

# ⭐⭐ GH#815 —— **解鎖全部，⛔ 不是只解那一支的**。
#   `--step` 從 `sync-io.json` 的 `writes` 推導要解哪些，而那張表是**量出來的** ⇒
#   ⛔ 它會漏。實測：`pnpm spec:build` 寫 `docs/editor-contract/ggd-ability-prose.json`，
#   而那份檔的宣告者是 **skillremake:json**（⛔ 不是 spec:build）⇒ `--step spec:build`
#   解不開它 ⇒ **EACCES 照樣發生**，而使用者剛剛才「照規矩走了 genrun」。
#   ⭐ 精準度在這裡買不到任何東西：我們要保的性質是「**沒有產生器在跑的時候產物唯讀**」，
#   而跑的期間全開完全滿足它。代價是對 ~700 個檔 chmod（毫秒級）。
#   ⇒ 與 `sync.mjs` 的行為逐字相同 —— 而那條路已經穩定運作。
bash scripts/product-quarantine.sh unlock
trap 'bash scripts/product-quarantine.sh lock >/dev/null 2>&1 || true' EXIT
GGD_QUARANTINE_UNLOCKED=1 pnpm "$RUN"
RC=$?
bash scripts/product-quarantine.sh lock
if [ "$RC" -ne 0 ]; then
  echo "✗✗ genrun: \`pnpm $STEP\` 失敗（exit $RC）—— ⛔ 產物**沒有**重新產生。" >&2
  echo "✗✗ genrun: \`pnpm $STEP\` 失敗（exit $RC）—— ⛔ 產物**沒有**重新產生。"
else
  echo "✓ genrun: $STEP 完成（產物已重新上鎖）"
fi
exit "$RC"

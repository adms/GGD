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

# ⭐⭐ GH#950 —— **內容樹的獨佔鎖**。
#
# ⚠️ 為什麼：這支腳本會**成批重寫** `content/**`（`skillremake:json` 一次寫 400+ 份），
# ⛔ 而 vitest 的**檔案之間是並行的** ⇒ 另一支測試的 `--check` 可能正好讀到
# 一棵寫到一半的樹 ⇒ ⭐ 報一個**假的「過期」**，而它的訊息叫人去跑 build
# （照做會產生一份**位元組相同**的產物 ⇒ 下一輪又紅 ⇒ 以為是新的錯）。
#
# ⭐ 這裡是**唯一**要改的地方：genrun 是每一支產生器的單一入口。
# 讀者那一側走 `scripts/gencheck.sh`（共享鎖）。
#
# ⚠️ ⛔ **巢狀時不可以再拿一次** —— `flock` 是 per-fd 的，
# 而 `skills:sync` 底下的 genrun 是**另一個 process** ⇒ 再拿一次獨佔鎖會**死鎖**。
# ⇒ 判準與下面那個隔離區的巢狀防護**同一個**：`GGD_QUARANTINE_UNLOCKED`。
if [ "${GGD_QUARANTINE_UNLOCKED:-0}" != "1" ] && [ "${GGD_CONTENT_LOCK_HELD:-0}" != "1" ]; then
  export GGD_CONTENT_LOCK_HELD=1
  # ⚠️ ⛔ 不可以寫 `"$0" "$STEP" "${2:-}"` —— `$2` 沒給時那會傳一個**空字串**，
  #   而下面的 `RUN="${2:-$STEP}"` 對空字串**不會**套預設 ⇒ `pnpm ""`。
  if [ "$#" -ge 2 ]; then
    exec python3 scripts/content-tree-lock.py write -- bash "$0" "$STEP" "$2"
  fi
  exec python3 scripts/content-tree-lock.py write -- bash "$0" "$STEP"
fi

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

# 🧾 GH#771 Scope③ —— **執行期對帳**：跑之前拍一張快照，跑完問
#   「這一支寫出去的每一份檔，戶籍表上是不是它自己的？」
#   ⭐ 這裡是**唯一**歸得了因的地方：單獨跑 = 同一個時間窗只有這一支在寫。
#      （`skills:sync` 那一趟是 8–12 支並行 ⇒ mtime 互相汙染 ⇒ 刻意不對帳。）
#   ⚠️ 快照拍不出來就**說出來再跳過** —— 靜默的跳過與「全過」長得一模一樣。
SNAP=""
if [ "${GGD_RECONCILE_OFF:-0}" != "1" ]; then
  # ⚠️ 一定要帶 `XXXXXX` 的完整模板 —— BSD 的 `mktemp -t <前綴>` 會自己補亂數，
  #   ⛔ 而 GNU 的同一寫法會死在「too few X's in template」⇒ 那條路上對帳會**靜默消失**。
  SNAP="$(mktemp "${TMPDIR:-/tmp}/ggd-genrun-snap.XXXXXX")"
  node tools/parallel-gates/reconcile.mjs snapshot --out "$SNAP" ||
    { echo "⚠️ 對帳快照拍不出來 —— 這一輪**沒有對帳**（⛔ 不是通過）。" >&2; rm -f "$SNAP"; SNAP=""; }
fi

GGD_QUARANTINE_UNLOCKED=1 pnpm "$RUN"
RC=$?

# ⭐ 在**重新上鎖之前**對帳（chmod 只動權限位，⛔ 不動 mtime/size，兩邊順序都安全，
#   但擺在這裡讀起來就是「跑完 → 對帳 → 收工」）。
if [ -n "$SNAP" ]; then
  if [ "$RC" -eq 0 ]; then
    # ⭐ `--run` 是 wrapper 分離的另一半:sync-io 量到的可能是 **raw 名**
    #   (`castderive:build:raw`,宣告 492 份),而 `$STEP` 是公開名 ⇒ 只傳公開名會「查無此步」
    #   而**整支從來沒有被對帳過**。⇒ 兩個名字都給它,由它挑戶籍表上真的有的那一個。
    node tools/parallel-gates/reconcile.mjs verify --step "$STEP" --run "$RUN" --before "$SNAP" || RC=3
  fi
  rm -f "$SNAP"
fi

bash scripts/product-quarantine.sh lock
if [ "$RC" -eq 3 ]; then
  echo "✗✗ genrun: $STEP **跑完了但戶籍對不上**（見上面的對帳報告）—— GH#771。" >&2
  echo "✗✗ genrun: $STEP **跑完了但戶籍對不上**（見上面的對帳報告）—— GH#771。"
elif [ "$RC" -ne 0 ]; then
  echo "✗✗ genrun: \`pnpm $STEP\` 失敗（exit $RC）—— ⛔ 產物**沒有**重新產生。" >&2
  echo "✗✗ genrun: \`pnpm $STEP\` 失敗（exit $RC）—— ⛔ 產物**沒有**重新產生。"
else
  echo "✓ genrun: $STEP 完成（產物已重新上鎖）"
fi
exit "$RC"

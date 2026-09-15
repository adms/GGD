#!/usr/bin/env bash
# 🚀 **BMPNDD** = Backup戰情版 + 整理近一週開票進戰情版 + Push + Note + Discord + Deploy
#
# owner 2026-08-30（逐字，⭐ 兩個名字都是他取的）：
#   「整理近一週對話開票進戰情版(md) + push + note + discord + deploy => 我以後會簡稱 **MPNDD**」
#   「好 那我升級為 **備份戰情版.md** + … => 我以後會簡稱 **BMPNDD**」
#
# ⭐ **B 是獨立的一步，⛔ 不是藏在 M 裡的一行** —— 因為它會**自己失敗**
#   （磁碟滿、權限、路徑變了），而藏起來的失敗讀起來就是「M 過了」。
#
#   bash scripts/bmpndd.sh "<這一版的一句話說明>"
#   bash scripts/bmpndd.sh "<說明>" --no-deploy
#   bash scripts/bmpndd.sh "<說明>" --no-gate     # ⛔ 跳過第 0 步的閘（會印出來）
#
# ⚠️ ⭐ 為什麼是一個指令：這五步在此之前是五段**要記得**的手打，
# 而 2026-08-29/30 這一天它們漏過四次（M 忘了整理 · N 忘了發 · D 靜默跳過 · D 診斷錯方向）。
set -uo pipefail
cd "$(dirname "$0")/.."

MSG="${1:?用法: bash scripts/mpndd.sh \"<這一版的一句話說明>\" [--no-deploy]}"
shift
# ⛔⛔ GH#1256 —— **這裡不載 docker/.env**（⭐ 主 session 2026-09-15 派工時指定的結構性修正，⛔ 不是 lane 順手修；
#   96e6ede6b 的訊息寫成「順手修」是錯的，修正輪更正）。
#   在此之前這一行就在這裡 ⇒ 正式站的 env（`PLATFORM_GAME_SHARED_SECRET` 那一族）被 export 進
#   閘的 `pnpm ship:check` ⇒ game-server 的測試讀到正式站設定而紅（2026-09-15 當晚 BMPNDD 的閘就是這樣紅的）。
#   ⭐ 閘要在**乾淨的 env** 跑；env 只給 P·N·D·D —— 而 `ship-it.sh:19` 自己就載它，⛔ 不必在這裡載。
#   守衛：`bmpnddBoardAndEnv.test.ts`「閘的 env 裡沒有 docker/.env」（真的跑出貨的這一支）。

step() { printf '\n\033[1m══ %s\033[0m\n' "$*"; }
FAIL=""

# 🔙 GH#1256 的爭議各留一格開關（環境變數 —— 只有作者／主 session 會轉，⛔ 不進後台）：
#   GGD_BMPNDD_BACKUP_SET = both（預設）｜board｜batches        B 留底哪幾份（batches ＝ 改動前：只留執行批次計畫）
#   GGD_BMPNDD_M_ROLL     = 1（預設）｜0                        M 先跑 board:roll 重建七天窗（0 ＝ 改動前：唯讀比對）
#   GGD_BMPNDD_BOARD_WRAP = before-gate（預設）｜after-gate｜off  戰情版與副本何時進 git（off ＝ 改動前：不收）
#   根目錄捷徑追不追蹤那一格在 `board-roll.sh`（GGD_BOARD_LINK_REQUIRED）。
# ⛔ 打錯值 ⇒ 開跑前就停下來指名（靜默退回預設，與沒有開關長得一模一樣）。
knob() {   # knob <變數名> <預設> <合法值…> ⇒ 印出值
  local name=$1 def=$2 v ok; shift 2; v="${!name:-$def}"
  for ok in "$@"; do [ "$v" = "$ok" ] && { echo "$v"; return 0; }; done
  echo "⛔ $name='$v' 不認得（合法：$*）—— ⛔ 不靜默退回預設" >&2; return 1
}
BACKUP_SET=$(knob GGD_BMPNDD_BACKUP_SET both both board batches) || exit 1
M_ROLL=$(knob GGD_BMPNDD_M_ROLL 1 1 0) || exit 1
BOARD_WRAP=$(knob GGD_BMPNDD_BOARD_WRAP before-gate before-gate after-gate off) || exit 1

# ⭐ GH#1256 —— **戰情版是哪一份**只問 `board-roll.sh --where`（⛔ 這裡不再寫一份路徑）。
#   owner 叫「戰情版」的是 `docs/_release/戰情版-YYYYMMDD.md`。⛔ 在此之前 B／M 指的是
#   `docs/_execution-batches.md` —— owner 叫它「執行批次計畫」，⛔ 不是戰情版（研究見 #1256）。
board_path() { bash scripts/board-roll.sh --where; }

# ── B：備份戰情版 ────────────────────────────────────────────────────────
# ⭐ GH#1162 —— **第 0 步：閘**。在此之前這六步零個閘：`pnpm typecheck` 紅了好幾輪，
#   中間跑過 5 輪 BMPNDD、5 次部署，每一次都「綠」——「部署綠」與「typecheck 綠」是兩件事。
#   ⭐ 真的閘是 `pnpm ship:check`（它自己有跑 typecheck）。`--no-gate` 可跳過，⭐ 但要**印一行明說**跳過了
#   （靜默跳過與跑過長得一模一樣）。純函式：bmpnddGate.test.ts 用假的 pnpm 真的跑它。
bmpndd_gate() {
  if [ "${GGD_BMPNDD_NO_GATE:-0}" = 1 ]; then
    echo "⚠️ --no-gate：⛔ 這一輪**沒有跑** pnpm ship:check —— 你在沒有閘的情況下 push／部署（GH#1162）"
    return 0
  fi
  local t0 t1; t0=$(date +%s)
  if pnpm ship:check; then
    t1=$(date +%s); echo "✓ 閘過了：pnpm ship:check（$((t1-t0)) 秒）"; return 0
  fi
  t1=$(date +%s)
  echo "⛔ pnpm ship:check 紅（$((t1-t0)) 秒）⇒ **停在 push 之前**。修好再跑；真的要繞過用 --no-gate（會印出來）。"
  return 1
}
for _a in "$@"; do [ "$_a" = "--no-gate" ] && export GGD_BMPNDD_NO_GATE=1; done

# ⭐⭐ **閘搬到 P 前面了（2026-09-12）** —— ⛔ 它本來擋在 B 與 M 前面。
#
# ⚠️ owner 2026-09-12：「我跟你說過一個段落就要 BMPNDD 你要**檢討根因**為何忘了」
# ⭐ 根因**不是**忘了，是這支腳本在它最該跑的那一刻**拒絕跑**：
#
#   · 進入條件「一個段落」是**判準**，⛔ 沒有可量的觸發點
#   · 而第 0 步 `pnpm ship:check` 在**清紅燈的那一整天**必然是紅的
#   · `bmpndd_gate || exit 1` 擋在 B 之前 ⇒ ⛔ **備份與開票整理一次都沒發生**
#
# ⇒ ⭐⭐ **記錄進度的工具，被「進度已經完成」擋住了。**
#   而那正好是「段落」最密集、最需要記錄的那一天。
#
# ⭐ B（備份）與 M（整理開票進戰情版）**不改變任何出貨位元組** ——
# ⛔ 它們不需要閘。真正需要閘的是 P（push）之後那四步。
# ⇒ 閘留著、⛔ 一點都沒放寬，只是站到**它真正守的那扇門**前面。

step "B/6  備份戰情版"
# ⚠️ ⭐ 為什麼它是**一步**而不是一行：PreToolUse hook 對**檔案 API 直寫**是瞎的
#   （`Path.write_text()` / `writeFileSync` 它看不到）⇒ 戰情版 2026-08-30 被改了
#   五次以上而帳本裡只有 **1** 筆。⭐ 而 `ggd-board.html` 有 10 筆 —— 因為那支
#   產生器**自己叫**留底。⇒ 這一步就是替 md 那一份補上同一件事。
# ⭐ GH#1256 owner 2026-09-15：「「戰情版」有三份同名的檔=> 用時間區隔 全部都要備份」
#   ⇒ 當日戰情版 ＋ 執行批次計畫（⛔ 不是戰情版，但在「三份」裡）都留底，副本目錄帶時間戳。
#   ggd-board.html 由 gen_board.py 每次改寫前自己留底；根目錄 GGD戰情版.md 只是指向日檔的捷徑。
#   🔙 GGD_BMPNDD_BACKUP_SET（見檔頭）。
BOARD=$(board_path) || { echo "⛔ 找不到戰情版（board-roll.sh --where）—— ⛔ 不往下走"; exit 1; }
case "$BACKUP_SET" in
  both) KEEP=("$BOARD" docs/_execution-batches.md) ;;
  board) KEEP=("$BOARD") ;;
  batches) KEEP=(docs/_execution-batches.md) ;;
esac
if bash scripts/preserve.sh "${KEEP[@]}"; then :; else
  echo "⚠️ 留底失敗 —— ⛔ 這一步失敗就**不要往下走**（下一步會覆蓋它）"
  exit 1
fi

# ── M：整理近一週對話開票進戰情版 ───────────────────────────────────────
step "M/6  近一週的票 ↔ 戰情版"
SINCE=$(date -v-7d +%F 2>/dev/null || date -d '-7 days' +%F)
# ⭐ GH#1256「整理」＝ board:roll 從帳本重建七天窗（它改寫前自己留 戰情版_temp_{時間}.md）；
#   換日後今天那一份才是戰情版 ⇒ 重問一次路徑。🔙 GGD_BMPNDD_M_ROLL=0 ⇒ 不重建（見檔頭）。
if [ "$M_ROLL" = 1 ]; then
  bash scripts/genrun.sh board:roll board:roll:raw || { echo "⚠️ board:roll 失敗 ⇒ 下面比對的是舊的戰情版"; FAIL="${FAIL}M "; }
else
  echo "⚠️ GGD_BMPNDD_M_ROLL=0：⛔ 這一輪沒有重建七天窗，下面比對的是現有的戰情版"
fi
BOARD=$(board_path) || { echo "⛔ 找不到戰情版"; exit 1; }
# ⭐ **寫戰情版之前先留底**（owner 2026-08-30：「寫入戰情版前 都會自動備份對吧？」）
#   ⚠️ ⭐ 當時的答案是**沒有** —— PreToolUse hook 對**檔案 API 直寫**是瞎的，
#   而戰情版今天被 python 改了五次以上，帳本裡只有 1 筆。
# ⚠️ ⭐ 只問**開著**的（`--state open`）—— 戰情版是**現況**，⛔ 不是歸檔。
#   已關的票結論在它們自己身上；逼人把它們寫進現況板只會得到一份沒有人讀的清單。
NEW=$(gh issue list --state open --limit 200 --search "created:>=$SINCE" \
        --json number -q '.[].number' 2>/dev/null | sort -n) || NEW=""
if [ -z "$NEW" ]; then
  echo "⚠️ gh 連不上 ⇒ **沒有比對**（⛔ 這不是「近一週沒開票」）"
  FAIL="${FAIL}M "
else
  # ⚠️ ⭐ **逐行讀**，⛔ 不是 `for n in $NEW` —— 後者在 `set -u`＋換行分隔下
  #   會把整串當成**一個**值 ⇒ 迴圈只跑一圈、grep 一定失敗 ⇒
  #   ⭐ 而結果是「沒有漏」= **一個空轉的綠燈**（2026-08-30 我自己中了一次）。
  # ⭐ GH#1256：戰情版的票號那一格常常**沒寫 `#`**（`| 1157 1158 |`）⇒ ⛔ 不再 `grep "#n"`，
  #   改問 `ledger_table.board_tickets()`（票號長什麼樣只住那裡）。比對程式壞了 ⇒ ⛔ 不讀成「沒有漏」。
  CNT=$(printf '%s\n' "$NEW" | grep -c .)
  if ! MISS=$(printf '%s\n' "$NEW" | python3 -c '
import sys; sys.path.insert(0, "scripts")
from ledger_table import board_tickets
seen = board_tickets(open(sys.argv[1], encoding="utf-8").read())
print(" ".join(f"#{n}" for n in map(int, sys.stdin.read().split()) if n not in seen))' "$BOARD"); then
    echo "⛔ 票號比對程式失敗 ⇒ **沒有比對**（⛔ 這不是「都提到了」）"
    FAIL="${FAIL}M "
  elif [ -n "$MISS" ]; then
    # ⚠️ ⭐ fail-loud ⛔ 不自動塞：哪一則對到哪張票是**判斷**，自動貼票號只會得到沒有人讀的清單。
    echo "⚠️ 近一週**開著** $CNT 張票，其中**戰情版沒提到**的：$MISS"
    echo "   ⇒ 在帳本把那則對上票：python3 scripts/ledger_table.py --map <帳本.md> <HH:MM 或 身分> '<票號>'（戰情版從帳本重建）"
    FAIL="${FAIL}M "
  else
    echo "✓ 近一週**開著**的 $CNT 張票，戰情版（$BOARD）都提到了"
  fi
fi

# ── B·M 收尾：戰情版與它的副本**進 git**（GH#1256）─────────────────────────
# owner 2026-09-11：「S3 是備份不是互斥 所有產生器 抽取器 成品也都要在 S3 上一份 作為備份站點」
#   而 `backup-s3.sh` 上傳的是 `git archive HEAD` ⇒ ⛔ 沒進 git 的副本不上 S3、只活在這一台。
# ⭐ 在閘前面收：紅燈的日子副本也不會只留在工作區；P 會把它推上去。
#   ⛔ 只收戰情版家族，逐檔 pathspec（CLAUDE.md：commit 永遠帶逐檔列名，⛔ 不碰別的 lane）。
#   ⭐ 修正輪補收 `docs/legacy/_overwrites/_ledger.tsv`：B 的 preserve.sh 會追加它，⛔ 不收的話收尾之後它仍躺在工作區。
#     ⚠️ 它是 append-only 的留底帳本（hook 也寫）⇒ 整份進 commit 會連同別的 session 追加的列 ——
#     那是紀錄、⛔ 不是別人的程式改動；合併衝突取聯集（CLAUDE.md「追加式帳本 ⛔ --ours／--theirs」）。
board_wrap() {
  local files=() f msg
  while IFS= read -r -d '' f; do files+=("$f"); done < <(git ls-files -z -m -o --exclude-standard -- \
    'docs/_release/戰情版-*.md' 'docs/_release/戰情版_temp_*.md' \
    'docs/legacy/_overwrites/*/docs/_release/戰情版-*.md' 'docs/legacy/_overwrites/*/docs/_execution-batches.md' \
    'docs/legacy/_overwrites/_ledger.tsv')
  [ ${#files[@]} -gt 0 ] || { echo "✓ 戰情版沒有新的改動或副本要收"; return 0; }
  msg="${TMPDIR:-/tmp}"; msg="${msg%/}/bmpndd-board-wrap-$$.txt"
  printf 'chore(board): 🗂 GH#1256 戰情版與副本收尾（BMPNDD B·M，%s 個檔）\n\nowner 2026-09-15：「「戰情版」有三份同名的檔=> 用時間區隔 全部都要備份」\n' "${#files[@]}" > "$msg"
  # ⚠️ 為什麼還要先 `git add`：**未追蹤**的副本（新日檔、_temp_、legacy 目錄）`git commit -- <路徑>` 不認
  #   （pathspec did not match any file(s) known to git）⇒ 路徑一定要先進索引。
  #   ⭐ 用 `-N`（intent-to-add：只登記「有這個路徑」、⛔ 不 stage 內容；已追蹤的檔它不動）——
  #   別的 session 裸打 `git commit` 掃不走它，內容由下一行帶逐檔 pathspec 的 commit 從工作樹讀
  #   （CLAUDE.md「全程不 stage」；2026-09-15 修正輪在暫存 repo 實測兩個方向）。
  git add -N -- "${files[@]}" && git commit -q -F "$msg" -- "${files[@]}" \
    && echo "✓ 戰情版與副本 ${#files[@]} 個檔進 git（$(git rev-parse --short HEAD)）"
}
wrap_step() {
  step "B·M 收尾  戰情版與副本進 git（GGD_BMPNDD_BOARD_WRAP=$BOARD_WRAP）"
  board_wrap || { echo "⚠️ 收尾 commit 失敗 —— 副本還在工作區，⛔ 但沒進 git（不會上 S3）"; FAIL="${FAIL}B "; }
}
# 🔙 GGD_BMPNDD_BOARD_WRAP（見檔頭）：after-gate ⇒ 閘綠了才收；off ⇒ 這一輪不收。
case "$BOARD_WRAP" in
  before-gate) wrap_step ;;
  off) echo "⚠️ GGD_BMPNDD_BOARD_WRAP=off：⛔ 戰情版與副本這一輪不進 git（不會上 S3）" ;;
esac

# ── 閘：⭐ 站在**它真正守的那扇門**前面（push／note／discord／deploy）────────
# ⛔ 它本來在 B 之前 ⇒ 紅燈的日子裡連備份與開票整理都跑不了（見檔頭那段根因）。
step "0/6  閘（pnpm ship:check）—— ⭐ B 與 M 已經做完，這一步守的是 push 之後"
bmpndd_gate || {
  echo "⛔ 閘紅 ⇒ **停在 push 之前**。⭐ 而 B（備份）與 M（開票 ↔ 戰情版）**已經做完了**，"
  echo "   ⛔ 不會因為這裡紅而白跑 —— 那正是 2026-09-12 檢討出來的根因。"
  exit 1
}
[ "$BOARD_WRAP" = after-gate ] && wrap_step

# ── P + N + D + D ────────────────────────────────────────────────────────
step "P·N·D·D  (3-6/6)"
if bash scripts/ship-it.sh "$MSG" "$@"; then :; else FAIL="${FAIL}PNDD "; fi

echo
if [ -z "$FAIL" ]; then
  echo "🚀 BMPNDD —— 六步全過"
else
  echo "⚠️ 這幾步**沒過**：$FAIL"
  echo "   ⛔ 它們不會自己補 —— 修完再跑一次（過了的步驟是冪等的）"
  exit 1
fi

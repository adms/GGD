#!/usr/bin/env bash
#
# 規則快照 —— 動 CLAUDE.md 或記憶之前，先把**舊的**存起來。
#
# owner 2026-08-05：「請你每次改變 CLAUDE.md 與記憶 就產生一個舊的 backup file，
#                     來幫助我們做版本控制」
#
# ── ⚠️ 兩個檔案的處境完全不同（實測，不是猜的）─────────────────────────────
#
#   CLAUDE.md  → 在 repo 的 git 裡，已有 10 個歷史版本。備份是**加保險**：
#                我常常在一次 commit 裡改它好幾次，中間狀態在 git 裡看不到。
#   記憶 43 檔 → **完全沒有任何版本控制**（216K，`git rev-parse` 空手而回）。
#                改壞了、刪錯了、覆蓋了都救不回來。這才是真的洞。
#
# 所以這支腳本做兩件事：
#   ① 時間戳快照（owner 要的那個「舊的 backup file」，人眼看得懂、比得了）
#   ② 把記憶目錄本身變成一個 git repo 並提交 —— 那才是**真的**版本控制
#      （看得到 diff、回得去任何一版）。216K，成本等於零。
#
# ── 用法 ──────────────────────────────────────────────────────────────────
#
#   bash scripts/backup-rules.sh                # 動手改之前跑這一行
#   bash scripts/backup-rules.sh --list         # 看有哪些快照
#   bash scripts/backup-rules.sh --diff         # 記憶自上次快照以來改了什麼
#
# ⛔ CLAUDE.md 的規矩：改那兩個地方之前**先跑這支**。
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 專案的 claude 目錄名 = 專案路徑把 / 換成 -
SLUG="$(printf '%s' "$REPO" | sed 's|/|-|g')"
# ⚠️ `GGD_RULES_HOME` 只給守衛用 —— 讓 releaseScript 那種測試可以在 tmp 目錄
# 真的把這支跑起來，而不是掃字串（一個「cp 打錯路徑」的版本掃字串照樣綠）。
CLAUDE_DIR="${GGD_RULES_HOME:-$HOME/.claude/projects/$SLUG}"
MEM_DIR="$CLAUDE_DIR/memory"
SNAP_ROOT="$CLAUDE_DIR/rules-backup"

# 保留幾份時間戳快照。60 份 ≈ 13MB，而且舊的還在記憶自己的 git 裡。
KEEP=60

case "${1:-}" in
  --list)
    [[ -d "$SNAP_ROOT" ]] || { echo "還沒有任何快照。"; exit 0; }
    ls -1 "$SNAP_ROOT" | sort | tail -20
    echo
    echo "共 $(ls -1 "$SNAP_ROOT" | wc -l | tr -d ' ') 份，位置: $SNAP_ROOT"
    exit 0
    ;;
  --diff)
    if git -C "$MEM_DIR" rev-parse --git-dir >/dev/null 2>&1; then
      git -C "$MEM_DIR" --no-pager diff --stat
      git -C "$MEM_DIR" --no-pager diff
    else
      echo "記憶目錄還沒有 git —— 先跑一次 backup-rules.sh。" >&2
      exit 1
    fi
    exit 0
    ;;
esac

STAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="$SNAP_ROOT/$STAMP"
mkdir -p "$DEST"

# ── ① 時間戳快照 ──────────────────────────────────────────────────────────
[[ -f "$REPO/CLAUDE.md" ]] && cp "$REPO/CLAUDE.md" "$DEST/CLAUDE.md"
if [[ -d "$MEM_DIR" ]]; then
  mkdir -p "$DEST/memory"
  # ⚠️ 只拷 .md —— 不要把記憶目錄自己的 .git 也拷進去（會變成一份沒用的裸物件）
  find "$MEM_DIR" -maxdepth 1 -name '*.md' -exec cp {} "$DEST/memory/" \;
fi

n_mem="$(find "$DEST/memory" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
echo "✓ 快照 $STAMP —— CLAUDE.md + $n_mem 份記憶"
echo "  $DEST"

# ── ② 記憶目錄的真.版本控制 ───────────────────────────────────────────────
if [[ -d "$MEM_DIR" ]]; then
  if ! git -C "$MEM_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    git -C "$MEM_DIR" init -q -b main
    # ⚠️ 這個 repo **不推去任何地方** —— 記憶是本機的，裡面可能有專案私事。
    printf 'rules-backup/\n' > "$MEM_DIR/.gitignore"
    echo "  ⭐ 記憶目錄現在有 git 了（在此之前 43 份檔案零版本控制）"
  fi
  git -C "$MEM_DIR" add -A
  if git -C "$MEM_DIR" diff --cached --quiet; then
    echo "  （記憶自上次以來沒有變動，沒有新 commit）"
  else
    git -C "$MEM_DIR" -c user.name=GGD -c user.email=ggd@local \
      commit -q -m "memory @ $STAMP"
    echo "  ✓ 記憶已提交 —— \`git -C $MEM_DIR log\` 看得到全部歷史"
  fi
fi

# ── 修剪 ──────────────────────────────────────────────────────────────────
# ⚠️ 只剪時間戳快照，**不動記憶自己的 git**（那份是完整歷史，不該被剪）。
cnt="$(ls -1 "$SNAP_ROOT" 2>/dev/null | wc -l | tr -d ' ')"
if (( cnt > KEEP )); then
  ls -1 "$SNAP_ROOT" | sort | head -n $(( cnt - KEEP )) | while read -r old; do
    rm -rf "${SNAP_ROOT:?}/$old"
  done
  echo "  （修剪掉 $(( cnt - KEEP )) 份最舊的快照，保留 $KEEP 份）"
fi

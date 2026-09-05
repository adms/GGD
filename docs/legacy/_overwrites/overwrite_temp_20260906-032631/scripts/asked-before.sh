#!/usr/bin/env bash
# 升級問題給 owner **之前**先跑這個 —— 他可能已經答過了。
#
# owner 2026-08-20：
#   「你**重複問我也重複回答三次以上**了，你一定是**沒更新上去做記錄**，
#    我說了⋯**先做好 GH issue 記錄不要再重複問我了**」
#
# ⚠️ 這條規則失效的形狀很特別：答案**就在我自己寫的帳本裡**
# （`docs/_daily/2026-08-19.md:116` 逐字記著「跟主動一樣就好」），
# 而我升級決策時沒有回頭讀那張表。⇒ 判準治不了，因為「要記得查」正是被忘掉的那件事。
#
#   bash scripts/asked-before.sh 吞噬 冷卻
#   bash scripts/asked-before.sh 樹精
#   bash scripts/asked-before.sh --strict 十出身   # ⭐ 零命中 ⇒ exit 1（給 CI／packet repro 用）
set -uo pipefail
cd "$(dirname "$0")/.."

# ⭐ GH#1027：預設模式**沒命中也回 0** —— 它的消費端是人（「先查他答過沒」），那是對的。
#   ⛔ 但拿去當 `ggd-coord-packet@1` 的 repro（`expectedExit: 0`）就成了一把**單邊的尺**：
#   一句捏造的 owner 引言在 CI 上照樣全綠。`--strict` 補上「沒有的量不到」那一半。
STRICT=0; ARGS=()
for a in "$@"; do
  if [ "$a" = "--strict" ]; then STRICT=1; else ARGS+=("$a"); fi
done
set -- "${ARGS[@]+"${ARGS[@]}"}"
[ $# -eq 0 ] && { echo "用法: $0 [--strict] <關鍵字> [關鍵字…]" >&2; exit 2; }

PROJ="$HOME/.claude/projects/-Users-Takuro-GGD"
HITS=0
for kw in "$@"; do
  echo "════ 「${kw}」 ════"
  # ① 我自己的日期帳本（最便宜、命中率最高）
  if out=$(grep -rn --color=never "$kw" docs/_daily/*.md 2>/dev/null | head -12) && [ -n "$out" ]; then
    echo "── docs/_daily（我記過的裁決）──"; echo "$out"; HITS=1
  fi
  # ② 已經開的票（含留言）
  #
  # ⛔ 這裡以前**只印票號與標題** —— 而票號不是答案。就算命中 #447,畫面上也不會出現
  # 「30/50/99」那組真的數字,於是我照樣去問 owner 第四次。⇒（閘 D）命中就把
  # **那段文字本身**撈出來印:`gh issue view N --comments` 讀 body **加**留言
  #（`gh issue view` 不加 `--comments` 只印 body —— 而更正常常只活在留言裡）。
  if command -v gh >/dev/null 2>&1; then
    if out=$(gh issue list --state all --limit 300 --search "$kw" \
             --json number,title,state \
             --jq '.[]|"  #\(.number) \(.state|ascii_downcase) — \(.title)"' 2>/dev/null | head -8) \
       && [ -n "$out" ]; then
      echo "── 相關票 ──"; echo "$out"; HITS=1
      for n in $(printf '%s\n' "$out" | sed -n 's/.*#\([0-9][0-9]*\).*/\1/p' | head -3); do
        snip=$(gh issue view "$n" --comments 2>/dev/null \
               | grep -C2 --color=never -- "$kw" 2>/dev/null | head -12)
        [ -n "$snip" ] || continue
        echo "   ┌ #$n 命中的原文（⭐ 這才是答案,⛔ 票號不是）"
        printf '%s\n' "$snip" | sed 's/^/   │ /'
        echo "   └────"
      done
    fi
  fi
  # ③ transcript 撈出來的 owner 原話（若已產生）
  for f in /private/tmp/ggd-msgs-since-v0181.md docs/_daily/ledger-source_temp_*.md; do
    [ -f "$f" ] || continue
    if out=$(grep -n --color=never "$kw" "$f" 2>/dev/null | head -8) && [ -n "$out" ]; then
      echo "── owner 原話（$(basename "$f")）──"; echo "$out"; HITS=1
      break
    fi
  done
  echo
done
if [ "$HITS" -eq 1 ]; then
  echo "⚠️ **有命中** —— 先把上面讀完再決定要不要問。"
  echo "   如果他已經答過：⛔ 不要再問，把答案**逐字寫進那張票**（他要的是記錄，不是再問一次）。"
else
  echo "✓ 沒有命中 —— 這題看起來是新的，可以升級給 owner。"
fi

#!/usr/bin/env bash
#
# GGD 版號守衛 —— 算出「今天應該是哪一號」，並拒絕任何別的號。
#
# ═══════════════════════════════════════════════════════════════════════════
# 為什麼這支腳本存在
# ═══════════════════════════════════════════════════════════════════════════
#
# owner 的規則：**每天一個次版號**。同一天內只 bump 第三段。
#
# 而它被破壞了整整 10 天 —— v0.9 從 2026-07-27 撐到 2026-08-05，45 個 patch，
# 中間跨了 10 個日曆日。照規則那期間應該走到 v0.18。
#
# ⚠️ 根因不是「忘記」，是**規則只被寫下來一半**：CLAUDE.md 記的是
#
#     「git push + GitHub release note（同一天只 bump 第三段）」
#
# 「同一天怎麼做」寫了，「**跨天怎麼做**」沒寫。於是照著寫下來的那一半做，
# 45 次全部合規 —— 每一次單獨看都對，而合起來是錯的。
#
# ⛔ 所以補散文治不了它。CLAUDE.md 自己在部署協定那一段逐字寫過同一句話：
#
#     「散文治不了『憑記憶重新推導一個五步序列』，
#       **只有把它變成一支會自己驗證的程式才可以**」
#
# 這支腳本就是那個程式。它是 `git tag` 的**唯一入口**。
#
# ═══════════════════════════════════════════════════════════════════════════
# 規則（就這兩條）
# ═══════════════════════════════════════════════════════════════════════════
#
#   最後一個 tag 的日期 == 今天  →  只准 patch+1        （v0.10.3 → v0.10.4）
#   最後一個 tag 的日期 != 今天  →  只准 minor+1、patch 歸 0（v0.10.4 → v0.11.0）
#
# ⚠️ 「最後一個 tag 的日期」讀的是 **tag 自己的 creatordate**，不是 commit date。
# 一個今天補打在三天前 commit 上的 tag，算今天 —— 因為規則管的是「你今天發了版」，
# 不是「那份程式碼是哪天寫的」。
#
# ═══════════════════════════════════════════════════════════════════════════
# 用法
# ═══════════════════════════════════════════════════════════════════════════
#
#   bash scripts/release.sh --next            # 只印出應該是哪一號（不動任何東西）
#   bash scripts/release.sh --check v0.11.0   # 驗一個號對不對，錯就回非零
#   bash scripts/release.sh --tag  "說明文字"  # 算好、打 tag、印出下一步
#
# ⛔ 不要再手打 `git tag -a v0.x.y`。那正是壞掉 10 天的那條路。
#
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
用法:
  scripts/release.sh --next               印出今天應該用的版號
  scripts/release.sh --check <版號>        驗證一個版號，錯了回非零
  scripts/release.sh --tag <說明>          算好版號並打上 annotated tag
USAGE
  exit 2
}

# ── 讀最後一個 tag 與它的日期 ───────────────────────────────────────────────
# ⚠️ 用 creatordate 排序而不是 `git describe`：describe 走的是 commit 祖先，
# 而我們要的是「時間上最後發的那一版」。分支上補 tag 時兩者會分岔。
latest_line="$(git for-each-ref --sort=-creatordate --count=1 \
  --format='%(creatordate:short)|%(refname:short)' 'refs/tags/v*' || true)"

if [[ -z "$latest_line" ]]; then
  # 空 repo / 第一次發版。⚠️ 不 fail —— fail 會讓一個全新的 clone 打不出第一個
  # tag，而那個錯誤訊息會指向完全不相干的地方。
  LATEST_TAG=""
  LATEST_DATE=""
  NEXT="v0.1.0"
else
  LATEST_DATE="${latest_line%%|*}"
  LATEST_TAG="${latest_line##*|}"

  if [[ ! "$LATEST_TAG" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "✗ 最後一個 tag 不是 vX.Y.Z 的形狀: $LATEST_TAG" >&2
    echo "  這支腳本只認得三段式版號。手動處理之後再跑一次。" >&2
    exit 1
  fi
  MAJOR="${BASH_REMATCH[1]}"
  MINOR="${BASH_REMATCH[2]}"
  PATCH="${BASH_REMATCH[3]}"

  TODAY="$(date +%F)"
  if [[ "$LATEST_DATE" == "$TODAY" ]]; then
    NEXT="v${MAJOR}.${MINOR}.$((PATCH + 1))"
    REASON="同一天（${TODAY}）→ 只 bump 第三段"
  else
    NEXT="v${MAJOR}.$((MINOR + 1)).0"
    REASON="上一版是 ${LATEST_DATE}、今天是 ${TODAY} → 跨天，bump 次版號並把第三段歸 0"
  fi
fi

case "${1:-}" in
  --next)
    echo "$NEXT"
    ;;

  --check)
    [[ $# -ge 2 ]] || usage
    want="$2"
    if [[ "$want" != "$NEXT" ]]; then
      cat >&2 <<EOF
✗ 版號不對。
    你想打:   $want
    應該是:   $NEXT
    理由:     ${REASON:-第一個 tag}
    上一版:   ${LATEST_TAG:-（沒有）}  (${LATEST_DATE:-—})

⚠️ owner 的規則是「每天一個次版號」。這條規則在 2026-07-27 → 08-05 之間
   被破壞了 10 天（v0.9 打了 45 個 patch 卻從來沒翻頁），因為 CLAUDE.md
   只記了「同一天只 bump 第三段」而沒記跨天那一半。
   這支腳本就是為了讓那件事在結構上不可能再發生。
EOF
      exit 1
    fi
    echo "✓ $want"
    ;;

  --tag)
    [[ $# -ge 2 ]] || usage
    msg="$2"
    if git rev-parse -q --verify "refs/tags/$NEXT" >/dev/null; then
      echo "✗ $NEXT 已經存在了。" >&2
      exit 1
    fi
    git tag -a "$NEXT" -m "$NEXT —— $msg"
    echo "✓ 打好了 $NEXT"
    echo "  理由: ${REASON:-第一個 tag}"
    echo
    echo "下一步:"
    echo "  git push origin main --follow-tags"
    echo "  gh release create $NEXT --title ... --notes ...   # 每一次 push 都要帶 release note"
    ;;

  *)
    usage
    ;;
esac

#!/usr/bin/env bash
# 🚢 **push + note + discord + deploy** —— owner 2026-08-30 給這四步的名字。
#
#   bash scripts/ship-it.sh "<這一版的一句話說明>"
#   bash scripts/ship-it.sh "<說明>" --no-deploy      # 只到 discord
#
# ⭐ 為什麼是一個指令：這四步在此之前是**四段要記得的手打**，
# ⚠️ 而 2026-08-29/30 這一天它們就漏過三次（note 忘了發、discord 沒設 webhook 就靜默跳過、
#   deploy 因為 agent 空了而失敗卻被讀成「連不到」）。⭐ 一個指令 ⇒ 缺一步就看得見。
set -uo pipefail
cd "$(dirname "$0")/.."

MSG="${1:?用法: bash scripts/ship-it.sh \"<這一版的一句話說明>\" [--no-deploy]}"
DEPLOY=1; [ "${2:-}" = "--no-deploy" ] && DEPLOY=0

# ⭐ webhook 住 docker/.env（⛔ 不進 git）—— 這裡載它，⛔ 不讓呼叫端記得 `set -a`
[ -f docker/.env ] && { set -a; . docker/.env; set +a; }

step() { printf '\n\033[1m══ %s\033[0m\n' "$*"; }
FAIL=""

step "1/4  版號 ＋ push"
if bash scripts/release.sh --tag "$MSG"; then
  TAG=$(git describe --tags --abbrev=0)
  git push -q origin main --follow-tags && echo "✓ 已推 $TAG" || FAIL="${FAIL}push "
else
  echo "⛔ 打 tag 失敗"; exit 1
fi

step "2/4  GitHub release note"
# ⚠️ ⭐ note 的**內容**是人寫的（守則、突變、誠實的界線）⇒ 這裡只確保它**存在**，
#   ⛔ 不自動編一份（自動編出來的 note 是「一份很貴的摘要」）。
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "✓ $TAG 已有 release note"
else
  echo "⚠️ $TAG **還沒有 release note** —— ⛔ 這一步不能自動生（內容要人寫）"
  # ⭐⭐ **但可以把草稿生好** —— 2026-08-30 owner 揪到 **v0.32.0–v0.32.5 六個 tag 一個 note 都沒有**。
  #   ⚠️ ⭐ 而根因**不是這支腳本沒說** —— 它每一次都印了上面那一行並記了 FAIL。
  #     ⛔ 沒有處理它的是人。⇒ 這裡把「做對」的成本壓到最低：草稿寫好，只差把理由填進去。
  _PREV=$(git tag -l "v*" --sort=-creatordate | grep -v "^${TAG}$" | head -1)
  _DRAFT="/private/tmp/release-note-${TAG}.md"
  {
    printf '## %s\n\n' "$TAG"
    printf '⚠️ ⭐ 這是**從 commit 生成的草稿** —— ⛔ 直接發出去等於一份很貴的摘要。\n'
    printf '   ⭐ 要填的是**為什麼**：哪一條守則、量到什麼、突變驗過沒有、誠實的界線在哪。\n\n'
    printf '### %s → %s（%s 個 commit）\n\n' "${_PREV:-起點}" "$TAG" \
      "$(git rev-list --count "${_PREV:+${_PREV}..}${TAG}" 2>/dev/null)"
    git log --format='- %s' "${_PREV:+${_PREV}..}${TAG}" 2>/dev/null | head -40
  } > "$_DRAFT"
  echo "   ⭐ 草稿已生成：$_DRAFT（$(git rev-list --count "${_PREV:+${_PREV}..}${TAG}" 2>/dev/null) 個 commit）"
  echo "   ⇒ 填完理由再跑：gh release create $TAG --title … --notes-file $_DRAFT"
  echo "   ⛔ 而**零個 commit** 的 tag 不該存在 —— 那種版號答不出「這一版做了什麼」"
  FAIL="${FAIL}note "
fi

step "3/4  玩家 Discord 公告"
if [ -z "${GGD_DISCORD_WEBHOOK:-}" ]; then
  echo "⚠️ 沒設 GGD_DISCORD_WEBHOOK ⇒ **沒發**（⛔ 這不是「沒有玩家可見的改動」）"
  FAIL="${FAIL}discord "
elif bash scripts/release-note-players.sh --post; then
  :
else
  echo "⚠️ 玩家公告沒發出去（見上）"
  FAIL="${FAIL}discord "
fi

step "4/4  部署"
if [ "$DEPLOY" -eq 0 ]; then
  echo "ℹ️ --no-deploy ⇒ 跳過"
else
  # ⭐ agent 空的時候 deploy 會回一句**誤導人的** GitHub 權限錯誤（CLAUDE.md 記過）
  #   ⇒ 先把鑰匙圈裡的載回來，⛔ 不要讓下一個人再診斷一次
  ssh-add -l >/dev/null 2>&1 || ssh-add --apple-load-keychain >/dev/null 2>&1
  ssh-add -l 2>/dev/null | grep -q id_rsa || ssh-add ~/.ssh/id_rsa >/dev/null 2>&1
  if GGD_PUBLIC_HOST="${GGD_PUBLIC_HOST:-ggd.adms.ai}" \
     GGD_SITE_HOSTS="${GGD_SITE_HOSTS:-ggd.adms.ai test.adms.ai}" \
     GGD_MINI_USER="${GGD_MINI_USER:-genieacceler}" \
     GGD_MINI_HOST="${GGD_MINI_HOST:-192.168.0.133}" \
     bash scripts/mini-deploy.sh deploy; then
    :
  else
    echo "⚠️ 部署失敗（要 VPN／區網才連得到 mini）"
    FAIL="${FAIL}deploy "
  fi
fi

echo
if [ -z "$FAIL" ]; then
  echo "🚢 push + note + discord + deploy —— 四步全過（$TAG）"
else
  # ⚠️ ⭐ fail-loud：漏掉哪一步要**說出來**，⛔ 靜默跳過與全過長得一樣
  echo "⚠️ 這幾步**沒過**：$FAIL"
  echo "   ⛔ 它們不會自己補 —— 逐步修完再跑一次（前面過了的步驟是冪等的）"
  exit 1
fi

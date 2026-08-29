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
  echo "   ⇒ gh release create $TAG --title … --notes-file <檔>"
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

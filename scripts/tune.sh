#!/usr/bin/env bash
# ⚖️ **純數值調整的 T0 路** —— owner 2026-08-23：「這一版之後你的純數值調整
#    我一律走 T0 => **寫成 script 吧**」
#
# ── ⭐ T0 是什麼 ────────────────────────────────────────────────────────────
# `content/` 是線上的 **live bind-mount**：改 `content/config/*.json` 之後
#   · 伺服器側：`combat-env` 走 content-bus、`base-bonus` 開場前 5 秒 TTL 重讀
#     ⇒ **下一場就生效，⛔ 不必重建映像、⛔ 更不必重啟（那會踢人）**
#   · 客戶端側：玩家重新整理分頁就拿到
#
# ⇒ 一次純數值調整的成本應該是 **20 秒**，⛔ 不是 5 分鐘的四閘 + 3 分鐘的遠端 build。
#
# ── ⛔⛔ 三道 fail-closed，任何一道不過就**拒絕走 T0** ──────────────────────
#  ① 改動**只能**碰 `content/config/*.json`（＋ `content/` 的產物）。
#     碰到一行程式、一格 schema ⇒ ⛔ 出去跑 `pnpm ship`（全量）。
#     ⚠️ 這一道是 2026-08-02 那次事故的閘：那天 content 與 schema 都動了，
#        而**只有 content 被送上去** ⇒ 舊映像的 Zod 不認得新欄位
#        ⇒ 內容驗證整份失敗 ⇒ 退回 2 隻骨架英雄，⭐ 而網站看起來完全正常。
#  ② `content:build` 的**嚴格 Zod 驗證**要過（界外的值在這裡就被擋）。
#  ③ 動到 owner 的系統倍率那一族 ⇒ `ownerKnobs.test.ts` 要綠
#     （每一格都要引用得到他的一句原話）。
#
# ── ⭐ T0.5（2026-08-23 加）：技能/道具側的內容 JSON ────────────────────────
# owner 逐字：「**改暈眩只要改共享的 JSON 就好，哪裡來那麼多毛病**，
#              又不是增加新技能效果或標籤」
# ⇒ `content/{abilities,items,champions,vfx,models,ability-templates}/*.json` 也放行，
#   但閘子集**升一級**（⛔ 只裁「跑不跑」，⛔ 不改任何一支閘的判準）：
#     · content:build 嚴格 Zod（跟 T0 一樣）
#     · skillnorm:check + prose:check（卡面↔JSON 一致 —— 石化之眼那次抓到真謊話，⛔ 不可省）
#     · abilityMirror + abilityCodeParityForms 兩支**單檔** vitest（鏡像/編號對位）
#     · 動到 damage/cooldown 級距欄位 ⇒ 再加 anchors:check + echoloop:check
#   ⛔ 仍然不跑 typecheck／七包 vitest —— 一行程式都沒動。
#   ⛔ 三道 fail-closed 原封不動；混到任何程式/schema 路徑 ⇒ 照樣拒絕走全量。
#
# 用法：
#   bash scripts/tune.sh                       # 看這次改動能不能走 T0 / T0.5
#   bash scripts/tune.sh --deploy "說明"        # 驗過就直接上（--content-only）
# ⚠️ ⛔ 不設 `-u`:bash 3.2 對空陣列的 `${arr[@]}` 會當成 unbound。
set -o pipefail
cd "$(dirname "$0")/.."
TMPD="${TMPDIR:-/tmp}"; TMPD="${TMPD%/}"   # ⛔ GH#1003：⛔ 不寫死 macOS 專屬的 /private 實體路徑（Linux 上建不出來 ⇒ 重導靜默失敗）

BOLD=$'\033[1m'; GRN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'; OFF=$'\033[0m'
say() { printf '%s\n' "${BOLD}→ $*${OFF}"; }
ok()  { printf '%s\n' "${GRN}  ✓ $*${OFF}"; }
bad() { printf '%s\n' "${RED}  ✗ $*${OFF}"; }
warn(){ printf '%s\n' "${YEL}  ⚠ $*${OFF}"; }
die() { printf '\n%s\n' "${RED}⛔ $*${OFF}"; exit 1; }

DEPLOY=0; NOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --deploy) DEPLOY=1; NOTE="${2:-}"; shift 2 || shift ;;
    *) shift ;;
  esac
done

# ── ① 改動的路徑集合 ───────────────────────────────────────────────────────
# ⚠️ `core.quotepath=false` 是必要的:預設 git 把 CJK 路徑印成 C 風格跳脫,
#    對不到任何規則 ⇒ 每一次都會 fail-closed 成全量（GH#621 量到的）。
# ⚠️ ⛔ 不用 `mapfile` —— macOS 出貨的是 bash 3.2，它沒有那個內建（實測 command not found）。
PATHS=()
while IFS= read -r line; do
  [ -n "$line" ] && PATHS+=("$line")
done < <(
  git -c core.quotepath=false diff --name-only HEAD
  git -c core.quotepath=false ls-files --others --exclude-standard
)
[ "${#PATHS[@]}" -gt 0 ] || die "工作區沒有任何改動 —— 沒有東西要上。"

say "改動 ${#PATHS[@]} 個路徑"

# ⭐ 允許的落點：設定檔（T0）、技能/道具側內容（T0.5）、與它們的產物。⛔ 其餘一律出局。
CONFIG_TOUCHED=0
T05_PATHS=()
OUTSIDE=()
for p in "${PATHS[@]}"; do
  case "$p" in
    content/bundle.json|content/manifest.json|content/*/_index.json) ;;   # content:build 的產物
    content/editor-target-profile.json) ;;                                # 同上(外部編輯器契約,帶 digest)
    content/config/*.json) CONFIG_TOUCHED=1 ;;
    content/abilities/*.json|content/items/*.json|content/champions/*.json|content/vfx/*.json|content/models/*.json|content/ability-templates/*.json)
      T05_PATHS+=("$p") ;;                                                # ⭐ T0.5:技能/道具側
    docs/技能標記機制與效果規則.md|docs/固有能力及寶具總覽.md) ;;             # content:build 的產物(spec/overview)
    docs/editor-contract/ggd-skill-tiers.md|docs/editor-contract/ggd-ability-prose.json) ;; # 同上(tiers/prose)
    docs/_daily/*|docs/_release/*|docs/_reports/*) ;;                     # 帳本/報告,不進映像
    *) OUTSIDE+=("$p") ;;
  esac
done

if [ "${#OUTSIDE[@]}" -gt 0 ]; then
  bad "這些改動**不是**純內容調整：" >&2
  printf '     %s\n' "${OUTSIDE[@]}" >&2
  die "⇒ T0/T0.5 走不了。跑 ${BOLD}pnpm ship${OFF}${RED}（全量：程式／schema／映像一起）。
   ⭐ 這一道刻意 fail-closed —— 2026-08-02 那次就是 content 與 schema 都動了
      而只有 content 被送上去 ⇒ 舊映像的 Zod 不認得新欄位 ⇒ 退回骨架英雄，
      ⛔ 而網站看起來完全正常。"
fi
if [ "${#T05_PATHS[@]}" -gt 0 ]; then
  ok "T0.5：含 ${#T05_PATHS[@]} 個技能/道具側 JSON（閘子集升一級）"
else
  ok "改動全部落在 content/config/ 與它的產物裡"
fi

# ── ② 嚴格 Zod（content:build 自己會擋界外值）────────────────────────────
say "content:build（嚴格 Zod 驗證 → 重建索引與 bundle）"
if pnpm -s content:build > "$TMPD/tune-build.log" 2>&1; then
  ok "內容驗證通過，產物已重建"
else
  tail -20 "$TMPD/tune-build.log" >&2
  die "內容驗證失敗 —— ⛔ 界外的值在這裡就該被擋下來，⛔ 不要放它上線。"
fi

# ── ③ owner 的系統倍率那一族 ───────────────────────────────────────────────
if printf '%s\n' "${PATHS[@]}" | grep -qE 'content/config/(combat-env|owner-knobs|base-bonus)\.json'; then
  say "動到 owner 的旋鈕 ⇒ 驗授權表"
  if npx vitest run --root packages/shared src/ops/ownerKnobs.test.ts > "$TMPD/tune-knobs.log" 2>&1; then
    ok "每一格都引用得到 owner 的一句原話"
  else
    grep -E "→ |AssertionError" "$TMPD/tune-knobs.log" | head -6 >&2
    die "owner-knobs 對不上 —— ⛔ 引用不到他原話的格子不可以改（第一守則）。"
  fi
fi

# ⭐ T0.5 的平衡閘是**條件式**的：anchors/echoloop 驗的是 damage/cooldown 級距的
#    推導鏈 —— 沒動到那兩族欄位就不必跑（⛔ 只裁跑不跑，兩支閘的判準一個字都沒動）。
#    純 T0（config）維持四支全跑：系統倍率/公式正是它們要抓的。
tier_fields_touched() {
  [ "${#T05_PATHS[@]}" -gt 0 ] || return 1
  git -c core.quotepath=false diff HEAD -- "${T05_PATHS[@]}" 2>/dev/null \
    | grep -qE '"(damageTier|cooldownTier)"' && return 0
  local f
  for f in "${T05_PATHS[@]}"; do
    git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 && continue  # 已追蹤 ⇒ 上面的 diff 已涵蓋
    [ -f "$f" ] && grep -qE '"(damageTier|cooldownTier)"' "$f" && return 0
  done
  return 1
}

# ⭐ 內容相關的閘（⛔ 不是全部 36 支）：只有真的會因為這次改動而過期的那幾支。
GATES=(skillnorm:check prose:check)
if [ "${#T05_PATHS[@]}" -eq 0 ] || [ "$CONFIG_TOUCHED" -eq 1 ] || tier_fields_touched; then
  GATES+=(anchors:check echoloop:check)
else
  warn "T0.5 沒動到 damage/cooldown 級距欄位 ⇒ 跳過 anchors:check + echoloop:check"
fi
say "內容側的閘（⛔ 不跑 typecheck／七包 vitest —— 一行程式都沒動）：${GATES[*]}"
FAILED=()
for g in "${GATES[@]}"; do
  if pnpm -s "$g" > "$TMPD/tune-$( echo "$g" | tr ':' '_' ).log" 2>&1; then
    ok "$g"
  else
    bad "$g → $TMPD/tune-$( echo "$g" | tr ':' '_' ).log"
    FAILED+=("$g")
  fi
done

# ⭐ T0.5 加的一級：鏡像與編號對位（兩支**單檔**，一次 vitest 啟動）。
#    石化之眼那次教訓：卡面說一套、JSON 做一套 —— 這兩支就是抓這種謊話的。
if [ "${#T05_PATHS[@]}" -gt 0 ]; then
  say "T0.5 一致性閘（abilityMirror + abilityCodeParityForms —— 單檔 vitest）"
  if npx vitest run --root packages/shared \
      src/content/abilityMirror.test.ts src/content/abilityCodeParityForms.test.ts \
      > "$TMPD/tune-t05-vitest.log" 2>&1; then
    ok "abilityMirror + abilityCodeParityForms"
  else
    bad "abilityMirror/abilityCodeParityForms → $TMPD/tune-t05-vitest.log"
    FAILED+=("t05-vitest")
  fi
fi
[ "${#FAILED[@]}" -eq 0 ] || die "${#FAILED[@]} 支內容閘紅了 —— ⛔ 一次列完了，逐支修完再跑。"

printf '\n%s\n' "${GRN}${BOLD}✅ T0 可行 —— 這一次改動不需要重建映像。${OFF}"
printf '   %s\n' "省下：typecheck ~130s · vitest 七包 ~237s · 遠端 build ~191s ≈ ${BOLD}9 分鐘${OFF}"

if [ "$DEPLOY" -eq 0 ]; then
  printf '\n   真的要上：%s\n' "${BOLD}bash scripts/tune.sh --deploy \"說明\"${OFF}"
  exit 0
fi

[ -n "$NOTE" ] || die "--deploy 要帶一句說明（它會進 commit 訊息）。"

say "commit（⛔ 逐檔 pathspec —— index 是全 repo 共用的）"
TIER=T0; [ "${#T05_PATHS[@]}" -gt 0 ] && TIER=T0.5
printf 'chore(tune): %s\n\n⭐ 純內容調整,走 %s（`scripts/tune.sh`）—— ⛔ 沒有重建映像。\n三道 fail-closed 全過:只碰 content 白名單 · 嚴格 Zod · owner 授權表。\n' \
  "$NOTE" "$TIER" > "$TMPD/tune-msg.txt"
git commit -F "$TMPD/tune-msg.txt" -- \
  content/config content/abilities content/items content/champions content/vfx content/models content/ability-templates \
  content/bundle.json content/manifest.json content/*/_index.json content/editor-target-profile.json \
  docs/技能標記機制與效果規則.md docs/固有能力及寶具總覽.md \
  docs/editor-contract/ggd-skill-tiers.md docs/editor-contract/ggd-ability-prose.json \
  || die "commit 失敗（多半是沒有東西變 —— 產物已經是最新的？）"
git push origin HEAD || die "push 失敗"
ok "已推上去"

say "部署（--content-only：⛔ 不重建映像，只重啟 game shard 讓它重讀）"
ssh -A can@34.81.104.163 'cd /home/can/GGD && bash scripts/host-deploy.sh --content-only' \
  > "$TMPD/tune-deploy.log" 2>&1
RC=$?
tail -14 "$TMPD/tune-deploy.log"
[ "$RC" -eq 0 ] || die "部署回非零 —— 讀 $TMPD/tune-deploy.log。回滾：bash scripts/host-deploy.sh --rollback"
printf '\n%s\n' "${GRN}${BOLD}✅ 上線了。${OFF}⚠️ 玩家要重新整理分頁才拿得到客戶端那一半。"

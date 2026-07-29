# #285 · v0.9.9 稽核未驗完的 17 個發現 —— 逐條重驗

> **這份文件的存在理由**：`wf_120e290a-425`（v0.9.9 部署前稽核）產出 **27 個發現**、
> 需要 **54 個 verdict**，只跑完 **21 個**就撞到月額度，**33 個 verifier 全掛**。
> 結果是 **3 個雙重確認**、**2 個雙重駁倒**、**5 個只拿到一票**或更少——
> 合計 **17 個發現從來沒有人驗證過**。它們既不是 bug 也不是誤報，是**未知**。
>
> 本輪逐條親自復現。**基準 = main `658eb191`（HEAD）**。
>
> ⚠️ **量測時工作樹是髒的**（四條並行工作流）。所有平衡數字一律用
> `git show HEAD:content/...` 的**已提交值**（`maxHealth ×4.0`、`基礎加成 +300`）計算，
> 不是工作樹當下的值（量測期間另一條工作流把它們改成 `×6.0` / `+650`）。

---

## 資料來源（可複現）

原始 27 個發現不在任何 docs 裡，只在 workflow run 的 JSON 與 subagent 記錄中。
取回方式：

```bash
# 27 個發現的完整內容（title/file/line/severity/claim/failure/evidence）
python3 - <<'EOF'
import json,glob
base='~/.claude/projects/-Users-Takuro-GGD/1fc1e42e-e26b-4bec-88ef-ca25238c0f4c/subagents/workflows/wf_120e290a-425/'
# 五個 lens agent 的 StructuredOutput tool_use → input.findings
EOF
# 27 findings / 3 confirmed / 24 refuted-list
# 24 筆裡只有 5 筆有 verdict 文字（2+2+2+2+2+1 = 15 條），confirmed 那 3 筆各 2 條 = 6
# 15 + 6 = 21 verdicts，54 − 21 = 33 個 verifier 死於額度。
```

`refuted` 陣列裡 **`why` 長度 < 2** 的那 17 筆，就是本文的 17 個發現。
中間產物：`/private/tmp/v099_findings.json`、`/private/tmp/v099_unverified.json`。

---

## 裁決總表

| # | 發現 | 裁決 | 修在哪 |
|---|---|---|---|
| 1 | 商店屬性面板不吃基礎加成（`statPreview.ts:107`） | ✅ **真 · 已修**（⚠️ 修補**無守衛**） | `1c777d7f` |
| 2 | `setPreset` 漏傳 `touch`，手機 fpsCap 被推回 60 | ✅ **真 · 已修**（有出貨路徑守衛） | `1c777d7f` |
| 3 | 後台頁宣稱「下一場生效」，實際要重啟 shard | ✅ **真 · 已修** | `dc3c12ad`（#278） |
| 4 | 瞄準優先只在站著不動時成立（走+瞄偏 28.3°） | ✅ **真 · 已修** | `1c777d7f` |
| 5 | 兩支 `zz_scratch_*.test.ts` 被提交進 v0.9.9 | ✅ **真 · 已清**（⚠️ script prompt 未修） | `1c777d7f` |
| 6 | 客戶端沒有「壞 overlay 退回出貨樹」保險 | ✅ **真 · 已修** | `a4103ee5` |
| 7 | overlay 寫入路徑全程沒有 Zod 驗證 | ✅ **真 · 已修** | `dc3c12ad`（#283） |
| 8 | 後台頁把「沒讀到文件」壓成「讀到空文件」 | ✅ **真 · 已修** | `1c777d7f` |
| 9 | 「清除」語意 = 設成 0，旁邊卻寫「出貨預設 300」 | ✅ **真 · 已修** | `dc3c12ad`（#279） |
| 10 | 同 #3（content-bus 不認 `content-overlay`） | ✅ **真 · 已修** | `dc3c12ad` |
| 11 | 基礎加成 schema 沒有任何範圍守衛 | ✅ **真 · 已修**（實測拒絕） | `dc3c12ad`（#277） |
| 12 | 負值讓全英雄一開場就死 | ✅ **真 · 已修**（實測拒絕） | `dc3c12ad`（#277） |
| 13 | TTK 文件沒同步 + 出貨血量只有校準目標的 ~22% | ⚠️ **部分真 · 仍活著** | — |
| 14 | 同 #3（`MatchController` boot-time 取值） | ✅ **真 · 已修** | `dc3c12ad` |
| 15 | %-血量系統縮水 23%、固定傷害相對變強三成 | ⚠️ **當時真 · 現在幾乎歸零** | owner ×3.0→×4.0 |
| 16 | 傳說·萬象強化少掉 1140–1950 血 | ⚠️ **真 · 仍活著且變大**（→ 1620–2700） | — |
| 17 | `autoAttackCensus` 的債務清單被血量綁住 | ⚠️ **真 · 仍成立**（已在檔內記錄，note 級） | — |

**12 真已修 / 3 真仍活 / 2 部分真（量級已被後續改動改寫） / 0 誤報。**

> 沒有任何一條是誤報。原稽核 5 個 lens 的抓取品質很高——**問題只在驗證階段死於額度**。
> 反過來說：這 17 條裡有 **12 條在額度掛掉的當天到隔天就被人獨立復現並修掉了**
> （`1c777d7f` 修 4 條、`a4103ee5` 修 1 條、`dc3c12ad` 修 7 條），
> 也就是「重跑 verifier」這件事本身的邊際價值主要落在**剩下的 5 條**。

---

## 逐條證據

### 1. 商店屬性面板不吃基礎加成 —— ✅ 真，已修，**但修補沒有守衛**

**原主張**：`statPreview.buildWorld()` 只設 `world.combatEnv`，沒設 `world.baseBonus`，
`ChampionStatContext` 也沒有這個欄位 → 面板永遠用 `DEFAULT_BASE_BONUS`。

**現況**（已修）：

```
apps/client/src/ui/panels/statPreview.ts:103  baseBonus?: BaseBonusTable;
apps/client/src/ui/panels/statPreview.ts:129  world.baseBonus = ctx.baseBonus ?? DEFAULT_BASE_BONUS;
apps/client/src/ui/panels/statPreview.ts:358  statContextFromSeat(seat, env?, baseBonus?, statCaps?)
apps/client/src/ui/panels/MerchantShop.tsx:625  const baseBonus = useDisplayBaseBonus();
apps/client/src/ui/panels/MerchantShop.tsx:661  statContextFromSeat(seat, env, baseBonus, statCaps)
```

線是接上了。**但這個修補可以被整行刪掉而測試全綠**（失敗形態 ③）：

1. `packages/shared/src/sim/SimWorld.ts:480` 的欄位預設就是
   `baseBonus: BaseBonusTable = DEFAULT_BASE_BONUS`
   —— 所以 `ctx.baseBonus` 是預設值時，`:129` 那一行**是 no-op**。
2. 全 client 只有三個測試檔提到 `baseBonus`，**沒有一個走 statPreview**：

```bash
$ for f in $(grep -rl "baseBonus" apps/client/src | grep test); do echo "$f"; done
apps/client/src/ui/championSheetFinal.test.ts   # championSheet，不是 statPreview
apps/client/src/ui/statCapsDisplay.test.ts      # :57 championSheetRows(...)，不是 statPreview
apps/client/src/net/statCapsWire.test.ts        # 協定
```

3. **對照組證明這個守衛是做得出來的**：同一個 context 的兄弟欄位 `statCaps`（GH#286，
   後來才加）**有**守衛 ——
   `apps/client/src/ui/statCapsDisplay.test.ts:115-117` 用
   `statCaps: normalizeStatCaps({ as: { base: 7, unlocked: 12 } })` 餵進真的
   `computeStatBlock`。`baseBonus` 沒有等價的一條。

> **這是本輪唯一的新缺口。** 缺陷本體修好了，但「改壞會紅」不成立
> —— 一次重構把 `:129` 刪掉，商店屬性面板會在操作者調整「攻擊力 +50」之後
> 少報 50，而 4,091 條 client 測試不會有一條變紅。

---

### 2. `setPreset` 漏傳 `touch` —— ✅ 真，已修，**守衛合格**

```
apps/client/src/settings/SettingsStore.ts:132(舊)  applyPreset(this.settings.graphics, preset)   ← 漏第三參數
apps/client/src/settings/SettingsStore.ts(現在)     applyPreset(this.settings.graphics, preset, this.touch)
```

守衛走**出貨路徑**（不是純函式）：
`apps/client/src/settings/fpsPlatform.test.ts:113`
「⭐ setPreset 也要帶平台 —— 手機點一下畫質預設不得把 fps 推回 60」，
:121 呼叫 `store.setPreset(preset)`，:126 有桌機對照組。這條符合第二守則。

（此條與 confirmed 名單裡的同一缺陷重複——原稽核的 `correctness` 與
`failure-shapes` 兩個 lens 各自獨立抓到，前者拿到雙重確認，後者的 verifier 死了。）

---

### 3 / 10 / 14. 「下一場生效」是謊 —— ✅ 真，已修

三條講同一件事，由三個不同 lens 提出。修補是**新增一整個模組**：

```
apps/game-server/src/config/baseBonus.ts       ← 新檔（#278），TTL 快取，與 combat-env 同形
apps/game-server/src/rooms/MatchRoom.ts:366-369  await sharedBaseBonusCache().get()
apps/game-server/src/match/MatchController.ts:526  baseBonus 改走**建構子參數**，不在這裡讀 Configs
```

```bash
$ pnpm --filter @ggd/game-server exec vitest run src/config/baseBonusResolve.test.ts
 ✓ src/config/baseBonusResolve.test.ts (10 tests) 48ms
```

其中一條測試名就是「平臺覆蓋層改了 → 下一場比賽用的是新值，不需要重啟遊戲伺服器」。
fail-safe 也覆蓋（平台不可達 / 非 200 / 垃圾 body → 退回內容預設，不會清成 0）。

⚠️ 註記：`MatchController.ts:533-540` 明說 **`mobWaves` 還是 boot-time**
（「#278 只替 baseBonus 做了 TTL 快取；這一份還沒有」）—— 同一個形狀的下一顆地雷。

---

### 4. 瞄準優先只在站著不動時成立 —— ✅ 真，已修

`MovementSystem.ts` 現在是三段式擁有權，`aimedThisTick` 直接短路整段：

```
packages/shared/src/sim/systems/MovementSystem.ts:222-225
  // 1) 玩家正在瞄 → orderSystem 已經寫好了,一個字都不要動
  // 2) 出手鎖 → 朝著 commit 的方向,腳照走
  // 3) 其餘 → 朝著移動方向
  if (!aimedThisTick) { if (lockDir) t.facing = {...lockDir}; else t.facing = turnToward(t.facing, dir); }
```

```bash
$ pnpm --filter @ggd/shared exec vitest run src/sim/aimPriority.test.ts
 ✓ src/sim/aimPriority.test.ts (8 tests) 19ms
```

`1c777d7f` 的 commit 訊息記錄了突變驗證（「突變回第一版 → 2 紅」），
並新增「⭐ 一邊走一邊瞄」+ 對照組（三個候選方向兩兩不同才有鑑別力）。

---

### 5. scratch 測試檔被提交 —— ✅ 真，已清；**但流程沒修**

```bash
$ ls packages/shared/src/sim/zz_scratch_aim.test.ts apps/client/src/settings/zz_scratch_fps.test.ts
ls: ... No such file or directory        （兩支都不在了）
$ git log --oneline --diff-filter=D -3 -- packages/shared/src/sim/zz_scratch_aim.test.ts
1c777d7f fix(v0.9.9): 部署前稽核抓到的 4 個缺陷 + 移除誤入的 scratch 檔
```

⚠️ **根因沒修。** `ggd-v099-predeploy-audit-wf_120e290a-425.js` 的 `RULES` 已經寫了
「不得在 repo 內建立任何檔案」，agent 還是照寫。任務 #285 自己也點名要補強這段 prompt
——**本輪沒有做**（本工作流唯讀，只能新增 docs）。

---

### 6. 壞 overlay 把客戶端打成骨架 —— ✅ 真，已修

`apps/client/src/content/bootContent.ts` 現在有 `attempt(withOverlay)` 雙段式重試，
註解自己寫出這條稽核的診斷：

```
bootContent.ts:158-163
  // ⚠️ A BAD OVERLAY MUST NEVER BRICK THE CLIENT — and before this retry it
  // did, ASYMMETRICALLY: the game-server has had exactly this fallback since
  // #189 … so one bad operator edit would have left the SHARD healthy and
  // dropped every BROWSER to the 2-champion skeleton.
```

修在 `a4103ee5`（稽核**進行中**由另一條 session 落地，所以 verifier 死掉時它已經在修了）。

---

### 7. overlay 寫入沒有 Zod 驗證 —— ✅ 真，已修

原主張的關鍵是「註解宣稱有驗，是假的」。現在**閘真的在寫入路徑上**：

```
apps/admin/src/api.ts:372-373
  const verdict = validateOverlayDoc(collection, id, doc);
  if (!verdict.ok) return Promise.reject(new Error(`拒絕寫入：${verdict.error}`));
apps/admin/src/contentOverlay.ts:429  export function validateOverlayDoc(...)
apps/admin/src/contentOverlay.ts:449    const parsed = spec.schema.safeParse(doc);
```

沒有 schema 的 collection **回 `validated: false` 而不是假裝驗過**
（`contentOverlay.ts:445`）—— 這正是原發現罵的那種謊。

```bash
$ pnpm --filter @ggd/admin exec vitest run src/overlayValidate.test.ts
 ✓ src/overlayValidate.test.ts (9 tests) 13ms
```

---

### 8. 後台頁 `null` 塌陷成 `{}` —— ✅ 真，已修

```
apps/admin/src/ui/BaseBonusPage.tsx:71  setBonusState(full ? extractBonus(full) : null);
```

檔內註解把兩個狀態的差別寫死（`null` → 顯示出貨預設 300；`{}` → 顯示 0），
並標明「是這個呼叫端把分別丟掉的（失敗形狀 ⑤）」。

```bash
$ pnpm --filter @ggd/admin exec vitest run src/baseBonus.test.ts
 ✓ src/baseBonus.test.ts (9 tests) 12ms
```

---

### 9. 「清除」語意誤導 —— ✅ 真，已修

`dc3c12ad`（#279）做了三件事，逐條對上原發現：

| 原發現說的 | 現在 |
|---|---|
| 「清除」讀起來像回到 300，實際是設成 0 | 改名 **「歸零」**（`BaseBonusPage.tsx:209-218`），確認文案寫「歸零後這一列是 0，**不是**出貨預設 {r.shipped}」 |
| 沒有確認 | 兩段確認（`confirmZero` state，`:51`、`:218-228`） |
| 沒接平台既有的 `revertOverlayDoc` | 新增「**還原出貨版**」按鈕（`:109-113` `revertAll()` → `revertOverlayDoc`），page 級二次確認（`:268-282`） |

---

### 11 / 12. 基礎加成零範圍守衛、負值全滅 —— ✅ 真，已修（**執行期實測**）

`packages/shared/src/sim/baseBonus.ts:68` `BASE_BONUS_MIN = 0`、
`:75` `BASE_BONUS_MAX` 逐 stat（有 clamp 的六項 = 自己區間跨度，其餘給有限天花板），
`:99-101` `baseBonusBounds()`；schema 端 `config.ts:1335-1344` 用 `superRefine` 引用同一份界線。

```bash
$ pnpm exec tsx /private/tmp/probe_bb.ts
negative doc parse ok? false Number must be greater than or equal to 0
huge doc parse ok?     false Number must be less than or equal to 20000
300 doc parse ok?      true
bounds maxHealth  [ 0, 20000 ]
bounds attackSpeed[ 0, 3.8 ]
normalize(-9999)  -> {}
normalize(999999) -> {"maxHealth":20000}
```

後台端：每一列顯示「範圍 {min} ~ {max}」（`BaseBonusPage.tsx:192-194`），
無效值時輸入框轉紅 + `aria-invalid`，儲存鈕 `disabled={... || !valid || ...}`（`:200-203`）。

```bash
$ pnpm --filter @ggd/shared exec vitest run src/sim/baseBonusBounds.test.ts
 ✓ src/sim/baseBonusBounds.test.ts (10 tests) 17ms
```

---

### 13. TTK 文件沒同步 + 血量只有校準目標的 ~22% —— ⚠️ **部分真，仍活著**

拆成三個可查證的主張：

**(a) 專案真的有 TTK 校準目標** —— ✅ 成立。
`docs/_ttk-experiment-153.md:7`：「Set `combat-env.json` `multipliers.maxHealth` ≈ `15.7`」，
目標是「平均 ≈180 s、p10 ≥120 s」。

**(b) 兩份 TTK 文件的 Env 同步行沒跟著改** —— ⚠️ **一份修好了、一份還是壞的**：

| 檔案:行 | 文件宣稱 | HEAD 實際 | 判定 |
|---|---|---|---|
| `docs/_ttk-retune.md:27` | `damageDealt=0.5, maxHealth=8, cooldown=0.25` | `1.0 / 4.0 / 0.2` | ❌ **三個值全錯** |
| `docs/_ttk-experiment-153.md:29` | `current shipped maxHealth = 4` | `4.0` | ✅ 巧合對上（owner 在 v0.9.13 把 3.0 改回 4.0） |

**(c) 「~22%」** —— 當時對，現在是 **28.9%**。用真的 `finalizeStat` + 真的內容重算
（`/private/tmp/probe_hp3.ts`，HEAD 內容：`maxHealth ×4.0`、`strToMaxHealth 23`、加成 `+300`）：

```
lv1 : 中位 base 564 → 出貨 2556 | TTK#153 目標(base×15.7) 8855 → 出貨/目標 28.9%
lv6 : 中位 base 771 → 出貨 3384 | 目標 12105 → 28.0%
lv12: 中位 base 1019 → 出貨 4378 | 目標 16005 → 27.4%
lv18: 中位 base 1268 → 出貨 5371 | 目標 19904 → 27.0%
```

> 交叉驗證：把倍率換回 v0.9.9 的 ×3.0 得 `564×3+300 = 1992`，
> 與 `docs/_execution-batches-history-20260727.md` 記載的「中位血量 1992」**逐位元吻合**。
> 也就是我的算法與專案自己量到的數字同源，1992/8855 = **22.5%** —— 原發現的「22%」是對的。

**仍活著的部分**：`docs/_ttk-retune.md:27` 的三個值。**S**，純 docs。
（血量本身 owner 已於 `76c1f6c1` 裁決「不用改，我是故意的」，不要再回頭動。）

---

### 15. %-血量系統縮水 23% —— ⚠️ 當時真，**現在幾乎歸零**

機制描述完全成立（都在 `content/config/arena-rules.json`）：

```
.reviveCircles.reviveHpPctMax = 0.5     ← 按最大血比例
.flowers.healPctMax           = 0.18    ← 按最大血比例
.guardianTower.maxHitPctMaxHp = 0.15    ← 按最大血比例
.guardianTower.volleyDamageBase = 108   ← 固定數字
.mobWaves.mob.attackDamage      = 1.2   ← 固定數字
```

但量級被 owner 的後續裁決改寫了：

| 版本 | 中位 lv1 最終血量 | 相對 v0.9.8 |
|---|---|---|
| v0.9.8（300 在 base 內、×3.0） | 2592 | — |
| v0.9.9（300 移出倍率、×3.0） | **1992** | **−23.1%** ← 原發現量到的就是這個 |
| HEAD（300 移出倍率、**×4.0**，owner 2026-07-29 推翻 #265） | **2556** | **−1.4%** |

> 也就是說：原發現「%-血量系統整體縮水約 23%」在提出當下是**對的**，
> owner 在 v0.9.13 把 `maxHealth` 從 3.0 改回 4.0（`8b405869`）之後，
> 這條的實際偏移剩 **1.4%**。**不建議再開單。**

---

### 16. 傳說·萬象強化少掉一大塊血 —— ⚠️ **真，仍活著，而且變大了**

機制成立且我獨立算出**與原報告逐字相同的區間**：

- `capstoneModifiers(pct)` 是對 `maxHealth` 的 `pctAdd`，`statPipeline` 的 `pctAdd`
  只作用在 `base + Σflat`；
- 基礎加成在 `finalizeStat`（`baseBonus.ts:190-196`）排在 `*= env` **之後**，
  所以那 300 完全不被 `(1+r)` 也不被 `×maxHealth` 放大。

差額 = `300 × ((1+pct) × mult − 1)`：

| `maxHealth` 倍率 | capstone +60% | capstone +150% |
|---|---|---|
| ×3.0（v0.9.9，原發現量的） | **1140** | **1950** ← 與原文「1140–1950」完全一致 |
| ×4.0（**HEAD**） | **1620** | **2700** |

`/private/tmp/probe_hp3.ts` 的 lv6 中位實測：

```
capstone +60%  @lv6 中位: 出貨 5234 | 若 300 也被放大 6854 | 差 1620
capstone +150% @lv6 中位: 出貨 8010 | 若 300 也被放大 10710 | 差 2700
```

> **owner 的 #284 裁決只說「基礎加成維持 300」，沒有處理這一條。**
> 一條 7,500 金、六回合、全押的路線，收益比「如果 300 也在被乘的項裡」少 1620–2700 點血
> —— 而且 owner 把倍率調高到 ×4.0 反而讓這個落差**變大**。
> 這是「要不要讓 capstone 的 pctAdd 吃到基礎加成」的一個**設計裁決**，不是 bug。

---

### 17. `autoAttackCensus` 的債務清單被血量綁住 —— ⚠️ 真，仍成立（note 級，已記錄）

兩條證據：

```
packages/shared/src/sim/autoAttackCensus.test.ts:232   foeHp.hp = foeHp.maxHp;   ← 只補「對手」
packages/shared/src/sim/combatFeel.ts:251-253
  export function knockbackRaw(rules, damage, maxHp) { ... const pct = damage / maxHp; }
```

擊退距離是「傷害佔**受傷單位最大生命**的百分比」（GH#193），
所以任何 `maxHealth` 調整都會改變普攻被打斷的頻率 → 改變這份自動產生的報告。

現況比原發現描述的**好**：清單已從 6 位降到 1 位，而且 test 檔頭
（`:110-134`）已經把整條耦合鏈**寫清楚了**，包含 u011「537 血 → 194.5 impact = 36% → 2.42 身位」
的逐 tick 追蹤。目前 `docs/_auto-attack-census.md` 的 u011 速率是 **0.43**
（原發現引用的「0.43 → 0.14」那次漂移已經被 GH#193 反轉回來）。

**要做的只有一件事**：任何 HP 調整（含後台改基礎加成）之後**要重跑這份 census**，
否則 ratchet 會靜默變紅或靜默變綠。**S**，屬流程而非程式碼。

---

## 還活著的清單（給主程分配）

| 項 | 檔案領域 | 工程量 | 說明 |
|---|---|---|---|
| **A. statPreview 的 `baseBonus` 沒有守衛** | `apps/client/src/ui/panels/statPreview.test.ts` | **S** | 照抄兄弟欄位 `statCaps` 在 `apps/client/src/ui/statCapsDisplay.test.ts:115-117` 的寫法：餵一個**非預設**的 `baseBonus`（例如 `{maxHealth: 900, attackDamage: 50}`）進真的 `computeStatBlock`，斷言非 HP/MP 欄位跟著動。突變驗證＝刪掉 `statPreview.ts:129` 要紅 |
| **B. `docs/_ttk-retune.md:27` 的 Env 行三個值全錯** | `docs/` | **S** | 改成 `damageDealt=1.0, maxHealth=4.0, cooldown=0.2`，並註明「校準值 ×8.0 是在 dmg ×0.5 下得到的，與現行 dmg ×1.0 不可直接比較」 |
| **C. capstone 的 pctAdd 吃不到基礎加成（1620–2700 血）** | `packages/shared/src/sim/economy/statPath.ts` + `sim/baseBonus.ts` 的順序 | **S**（一個裁決）/ **M**（若要做成後台可切） | 依第一守則，建議做成**後台可切的兩種模式**（`capstoneAmplifiesBaseBonus: true/false`），預設維持現行語意，不要在註解裡辯護 |
| **D. `mobWaves` 仍是 boot-time** | `apps/game-server/src/config/` | **M** | `MatchController.ts:533-540` 自述「#278 只替 baseBonus 做了 TTL 快取」。同一顆地雷的下一次爆炸 |
| **E. 稽核 workflow 的 prompt 沒補強** | `~/.claude/.../workflows/scripts/ggd-*-audit-*.js` | **S** | 現行 `RULES` 已寫「不得在 repo 內建立任何檔案」但被無視。建議改成**可執行的驗收**：交付前必跑 `git status --porcelain` 且輸出必須為空，非空即判交付失敗 |
| **F. 任務台帳漂移** | 任務系統 | **S** | #277 / #278 / #279 / #280 / #281 / #282 / #283 在任務表上都是 `pending`，但 `dc3c12ad`（已在 main）已經把它們做完並附測試。#284 也已由 `76c1f6c1` 裁決完畢 |

---

## 量測時的環境注意事項（給下一位）

1. **工作樹髒**。量測期間四條工作流在同一棵樹上跑，`git status --short` 有 25+ 個 M。
   本文所有平衡數字一律取自 `git show HEAD:content/...`。
   量測進行中另一條工作流把 `combat-env.maxHealth` 改成 `6.0`、`base-bonus` 改成 `650`
   —— 如果你在別的時間點重跑 `/private/tmp/probe_hp3.ts`，數字會不一樣，**這不是矛盾**。

2. **`apps/client` 有 4 條紅燈，但不是 HEAD 的問題**：

```bash
$ pnpm --filter @ggd/client exec vitest run src/render/frameDrive.test.ts src/GameApp.frameWiring.test.ts
 × #282 一幀的兩半真的接在 GameApp 上 … expected '…' to contain 'this.gamepads.poll('
 × intent 送出率與 fps 上限無關 … 舊順序竟然也送到 30 筆/秒
```

   原因是**另一條工作流未提交的 `GameApp.ts` 重構**（+104 行）：

```
HEAD   :1175 private pumpInput() { … this.gamepads.poll(); … }
工作樹 :1205 private pumpInput() { this.sampleInput(); this.intentClock.tick(nowMs); }
```

   `#282` 的守衛是掃 `pumpInput` 的原始碼字串（失敗形態 ⑥ 的近親），
   所以那條重構一動它就紅。**不要把這 4 條算成本次稽核的發現**
   —— 也不要在對方合併之前去「修」它。

---

_本文由 #285 唯讀工作流產生。未修改任何 `apps/` · `packages/` · `content/` · `tools/` 檔案；
探測腳本在 `/private/tmp/probe_bb.ts`、`/private/tmp/probe_hp3.ts`。_

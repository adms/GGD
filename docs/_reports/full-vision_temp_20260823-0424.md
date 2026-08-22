# 全視野 —— 根因、落地、與交回主 session 的補丁

> owner 2026-08-23（逐字）：
> 「**理論上這個地圖是全視野，就算牆後也看得到**，不然現在很奇怪，
>  看到 **bot 瘋狂隔牆打空氣敵人**，但**我卻看不到也打不到**」

> owner 2026-08-23（常設指令，逐字）：
> 「**沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback**」

---

## ⭐ 根因：**A 和 B 都有**，而且它們是同一個畫面的兩半

⛔ 這**不是**「bot 的索敵不查視線、玩家的查」。逐條量到的：

| # | 在哪 | 做什麼 | 對誰 | 憑據 |
|---|---|---|---|---|
| ① | `packages/shared/src/sim/targeting.ts` | **一格視線檢查都沒有** | ⭐ bot 與玩家**同一支** | `grep hasLineOfSight targeting.ts` → **零命中**；檔案裡唯一的可見性判斷是隱形的 `canSee`（315/362/401 行）。`apps/game-server/src/ai/Tier0Brain.ts:312` 逐字呼叫同一支 `acquireTarget` |
| ② | `sim/systems/BasicAttackSystem.ts::seesTarget`（GH#324） | 牆擋**普攻**（兩處閘：wind-up 前 286 行 + 起手前 330 行） | bot 與玩家**同一支** | 該函式的註解自己寫「語意天然一致：**走出視線 ＝ 走出射程**」 |
| ③ | `apps/client/src/render/occlusionZone.ts`（GH#324） | 牆後的**敵人不畫** | ⭐ **只有玩家**（伺服器照樣把每個人送給每個人） | `occludeArgsFor` 的 `blocked = !hasLineOfSight(center, p, live)`，接在 `GameApp.ts:1793` 的 `occlude:` |

⭐ **合起來就是 owner 描述的畫面**：
bot 隔著牆索敵到人（①，而且它用的半徑是 `AI_ENGAGE_RANGE = 48`，比玩家的近身取得半徑大得多）
→ 丟**技能**（`ProjectileSystem` **從不**呼叫 ②，那是 GH#324 的裁決「不擋技能」）
→ 而玩家**看不到**那個敵人（③）⇒ 畫面上就是「**bot 對著空氣瘋狂丟招**」。
玩家自己：看不到（③）所以點不到，**普攻也打不出去**（②）。

⇒ **A（索敵不對稱）本身不成立**，真正的不對稱是 ②③ 這一對：
**②（打得到嗎）是對稱的，③（看得到嗎）只作用在玩家身上**，
而 bot 用的技能剛好繞過 ②。

## ⭐ 隱形沒有被連帶影響 —— 怎麼確認的

- `canSee`（`sim/stealth.ts`）與 `sim/vision.ts` **零交集**：全視野的兩格開關
  都不在 `isAutoTargetable` 的隱形那一行的路徑上。
- 守衛 `packages/shared/src/sim/fullVision.test.ts` **兩個方向一起讀**：
  同一個夾具（真的一面牆，先斷言 `hasLineOfSight` 是 false）——
  牆後的敵人 `acquireTarget` **拿得到** ✅ · 同一個敵人加上隱形 **拿不到** ✅。
- 回歸：`stealth.test.ts`（20 條）· `autoAcquire.test.ts`（29 條）全綠。

---

## ⭐ 開關（三個住處都落地了）

| 住處 | |
|---|---|
| 出貨值 | `content/config/arena-rules.json` → `vision: { fullVision: true, wallBlocksBasicAttack: false }` |
| Zod + 型別 | `packages/shared/src/content/schema/config/arenaRules.ts::zVisionRules`（＋ `ARENA_RULES_DOC_ID`） |
| 規則本體 | `packages/shared/src/sim/vision.ts`：`VisionRules` · `DEFAULT_VISION_RULES` · `visionRulesFromDoc` · `visionRulesOf` |
| 後台 | `apps/admin/src/configForms.ts` 的 `ARENA_RULES_SPEC.fields` 追加兩列（**競技場規則**那一頁） |

| 欄位 | 出貨 | 關掉／打開會回到 |
|---|---|---|
| `vision.fullVision` | **true** | GH#324 的視野遮蔽（牆後的敵人不畫） |
| `vision.wallBlocksBasicAttack` | **false** | GH#324 的普攻視線閘 |

### ⚠️ `wallBlocksBasicAttack` 出貨 `false` 是**我挑的**，理由要能被反駁

它**推翻**一句更早的 owner 原話（2026-08-14「擋普攻 不然會風箏到死 但不擋技能」）。
三個理由：
1. 第〇·六守則的階梯 —— **新的贏**（2026-08-23 > 2026-08-14）。
2. ⭐ 那道閘是**從視野模型推導**出來的（它自己的註解：「走出視線 ＝ 走出射程」）。
   owner 換掉了視野模型，推導就不成立 —— 留著它會讓「看得到卻打不到」，
   而那正是他抱怨的後半句。
3. 「風箏到死」那個顧慮沒有消失，它變成**一格可以翻回去的開關**。

⛔ 我**沒有**動任何 owner 旋鈕（`content/config/owner-knobs.json` 一個字都沒改）。

---

## ⛔ 交回主 session 的補丁（兩處，都在這條 lane 的柵欄外）

⭐ **出貨行為今天就是對的**（`DEFAULT_VISION_RULES` ＝ owner 要的那一邊，
而 `visionRulesOf` 讀不到 world 上那一格時就回它）。
⚠️ 但在下面兩行落地之前，**後台的 `wallBlocksBasicAttack` 那一格是死的**
（`fullVision` 那一格是活的 —— 客戶端直接讀 `Configs`，⛔ 不經過 SimWorld）。

### ① `packages/shared/src/sim/SimWorld.ts`（另一條 lane 的檔）

在 `stealthRules: StealthRules = DEFAULT_STEALTH_RULES;`（約 1265 行）**下面**加：

```ts
  /**
   * 視野規則 (`config.arena-rules@1` 的 `vision`, see sim/vision.ts) ——
   * 全視野開不開、牆擋不擋普攻。和 `stealthRules` 完全同一條規矩：
   * 開賽前指派一次，之後不再動。
   */
  visionRules: VisionRules = DEFAULT_VISION_RULES;
```

import 那一段加：

```ts
import { DEFAULT_VISION_RULES, type VisionRules } from "./vision";
```

### ② `apps/game-server/src/match/MatchController.ts`（另一條 lane 的檔）

在 `this.world.stealthRules = stealthRules;`（約 1187 行）**下面**加：

```ts
    // 視野規則 (`config.arena-rules@1` 的 `vision`) —— 同樣在 tick 0 之前定格。
    this.world.visionRules = visionRulesFromDoc(Configs.tryGet("arena-rules"));
```

import 加：`import { visionRulesFromDoc } from "@ggd/shared/sim/vision";`
（`Configs` 那個 import 已經在檔案裡；`arenaRules.ts:477` 就是這樣讀同一份文件的。）

⭐ 落地之後 `sim/vision.ts::visionRulesOf` **一個字都不用改** —— 它讀的就是那一格。

### ③ `apps/client/src/GameApp.ts` —— ⭐ **不需要補丁**

`occludeArgsFor` 自己讀 `Configs.tryGet("arena-rules")`（以文件物件身分 memo，
`fullVision` 開著時每一幀零配置），所以 `GameApp.ts:3837` 那一行三個參數的呼叫
一個字都不用動。

### ⚠️ `visibleZones` / L3 ZONE CULL **不是**根因

`GameApp.ts` 的 `visibleZones` 管的是「**哪幾場獨立的 3v3 對戰實例**要畫」
（`apps/client/src/net/zoneVisibility.ts`），⛔ 不是牆、⛔ 不是戰爭迷霧。
`occlusionZone.ts` 的檔頭逐字寫著「這裡的 zone **不是**地圖分區」。⇒ 一個字都沒動。

---

## 測試

| | |
|---|---|
| 新增 | `packages/shared/src/sim/fullVision.test.ts`（3 條，靈魂層）· `apps/client/src/render/visionOcclusion.test.ts`（**重寫**，2 條） |
| 重寫的理由 | 舊的驗的是 GH#324「牆後的敵人不畫」，而且驗的是它**自己抄的** `occluded` 純函式，⛔ 不是出貨的 `occludeArgsFor`（失敗形態⑥）。原文在 `docs/legacy/_overwrites/` 的自動留底 |
| 突變（一條，承重） | `occlusionZone.ts` 的 `if (rules.fullVision) return undefined;` 拿掉 → **紅**（`⭐ 出貨規則：一格都不遮`），已還原 |
| 回歸 | `stealth.test.ts` · `autoAcquire.test.ts` · `wallBlocksBasicAttack.test.ts` · `anchorBounds.test.ts` · `configDocCoverage.test.ts` 全綠 |
| typecheck | `pnpm typecheck` **EXIT=0** |

### ⚠️ 兩個**不是我造成**的紅

1. `apps/admin/src/configForms.test.ts` 3 條紅，全部指名 **`vfx-cleanup` 的
   `vfxHardCapExemptPrefixes`** —— 那是 vfx lane 在飛的改動
   （`content/config/vfx-cleanup.json` 與 `schema/config/vfxCleanup.ts` 都是 dirty）。
   ⭐ `arena-rules` 的標籤／葉節點雙向檢查**是綠的**。
2. `content/` 動過 ⇒ `shippedBundleIsCurrent` 會紅，直到主 session 跑一次
   `pnpm content:build`（這條 lane 禁止跑）。

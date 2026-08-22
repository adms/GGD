# 超過施法距離時角色走過去放技能 —— `config.cast-approach@1`

> owner 2026-08-22（逐字）：「**超過施法距離人物不會走過去放技能（做成後台開關）**」
> ⚠️ **這一題還沒有 GH issue** —— 主 session 請 `gh issue create` 補一張並把本檔連過去。

---

## ① 現況（量到的，⛔ 不是憑印象）

按下一支**指定型**（`castType: "targeted"`）技能而目標在射程外時，
2026-08-22 之前真的會發生的事：

| 位置 | 做什麼 |
|---|---|
| `abilitySystem.ts::castAbility` 的 `targeted` 分支 | `if (distSq(t.pos, tgt.pos) > range*range) return "out-of-range";` |
| `systems/CommandSystem.ts:54` | 任何非 `"ok"` → `world.emit("castRejected", …)` |
| 角色 | **一步都不動**。魔力不扣、冷卻不轉 |

⇒ 玩家看到的是一個**沒反應的按鈕**加上一句「距離太遠」。⛔ 沒有任何接近行為。

⚠️ **另外三種 castType 本來就不會拒絕**，所以它們不在這一版的管轄內：

| castType | 距離不足時 |
|---|---|
| `ground` | **把落點夾回射程邊緣**（`clampLen`，LoL 行為，94 支技能靠著它）——⛔ 不拒絕 |
| `skillshot` / `dash` | 只吃方向，根本沒有距離閘 |
| `self` | 無 |

⭐ 「地面指定技要不要也走過去」是**另一個決策點**，⛔ 我沒有替 owner 挑
（改它會同時動到 94 支既有技能的手感）。要做的話它是這份 config 的第四格。

---

## ② 做了什麼

### 機制（`abilitySystem.ts`）

1. 距離不足 ⇒ 呼叫 `armCastApproach()`：寫 `nav.moveTarget` **與** `nav.order`
   （兩個都要 —— `OrderSystem` 的追擊迴圈靠 `nav.order?.kind === "move" &&
   moveTarget !== null` 決定要不要讓路，這是 #274 既有的走位權規則。少了那一行，
   一個已經自動索敵的英雄會在下一 tick 被追擊把 `moveTarget` 改寫回**攻擊距離**，
   而接近永遠到不了比攻擊距離短的射程），回傳新的 `CastResult` 成員 `"approaching"`。
2. `castApproachSystem(world)` 由 **`MovementSystem` 末尾**呼叫（身體最終座標剛寫完）：
   走進射程的那一 tick 直接 `castAbility(..., { allowApproach: false })`。
   ⭐ 射程走**同一個** `resolveAbilityRange` seam —— 抄一份距離比較在驅動器裡，
   「接近停下來」與「castAbility 放行」就會差一個 ε，角色停在邊緣每 tick 被拒絕一次。
3. **成本在真的施放那一刻才付**。接近期間魔力一點都不扣、冷卻一格都不轉
   （閘的位置刻意排在付出成本之前，與 `isPassiveOnly` / `berserkCastBlock` 同一段）。

**四個結束條件**：施放成功 · 目標死亡/消失/換區 · 走超過 `maxApproachDistance` ·
移動通道被別人接管（`cancelOnNewOrder`）。還移動通道時**只在它還是我們的**才動
（`nav.moveTarget === token` 的身分權杖比對）——⛔ 別人剛下的走位一個字都不能碰。

### 後台三格（`content/config/cast-approach.json` + `schema/castApproachDoc.ts`）

| 欄位 | 出貨 | 上下界與理由 |
|---|---|---|
| `enabled` | **true** | owner 明說的那一邊（第〇·六守則：高層級的結果預設 on） |
| `maxApproachDistance` | **24** | `.min(1)`：小於一個身位（半徑 0.5）的接近完成不了任何一步，畫面上與 `enabled:false` 一模一樣（第一·五守則）。`.max(48)`：決鬥區**直徑**（半徑 24，見 `range-tiers.json` 的校準）。出貨 24 = 半徑 |
| `cancelOnNewOrder` | **true** | 與 `combatFeel.autoEngage.respectLiveSteering` 同一個哲學：一條新到的指令當場把方向盤還給玩家 |

⭐ 它同時是一道**事前閘**：按下去的當下 `距離 > 射程 + maxApproachDistance` 就直接回
`"out-of-range"`，⛔ 不會先跑 24 單位再無聲停住（那比沒反應的按鈕更難懂，而且會把玩家
送進敵方隊伍中間）。

### 與既有兩條路的關係（先查過才動的）

| | 結論 |
|---|---|
| **手把軟鎖定**（GH#519） | ⛔ **不衝突**。它整條住在客戶端（`AimResolver` / `GamepadInput`），產出的只是 `target: { type:"entity" }`。伺服器這一側完全不知道它存在 |
| **攻擊移動 / 自動索敵** | 走 `nav.order.kind === "move"` 這條**既有**的讓路規則（#274），⛔ 沒有新的優先序 |
| **卡住就接敵**（GH#216） | 接近用的是 `move` 指令 ⇒ `updateWalkStall` 照樣計數；卡死時 `autoEngage` 接管 → `moveTarget` 身分權杖不符 → 接近自己放手 |
| **客戶端預測影子** | `LocalPrediction` 從不跑 `commandSystem` ⇒ 它那一格永遠是空的 ⇒ `castApproachSystem` 對它是嚴格 early-return。既有錄影逐位元不變 |

---

## ③ 守衛與突變

`packages/shared/src/sim/abilities/castApproach.test.ts`（129 行，實作 ~280 行 ⇒ 在上限內）

一條承重的：目標在射程外 → 身體**真的移動到射程內** → **真的施放**（讀血條，
⛔ 不讀 `pendingCastApproach()` 這種內部狀態，⛔ 不斷言任何距離數字）。
夾具刻意**不給任何人 `world.champion`** ⇒ `autoAcquirePass` 掃不到 ⇒
「角色移動了」只可能是接近造成的（否則自動索敵的追擊會把壞掉的實作救活）。

**突變（真的做過）**：`MovementSystem` 末尾的 `castApproachSystem(world)` 拿掉
→ 斷言 ② 紅（`expected 0 to be greater than 0`）。
⭐ 而斷言 ① **仍然綠** —— 武裝那一行自己就寫了一次 `moveTarget`，所以身體照樣走過去，
**只是永遠不放**（＝角色走到臉上然後站著發呆）。這正是為什麼「有沒有移動」單獨拿來
斷言是不夠的，也記進了測試檔頭。

**測試數字**：`vitest` 3 次（初驗 / 突變 / 批次）。
批次 = `sim/abilities/` + `sim/systems/` + `combatEnv` + `efurKit` + `purity`
→ **185 passed / 2 failed**（那 2 條見 ④）。`tsc` 1 次（+ 一次 `--filter @ggd/shared` 收尾）。
`packages/shared` typecheck **綠**。

---

## ④ ⛔ 需要主 session 接線（**柵欄外，我一個字都沒動**）

⚠️ **前三項是必須的，缺任何一項 repo 就是紅的。** 第 ① 項缺了會是**線上事故**。

### ① union 一行 —— ⛔ 漏掉 = 整份內容驗證失敗 → 客戶端退回 2 隻骨架英雄

`packages/shared/src/content/schema/config/index.ts`（import 區 + union 陣列各一行）：

```ts
// ⭐ 超過施法距離時走過去再放（owner 2026-08-22）。schema 住自己的檔，這裡只接進 union。
//    ⚠️ 漏掉這一行 = 一份 cast-approach.json 進了 content/ 之後整份內容驗證失敗
//    → 骨架英雄（2026-08-02 線上壞掉四小時的形狀）。
import { zConfigCastApproachDoc } from "../castApproachDoc";
...
  zConfigCastApproachDoc,
```

⭐ **好消息**：`pnpm content:build` 現在會先跑嚴格 Zod 才寫入，所以漏掉這一行會
**當場失敗**，⛔ 不會靜默出貨。⚠️ 但我**沒有**跑 `content:build`（全域鎖），
所以 `bundle.json` / `_index.json` 現在是過期的 —— 主 session 收尾那一次會補上。

### ② 一行 tsx —— 現在 `apps/client` typecheck 是**紅的**（刻意的閘）

`apps/client/src/ui/platform/valhalla/ValhallaSandboxPanel.tsx:63` 的
`CAST_REASON: Readonly<Record<CastResult, string>>` 少一個鍵：

```ts
  approaching: "距離太遠 —— 走過去再放",
```

⭐ 這個編譯錯誤是**刻意留著的**：`"approaching"` 是一個新的施法結果，
而它必須有一句給玩家的話。編譯器逼出來的閘 ⛔ 不是我忘了接線。

### ③ 兩條既有測試 —— 它們釘的是 owner **這一次推翻掉的**行為

| 檔案:行 | 現在 | 應改成 |
|---|---|---|
| `packages/shared/src/sim/combatEnv.test.ts:388` | `.toBe("out-of-range")` | `.toBe("approaching")`（那一條驗的是「縮小後的射程 seam 有沒有擋下來」，`"approaching"` 同樣證明它擋了） |
| `packages/shared/src/sim/efurKit.test.ts:262` | `.toBe("out-of-range")` + 之後 12 tick 不准移動 | 13-01 暗步現在會**走進射程再瞬移**。標題「REFUSES past its distance limit」要改寫；⛔ 保留「魔力/冷卻一格都不動」那兩條斷言（接近期間確實一格都不付） |

⛔ **不要**為了讓它們綠而關掉 `enabled` —— 那是把 owner 的裁決倒回去。

### ④ 建議（可以晚一版，⛔ 但都是真的洞）

| 項 | 是什麼 | 不做會怎樣 |
|---|---|---|
| **`SimWorld.castApproach` 欄位** | 現在 `castApproachRules(world)` 讀一個**還不存在**的選擇性欄位，永遠拿到出貨值 | 後台改了這三格**不會生效**（⚠️ 一格調不到的參數＝第一守則的反面） |
| **`SimWorld` 收留待辦表** | 待辦接近現在住在 `abilitySystem.ts` 的 `WeakMap<SimWorld, …>`（柵欄的產物） | 它應該和 `walkStall` / `autoEngaging` / `suspendedOrder` 同一排；現在 `world.despawn()` 不會清它（改由驅動器每 tick 自清，⛔ 不會長大，但住錯地方） |
| **後台三格** | `apps/admin` 的 `SHIPPED_*` + 欄位 union + 標籤 + 分組 + `configFromForm`，以及 `store.ts` / `ui/App.tsx` 的 session-gate + 導覽列 | `configDocCoverage.test.ts` 會紅（新 config 一定要有後台頁） |
| **`CommandSystem` 別把 `"approaching"` 當拒絕** | 現在它會發 `castRejected{reason:"approaching"}` → HUD 閃「現在無法施放」，而角色其實正在走 | 一個**誤報**的提示。正解是 `if (result !== "ok" && result !== "approaching")`，或改發一個 `castApproachBegan` |
| **`effects/proxyCast.ts:229`** | 代理施法距離不足時也會武裝一次接近（讓**真正的施法者**走過去） | 多半是想要的，但那是一個決策點 ⇒ 建議傳 `{ allowApproach: false }` 並把它做成 `proxyCast` 的一格 |

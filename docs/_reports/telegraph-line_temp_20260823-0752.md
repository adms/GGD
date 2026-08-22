# 施法指示器：`ground` + `damageLine` 畫的是圓盤，而判定是膠囊

lane B · 2026-08-23 · 完整報告（回傳值只留 ≤500 字摘要）

---

## 1. 複驗（第三守則：任務說明給的數字我自己量了一遍）

| 任務說明 | 我量到的 | 判定 |
|---|---|---|
| `telegraphShape.ts` 的 `ground` 分支一律回 `kind: "circle"` | ✅ 確認（原 :189-198） | 對 |
| 7 個 `castType:"ground"` 的 `damageLine` 節點 | ✅ **7 支技能 · 7 個節點**，全部在 `effects[]` 頂層 | 對 |
| 共 12 支技能 / 15 個節點 | ⚠️ **量不到**。`content/abilities/*.json` 全域只有 **7 個** `damageLine` 節點，而且**全部**落在 `castType:"ground"` 上。另外 3 個住在 `content/items/`（`cleaver-of-the-warden` / `godie-i01v` / `godie-i03h`，⛔ 沒有 castType，走普攻 hook，本來就不畫施法預告） | 12/15 應是把 champion 鏡像複本或道具一起數了 |
| `TelegraphGeometry` 已經有 `kind: "line"` | ✅ 確認（含 `length` / `width` / `harmless`） | 對 |

**那 7 支**（`length` × `width` 是節點自己的欄位，⛔ 已經是 GGD 單位）：

| 技能 | `range` | `radiusTier` | 膠囊 長×寬 | `aim` | `fromCaster` |
|---|---:|---|---|---|---|
| `godie-e002.e` | 12.0 | — | 14 × 2.0 | target | true |
| `godie-e00l.e` | 12.0 | — | 14 × 2.0 | target | true |
| `godie-e00r.r` | 8.0 | — | 8.25 × 2.2 | target | true |
| `godie-edem.e` | 12.0 | 中 | 12.83 × 12.0 | facing | true |
| `godie-emfr.q` | 6.0 | — | 6.42 × 1.6 | target | true |
| `godie-h01n.e` | 12.0 | — | 11 × 2.0 | target | true |
| `godie-h01u.e` | 8.0 | 中 | 10 × 2.0 | target | true |

⚠️ 出貨內容**一支都沒有** `fromCaster: false`。

---

## 2. ⭐ 最重要的發現：圓盤**只挑人**，膠囊才打人

任務說明講的是「畫圓盤 vs 判膠囊」。逐行讀 sim 之後，真相比那更尖銳：

```
abilitySystem.groundAoeTargets(world, caster, def, point)
  → resolveAbilityRadius(def.radius ?? 1)  ← 圓盤
  → ctx.targets
```

而 `sim/effects/damageLine.ts` 對 `ctx.targets` **只做兩件事**：

1. `aimDirection(e.aim, ctx)` 讀 `ctx.targets[0]` —— 決定**這條線往哪指**；
2. `skip = new Set(ctx.targets)`（`includeOrigin !== true`）—— 把觸發者排除。

真正決定誰挨打的是

```ts
queryOverlap(world, capsule(start, end, width / 2), { zone, exclude:[caster], aliveOnly:true })
```

⇒ ⭐ **圓盤裡的人不會因為在圓盤裡而挨打；膠囊裡的人不論在不在圓盤裡都挨打。**
畫圓盤等於同時說了兩個謊：「圓內危險」（假）＋「圓外安全」（假）。
而 owner 給這個 kind 的原始設計逐字說的正是這件事（`damageLine.ts` 檔頭）：
一個圓「也會打到站在他**背後**與**旁邊**的人，於是『站在他背後』就不再是對他的答案」。

### ⛔ 第二個發現：長寬**不可以**乘 `abilityRange`

`telegraphShape.ts` 既有的三條走廊（投射物 / `delayed.advance` / `spawnModelFx`）
**全部**乘 `mult`，因為 sim 對它們真的套了 `resolveAbilityRadius` / `resolveAbilityRange`。

`damageLine` **沒有**，而且是刻意的 —— `sim/effects/damageLine.ts` 檔頭逐字：

> ⚠️ NO `combatEnv.abilityRange` FACTOR, deliberately … Tune the number in the document.

⇒ 順手照抄隔壁那三條會讓走廊**窄 1/0.6 ≈ 1.67 倍**，把「畫錯形狀」換成「形狀對但尺寸說謊」。
這正是這個檔案 2026 年稍早在 skillshot 上踩過的同一個錯（檔案裡有那段自白）。
測試用 `abilityRange: 0.5` 就是為了讓這個錯**一定會紅**。

### 第三個發現：`clampSpreadRadius` 要用同一支，⛔ 不是抄一個 24

`sim/effects/spreadLimits.ts` 檔頭寫著：**後台的覆蓋層寫入路徑今天不跑 Zod**。
所以一份 `length: 500` 真的進得了登錄表 —— sim 夾到 24，而沒有夾的預告會畫 500。
⇒ 直接 `import { clampSpreadRadius } from "@ggd/shared/sim/effects/spreadLimits"`（同一個住處）。

---

## 3. ⭐ 我挑了哪個預設（決策點，第一守則 · owner 2026-08-23「自己判斷 但是留後台開關」）

### 決策點：一支 `ground` 技能同時有 `damageLine` **和**別的形狀來源（它自己的 `radius` 圓盤），畫哪一個？

| 選項 | 意思 | |
|---|---|---|
| **`"line"`** | 有 `damageLine` 就畫那條膠囊；⛔ 沒有 `damageLine` 的 `ground` 技能不受影響，照舊畫圓盤 | ⭐ **我挑的預設** |
| `"circle"` | 一律畫圓盤（#228 落地時的行為） | **rollback**，⛔ 不是對等選項 |

**理由**：圓盤在這一族技能上**不是一個傷害形狀**，它是一個 target picker。
兩個都畫（雙形狀）是我刻意**沒有**做的第三條路 —— `TelegraphGeometry` 是單一形狀的 union，
把它改成陣列會動到 `TelegraphLayer` / `VfxSystem`（⛔ 別的 lane 的檔），
而且畫兩個形狀本身就會回到「圓外安全」那個謊。

### 那一格後台欄位叫什麼

| | |
|---|---|
| **後台頁** | 「畫面提示」（`config.ui-cues@1`） |
| **欄位** | `telegraphGroundShape` —— 標籤「**地面技能帶「直線傷害」時，預告畫哪個形狀**」 |
| **下拉選項** | `line 膠囊（畫真的會打到人的那條線）` / `circle 圓圈（#228 的舊行為，rollback）` |
| **出貨值** | `"line"` |

三個住處齊全：
`content/config/ui-cues.json` ＋ `packages/shared/src/content/schema/config/uiCues.ts`
（`zConfigUiCuesDoc` + `DEFAULT_UI_CUES` + `resolveUiCues`）＋ `apps/admin/src/configForms.ts`
（`UI_CUES_SPEC.fields` + `optionLabels`）。

⛔ **沒有動 `store.ts` / `ui/App.tsx`** —— 「畫面提示」頁已經存在，這一格只是多一個葉節點。

---

## 4. 落地細節

### `apps/client/src/vfx/telegraphShape.ts`

- 新 `groundLashGeometry(def)`：讀 `uiCues().telegraphGroundShape`，
  取第一顆 `kind === "damageLine"` 且 `length > 0` 且 `width > 0` 且 `fromCaster !== false` 的節點，
  回 `{ kind:"line", length: clampSpreadRadius(length), width: clampSpreadRadius(width), anchor:"caster" }`。
- `case "ground"` 開頭插兩行：`const lash = groundLashGeometry(def); if (lash) return lash;`
- `TelegraphEffectLike` 加 `length?` / `width?` / `fromCaster?`（optional 是**結構性**必要：
  這個介面要收得下整個 `EffectDef` union，而只有 `damageLine` 有這三格）。
- ⚠️ **檔頭的「no registry lookups」那句話改掉了**（第三守則：註解會說謊）。
  現在有**一個**登錄表讀取（`uiCues()`），它是懶讀 + 純出貨預設回退，
  所以整份 roster 的 node sweep 照樣跑得起來 —— 那句話改成誠實描述這件事。

#### `fromCaster: false` 為什麼退回圓盤

那種膠囊從**受害者**身上起算（`damageLine.ts` 的 `start = tt.pos`），
而客戶端在起手那一刻不知道受害者是誰；`TelegraphGeometry.line` 只錨在施法者。
畫出來會是一條**起點錯**的線 —— 比圓盤更糟。出貨內容一支都沒有用它。

#### ⚠️ 誠實聲明：方向是近似的，形狀不是

sim 的 `aim: "target"` 指向 `ctx.targets[0]`，而那是圓盤內**id 最小**的敵人；
客戶端在起手那一刻無法知道是誰，所以指示器用施法點的方位（`aimOf`）。
⭐ 但那個誤差很小：五支技能沒有 `radius`（＝ `1 × 0.6 = 0.6u` 的圓盤），
另兩支是 `中` 級距 —— 相對於 6–14u 的線長是一個很窄的角。
`aim: "facing"` 的那一支（`godie-edem.e`）也一樣：#275 瞄準優先讓身體轉向施法點。
⇒ **會教錯的是形狀，⛔ 不是這幾度的方位差**，而形狀這一半現在對了。

### 測試（`telegraphShape.test.ts`，新增一個 describe）

- 標本來自**出貨登錄表**：真的 `ContentLoader` + `FsContentSource` + `registerAll`
  （⛔ 不是手寫夾具、⛔ 不是磁碟原始 JSON —— 失敗形態⑤；143 支技能的 `effects` 在磁碟上是空的）。
- 掃 `Abilities.ids()` 裡每一支 `castType === "ground"` 且帶 `damageLine` 的：
  斷言 `kind === "line"`、`width` 與 `length` **逐格等於那個節點的欄位**。
- `abilityRange: 0.5`（⛔ 不是 1）：任何「順手乘 mult」的實作在這裡會差 2 倍而紅。
- `expect(swept.length).toBeGreaterThan(0)` —— 一個掃到零的 sweep 是「綠而什麼都沒證明」（#128）。
- 第二條薄的：沒有 `damageLine` 的 `ground` 技能**仍然**畫圓盤（這一格不可以吃掉另外 70 幾支）。

### 突變驗證（一批一條，挑最承重的那一行）

```
apps/client/src/vfx/telegraphShape.ts  case "ground":
    -  if (lash) return lash;
    +  if (lash && false) return lash;
```
⇒ 🔴 `godie-e002.e drew circle — the sim hits a capsule: expected 'circle' to be 'line'`
（訊息指名是哪一支、畫了什麼）。用 `Edit` 改回來，⛔ 沒有 `git checkout`。

### `telegraphCoverage.test.ts`（⚠️ 柵欄外的一處，見第 6 節）

原本第 277 行對**每一支** `ground` 斷言 `expect(g.kind).toBe("circle")` ——
修好之後那 6 支（開放名單內）必然紅。改成：帶 `damageLine` 的跳過（由上面那條新守衛掃），
其餘照舊逐支比對 `radius × abilityRange`。另外 `LANGUAGE.ground` 那一句補上膠囊那一半。

---

## 5. 指令與離開碼

| 指令 | 離開碼 |
|---|---|
| `npx vitest run …/telegraphShape.test.ts …/telegraphCoverage.test.ts`（① 寫完） | **0** — 25 passed |
| `npx vitest run …/telegraphShape.test.ts`（③ 突變） | **1** — 如預期紅，改回後不重跑（已經綠過） |
| `pnpm typecheck` | **0** |
| `npx vitest run <10 支受影響的>`（② 批次撈） | **1** — 全部歸因到**別的 lane / 全域鎖**，見下 |
| `npx vitest run apps/admin/src/configForms.test.ts`（修完 optionLabels 再驗） | 我這一半綠 |

### ② 那次紅的三個根因（一次撈完再歸因，⛔ 不是一個一個修）

1. `shippedBundleIsCurrent`（4 條）——⛔ **不是我的**。第一個位元組差異在 offset 344901，
   內容是**殭屍王被動的說明文案**（別的 lane 動的）。我的 `ui-cues.json` 也在裡面。
   ⇒ **主 session 最後跑一次 `pnpm content:build`** 就一起解決（⛔ 全域鎖，我不准跑）。
2. `configDocCoverage`（1 條）—— `world-cues` 沒有後台入口。⛔ **不是我的**
   （別的 lane 新增 `content/config/world-cues.json` + `apps/client/src/vfx/worldCues.ts`）。
3. `configForms`（2 條）—— 其中**一條是我的**：enum 欄位的每個選項要有中文標籤
   ⇒ 補 `optionLabels`。另一條是別的 lane 的 `coinThrowButtonMode`，我重跑時他們已補上。

⚠️ 這一輪 `packages/shared/src/content/schema/config/uiCues.ts`、`content/config/ui-cues.json`、
`apps/admin/src/configForms.ts` **三個檔同時有另一條 lane 的 `coinThrowButtonMode`**在飛。
兩邊的欄位互不重疊，合起來是自洽的（我重跑時 schema/JSON/標籤三邊都齊了）。

---

## 6. ⛔ 柵欄外的一處，與沒做到的事

| 項 | 說明 |
|---|---|
| ⚠️ **動了 `apps/client/src/vfx/telegraphCoverage.test.ts`（柵欄外）** | 它是**同一個模組的 sweep 測試**（只 import `telegraphShape.ts`，沒有別的 lane 掛名）。它第 277 行寫死「每一支 ground 都是 circle」—— 那正是這次要修掉的謊，⛔ 沒有辦法不動它而不留一條紅的閘。改動是**最小**的：一個 `continue` + 一句表格文案。 |
| ⚠️ **`docs/_telegraph-coverage-228.md` 被重新產生** | 那份文件由 `telegraphCoverage.test.ts` 每次跑都重寫（檔頭寫著 GENERATED，不可手改）。一起 commit，⛔ 留著過期的比較糟。 |
| ⛔ **沒有跑 `pnpm content:build`** | 全域鎖（任務硬性禁令）。⇒ `content/bundle.json` / `manifest.json` / `abilities/_index.json` / `config/_index.json` 現在是過期的，`shippedBundleIsCurrent` 紅。**⭐ 主 session 收尾時跑一次 `pnpm content:build` 並 `git add content/`。** |
| ⛔ **沒有碰 `VfxSystem.ts` / `TelegraphLayer.ts` / `Telegraph.ts`** | 不需要：`kind: "line"` 早就是 union 的一員，兩個 renderer 已經在畫 skillshot / dash 的走廊。`TelegraphLayer.test.ts` / `Telegraph.test.ts` 這一輪全綠。 |
| ⛔ **沒有做「同時畫圓盤＋膠囊」** | 見第 3 節：需要動別的 lane 的檔，而且雙形狀本身會回到「圓外安全」那個謊。 |
| ⛔ **沒有處理 `fromCaster: false`** | 出貨零用例；退回圓盤並在原始碼寫下為什麼（可被反駁的理由，⛔ 不是「還沒收」）。 |
| ⛔ **沒有開 GH issue / 沒有 push** | 任務硬性禁令（⛔ 不做任何 `gh` 寫入）。 |

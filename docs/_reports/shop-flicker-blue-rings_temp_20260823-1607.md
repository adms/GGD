# lane UI —— ① 商店黑閃爍 · ② 地上亮藍色擴散圈圈（2026-08-23）

> owner 逐字（2026-08-23）：
> ①「**剛進商店 介面有些部分會黑閃爍 選完隨機三選一又回復正常**」
> ②「地上常出現**一堆亮藍色往外擴散的圈圈特效** 應該不是 w3x 原始特效 或是做的太不像
>   **我感覺是硬加的 太亮太搶眼不好看** 請改善」

⚠️ 這份報告裡凡是沒有 `檔:行` 的句子都是**推測**，⛔ 不是量到的（CLAUDE.md 第三守則）。

---

## ② 🔵 亮藍色往外擴散的圈圈 —— **它是誰，答案是確定的**

### 它是 `ImpactComposer` 的 `ShockwaveRing`，⛔ 不是任何一份 `content/vfx/*.json`

| | |
|---|---|
| **是什麼** | `MeshBuilder.CreateTorus("vfx-ring", { diameter:1, thickness:0.09, tessellation:40 })`，`disableLighting = true`（**不吃燈**）＋ `emissiveColor = tint`，貼地 `y = 0.08` |
| **住哪** | `apps/client/src/vfx/vfxPresets.ts:516-565`（`class ShockwaveRing`）＋ `:534-541`（`ringShape()` 的 ease-out 擴散） |
| **多大／多亮** | `heavy`：半徑 **0.3 → 1.7** 世界單位、**240ms**、alpha **0.8**；`ex`：**0.4 → 2.6**、320ms、alpha **0.9**（`vfxPresets.ts:604-606` 的 `IMPACT_TUNING`） |
| **同時上限** | `MAX_RINGS = 6`（`vfxPresets.ts:513`），超過就搶最舊的那一個 |

### 誰在畫它 —— ⭐ **每一次魔法傷害**，⛔ 不是只有爆擊

```
sim  packages/shared/src/sim/combat/hitFeel.ts:170   type === "magic"  → sparkKind = "magic"
client apps/client/src/vfx/VfxSystem.ts:453          "magic" → { tint: IMPACT_TINTS.magic, intensity: "heavy" }
client apps/client/src/vfx/HitSpark.ts:129           composer.fire(intensity, …)
client apps/client/src/vfx/vfxPresets.ts:700         if (recipe.ring) this.fireRing(…)   ← heavy/ex 必畫
```

⭐ **`IMPACT_TINTS.magic = [0.68, 0.5, 1]`**（`vfxPresets.ts:583`）—— 就是那個「亮藍（紫）」。
⚠️ 而 `"hit"`（普通物理）走 `light`，`light.ring === undefined` ⇒ **沒有圈**。
⇒ **「魔法傷害」這一條就是一發一圈**，而 GGD 絕大多數技能傷害是 magic ⇒ owner 說的「常出現一堆」。

**藍色系的其他來源（同一個環，只是 tint 不同）：**

| 來源 | tint | 一場幾次 |
|---|---|---|
| `IMPACT_TINTS.magic`（`vfxPresets.ts:583`） | `[0.68, 0.5, 1]` 亮藍紫 | ⭐ **每一次魔法傷害** |
| `IMPACT_TINTS.ice`（`vfxPresets.ts:587`） | `[0.6, 0.85, 1]` 亮青 | 每一次帶 `hitFeel` 冰屬性的命中 |
| `world-cues.json` `summonSpawn`（今天新加） | `[0.62, 0.48, 1]` 亮藍紫 | **每一隻召喚物各一發** ⇒ 一次施放好幾隻＝一次好幾圈 |
| `world-cues.json` `deathWardSpawn`（今天新加） | `[0.35, 0.2, 0.5]` 暗紫 | 一回合最多 12 次 |

### ⭐ 有沒有 w3x 原作對應？—— **沒有，而且結構上不可能有**

`ShockwaveRing` **不是一份 `vfx@1` 文件**，所以它不在 `content/vfx/`、不在
`ability-vfx-bindings.json`、不在 `vfx-ability-art.json`，也不可能被任何 w3x 綁定表指到。
它是 task #147「AAA-target impact kit」自己發明的一顆 torus（`vfxPresets.ts` 檔頭逐字寫著
「per the AAA-target ranges」）。
⇒ ⭐ **owner 的「我感覺是硬加的」是對的，而且是逐字正確的**：它是硬加的、烘在 TS 裡、
`content/` 一格都調不到（第〇·四守則與第一守則的雙重違反樣本）。

### 這一輪做了什麼（⭐ 只有柵欄內的那一半）

| 檔 | 改了什麼 | 為什麼 |
|---|---|---|
| `content/config/world-cues.json` | `point.summonSpawn.heavy`：`true` → **`false`** | 重版 ⇒ 多畫一圈 `ShockwaveRing`；輕版**沒有那一圈**（`IMPACT_TUNING.light.ring === undefined`），閃光與火星仍在 ⇒「憑空多出一個打手」照樣看得到 |
| `packages/shared/src/content/schema/config/worldCues.ts` | `DEFAULT_WORLD_CUES.point.summonSpawn.heavy` 同步 | ⛔ 第三個住處的 drift 閘 `performanceEventsHaveConsumers.test.ts:162` 逐欄比對 |

⛔ **tint 一格都沒動**：`(0.62,0.48,1)` 是「成形」與「消散」`(0.5,0.42,0.75)` 分得開的唯一線索，
而 owner 說的「太亮」來自那一圈**不吃燈的 alpha 0.8 emissive torus**，⛔ 不是顏色本身。

**⭐ 一鍵 rollback**：後台 →「世界演出」→「**成形：用重版**」轉回**開**。
（`content/` 是 live bind-mount，存檔就生效；⛔ 不必重建映像。）

### ⛔ 沒做到的：**主要來源沒有修，因為它在柵欄外**

`IMPACT_TINTS.magic` / `IMPACT_TUNING.heavy.ring` 住在 `apps/client/src/vfx/vfxPresets.ts`，
`sparkStyleFor()` 住在 `apps/client/src/vfx/VfxSystem.ts` —— **兩個都不在這條 lane 的柵欄裡**。

⭐ **建議的落地形狀（⛔ 我沒有做，等主 session 協調）**，一次同時解掉「太亮」與「烘在 TS 裡」：

1. 新開 `content/config/impact-ring.json`（`config.impact-ring@1`），四格：
   `enabled`（一鍵 rollback）· `alphaScale`（0–1，出貨建議 **0.45**）·
   `radiusScale`（0.3–1.5，出貨建議 **0.7**）· `magicTintB`（0–1，出貨建議 **0.85**）
   —— ⚠️ 全部 number/boolean，⛔ 沒有 enum（`deriveFields` 只認得這兩種）
2. Zod `DEFAULT_IMPACT_RING` ＋ admin `ConfigDocSpec`（三個住處）
3. `ImpactComposer.fireRing()` 讀它，`ShockwaveRing.reset()` 把 `alpha`／`endRadius` 乘進去
4. ⛔ **不要**在 `IMPACT_TINTS` 上手改字面值 —— 那只是把同一個問題往旁邊挪一格

⚠️ **⛔ 我刻意沒有自己挑那三個建議值以外的東西，也沒有動 `IMPACT_TINTS`。**
第一守則：「可調」≠「我可以轉」。

---

## ① 🖤 商店黑閃爍 —— ⛔ **沒有查到根因**，但排除了五條、留下兩個具名嫌疑

### ⛔ 排除（每一條都有 `檔:行`，⛔ 不是「看起來不像」）

| # | 假設 | 排除的證據 |
|---:|---|---|
| **1** | ⭐ **主 session 點名的優先假設**：空氣漫反射／天氣的 `scene.fog` 被套到間場 scene | `setupLighting()`（`render/Lighting.ts:68`，`scene.fog` 的**唯一**寫入端）只被 `GameApp.ts:692` 用 `this.renderer.scene` 呼叫一次。間場自己 `new Engine`＋`new Scene`（`IntermissionScene.ts:293,296`）並在 `:306-308` 從 `ATMOSPHERE`（`intermission/layout.ts:483-484`）寫自己的霧。⇒ ⭐ **兩個 `Scene` 物件，沒有任何路徑把天氣霧寫到商店那一顆。lane FG 是乾淨的。** |
| **2** | 競技場 rAF 與商店 `runRenderLoop` 兩個迴圈互相蓋畫面 | `GameApp.ts:2051` `if (!this.renderSuppressed) this.renderer.render();`，而 `IntermissionStage.tsx:119` 掛載時設 true、`:157` 卸載時設 false。⇒ 商店期間**競技場一幀都不畫**，而且是兩張各自獨立的 canvas |
| **3** | 三選一的卡片被反覆「翻回背面」 | `AugmentDraftPanel.tsx:196` 的 effect deps 是 `[offer.offerId]`（穩定），`:183` `setRevealed((n) => Math.max(n, …))` 是**單調**的 ⇒ 不可能倒退 |
| **4** | 圖示 `<img>` 每次 render 重新載入（黑底閃出來） | `ContentDb.ts:162-167` `contentAssetUrl()` 只加一個**穩定**的 `?h=<contentVersion>`；`IconImg.tsx` 對同一個 src 只記一次失敗 |
| **5** | `@keyframes` 名稱撞號／定義被卸載 | 全 `apps/client/src/ui` 只有一處 `@keyframes ggdFocusIn`（`AugmentDraftPanel.tsx:102`），⛔ 沒有第二份 |
| **6** | 間場 scene 的硬體縮放在震盪（RTT 重配 ⇒ 黑幀） | `applyHardwareScaling()`（`IntermissionScene.ts:357`）**只在建構子被呼叫一次**（`:294`），⛔ 不是每幀 |

### ⚠️ 兩個具名嫌疑（⛔ 都需要一次 10 秒的 console 檢查，而我不能連正式站）

#### 🅰 兩顆引擎向瀏覽器要**不同的 GPU**，而兩顆都拒絕處理 context lost

```
apps/client/src/render/Renderer.ts:35                 new Engine(canvas, true, { stencil:false, doNotHandleContextLost:true })
apps/client/src/render/intermission/IntermissionScene.ts:293
                                                      new Engine(canvas, true, { stencil:false, doNotHandleContextLost:true,
                                                                                 powerPreference:"low-power" })
```

⭐ **間場是全站唯一一個「`low-power` 的 context 與 default 的 context 同時活著」的畫面**
（`LoginScene.ts:298` 用同一組選項，但那時候頁面上只有它一顆）。
雙 GPU 的 macOS（owner 就是 darwin）上，瀏覽器可能為此**遷移／丟掉**一個 context，
而 `doNotHandleContextLost:true` ⇒ **Babylon 不會復原**，那張 canvas 就是黑的。
⛔ **我沒有改它**：第三守則（沒驗證的推測不出貨），而且拿掉 `low-power` 有耗電代價 ——
那是一個要 owner 知道的取捨，⛔ 不是我順手翻的一格。

**怎麼在 10 秒內驗**：商店裡開 console，看有沒有 `webglcontextlost`；或在畫面上找
fps 藥丸旁的 ⚠️ 健康度徽章。

#### 🅱 ⭐ **今天**才變得可能：擲例外的那一幀現在會**呈現一張被清空（≈黑）的畫面**

`apps/client/src/render/safeRenderLoop.ts:44-56`（今天 `dddc529c` 新加）把 throw 接住並讓
**下一幀繼續**。而 Babylon 在 `scene.render()` 的**開頭**就清畫面 ⇒ 中途擲例外的那一幀
呈現的是「清空之後、什麼都還沒畫」＝**黑**。
⭐ 在今天之前同一個故障的長相是**整個畫面凍住**（迴圈死掉），⛔ 不是閃 ——
⇒ **這個症狀「剛好從今天開始」是說得通的。**

**怎麼在 10 秒內驗**：`perfBus.renderLoopErrors`（`apps/client/src/perfBus.ts:104`）非零時，
`PerfOverlay` 會在**永遠可用**的 fps 藥丸旁畫一枚 ⚠️（⛔ 不受 `showPerfOverlay` 管）；
console 會有 `[render:intermission] 這一幀擲了例外`（同一個場景最多印 3 次）。

⚠️ 兩個嫌疑我**都沒辦法把它跟「三選一還沒選完」綁起來** —— 我找不到任何一條路徑讓
`offers.length > 0` 這件事影響到那兩顆引擎。⇒ owner 那半句話也可能只是**時間標記**
（「大概過了幾秒就好了」），⛔ 而不是因果。這一點要請他確認：
**「圈圈選完就不閃了，還是進商店幾秒後就不閃了？」**

---

## 🐛 順手量到的一個真缺陷（⛔ 沒有修，第零守則⑧）

**`intermissionSurfaces().shopInteractive` 有零個消費端**（失敗形態⑧）。

```
grep -rn "intermissionSurfaces" apps/client/src   ⇒ 只有 ui/IntermissionStage.tsx:74
而它只讀 surfaces.ambientMuted（:225），⛔ 沒有讀 shopInteractive、也沒有讀 scrim
```

`panels/intermissionLayout.ts` 用**約 20 行散文**論證「三選一在的時候商店要停止吃點擊，
因為一個變暗但仍可按的卡片還是會誘人去按，而帶著未回答的 offer 按 Ready 會把增益丟掉」——
而 `MerchantShop` / `ReadyButton` **一個字都沒讀那條規則**。
現在它只是**碰巧**被 scrim 的 `pointerEvents:"auto"`（`AugmentDraftPanel.tsx:98`）擋住。
⇒ 哪天 scrim 改成 `pointerEvents:"none"`（那是很自然的一次「讓底下看得更清楚」改動），
**這條規則會靜靜消失，而全套測試是綠的。**

⛔ 我不能做 `gh` 寫入 ⇒ 請主 session 開票。

---

## 📋 指令與離開碼

| 指令 | EXIT |
|---|---:|
| `npx vitest run apps/client/src/vfx/performanceEventsHaveConsumers.test.ts` | **0**（8/8 綠，含 `:162` 出貨 JSON ↔ `DEFAULT_WORLD_CUES` 的 drift 閘） |
| `npx tsc --noEmit -p packages/shared/tsconfig.json` | **0** |

⛔ **沒有跑** `pnpm content:build` / `skills:sync` / `spec:build`（全域鎖，主 session 統一跑）
⇒ ⚠️ `content/bundle.json` 目前是**過期的**，`shippedBundleIsCurrent.test.ts` 會紅到主 session 跑完為止。

## 🧪 測試預算

⭐ **0 行新測試** —— 這一輪唯一的改動是**純數值調整**（第零守則⑦：三個住處 + drift 測試已經在守），
而那條 drift 閘（`performanceEventsHaveConsumers.test.ts:162`）**本來就存在且真的比對出貨 JSON**。
⛔ 沒有開對抗輪。⛔ 沒有做突變（沒有新接線）。

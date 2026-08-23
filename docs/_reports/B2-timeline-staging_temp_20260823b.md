# B2 技能模板②⑧ —— 時間軸演出（連段／持續傷害／黑龍波）

日期 2026-08-23 · lane B2 · 柵欄 `packages/shared/src/content/schema/effects/**` ·
`content/abilities/`（只動點名的）· `tools/skill-remake/heroes/`

---

## 0. 一句話結論

**群組②（連段 / 動畫持續傷害 / 龍虎亂舞）在 `1578a44a` 已經落地且有守衛；
群組⑧（三條黑龍 / 衝擊波 / 動地剁）的機制也在了，但「動地剁」在出貨內容上
**畫的是另一件事** —— `path:"radial"`（十二具從腳下往外噴）而 JASS 是
**半徑一圈上的十二個落點**。** 這一格從來沒有被任何守衛問過。

---

## 1. ⭐ 量測：「動地剁」現在到底有沒有畫面

上一輪我對 owner 說過「動地剁畫面有、只是無聲」。**那句話兩邊都不準**，逐項重量：

| 時點 | 畫面 | 聲音 |
|---|---|---|
| ~2026-08-22 | ⛔ **沒有** —— `VfxSystem` 的 `case "modelFxSpawn"` 第一行讀零寫入端的 `ev.data.spec` 然後 `break`（GH#606） | ⛔ 沒有（`spawnModelFx` 當時整個 payload 一個聲音鍵都沒有，GH#605） |
| **今天（GH#606 / #605 之後）** | ✅ **有** | ✅ 有（`soundKey: "guardianSlam"`，只有 38-03 那一支） |

⇒ 「無聲」在 GH#605 之後已經不成立；而「畫面有」在 GH#606 之前也不成立。
⭐ **今天真正的缺陷不是有沒有，是畫錯了**（下一節）。

鏈路逐段量到的（⛔ 不是推論）：
1. sim 真的發 —— `dragonStaging.test.ts` 跑出貨 38-03，三組 `modelFxSpawn`，實例數 `[1, 1, 12]`
2. `eventFanout.ts:63` 白名單放行 `modelFxSpawn`
3. `VfxSystem.ts` 的 case 現在讀 `ModelFxSpawnEvent`（兩邊 import 同一個型別）→ `modelFx.spawn(p)`
4. `resolveModel("imported.tectonicfury")` → `content/models/imported.tectonicfury.json` 存在，
   `glbPath: assets/models/imported/tectonicfury.glb` 磁碟上存在
5. `DEFAULT_MAX_LIVE = 48` ⇒ 12 具不會撞預算

---

## 2. ⭐ 最重要的發現：`orbit` 與 `radial` 是兩種畫面，而動地剁選錯了

JASS 原文（`tools/jass-dragon/out/A09I.staging.json`，逐字）：

```
"polarProjections": [ … { "angle": "( I2R(udg_BlackDargon) * 30.00 )", "dist": 350.0 } ]
"loopBounds":       [ { "var": "BlackDargon", "max": 12 } ]
"timedLifeSec":     [ 2.0, 3.0 ]
```

＝ **半徑 350 的環上、每 30° 一個「位置」**，每個位置站一隻有壽命的傀儡對自己腳下丟一發。

引擎的兩條路徑（`sim/effects/spawnModelFx.ts::modelFxInstances`）：

| path | 實例的座標 | 走多遠 | 畫面 |
|---|---|---|---|
| `orbit` | `ringPoints(origin, distance, count)` —— **各自一個座標** | 0（終止條件是 `lifeSec`） | 地面被剁開一圈 |
| `radial` | **十二具共用施法者這一個座標**，只有方向不同 | `distance` | 腳下噴出十二根然後散掉 |

出貨的 38-03（`godie-u010.e` / `godie-uvng.e`）寫的是
`path:"radial", count:12, distance:6.42, speed:30`
⇒ 十二具在 **6.42 / 30 ≈ 0.21 秒**內從腳下噴出去然後全部消失，
⛔ 而原作是十二個落點**站在一圈上留 2–3 秒**。

⚠️ 每一道既有的閘對此都是綠的：schema 收得下、`dragonStaging.test.ts` 只問「有沒有一組多實例」、
`content:build` 全綠。這是第一·五守則的形狀 —— **零件都對，組合演的是另一件事**。

---

## 3. 這一輪落地的（全部在柵欄內）

### 3.1 `content/abilities/godie-u010.ex.json` · `godie-uvng.ex.json`（38-002 究極暴走黑龍波）

⭐ 為什麼是 `.ex` 而不是 `.e`：`abilityMirror.test.ts` 只鏡射 **Q/W/E/R**，
`exAbility` 在 champion 文件裡是一個 **id 字串** ⇒ `.ex` 改一份就好，
⛔ 而 `.e` 一定要連 `content/champions/*.json` 一起改，而 champions 不在這條 lane 的柵欄裡。

| 改動 | 依據 |
|---|---|
| **加上動地剁落點環**：`path:"orbit"` · `count:12` · `distance:6.42` · `lifeSec:3.0` · `soundKey:"guardianSlam"` | owner 逐字把「三條黑龍＋衝擊波＋動地剁」同時掛在 38-002 與 38-03 上；而 38-002 在此之前**只有兩種演出**，比它的基礎技還少。`lifeSec:3.0` 取 JASS `timedLifeSec` 的 3.0，環半徑與音效鍵**照抄同族的 38-03**（⛔ 不新編數字） |
| 三條黑龍加 `arriveSoundKey:"explosion"` | 38-002 在此之前**整支一個聲音鍵都沒有**（`sfxKey` 也沒有）。這個 key 就是 38-03 同一具 `imported.darkraor` 用的那一個 |

⚠️ **⛔ 沒有動任何傷害／平衡欄位** —— 純演出。
⭐ **rollback 的那一格**：這兩個節點是 `content/abilities/*.json` 的內容節點，
`content/` 是線上 live bind-mount ⇒ owner 在**後台「內容管理」把那一個節點刪掉**就回到原狀，
⛔ 不需要重建映像、不需要部署。

### 3.2 `packages/shared/src/content/schema/effects/modelFxStagingContract.test.ts`（檢查 script）

owner 群組②的原話裡的「**還有檢查 script**」在群組⑧這一側缺一支。兩條：

① ⭐ **承重（機制，跑出貨的東西）** —— 載入出貨內容 → 真的 `SimWorld` → 施放出貨的 38-002 →
拿**真的** `modelFxSpawn` → 問「實例最多的那一組**每一具是不是各占一個座標**」。
⭐ 用「實例最多的那一組」認落點環，⛔ 不用 `path` 認：拿被測的那一格當篩選條件的話，
它被改壞時斷言只會「找不到東西」，⛔ 而不是指出病灶。
反面同時釘住：發散那一族**必須**共用一個原點（否則同一條斷言對兩種實作都會過）。

② **契約** —— 每一支帶多實例 `spawnModelFx`（`count ≥ 2` ＝ 一個演出家族）的技能
都要出得了聲（`sfxKey` / `soundKey` / `arriveSoundKey` 任一）。
豁免 `FENCED_OUT = {godie-n003.r, godie-n01g.r}`（42-04 世界終結，圓周噴發 12 具大冰塊，
**今天完全無聲**）—— 理由是它們是 `R` 槽 ⇒ 鏡射進 champions ⇒ 不在柵欄裡；
⭐ 補上聲音的那一天這條斷言會紅並要求刪掉那兩列（⛔ 沒有到期日的豁免＝永久許可證）。

**突變紀錄（一批一條，最承重的那一行）**：
把 `godie-u010.ex.json` 動地剁節點的 `"path": "orbit"` 改回 `"radial"`
→ 紅：`38-002 的動地剁不是一圈落點：12 具站在 1 個座標上（path=radial）——
那是腳下噴發，⛔ 不是地面被剁開一圈: expected 1 to be 12`
（⭐ 而這**正好逐字就是出貨的 38-03 今天的狀態**）。
還原用 `Edit` 改回那一行，⛔ 不是 `git checkout`。

---

## 4. ⛔ 柵欄外的四件事（交給主 session 開票／排序）

| # | 是什麼 | 為什麼我沒有動 | 不修的後果 |
|---|---|---|---|
| **①** | **38-03 動地剁 `radial` → `orbit`＋`lifeSec`**（`godie-u010.e` · `godie-uvng.e` ＋兩份 champion 鏡射） | `.e` 是鏡射槽，要同時改 `content/champions/*.json` | owner 點名的「動地剁」在**基礎技**上演的是腳下噴發、0.21 秒就散光 |
| **②** | ⭐ **`GameApp.ts:867` 的 `modelDocFor` 把 `model@1` 投影成 `{glbPath, scale}`** —— `fxLongAxis` 與 `fxSpawnHeight` **兩格在生產路徑上被丟掉** | `apps/client/**` 不在柵欄裡 | 失敗形態⑧：`modelFxRig.spawn()` 第 184/201 行讀 `doc.fxLongAxis` / `doc.fxSpawnHeight`，而**唯一的生產寫入端不送它們** ⇒ owner 要的「90 度橫放的 beam」軸修正**從來沒有生效過**（`imported.fireblast`＝`x`、`imported.netherstrike`＝`y` 兩份文件白設），移動模型一律貼地 y=0。⚠️ `modelFxWireContract.test.ts` 對此是綠的 —— 它自己注入 `resolveModel: () => ({ glbPath: "x.glb" })`（失敗形態⑤：被測的不是出貨的那個） |
| **③** | ⭐ **三張龍族「特效模板」卡其實**不能被引用** | `content/ability-templates/` 與 `packages/shared/src/content/modelFxPreset.ts` 都不在柵欄裡 | `tpl-dragon-serpent` / `-shockwave` / `-quake` 的參數名（`instances` / `travel` / `ringRadius` / `impactLifeSec`）**對不上** `PRESET_FIELDS`（`modelKey`/`path`/`speed`/`distance`/`count`/`spinDegPerSec`/`scale`），而且**三張都沒有 `path`**。⭐ 更根本的是 **`lifeSec` 根本不在 `PRESET_FIELDS` 上** ⇒ 整個 `orbit` 家族（`refine` 要求 `lifeSec` 必填）**在結構上不可能做成 preset**。⇒ owner 要的「轉化為特效模板」在群組⑧只做到「卡片存在」，⛔ 沒有做到「可以被引用」 |
| **④** | `godie-hapm.ex`（52-002 射殺百頭）補齊連段三件套 | 修它會讓 `comboFinisherShowcase.test.ts` 的 `staleExemptions` 紅，而那支測試在 `sim/effects/`（柵欄外） | 十段連段沒有打擊特效／`{{i}}Hit`／收尾標點 |

---

## 5. ⛔ 沒有做、而且是**刻意**沒做的

**群組⑧不加特效文字。** owner 的「別忘了還有特效文字」是接在**群組②**（連段 `1Hit…7Hit`）
那一句後面的；而 A09I 的 JASS `vfx` 區塊只有 `atPoint: Boomnl.mdx` ＋
`sounds: [ShimmeringPortalDeath, DragonYes2]`，**一個 `CreateTextTag` 都沒有**，
兩支技能的 owner 說明裡也沒有任何 `「…」` 台詞可以引用。
⇒ 現在編一句字出來就是「我的推測幾小時後變成他的需求」那條守則的形狀。
**要加的話這是一個 owner 的決定，⛔ 不是我的。**

---

## 6. ⚠️ 主 session 要接的一步

這一輪動了 `content/abilities/*.json` ⇒ **`bundle.json` 現在過期**，
`shippedBundleIsCurrent.test.ts` 會紅。`pnpm content:build` 是全域鎖，
⛔ 這條 lane 不能跑 —— **請主 session 跑一次 `pnpm content:build` 並 `git add content/`。**

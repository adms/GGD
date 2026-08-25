# MarkOfChaosTarget PRE2×4 — 連續圖片驗收（GH#699 · MARK lane · 2026-08-26 01:00）

台子：`apps/client/public/beam-audition.html?ability=<id>`（`client-beam` :39673）。
量尺先過 `calibrate()`：全亮 quad **462,400** 亮像素 > 0 ⇒ 量尺自證，之後的每一個讀數才算數。

鏈路：真 `SimWorld` → 出貨技能（`castAbility`，走真的詠唱條）→ 真 `abilityCast` 事件 →
真 `VfxSystem.handleEvent` → 真 `playCastVfx` 第 1 級（`W3xEmitterRig`）→
真 `particleFactory.toParticleSystem` → 真的 `content/vfx/*.json`。
內容經 `workingTreeSource()` 從工作樹逐檔讀。

---

## ⛔⛔ 先講一件事：這一頁在今天之前**量不到任何一支技能的原作藝術**

⭐ 這一批最重要的發現不是「特效看得見」，是**量尺本身有三個洞**，而它們讓
`beam-audition.html` 的每一份既有視覺證據都**只涵蓋 `spawnModelFx`（glb rig）＋
`vfx-preset-*` 退路**，⛔ 從來沒有涵蓋過任何一份 `vfx@1` 粒子文件。

| # | 洞 | 量到的後果 | 修在哪 |
|---|---|---|---|
| ① | `castOnce()` 在**兩個 step 之間**同步施法，而 `SimWorld.step()` 的**第一行**是 `this.events.length = 0` ⇒ `abilityCast`（家族藝術／`vfxKey`／`sfxKey` **唯一**的載體）在任何人讀到它之前就被清掉 | 事件直方圖只有 `buffApply`／`castEnd`；**`playCastVfx` 一次都沒被呼叫過** | `beamAuditionWorld.ts::castOnce()` —— 一次性包住下一個 `step`，讓施法發生在 **tick 內**（那正是出貨路徑的位置）⛔ 不是自己造 payload |
| ② | `VfxSystem` 的 ctx **沒有 `vfxDoc` 這一格**（出貨組合根 `GameApp.ts:890` 逐字是 `vfxDoc: (key) => this.contentDb.vfxFor(key)`）⇒ `this.doc()` 永遠 `undefined` ⇒ **每一份 `vfx@1` 都查不到**，靜靜掉進 `HitSpark` 退路 | `godie-hart.r` 真的發了 **2 則 `vfxSpawn`**（thunderclapcaster.p00 ＋ warstompcaster.p00），而場上粒子系統名字裡**一個 `w3x` 都沒有** | `beamAudition.ts` —— 補 `vfxDoc: (k) => VfxDefs.tryGet(k) ?? null`（走出貨的同一份登錄表） |
| ③ | 這一頁只跑 `ensureContentLoaded()`，⛔ 沒有跑出貨組合根 `ContentDb.load()` 安裝的**三份設定**（`setAbilityArtBindings` → `setAbilityVfxBindings` → `setFamilyTuning`，順序是它逐字要求的）⇒ `w3xArtFor()` 對**每一支**技能回 `undefined` ⇒ `playCastVfx` 的第 1／2 級**一次都沒走過** | 補之前 `godie-n01g.ex` 場上 **0 個** `w3xfx-*`；補之後 **4 個** | `beamAudition.ts` —— 逐字照抄 `ContentDb.ts:363/369/379` 的三行與順序 |

⚠️ ⭐ **我自己也被這三個洞騙過一次**：中途我根據「補了 ①② 之後仍然 0 個 stock 系統」
寫下了「`extraVfxDocIds()` 沒有渲染端消費者 ⇒ 這 4 份文件零消費端」的結論 ——
**那是錯的**，補上 ③ 之後三顆 emitter 全部出現。⇒ 這正是 CLAUDE.md 👁 節洞 d
（「量尺自己會說謊」）本人：⛔ 一個量不到的讀數不是「功能不存在」的證據。

---

## 一、A/B ：`config.vfx-families@1 → families.mark.enabled`（交付 3 ＋ 4 的 rollback 證明）

技能 **`godie-n01g.ex`（42-002 魔力印章）** —— 出貨 `vfx-families.json` 把它綁在
`family: "mark"`，而 `mark` 家族宣告的原作模型逐字就是 `markofchaostarget`
⇒ `stockEmitterIds()` 這條**規則**產出 p00/p01/p02。

| 擷圖 | 開關 | 場上 `w3xfx-*` 粒子系統 | peak lit | peak bright | 基線 |
|---|---|---|--:|--:|--:|
| `shot1_n01g-ex_42-002_mark_ON.png` | `families.mark.enabled: **true**`（出貨值） | **4** —— `markofchaostarget.p00` · `.p01` · `.p02` ＋ 家族主 emitter `fx.fam.mark.w3x-ff6400.s85` | **101,910** | **89,341** | 0 |
| `shot2_n01g-ex_42-002_mark_VETO.png` | `families.mark.enabled: **false**` | **0** | 16,799 | 6,117 | 0 |

⭐ 否決之後 `w3xArtFor("godie-n01g.ex")` 回 `null`，技能掉回**自己的** `vfxKey`
⇒ 場上只剩 `vfx-fx.prim.arcane.pulse-lg` 的紫色光柱（截圖裡看得一清二楚）——
那正是 `resolveFamilyArt` 檔頭逐字寫的「the caller keeps the ability's own `vfxKey`,
which is the `fx.prim.*` baseline. There is no silent third state.」

⇒ ⭐ **這一格是一個量過的、真的關得掉的 rollback 開關**，⛔ 不是一個宣稱。

---

## 二、逐份文件的像素讀數（交付 3）

台子相機正前方 1.5 公尺放一具，走**出貨的** `particleFactory.toParticleSystem`
（整個 repo 把 `vfx@1` 變成 Babylon 粒子系統的**唯一**入口）＋ 出貨的 `VfxDefs` 文件。
A/B ＝同一台相機、同一個場景，`ps.dispose()` 之後再量一次。

| 擷圖 | doc | 模式 | 尺寸 start→end | peak lit | peak bright | A/B off | **差分** |
|---|---|---|---|--:|--:|--:|--:|
| `shot3_doc_p00_shockwaves02.png` | `…markofchaostarget.p00` | continuous rate 30 | 1.847 → **7.386** | **74,129** | 56,722 | 0 | **74,129** |
| `shot4_doc_p01_shockwavesYellow.png` | `…p01` | continuous rate 30 | 1.403 → 3.825 | **52,691** | 45,179 | 0 | **52,691** |
| `shot5_doc_p02_022222.png` | `…p02` | continuous rate 80 | 0.253 → 0.142 | **1,457** | 326 | 0 | **1,457** |
| `shot6_doc_p03_blastflarestreamers_2px.png` | `…p03` | burst 26 | 0.111 → 0.083 | ⛔ **2** | **0** | 0 | ⛔ **2** |
| `shot0_control_off_0px.png` | （全部關掉的對照幀） | — | — | **0** | 0 | — | — |

⭐ p00 是**巨環**本人（原作 `segmentScaling 265.9 × 1/36`）—— 截圖上是一圈可辨識的
紅色符印光環，正對得上 `mark` 家族說明逐字的「在目標身上炸開一圈符印光」。

⚠️ **p02 是暗的但不是零**（1,457 / 326）：37 顆 0.14–0.25 世界單位的紅色星形拖尾。
它在合成畫面裡是 p00/p01 環上的細碎火星（見 `shot1`），⛔ 不是主角。

## ⛔ 差分尺當場抓到的一個「說了但不會發生」

**`…p03`（BlastFlareStreamers，burst 26）在這台相機上是 2 個亮像素、0 個 bright。**
26 顆粒子真的生出來了（`getActiveCount()` = 26），但 `size 0.111 → 0.083`
＋ `gravityY −13.889` ＋ peak α 0.502 ⇒ 它在 1,280×720 上**幾乎不佔像素**。

⭐ **這一份出貨了但目前播不到，而那是刻意的**：執行期的
`MAX_STOCK_EMITTERS_PER_MODEL = 3` 只問 `p00/p01/p02`。
⇒ 這個讀數的意義是：**如果**哪天有人把那個窗開到 4，`p03` 會是一份幾乎看不見的
文件 —— ⛔ 那時候要重新量，不是直接放行。（本批⛔ 不動那個上限。）

---

## ⚠️ 誠實限制（量到但本批不宣稱）

1. **本批一個位元組的出貨內容都沒改。** 這 4 份文件的綁定**在本批之前就已經成立**
   （`mark` 家族 → `stockEmitterIds()` 的規則），本批做的是**證明它成立**。
   ⇒ ⛔ 不要把這份報告讀成「新接了線」。
2. **只驗了 13 支 `mark` 家族技能裡的 1 支**（`godie-n01g.ex`）。那條路是一條
   **規則**（`W3X_ART_FAMILIES.mark.models` → doc id），⛔ 不是逐支的白名單，
   所以其餘 12 支走的是同一段程式碼；⛔ 但我沒有逐支量過。
   ⚠️ 其中 **4 支的 ability doc 根本不存在**（`godie-e00k.ex` · `godie-e00z.ex` ·
   `godie-ekee.e` · `godie-opgh.e` 在 `content/abilities/` 裡沒有檔案）⇒ 實際活著的是 **9 支**。
3. **⛔ 沒有量到 04-03 龍破斬**（census 指出的落點）—— 它的家族綁定是 `dissipate`，
   ⛔ 不是 `mark`，本批沒有動它（理由見 `MARK_temp_20260826-0100.md` §三）。
4. **音效沒有終端證據** —— audition 台子不播聲音。`mark` 家族的
   `soundLaunch: buffApply` / `soundDissipate: castEnd` 本批未驗。
5. ⚠️ **EX 技能在這一頁只放得了一次**：`castOnce()` 只重置 **R 槽**的冷卻，
   第二次施放會被 `castAbility` 以 `cooldown` 拒絕（⛔ 這是既有行為，本批沒有動它）
   ⇒ 每一組讀數都是**重新載入頁面**之後的第一次施放。
6. ⚠️ 兩組 A/B 的取樣視窗不同（ON 走 30 次 `step(2)`、VETO 走 8 次）。ON 的峰值
   落在 t=14，在 VETO 的視窗內 ⇒ 兩者可比；⛔ 但那不是逐幀對齊的差分。
   **決定性的讀數是 `w3xfx-*` 系統數 4 → 0**，⛔ 不是那兩個像素數。

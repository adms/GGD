# 技能與道具特效 —— 完美實作進度盤點（8 軸）＋ 卡住的共同原因分類

> owner 2026-08-23 逐字：
> 「請盤點整理一個**技能與道具特效清單完美實作進度**，並**分類顯示還不能完成的共同原因**」

⭐ **這份報告的重心是第 2 節（卡住的共同原因分類）**，⛔ 不是 421 列的清單。
⚠️ 全部數字為 **2026-08-23 當日重新量測**（唯讀腳本 `/private/tmp/ggd-vfx/`），
⛔ 一個字都沒有抄 `docs/技能特效重整_temp_20260822-2100.md`——那一份的軸①/④/⑤（原作 w3x 側）
不隨 GGD 內容變動，才引用；GGD 側全部重量，**而且已經漂了**（見 §6 差異表）。

**母體（今天量到的）**：技能 `content/abilities/` **421** 支 · 道具 `content/items/` **142** 件 ·
特效文件 `content/vfx/` **643** 份（`vfx@1` 584 · `ribbon@1` 55 · `attachment@1` 4）·
英雄 71 · 投射物 21 · 狀態效果 43 · 技能模板 41。
另有 `content/_legacy/` **440 份**（技能 276 · 道具 112 · 英雄 48）—— ⛔ **一份都不在 `bundle.json`**（實測）。

---

## 1. 一頁摘要 —— 八軸的完美實作進度

| 軸 | 完美 = 什麼 | 分母 | 已達成 | 進度 | 卡在哪一類 |
|---|---|---:|---:|---:|---|
| ① **JASS 一次性特效** | 原作 557 個 `AddSpecialEffect*` 呼叫點各有對應演出 | 115 種模型 | 14 種地圖自帶模型可用，其中 **2 種**已成 `fx.w3x.stock.*` 並被消費 | **~12%**（可用模型基數） | B 缺資產 · C 缺綁定 |
| ② **3D model 蝗蟲群**（橫放 beam／砲擊／衝擊波） | 原作 28 具會動的 dummy（收斂成 **22 個特效**）都用 `spawnModelFx` 演出 | 22 | **15 支技能 / 21 個 effect site** 已用 `spawnModelFx` | **~68%**（⬆ 從 08-22 的 22%） | F 內容缺口 |
| ③ **粒子特效** | 技能綁的是**原作**粒子，不是通用原型 | 385 支有 `vfxKey` | 綁 `fx.w3x.*` **24** 支；綁 `fx.prim.*` 通用原型 **343** 支 | **6%** | C 缺綁定 · B 缺資產 |
| ④ **拖曳緞帶** `ribbon@1` | 55 份緞帶都有消費端 | 55 | 走 `config.ambient-vfx@1` 綁定的 **10** 份 | **18%** | A 缺機制（沒有技能級消費端） |
| ⑤ **球體／掛件** `attachment@1` | 原作 316 次掛件呼叫（31 次自帶模型）有對應 | 31（自帶模型那一半） | `attachment@1` 文件 **4** 份，全部被消費 | **13%** | A 缺機制 · B 缺資產 |
| ⑥ **特效音效綁定** | 每支技能有**指名**的音效，⛔ 不是通用音 | 421 | 逐支 `sfxKey` **72** · family 覆寫 **17** · family 預設音 **122** ⇒ 合計 **211** | **50%** | C 缺綁定（#554） |
| ⑦ **特效文字** | 技能演出帶浮空字（傷害／狀態／台詞） | 421 | `floatingText` **9** 支 | **2%** | F 內容缺口 |
| ⑧ **骨頭錨點** | 一次性施法特效掛得上骨骼 | — | ⛔ **引擎做不到**：`spawnVfx.at` 只有 `self`/`target`/`point` | **0%** | A 缺機制（#565） |

### ⛔ 道具（`content/items/` 142 件）：這一軸的分子是 **0**

| 量到的 | |
|---|---:|
| 道具文件 | **142** |
| 帶 `vfxKey` 的 | **0** |
| 帶 `sfxKey` 的 | **0** |
| 帶 `vfxLayers` 的 | **0** |
| 帶 `icon` 的 | 142 |

⭐ **根因不是「沒人填」，是 `item@1` schema 裡根本沒有這三格欄位**
（`packages/shared/src/content/schema/item.ts` —— 逐欄讀過，只有 `icon` / `iconKey`）。
⇒ 道具的 316 個 effect 節點（`applyBuff` 92 · `status` 52 · `applyStatus` 34 · `damage` 18 ·
`damageArea` 13 · `dot` 5 · `dash` 2 · `knockback` 2 · `proxyCast` 3 …）**一個都畫不出專屬特效**。
⚠️ 而且它們最常見的出口 `applyStatus` 也接不住：`content/status-effects/` **43 份文件，
`vfxKey` 出現 0 次**（`statusEffect.ts` 同樣沒有這一格）。

⇒ ⭐ **道具與狀態效果是「A 缺機制」裡最大的一塊，而且今天沒有任何一張票在追它。**

---

## 2. ⭐⭐ 卡住的共同原因分類（本報告的主產出）

⚠️ 排序依據是**第〇·五守則**：按「**解一次解開幾支**」排，⛔ 不是按軸的順序。

| # | 原因類 | 卡住的量 | 代表票 | 解一次解幾支 | 形狀 |
|---:|---|---:|---|---:|---|
| **1** | **C 缺綁定** —— 通用原型換原作粒子 | **343** 支技能綁 `fx.prim.*` | #529 · #547 | **343**（其中 278 支在可選英雄身上） | 純資料：改 `vfx-ability-art.json` 的推導來源 |
| **2** | **B 缺資產** —— 貼圖還是代用圖 | **582 / 638** 份 vfx 文件（91%） | #65 | **582 份文件 → 影響全部 385 支有 vfxKey 的技能** | 接線：MPQ/BLP 解碼器都在本機，`wc3/` 只有 **8 個 PNG** |
| **3** | **C 缺綁定** —— 技能音效 | **210** 支零 authored 音效 | #554 | **210**（其中 175 支退到元素 whoosh、35 支退到通用 `abilityCast`） | 推導綁定表，⛔ 不烘進 421 份 JSON |
| **4** | **C 缺綁定** —— 特效方位 | **57** 支 beam ＋ 35 slash ＋ 25 shockwave ＋ 2 bolt = **119** | #377 · #379 | **119** | `orient.yawFrom:"aim"` 出貨只有 **2 份**、`pitchDeg:0` 只有 **2 份** |
| **5** | **A 缺機制** —— 道具／狀態效果沒有特效欄位 | 道具 **142** ＋ 狀態效果 **43** | ⛔ **今天沒有票** | **185 份文件**（道具 316 個 effect 節點） | schema 加 `vfxKey`/`sfxKey`，沿用 `resolveAbilityVfxLayers()` |
| **6** | **A 缺機制** —— 一次性特效的骨頭錨點 | 引擎 **0**；**126** 份 vfx 文件帶著讀不到的 `anchorBone` | **#565** | 票上點名 **11 支**；連帶解開 126 份文件 | `spawnVfx.at` 加 `"bone"` ＋ `VfxSystem.play()` 接掛點解析 |
| **7** | **F 內容缺口** —— 光束打到底沒有爆炸 | **21 個** `spawnModelFx` site（15 支技能）**全部** `onArrive` 無 `spawnVfx` | **#607** | **15 支** | 純內容：技能 JSON 補一個 `onArrive.spawnVfx` |
| **8** | **A 缺機制** —— 緞帶／掛件沒有技能級消費端 | 緞帶孤兒 **45** ＋ `attachment@1` 只有 4 份 | #392 · #432 | **45 份緞帶 ＋ 原作 31 次自帶模型掛件** | 只有「綁在**模型**上」一條路，⛔ 沒有「這**支技能**放一條」 |
| **9** | **D 落在下架／變身態上** | 綁定表 **104 列**指向不存在的技能（**103 列**落在 `_legacy/`）；**30** 支技能住在進不去的形態上 | #566 · #552 · #599 | 回收 104 列 ＋ 30 支重複維護的技能 | 產生器的 key space 是**原作**，⛔ 不是出貨的 421 支 |
| **10** | **E 產生器擁有它** | `vfx-ability-art.json`（437 列）· `vfx-families.json`（312 列）· 90 支重製技能 | #384 · #378 · #427 | —（這是**改法約束**，不是缺口） | 手改會被 `generateAbilityArtContent.ts` / `batch1.py` 洗掉 |
| **11** | **B 缺資產** —— 15 位英雄掛替身骨架 | **15** 位（＋ sela/thorne 本尊 2） | #224 | **軸⑤在這 15 位身上整個做不出來** | 掛點會綁到 `champ.sela`/`champ.thorne`/`champ.skin.*` 的骨架 |
| **12** | **F 內容缺口** —— 特效文字 | **412 / 421** 支沒有 `floatingText` | #543（owner：「別忘了還有**特效文字**」） | **412**（實際該有的遠少於此，見 §4⑦） | 純內容 |

### ⭐ 這 12 條收斂成 **6 個原因類**，量如下

| 原因類 | 卡住的獨立項目數（去重後） | 佔比基準 |
|---|---:|---|
| **C 缺綁定**（機制與資產都在，沒接） | **343** 支技能（粒子）＋ **210** 支（音效）＋ **119** 支（方位） | 421 支技能 |
| **B 缺資產**（要美術／要抽取） | **582 / 638** 份 vfx 貼圖 ＋ **15** 位英雄骨架 ＋ 101 種暴雪內建模型（⛔ 永遠不能匯入 ⇒ 替代題） | 638 份 vfx |
| **A 缺機制**（引擎做不到） | 骨頭錨點（**126** 份文件）＋ 道具/狀態 vfx 欄位（**185** 份文件）＋ 技能級緞帶掛件（**45** 份） | — |
| **F 內容缺口**（機制在、內容沒寫） | `onArrive` 爆炸 **15** 支 ＋ 特效文字 **412** 支 ＋ 蝗蟲群剩 **7** 個原作特效 | — |
| **D 落在下架／變身態上** | **104** 列綁定 ＋ **30** 支技能 ＋ **89** 支要雙份維護的變身態技能 | — |
| **E 產生器擁有它** | **749** 列綁定住在兩份產生檔裡 ＋ 90 支 `batch1.py` 技能 | — |

---

## 3. ⭐ 建議的解鎖順序（按「解一次解幾支」）

⛔ 這一節只**建議**，沒有開票（gh 寫入是禁令）。

| 順位 | 做什麼 | 解幾支 | 為什麼排這裡 | 檔案領域（排並行 lane 用） |
|---:|---|---:|---|---|
| **1** | **原作粒子回填**（#529/#547） | **343** | ⭐ **零引擎改動**。已抽出的 `fx.w3x.*` 有 118 層而只綁了 12 層 —— 供給早就在了 | `content/config/vfx-ability-art.json` · `ability-vfx-bindings.json` · `tools/vfx-bind/` |
| **2** | **方位接線**（#377/#379） | **119** | schema 的 `orient` 早就有，出貨只有 2 份在用；改的是**產生器的預設**，⛔ 不是逐支技能 | `apps/client/scripts/gen-w3x-families.ts` · `content/vfx/fx.prim.*.json` |
| **3** | **技能音效綁定**（#554） | **210** | 從 JASS 的 `PlaySoundOnUnitBJ` 回推，做成**綁定表**（第〇·四守則） | `content/audio-manifests/` · `content/config/audio-map.json` |
| **4** | **道具／狀態效果的特效欄位**（⛔ 無票） | **185 份文件** | ⭐ 這是**唯一一個分子是 0 的軸**，而它擋住整個道具線 | `schema/item.ts` · `schema/statusEffect.ts` · `content/items/*.json` |
| **5** | **`spawnVfx` 骨頭錨點**（#565） | 11 支 ＋ **126** 份文件 | 唯一真的缺的大機制；126 份文件今天帶著一個讀不到的欄位 | `schema/effects/spawnVfx.ts` · `apps/client/src/render/vfx/VfxSystem` |
| **6** | **光束落點爆炸**（#607） | **15** | 純內容、當天做得完；owner 點名的四支經典砲擊「飛到底就消失」 | `content/abilities/*.json`（⚠️ 鏡射兩份） |
| **7** | **貼圖回填**（#65） | 582 份文件 | 量最大但**只是好看程度**，⛔ 不改變「有沒有演出」；且需要 MPQ 接線 | `tools/w3x-import/extract_particles.py` · `content/assets/textures/particles/wc3/` |
| **8** | **綁定表回收下架列**（#566） | 104 列 | ⭐ 它同時是一條**閘**：`refs.ts` 今天不檢查 config 裡的技能 key | `packages/shared/src/content/refs.ts` · 兩份產生器 |

---

## 4. 逐軸細節（量測基礎逐條標明）

### ① JASS 一次性特效

原作（`tools/vfx-census/CENSUS_5AXIS.json`，w3x 側不隨 GGD 內容變動）：

| | 數 |
|---|---:|
| `AddSpecialEffectLocBJ`（落點一次性） | 241 |
| `AddSpecialEffectTargetUnitBJ`（掛單位） | 316 |
| **合計呼叫點** | **557** |
| 相異模型 | 115 |
| └ 地圖自帶（`raw/` 有檔，⭐ 可用） | **14** |
| └ 暴雪內建（⛔ 授權，不會進 repo） | **101** |

GGD 側（今天量）：`fx.w3x.stock.warstompcaster.p00` 與 `fx.w3x.stock.thunderclapcaster.p00`
兩份已建立**且被消費**（#439 的動地跺是全 repo 引用第 1 名）。
⛔ 呼叫數前 3 名的 `blinktarget`(76) · `stampedemissiledeath`(26) · `impaletargetdust`(22)
在 GGD **一份文件都沒有**——但它們全是暴雪內建，⇒ ⭐ **那不是缺口，是替代題**（走 `fx.prim.*`）。

⚠️ **掛點名有 19 種原始寫法**（含錯字 `orgin`、尾空白 `chest `、`hand,right` / `handright`）
⇒ 任何逐字比對掛點名的程式都會**靜默漏掉**，正規化必須先做。

### ② 3D model 蝗蟲群 —— ⭐ 這一軸今天大幅前進

| | 08-22 | **08-23（今天量）** |
|---|---:|---:|
| 用 `spawnModelFx` 的技能 | 5 | **15** |
| effect site | — | **21** |
| `spawnVfx` | 22 | 27 |
| `spawnProjectile` | 22 | 22 |

15 支：`godie-e002.e` · `godie-e00l.e` · `godie-e00r.r` · `godie-h020.e` · `godie-hjai.e` ·
`godie-n003.r` · `godie-n01c.e` · `godie-n01g.r` · `godie-nbbc.e` · `godie-o00x.r` ·
`godie-ogrh.r` · `godie-u010.e` · `godie-u010.ex` · `godie-uvng.e` · `godie-uvng.ex`

⚠️ ⭐ **其中 4 支住在下架的變身態上**（`godie-h020.e` · `godie-n01c.e` · `godie-u010.e/.ex`）——
⛔ 但**不是白做**：逐支比對過，它們在 base 上都有同名的一份（`hjai.e` / `nbbc.e` / `uvng.e/.ex`
都在同一張清單上）。⇒ 成本是**雙份維護**，⛔ 不是成果消失。

⛔ **21 個 site 沒有一個的 `onArrive` 帶 `spawnVfx`**（#607，今天逐個 site 重量）：

| 技能 | `onArrive` 現況 |
|---|---|
| `godie-e002.e` / `godie-e00l.e` 20-03 約束與勝利之劍 | `screenShake` ⛔ 無視覺 |
| `godie-h020.e` / `godie-hjai.e` 04-03 龍破斬 | `damageArea` · `screenShake` ⛔ 無視覺 |
| `godie-ogrh.r` / `godie-o00x.r` 09-04 龜派氣功 | **空的** ⛔ |
| `godie-e00r.r` 59-04 野戰型陽電子砲 | **空的** ⛔ |
| 其餘 14 個 site | 全部 `[]` 或只有 `screenShake` |

### ③ 粒子特效

| | 今天量到 |
|---|---:|
| `vfx@1` 文件 | 584（總 643） |
| **有消費端** | **238** |
| ⛔ **孤兒** | **405**（63%） |

孤兒分佈（前綴）：`godie-*` 234 / 282 · `fx.fam.*` 68 / 79 · `fx.w3x.particle.*` 42 / 66 ·
`fx.w3x.orb.*` 33 / 40 · `fx.prim.*` 24 / 143 · `fx.w3x.locust.*` 3 / 12

⚠️ ⭐ **孤兒不等於壞掉** —— 分三種，只有第三種是缺口：
1. `fx.fam.*` / `fx.prim.*` 的**矩陣空格**（一個家族 × 多尺寸／色調，只挑了幾個）⇒ 備選
2. `fx.w3x.*.pNN` 的**同一個模型第 2～6 層**（綁定只挑了其中幾層）⇒ 設計
3. ⛔ **`godie-*` 234 份**：匯入模型的逐層粒子，**唯一消費端是 `config.ambient-vfx@1`**
   （「這個模型永遠帶著它」），⛔ **沒有「這支技能施放時放這一層」的路** ⇒ 真缺口，且屬 **A 缺機制**

技能側的綁定分佈（421 支）：

| 綁到哪 | 支數 | 可選英雄 | 變身態 | 下架 | 隱藏 |
|---|---:|---:|---:|---:|---:|
| `fx.prim.*` 通用原型 | **343** | 224 | 77 | 20 | 21 |
| `fx.w3x.*` 原作 | **24** | 15 | 5 | 4 | 0 |
| `godie-*` 模型層 | 5 | 3 | 0 | 2 | 0 |
| `fx.fam.*` | 2 | 2 | 0 | 0 | 0 |
| ⛔ 沒有 `vfxKey` | **36** | 24 | 6 | 4 | 2 |
| **`vfxKey` 指向不存在的文件** | **0** ⭐ | | | | |

⭐ **0 個 dangling `vfxKey`** —— 有綁的都畫得出來。問題是**綁的是通用原型**。

### ④ 拖曳緞帶 `ribbon@1`

55 份文件（49 份帶 `anchorBone`），走 `config.ambient-vfx@1` 綁定的 **10** 份 ⇒ 孤兒 45。
⭐ **它們不是壞掉的，是沒有第二個消費端**：只有「這個**模型**永遠帶著這條緞帶」一條路，
⛔ 沒有「這**支技能**施放時拉一條」、也沒有「這**把武器**揮動時拉一條」。
⇒ owner 逐字點名的「揍敵客拖曳緞帶」卡在這裡，而且 `godie-efur` 還掛在 `champ.sela` 骨架上（見⑤）。

### ⑤ 球體／掛件 `attachment@1`

| | 數 |
|---|---:|
| 原作掛件呼叫 | 316（`orb-ambient` 32 / `orb-timed` 284） |
| └ 用**地圖自帶模型**（⭐ 可以直接接） | **31** |
| GGD `attachment@1` 文件 | **4**（`attach.ex.midchilder-aura` · `attach.godie-e00x.awing` · `attach.godie-o00x.hands` · `attach.godie-u01u.poweraura`） |
| `config.ambient-vfx@1` 綁定的模型 | **22**（綁到 37 個 vfx id） |

⛔ **前置條件：17 位英雄掛在替身骨架上**（其中 2 位是 sela/thorne 本尊）——
掛點會綁到別人的骨架，軸⑤在他們身上**做不出來**：

`godie-e00r` 初號機（`champ.skin.rogue`）· `godie-efur` 揍敵客桀諾（`champ.sela`）·
`godie-e00s`/`godie-e010` 白木卡迪那 · `godie-h02k` 熊貓 · `godie-hapm` Berserker ·
`godie-n00b` 哆拉A夢 · `godie-o030`/`godie-orkn` 臭作 · `godie-ogld` 黑人牙膏 ·
`godie-u00k` 死之王 · `godie-ubal` 巴恩 · `godie-ucrl` 傑富力士 · `godie-udea` 飛鼠先生 ·
`godie-umal` 拳四郎
⚠️ owner 逐字點名的**初號機**與**揍敵客**都在這張表上。
⚠️ 71 位英雄只有 **43 個相異 `modelKey`**（46 位在共用 18 個模型，#224）。

### ⑥ 特效音效綁定

| 層 | 支數 | 是什麼 |
|---|---:|---|
| 逐支 `sfxKey` | **72** | 最具體 |
| per-ability family 覆寫帶音 | **17** | `vfx-families.json.abilities[id].soundLaunch/Impact` |
| 僅靠 family 預設音 | **122** | 21 個家族**全部**都有 `soundLaunch` |
| **合計 authored** | **211 / 421（50%）** | |
| ⛔ **零 authored** | **210** | |
| └ 有 `vfxKey` ⇒ 退到**元素 whoosh** | 175 | `castElementKey(vfxKey)` |
| └ 連 `vfxKey` 都沒有 ⇒ **通用 `abilityCast`** | **35** | 最糟的一格 |

⭐ ⛔ **不是無聲，是通用音**（`apps/client/src/audio/combatSfx.ts:594-596` 的三段 fallback）——
⚠️ **而那看起來跟「音效做好了」一模一樣**，這正是 #554 的重點。

其他量到的（都是綠的，⭐ 值得記一筆）：
- `audio-map.json` 的 sfx key **232** 個，**0 個**沒有被內容引用
- 技能的 `sfxKey` **0 個**指向 audio-map 裡不存在的 key
- ⛔ **`content/vfx/` 643 份文件裡，帶 `soundLaunch`/`soundImpact`/`soundLoop`/`soundDissipate` 的是 0 份**
  —— schema 有那四格（`vfx.ts:841-847`），出貨的音效住在 `vfx-families.json`：
  **21 個家族全部有 `soundLaunch`**，逐支覆寫 `soundLaunch` **91** 處 / `soundImpact` **23** 處 / `soundGain` 1 處。
  ⭐ 這是**刻意**的（一個住處），⛔ 不是缺口，但**任何掃 vfx 文件找音效的程式都會得到 0 而誤判**。

### ⑦ 特效文字

`floatingText` effect：技能 **9 支**（`godie-e002.e` · `godie-e002.ex` · `godie-e00l.e` ·
`godie-e00l.ex` · `godie-h020.e` · `godie-hart.r` · `godie-hjai.e` · `godie-n003.r` ·
`godie-n01g.r`）· 道具 **0 件**。

⚠️ ⭐ **分母不該是 421** —— owner 在 #543 點名「別忘了還有**特效文字**」是接在三支驗收技能後面的，
⇒ 合理的分母是「**演出型**技能」而不是全部。⛔ 但我量不到「哪些技能應該有特效文字」——
那是一個設計判斷，⛔ 不是資料。**這裡只報事實：9 / 421，而且 9 支正好覆蓋三支驗收技能的兩對鏡射。**

### ⑧ 骨頭錨點 —— ⛔ 引擎做不到（唯一一個「機制缺席」的軸）

| | |
|---|---:|
| `spawnVfx.at` 的列舉 | `["self","target","point"]` ⛔ **沒有 `bone`** |
| 讀 `anchorBone` 的程式 | 只有 `AmbientVfx.ts`（常駐通道）· `W3xEmitterRig` · `WhirlwindFx` |
| `content/vfx/` 帶 `anchorBone` 的文件 | **213** |
| └ `ribbon@1`（走 AmbientVfx，掛點**有效**） | 49 |
| └ `vfx@1` 且 `ambient:true`（掛點**有效**） | 38 |
| └ ⛔ **`vfx@1` 非 ambient —— 掛點被吃掉** | **126** |
| 　　└ 其中連消費端都沒有 | **125** |
| `vfx-families.json` 逐支 `anchor` 覆寫 | 62 處（其中 42 支對到現存技能） |

⭐ **`abilityVfx.ts` 的檔頭自己把後果寫下來了**（逐字）：
「把 `anchor` 開在這裡等於開一個寫了會被吃掉的欄位 —— 就是七種故障的第 ② 種」。
⇒ ⭐ 這是**第一·五守則**的形狀：126 份文件上有一格「說了但不會發生」的設定。
原作 285 次 timed 掛件全部是這個形狀（#565）。

---

## 5. ⛔ D 類細節 —— 落在下架／變身態上（今天量到三個獨立的洞）

### ① 綁定表 **104 列**指向不存在的技能

| | 數 |
|---|---:|
| `vfx-families.json.abilities` 指向不存在的技能 | **93** |
| `vfx-ability-art.json.bindings` 指向不存在的技能 | **103** |
| **去重後** | **104**（涉及 **38** 個英雄 id） |
| └ 那支技能只活在 `content/_legacy/` | **103** |
| └ ⛔ **哪裡都沒有** | **1**（`godie-e010.ex`） |

⭐ **根因**：`generateAbilityArtContent.ts` 的 `family` 格從 `MODEL_USAGE.json`（**原作 w3x 普查**）
推導 —— 它的 key space 是**原作的 rawcode**，⛔ 不是出貨的 421 支。
而 `prim` / `owner` / `promoted` 三格是「**保留是預設**」（GH#378 的正確教訓），
⇒ 死掉的 id 一旦寫進去就**永遠留著**。

⛔ **沒有任何閘會紅**：`refs.ts:162` 的註解逐字寫著「config docs are mostly parameter tables」——
config 裡的**技能 key** 不在 ref 圖上。（vfx **那一側**有閘：`vfxPromotedRefsResolve.test.ts`，GH#478。）
⇒ ⭐ **兩個方向只關了一個**：「綁到不存在的**特效**」會紅，「綁到不存在的**技能**」不會。

### ② **30 支技能**住在玩家永遠進不去的形態上

`roster.json` 的 `retiredChampions` 有 11 個 id，其中 5 個有技能文件：
`godie-e007`（6 支）· `godie-h020`（6）· `godie-h02u`（6）· `godie-n01c`（6）· `godie-u010`（6）。

⭐ **入口今天真的關上了**（第三守則：去驗了，⛔ 不是讀註解）：
`ChampionFormSystem.ts:204` — `if (world.retiredChampionIds.has(counterpart)) return undefined;`，
由 `MatchController.ts:1199` 從 `config.roster@1` 灌進去。
⚠️ `SimWorld.ts:1281` 那段「入口從來沒有被關過」是**在講這一格為什麼要存在**（2026-08-23 稽核的紀錄），
⛔ 不是現況 —— 現況就在同一個檔案下方的 `retiredChampionIds` 宣告。
⚠️ **但 `roster.json` 只是預設值**：線上若存過後台覆蓋層，實際名單以覆蓋層為準（⛔ 本輪沒有讀線上狀態）。

⭐ **但不是白做**：逐支比對過，30 支裡 **27 支**在 base 英雄身上有同名的一份，
只有 3 支是「base 同槽不同名」（`godie-e007.e` 12-03 · `godie-h02u.e` 92-03 · `godie-h02u.w` 92-02）。
⇒ 成本是**雙份維護**，⛔ 不是成果消失。

### ③ **89 支技能**住在**還活著**的變身態上 ⇒ 每一次特效改動要做兩份

20 個 `transform.role:"alternate"` 的英雄裡，**19 個**的 base 仍有 `championForm` 入口
（只有 `godie-e007` 沒有）。⇒ ⭐ 每一支變身態技能的特效改動都必須**鏡射到 base**，
⛔ 漏一邊就是「玩家在某一個形態下看不到」——而**兩邊各自都是綠的**。

⚠️ #599 量到「19 對裡 **15 對**的 3D model 完全一樣」⇒ 那 15 對的變身在**視覺上不存在**，
而它們讓整個特效工作量乘以 2。

---

## 6. ⚠️ 與 2026-08-22 那份普查的差異（⛔ 不是修正，是內容真的動了）

| 項 | 08-22 | **08-23** | 差 |
|---|---:|---:|---|
| `content/vfx/` 文件 | 584 | **643** | +59 |
| 用 `spawnModelFx` 的技能 | 5 | **15** | **+10** ⭐ |
| `attachment@1` | 3 | **4** | +1 |
| vfx 孤兒 | 373 | **405** | +32（分母也長了） |
| 有 `vfxKey` 的技能 | 384 | **385** | +1 |
| 綁 `fx.w3x.*` 原作 | 24 | **24** | 0 ⛔ |
| 逐支 `sfxKey` | 72 | **72** | 0 ⛔ |
| `orient.yawFrom:"aim"` | 2 | **2** | 0 ⛔ |
| `wc3/` 真貼圖 PNG | 8 | **8** | 0 ⛔ |

⇒ ⭐ **動的只有軸②（3D model）。** 其餘四條（原作粒子、音效、方位、貼圖）在 24 小時內**一格都沒動**——
而它們正好是「解一次解 100+ 支」的那四條。

---

## 7. ⛔ 量不到的（⛔ 我沒有編數字）

| 問題 | 為什麼量不到 |
|---|---|
| 「道具 89 上架 / 53 關著」 | ⛔ **重現不出來**。`content/items/` 是 **142** 件，`draftEligible:false` **0** 件，`cost==0` 93 件 / `cost>0` 49 件，loot-table 引用 84 件 —— 沒有一個切法給出 89/53。⭐ 142 = 89+53 成立，但那個分界住在哪裡我查不到（可能在後台耐久覆蓋層，而那是線上狀態） |
| 「哪些技能**應該**有特效文字」 | 那是設計判斷，⛔ 不是資料。只能報 9 / 421 |
| 「玩家實際看到的特效好不好看」 | 需要跑起來截圖比對；本輪是唯讀靜態盤點 |
| 每一類「解一次解幾支」的**工時** | ⛔ 沒有可引用的量測基礎 |
| 線上後台是否已存過 override 蓋掉 `content/config/` | ⛔ 沒有讀線上狀態（唯讀規範允許，但那是營運狀態不是內容事實） |

---

## 8. 並行批次建議（檔案級柵欄，⛔ 不是目錄級）

| 批次 | 對應順位 | 獨佔的檔案 | 為什麼不能與別批同時跑 |
|---|---|---|---|
| **A** | 1 ＋ 2（原作粒子回填 ＋ 方位） | `content/config/vfx-ability-art.json` · `ability-vfx-bindings.json` · `content/vfx/fx.*.json` · `apps/client/scripts/gen-w3x-families.ts` | ⛔ **這兩票不可以分開** —— 都在改「這支技能指到哪一份 vfx」 |
| **B** | 6（`onArrive` 爆炸） | `content/abilities/*.json`（⚠️ 鏡射兩份） | 唯一會大量改技能 JSON 的一條 ⇒ 獨佔 `content/abilities/` |
| **C** | 4 ＋ 5（道具/狀態 vfx 欄位 ＋ 骨頭錨點） | `schema/item.ts` · `schema/statusEffect.ts` · `schema/effects/spawnVfx.ts` · `apps/client/src/render/vfx/` | 唯一動 schema 的一條。⚠️ 內容側接線要等 B 收工 |
| **D** | 3（音效綁定） | `content/audio-manifests/` · `content/config/audio-map.json` · `tools/` | ⛔ 完全不碰 `content/vfx/` |
| **E** | 8（回收下架列 ＋ 補閘） | `packages/shared/src/content/refs.ts` · 兩份產生器 | 它會**改到 A 的產物**，⇒ ⛔ 必須在 A 之後 |

⛔ **兩個結構性序列點**（加速不了）：
1. `pnpm skills:sync` 寫 `bundle.json` ⇒ 全域只能有一條工作流跑，主 session 最後統一跑一次。
2. 新增 `content/config/*.json` 會逼著動 `apps/admin/src/store.ts` 與 `ui/App.tsx` **各一行**
   （`configDocCoverage.test.ts`）—— 那兩行是**已知唯一真正共用的檔**，一律由主 session 接。

---

## 9. 量測方法（可重跑，⛔ 唯讀）

```
/private/tmp/ggd-vfx/measure.py    # 8 軸 + 道具 + 狀態效果
/private/tmp/ggd-vfx/crosstab.py   # 每一軸 × 英雄上架狀態的交叉表
```

- 「有消費端」的定義是**消費路徑**（12 個內容集合 ＋ `content/config/*.json`，
  ⛔ 排除 `docs/` · `bundle.json` · `manifest.json` · `_index.json` ·
  `ability-vfx-bindings.unmatched[]`）——⛔ 不是「字串出現在某個檔裡」。
- 英雄上架狀態＝`content/config/roster.json` 的 `retiredChampions` / `hiddenChampions`
  ＋ 英雄卡的 `transform.role === "alternate"`，⛔ 不抄任何字面清單。
- 技能鏡射（`content/abilities/` ↔ 英雄卡內嵌）**逐欄比對過：`vfxKey` / `vfxLayers` /
  `sfxKey` / `persistentVfx` / effect kinds 全部 0 漂移**，284 對逐一比。
  ⇒ ⭐ 這一輪的所有數字用 standalone 那一份算，不會少算。

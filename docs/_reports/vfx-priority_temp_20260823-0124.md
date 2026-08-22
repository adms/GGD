# 三張 [優先] 特效票 —— #572 · #571 · #555

> lane 報告 · 2026-08-23 · 逐檔柵欄：`apps/client/src/vfx/**` · `apps/client/src/render/vfx/**` ·
> `content/{vfx,models}/**` · `content/config/*lightning*|*beam*.json` · `content/abilities/**` ·
> `packages/shared/src/content/schema/**`

---

## 摘要

| 票 | 狀態 | 一句話 |
|---|---|---|
| **#572** Lina 翔封界 | ⭐ **已經接上了（跑起來驗過）** | sim → snapshot → 客戶端渲染**四層全通**。缺的是**視覺提示**，⛔ 不是接線 |
| **#571** 閃電 | ⭐ **修好了** | 演算法早就在，**兩半被接到兩個不同的事件名上** ⇒ 整族閃電等於不存在。已補上消費端 + 重抖 + 貼圖 + 兩端輝光 |
| **#555** 橫躺 beam | ⭐ **矛盾查清楚了** | 「0 支」與「一堆」**都是對的** —— 它們數的是**兩個不同的通道** |

---

# 1 · #572 —— 翔封界 **沒有沒接上**，四層我逐層跑起來驗過

owner 問了兩次「不是已經做好 怎麼還沒接上？」。答案是：**它接上了**，而且每一層都有守衛。

## 1.1 逐層追蹤（⛔ 不是 grep 到字串就算，失敗形態⑥）

| 層 | 落點 | 證據 |
|---|---|---|
| ① 內容 | `content/abilities/godie-h020.passive.json` · `godie-hjai.passive.json` | 兩份都帶 `passive.ranks[0].flight = { hoverHeight: 0.45, ignoreUnits, ignoreObstacles, stayInsideBoundary }` |
| ② 引用 | `content/champions/godie-hjai.json:402` `passiveAbility` | ⭐ **`godie-hjai` 是本體且在白名單上**（`starter.go:322`）；`godie-h020` 是 04-002 惡夢魔王碎片的**變身態**（#552 下架的那一格）。⇒ ⭐ **#552 沒有把成果下架掉**，兩份文件都帶著同一個 grant |
| ③ 授予 | `sim/abilities/abilityPassives.ts::rankBlock` | `!hasSourceGrant(block)` 那一段明文放行「`modifiers` 空但有 `flight`」的 source |
| ④ 引擎 | `sim/flight.ts::flightSystem` → `world.flight` | `SimWorld.step` slot 1d；`movement/wallBlock.ts` 讀 `flightIgnoresObstacles` |
| ⑤ 上線 | `apps/game-server/src/net/snapshot.ts:620` | `es.h = air ? air.y : flightHoverHeight(world, id)` |
| ⑥ 客戶端 | `GameApp.ts:2258` `e.h = es.h` → `EntityViewRegistry.ts:987` `view.setPose(..., pose.h ?? e.h ?? 0, ...)` → `ChampionView.applyAirborne()` | `glbRoot.position.y = leapY + groundOffsetY*growthFactor`，而 `applyAirborne()` 是**每幀無條件**跑的（⛔ 不是只在 `airborne === true` 時） |

## 1.2 跑起來的證據

```
npx vitest run packages/shared/src/sim/laneB.innates.test.ts -t "翔封界"
✓ 4 passed  ——「is flying from spawn」(h020 + hjai 兩份各一)、
             「walks THROUGH a body instead of being shoved off it」、
             「IS STILL CLAMPED TO THE ARENA」
```

## 1.3 ⇒ 那 owner 看到的是什麼？

⭐ **翔封界身上一個特效都沒有。** 它的全部視覺 = 模型抬高 **0.45 單位** ＋ 影子縮小一點。

- ⛔ 沒有懸浮光環、沒有羽翼、沒有腳下的塵土消失、沒有任何狀態圖示。
- ⇒ 在畫面上「永久飛行」與「走路」**幾乎分辨不出來**，而玩家唯一能觀察到的差別是
  「她穿過了柱子」—— 那要剛好走到柱子上才看得到。

⭐ **建議（⛔ 我沒有做，因為它是一個沒有人指定過的設計選擇）**：
給 `flight` 授予一格**視覺**（懸浮光環／腳下無塵／狀態圖示），落 `content/config/` 或
`status-effects/`。⛔ 不要我挑 —— 這是「玩家看得見的取捨」，第一守則說列成欄位或問 owner。

---

# 2 · #571 —— ⭐ 根因：**兩半被接到兩個不同的事件名上**

## 2.1 owner 是對的，而且原因不是「沒有演算法」

演算法**早就寫好了**，而且寫得很完整：

| 檔 | 有什麼 |
|---|---|
| `apps/client/src/vfx/arcBolt.ts` | 鋸齒折線（中點位移 + `sin(πt)` taper 讓兩端精確）· 分岔 · 決定性雜湊（⛔ 不是 `Math.random`）· 顏色 ramp · 一整張參數表 |
| `apps/client/src/vfx/ArcBoltFx.ts` | 池化 ribbon · 加法混合 · 回合邊界回收 · 硬上限 32 |
| `packages/shared/src/sim/effects/chainLightning.ts:292` | `world.emit("chainLightning", { segments: [{x,z,x2,z2}] })`，**逐跳一則** |
| `apps/game-server/src/net/eventFanout.ts:138` | `"chainLightning"` 在白名單上，⭐ 真的過線 |

⭐ **而客戶端唯一的入口是 `case "vfxArc"`，全 repo 沒有任何東西發過 `vfxArc`。**

```
grep -rn "vfxArc" apps/ packages/  ⇒  只有 VfxSystem 的那個 case + 它自己的測試
grep -rn "chainLightning" apps/client/src/  ⇒  0 筆
```

⚠️ 這件事**寫在原始碼裡**（`eventFanout.ts` 的註解，逐字）：

> ⚠️ **客戶端目前還沒有這個 case**（`vfx/VfxSystem.handleEvent`）—— 見 GH#451 的
> nextRound：先把資料送到，渲染是下一輪的事。

⇒ 那個「下一輪」沒有發生，而**每一條既有的守衛都是綠的**（失敗形態②的教科書形狀：
sim 綠、fanout 綠、渲染器自己的測試綠 —— 只有它們的**組合**是空的）。

## 2.2 owner 點名的三支，逐支現況

| 點名 | 是誰 | 走哪條路 | 修好了嗎 |
|---|---|---|---|
| **皮卡丘** | `godie-o00k` 傲嬌電氣老鼠-皮卡娘 · **86-04 打雷絕招** | `chainLightning` | ⭐ **是** |
| **飛鼠先生** | `godie-udea` 至尊學長-飛鼠先生 · **65-04 天譴** | `chainLightning` | ⭐ **是** |
| **雷神之槌** | `content/items/godie-i01i.json`「雷神之鎚」 | ⛔ **`damageArea`，根本沒有任何弧** | ⛔ **否 —— 見 2.5** |

⚠️ 另外兩位**也叫皮卡丘**（`godie-o02l` 神騎寶貝 · `godie-ofar` 神奇寶貝兒），它們的
**58-002 打雷絕招**走的是**粒子**那條路（`vfxKey: fx.prim.lightning.beam-lg / pulse-lg`），
⛔ 不是 `chainLightning` ⇒ **這一版沒有變** —— 見 2.5。

## 2.3 做了什麼（三層，逐層對應 owner 的參考圖）

### ① 消費端（⭐ 承重的那一行）
`apps/client/src/vfx/VfxSystem.ts` 新增 `case "chainLightning"`：逐段呼叫 `strikeArc`。
⛔ 這裡不排任何時序 —— sim 是**每一跳一則事件**，間隔由 `jumpIntervalSec` 決定（第〇·五守則）。
種子 = `tick*131 + caster*17 + 段序`（決定性，⛔ 不是 `Math.random`，重播長出同一條）。

### ② 折線**每幀重算** ——「它真的在抖」
`arcBolt.ts` 加 `rejitterHz`（出貨 30 Hz）＋純函數 `arcRejitterStep(spec, ageMs)`；
`ArcBoltFx.update()` 每跨過一格時間窗就用 `seed + step` 重算整條折線。
⭐ **兩端不動**：`buildArcPath` 的 taper 在 i=0/n 歸零 ⇒ 弧仍然釘在施法者與目標身上。
⚠️ 在此之前折線是**出生時算一次就定住**的 —— 一條畫好的亮線，⛔ 不是電。

### ③ 沿線發光**貼圖** ＋ 兩端輝光
- `arcGlowRamp(size, coreT)`（純函數，回傳位元組）→ `ArcBoltFx` 建一份**池子共用**的
  `RawTexture`（1 × 32 RGBA），同時掛 `emissiveTexture`（白熱核心的 RGB）＋
  `opacityTexture`（兩緣的柔邊）。
  ⚠️ `RawTexture` ⛔ 不是 `DynamicTexture` —— 後者要 2D canvas，headless 沒有。
  ⚠️ 兩個插槽都要：加法混合只有 alpha 那一路縮得動亮度，少了 `opacityTexture` 邊緣仍然是硬的。
- **兩端爆點輝光**：每一跳的**落點**放一顆 `layeredPop(..., "light", lightning)`。
  ⭐ 只打落點端是刻意的：第 N 跳的起點就是第 N−1 跳的終點 ⇒ **每一個節點都會亮**，
  整條鏈唯一沒有輝光的是施法者自己，而那裡本來就有施法特效。
  ⛔ 兩端各放一顆 = 每節點兩顆 HitSpark，而一次施放最多 320 跳。

⭐ 全部素材**程序生成**，⛔ 沒有下載任何外部貼圖（版權）。

## 2.4 守衛與突變

`apps/client/src/vfx/chainLightningArc.test.ts`（136 行 / 實作 243 行 = **0.56×**）

| 斷言 | 驗什麼 |
|---|---|
| ① | 一則真的 `chainLightning` payload ⇒ 場上真的有一條 ribbon，**而且**它的第一/最後一個折線節點（左右兩條 path 的中點）**逐位元**落在 from/to 上 |
| ② | `fx.update()` 跨過一格重抖窗之後，**整個頂點陣列不相等**（＝在抖），**而兩端仍然逐位元不動** |

⛔ 沒有任何斷言抄出貨數值：重抖窗從 `ARC_BOLT_TUNING.rejitterHz` 推導。

**突變驗證**（一批一條，挑承重的）：把 `case "chainLightning"` 裡的 `this.strikeArc(...)`
換成 `void base;` → **兩條都紅**（「沒有任何弧 = 事件沒有消費端」）。改回來。

**回歸**：`npx vitest run apps/client/src/vfx apps/client/src/render/vfx`
→ **100 檔 / 883 條全綠**。`pnpm typecheck` → **EXIT=0**。

## 2.5 ⛔ 我**沒有**做的兩件，與為什麼

| 沒做 | 為什麼 |
|---|---|
| **後台旋鈕**（`rejitterHz` / `glowCoreT` / 段數 / 抖動幅度…落 `content/config/`） | ⭐ 新增一份 `content/config/*.json` **一定**要動 `apps/admin/src/{configForms,configDocCoverage,store,ui/App}.ts`（`configDocCoverage.test.ts` 的封閉豁免表 + 列數釘死），而 **`apps/admin/**` 不在這條 lane 的柵欄裡**。⭐ 落地路徑 `arcBolt.ts` 的檔頭已經寫好了：「加一格 schema 欄位然後把它折進 `arcBoltSpec` 的 `opts` 即可，⛔ 不必動 `ArcBoltFx`」。⇒ **這是 #571 唯一還開著的一項。** |
| **雷神之鎚 + 兩位皮卡丘的 EX 補上閃電** | 兩者都不走 `chainLightning`：前者是 `damageArea`（`content/items/**`，柵欄外），後者是粒子路（`fx.prim.lightning.beam-lg` = 32 顆 stretched 粒子的錐，讀起來是「一束光條」⛔ 不是閃電）。⭐ 要讓**元素 = lightning 的施法自動拉一道弧**是一個**決策**（哪些 castType 要、要不要開關），第一守則說它該是一格欄位 ⇒ ⛔ 我不替 owner 挑。**建議開子票。** |

---

# 3 · #555 —— ⭐「0 支」與「一堆」**都是對的**，它們數的是兩個不同的通道

## 3.1 量到的（⛔ 不是推的）

```
content/abilities/*.json 逐份走訪
  vfxKey 前綴分佈：fx.prim 354 · fx.w3x 33 · fx.fam 12 · 其餘逐份 id 若干
  含 "beam" 的 vfxKey：49 個，⭐ 全部在 fx.prim / fx.fam 底下，fx.w3x 底下 0 個
  含 modelKey 的節點（= spawnModelFx「翻滾光束」那條路）：16 個 / 7 個 modelKey / ⭐ 只有 5 支技能
```

| 通道 | 姿態由誰決定 | 人口 | 現況 |
|---|---|---|---|
| **模型**（`spawnModelFx` → `model@1.fxLongAxis`） | #555 的新欄位 | ⭐ **5 支技能 / 7 個 modelKey** | 2 份已宣告（`netherstrike` y · `fireblast` x），4 份**不該**宣告（z 是恆等變換 · `darkraor` 長寬只差 1% 是方塊 · `blackhole` 沒有網格），1 份量不到 ⇒ **鋪設完成** |
| **粒子**（`vfxKey` → `vfx@1.orient` 家族推導） | GH#379/#394 | ⭐ **49 個 beam key，散在幾十支技能上** | `vfx-families.json` 出貨 `beamPitchDeg: 0`（**完全橫放**）＋ 仰角 ≠ 90 ⇒ `familyOrient.ts:223` 自動注入 `yawFrom: "aim"` ⇒ **已經是躺平且朝目標的** |

## 3.2 ⇒ 矛盾的解

- **前一條 lane 的「0 支」** 回答的是：「還有沒有**別的模型**要填 `fxLongAxis`？」→ **沒有，而且是好消息**。
  ⭐ 它是對的，但它只涵蓋 **5 支技能**。
- **owner 的「一堆英雄技能都有」** 講的是**另一群**：那 49 個 beam key 背後的幾十支技能。
  ⭐ 他也是對的 —— 而那一群**已經**是 90 度橫放了（`beamPitchDeg: 0`），
  所以他看到的**不是**「beam 站起來了」。

## 3.3 ⭐ 那他要的是什麼？——**「快點先上特效模板吧」**

把整句讀完：「翔滾光束應該包含 90 度橫放的 beam 吧 **一堆英雄技能都有** 快點先上**特效模板**吧」

⇒ ⭐ **他要的是一個可以被引用的「翻滾橫放光束」模板**，⛔ 不是「去 45 支技能各填一格」。

**今天的實況**：想要一道**翻滾的橫躺光柱**，作者只能**手寫**一個 `modelFx` 節點
（`modelKey` + `spinDegPerSec` + 那份模型要先有 `fxLongAxis`）——
⭐ 全 repo **只有 5 支技能**做過這件事，而且**每一支都是逐支手寫的**：

| 技能 | modelKey | spinDegPerSec |
|---|---|---|
| 20-03 約束與勝利之劍（`godie-e002.e` / `e00l.e`） | `imported.netherstrike` | 720 |
| 04-03 龍破斬（`godie-h020.e` / `hjai.e`） | `imported.fireblast` | 360 |
| 42-04 世界終結（`godie-n01g.r`） | `imported.frostnova` | 180 |
| 38-03 邪王炎殺黑龍波（`godie-u010.e` / `uvng.e`） | `darkraor` + `blackhole` + `tectonicfury` | 240 / 720 / — |
| 38-002 究極暴走黑龍波（`godie-u010.ex` / `uvng.ex`） | `darkraor` + `blackhole` | 240 / 720 |

⭐ **這正是第零守則⑨的反面標記**（N 個同型 = K 個模板 + 一張表）：五份幾乎一樣的手寫節點。

## 3.4 ⛔ 我沒有做，與落地路徑

模板要嘛住 `content/config/vfx-families.json` 的 `families` 表（**多一列 `beamRoll`**），
要嘛住 `packages/shared/src/content/templates/expand.ts` —— ⭐ **兩者都在這條 lane 的柵欄外**
（`content/config/*lightning*|*beam*.json` 對不上 `vfx-families.json`；`templates/` 不在允許清單）。

⭐ **建議的一列**（一張表，⛔ 不是五段手寫）：
`families.beamRoll = { primitive: "beam", element: <逐支填>, spinDegPerSec: <逐支填>, … }`，
姿態由 `model@1.fxLongAxis` 決定（已經是逐模型的性質了），
於是「一堆英雄技能」各自只要引用一個家族名。

## 3.5 ⚠️ 順手發現（⛔ 沒修，柵欄外，建議開票）

`tools/beam-orient/scan.py --write` 的跳過條件**沒有**「長軸接近平手就不要提案」那一條，
而 `AMBIGUOUS_RATIO = 1.20` 這個數字已經算好、只印在表上。
⇒ 今天照 README 跑 `--write`，它會替 `imported.darkraor`（長寬只差 **1%**）寫上
`fxLongAxis: "x"`，而那份模型被 **4 支技能**引用。一行修法：`cmd_write()` 的跳過條件
加上 `or row.get("ambiguous")`。
（⚠️ 這一條前一條 lane 也記過 —— 兩條 lane 各自量到同一件事，代表它是真的。）

---

# 4 · 收尾

| | |
|---|---|
| **改到的檔** | `apps/client/src/vfx/arcBolt.ts` · `ArcBoltFx.ts` · `VfxSystem.ts` · `chainLightningArc.test.ts`（新） |
| **⛔ 沒有跑** | `pnpm skills:sync` / `pnpm content:build`（全域鎖，主 session 收尾統一跑）。⭐ 這一版**沒有動 `content/`**，所以 bundle 不會過期 |
| **測試** | `vitest` 3 次（新守衛+既有 → 全 vfx 回歸 → 突變）· `typecheck` 1 次 |
| **實作 / 測試** | 243 / 136 = **0.56×**（靈魂層上限 1.0×） |

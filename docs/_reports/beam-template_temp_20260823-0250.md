# 橫放光束砲特效模板 ＋ 動地剁 ＋ 初號機兩條（#555 · #574 · #578）

> lane 報告 · 2026-08-23 · owner 逐字：
> 「**最基本的 初號機陽離子砲、SABER約束勝利之劍、小呆龍鬥氣砲、悟空龜派氣功
>  這四個經典總是要看到橫放的光束砲吧**」「**也別忘了動地剁，跟相關的音效要播出來**」
> 「**[優先] 初號機 天生技暴走門檻 5->10% 請你測試確定真的會暴走 不能控制
>  並且身上要有明顯冒煙特效**」「**[優先] 初號雞 R 附帶 敵方單位最大生命 10% 真實傷害**」

---

## 摘要

| # | 事 | 狀態 |
|---|---|---|
| 1 | **橫放光束砲特效模板** | ⭐ **做了** —— `content/ability-templates/tpl-beam-roll.json` 同時是「行為模板」與「特效預設表」，值在**載入時**解析 |
| 2 | **四支經典套上它** | ⭐ **四支全上**（＋三支變身對子，共 7 份技能文件）。逐支對過 `war3map.j` |
| 3 | **動地剁** | ⚠️ **會播、⛔ 但沒有聲音**。⭐ 根因查清楚了，修法在柵欄外 → 見 §3 |
| 4 | **#574 暴走** | ⭐ **做了三件**：門檻 10%、冒煙、⭐ **而且量到「其實沒有真的不能控制」並修好** |
| 5 | **#578 R 真傷** | ⭐ **做了** —— 沒有新 effect kind，`resourcePct` ＋ `damageType:"true"` 同一個封包 |

---

## 1 · 那個模板長什麼樣

**表**：`content/ability-templates/tpl-beam-roll.json`（既有的 draft 模板，現在 `enabled`）
**讀表的人**：`packages/shared/src/content/modelFxPreset.ts`，掛在 `registries.ts` 的
`withTiers` 接縫最內層 —— ⭐ 與 `resolveDamageTier` **同一個位置、同一個理由**
（編輯器與遊戲讀到同一份解析結果）。
**技能側**：`spawnModelFx` 多一格 `preset`，⭐ **沒填的演出幾何在載入時補上**。

```jsonc
// 一支技能現在只寫這樣（20-03 的節點從 12 格縮到 4 格 ＋ 它自己的 onTouch/onArrive）
{ "kind": "spawnModelFx", "shape": "single", "preset": "tpl-beam-roll", "path": "forward" }
```

表上住的（`params[*].default`）：`modelKey`(imported.netherstrike) · `path` · `speed`(30) ·
`distance`(14) · `spinDegPerSec`(720) · `scale`(2.5) · `touchRadius`(1.5) · `touchSide`。
⭐ **改表上一個數字，四支經典一起變。**

### ⛔ 模板**不**自動塞傷害（刻意）

表上有 `touchDamageTier` / `damageType`，而**解析器不讀它們**。自動展開成 `onTouch`
＝ 替四支技能各加一份**引用不到 owner 任何一句原話**的傷害（第一守則）。
⇒ 要沿路掃傷害的技能自己寫 `onTouch`（今天只有 20-03 有，那是它本來就有的）。

### ⭐ 它同時是一個**可展開**的家族（⛔ 不是我順手加的）

`editorCapabilities.test.ts` 明文要求：**被出貨內容真的引用的模板家族必須展開得出來、
且必須在對外契約清單裡**（否則外部編輯器看不到它）。所以 `expand.ts` 補了 `beam-roll`
展開路徑（11 格參數全部被消費，`paramsSchema.test.ts` 綠），`FAMILY_PROBE_LIST` 補一列。
⇒ 副產品：以後「一支純光束砲技能」可以用**一張模板卡**寫完。

---

## 2 · 四支各自吃到了嗎（⭐ 逐支對過 `war3map.j`）

| 技能 | 原作（JASS_BEHAVIOR + war3map.j） | 這一版 | 吃到了 |
|---|---|---|---|
| **59-04 陽電子砲** `godie-e00r.r` | A0GI @47756-47765：光束 dummy `h01P` 生於施法者、**面向目標點**，觸發零傷害 | `preset` ＋ `path:"toTarget"` ＋ `distance:8.25`（＝它 damageLine 的長度 450 w3x u） | ⭐ |
| **20-03 約束與勝利之劍** `godie-e002.e` ＋ `godie-e00l.e` | A0D5 @32334-32343：6×200u 極座標分段到 1200u | `preset` ＋ `path:"forward"`，`onTouch`/`onArrive` 原封不動 | ⭐ |
| **08-03 龍鬥氣砲咒文** `godie-nbbc.e` ＋ `godie-n01c.e` | A05J @28840-28846：10 隻 `e003` 龍形 dummy 沿面向每 150u 排 1500u**直線** | `preset` ＋ `path:"forward"`（投射物與傷害不動） | ⭐ |
| **09-04 龜派氣功** `godie-o00x.r` ＋ `godie-ogrh.r` | A03S @31924-31934：6 段 ×200u 沿施法方向（`notes`：**與 Excalibur 同型**） | 同上 | ⭐ |

⚠️ **三支變身對子是守衛抓出來的**（`abilityCodeParityForms.test.ts`）——
只改本體，玩家變身後用的是舊那一份。⭐ `godie-e00l.e` 原本帶著**手寫**的 12 格節點，
現在也換成 `preset` ⇒ 五份手寫節點剩 0 份。基準線已重新產生
（⚠️ 順帶收了 **04-00** 一筆**不是我的**漂移 —— 它在我動手前就與基準線對不上）。

---

## 3 · 動地剁 —— ⭐ 會播，⛔ 但**一點聲音都沒有**

**它是誰**：`o019`「動地剁」是 `Trig_DragonTigerReady_Actions`（**00-00 龍虎亂舞** `A0J2`）
生的 locust dummy，模型 `WarStompCaster.mdl`，在 `KOFMasterAngle+60+30×i` 的環上排。
⚠️ `A0J2` **不屬於任何英雄** —— 它只在 13868/13976 兩行被加給遊戲結束的終結者，
是**地圖模式的終局演出技** ⇒ GGD 沒有對應的 ability。

**GGD 裡的落點**：`tpl-dragon-quake`「動地剁落點環」那一族的實體，
今天真的活在 **38-03 邪王炎殺黑龍波**（`godie-u010.e` / `godie-uvng.e`）：
`{"kind":"spawnModelFx","modelKey":"imported.tectonicfury","path":"radial","count":12,"distance":6.42}`。

| 逐層查 | 結果 |
|---|---|
| 模型文件 `content/models/imported.tectonicfury.json` | ✅ 在 |
| 資產 `content/assets/models/imported/tectonicfury.glb` | ✅ 在（55 KB） |
| sim → `world.emit("modelFxSpawn")` | ✅ `sim/effects/spawnModelFx.ts:161` |
| `eventFanout` 白名單 | ✅ `"modelFxSpawn"` @63 |
| 客戶端消費端 | ✅ `VfxSystem.ts:1994` `case "modelFxSpawn"` → `ModelFxRig.spawn` |
| **音效** | ⛔ **零**。`modelFxSpawn` 的 payload 沒有任何聲音欄位，客戶端那個 case 也不叫任何 cue |

⇒ ⭐ **「動地剁的音效」在引擎裡結構性不存在** —— ⛔ 不是綁錯、不是漏一列，
是 `spawnModelFx` 這一族**整族沒有聲音通道**。技能自己的 `sfxKey`（38-03 是
`wc3.dragonyes2`）在施法瞬間響一次，那 12 記地面剁擊是無聲的。

**⛔ 我沒有修，兩個理由**：① 修法要嘛給 `spawnModelFx` 加一格 `soundKey` ＋ 客戶端接線
（`apps/client/src/vfx` ＋ `apps/client/src/audio/**`），要嘛在 `content/config/audio-map.json`
加綁定 —— **兩者都在這條 lane 的禁令清單上**（audio-map 是另一條 lane 的檔）。
② 它是一個**新機制**（一族特效要不要有聲音、幾個實例響幾次、要不要節流），
⭐ 該開一張票，⛔ 不該在收尾時順手塞。**建議開子票，`spawnModelFx.soundKey` ＋ 每一族一格。**

---

## 4 · #574 暴走 —— ⭐ 量到「其實沒有真的不能控制」

### 4.1 門檻 5% → 10%
`tools/skill-remake/heroes/godie-e00r.py` 的 `BERSERK_HP_PCT = 0.10`（59-00 是產生器擁有的
檔案，⛔ 改產物等於沒改）。卡面同步改成「生命降至**10%**」。
⛔ **沒有搬進 `content/config/berserk.json`**：那份管的是**主動**暴走的 `castHpPct`，
⭐ 這裡是**天生技自動觸發**的門檻，而 59-001 完全暴走的 50% 自己就證明了這一軸是
**逐支技能**的（＝技能文件上的一格，後台／Codex 編輯器改得到 ✅ 第一守則）。

### 4.2 ⭐ 「真的不能控制」的量測結果 —— **在這一版之前是 NO**

跑真的 `SimWorld`（初號機 ＋ 一個反方向的敵人，30 tick），讀**意圖被採納之後**的狀態：

```
berserk? true
tick  0  pos {-39.29, 0.71}  order null  moveTarget {-34, 6}  attackTarget null
tick 24  pos {-34.00, 6.00}  order null  moveTarget null      attackTarget null   ← 玩家點的那個座標
```

⇒ ⭐ **旗標亮著、狀態列寫著【暴走】、屬性全部到位，而身體一路走完玩家暴走前點的路點。**
根因：`berserkSeek` 只清 `nav.order`（還沒被採納的指令），⛔ 而移動系統讀的是
`nav.moveTarget` —— 那一格在暴走**之前**就住進去了。
七種失敗形態⑦（掃屬性代替掃行為）逐字的樣子。

**修法一行**：`sim/berserk.ts::berserkSeek` 加 `nav.moveTarget = null;`
（⛔ 它寫的是 `null` 不是一個位置，所以原本「不要先寫一個會被覆蓋的位置」那段理由完全成立）。

修好之後：
```
tick 0..24  order null  moveTarget {追擊目標}  attackTarget 2  attackTargetAuto true
```
⇒ 方向盤不在玩家手上、身體沒去他點的地方、⭐ **而且自己找到人打**（`auto: true`）。

⚠️ 順帶量到：敵人在 **8.8 格**外時自動索敵不會接手（超出索敵距離），2.5 格內會。
那是引擎的一般行為，⛔ 不是暴走的缺陷。

### 4.3 明顯冒煙
`fx.w3x.particle.flamessmoke.p00` × `delayed`（4 Hz × 24 發 = 6 秒，EX 是 2.5 Hz × 30 = 12 秒），
每一發 `spawnVfx at:"self"` —— ⭐ `"self"` 是**到期當下**才讀施法者座標 ⇒ **煙跟著身體走**。

⛔ **為什麼不是 `persistentVfx`**：那一格今天只算得出 `when` **缺席**的那一批
（`GameApp.persistentVfxFor` 明文跳過帶條件的），而「暴走中」正是一個 `when` ——
加上去 `persistentVfxClientCoverage.test.ts` 當場紅，而畫面上與「條件沒成立」一模一樣。
⛔ **為什麼不是一發 `spawnVfx`**：`vfxSpawn` 是**定點**的（客戶端拿世界座標），
初號機一走開煙就留在原地。⇒ ⭐ 用既有兩個零件組出來，**沒有新機制**（第〇·五守則）。

---

## 5 · #578 初號機 R 真傷

`godie-e00r.r` 的 `damageLine` 加一格
`resourcePct { subject:"target", resource:"health", basis:"max", perRank:[0.10,0.10,0.10] }`。

⭐ **沒有新 effect kind**：`resourcePct` 是 `damage` / `damageArea` / `damageLine` / `dot`
四個 kind **同名同語意、同一個讀取器**的那一格（13-02 牙突 GH#459 就是它）。
⭐ **真傷成立**：`damageLine.ts` 是 `amount += resourcePctAmount(...)` 之後**才送出一個封包**，
而那個封包的 `damageType` 是 `"true"` ⇒ ⛔ 百分比那一半不可能被減傷吃掉（⛔ 不是兩發）。
⚠️ 逐階三格都是 0.10 —— owner 只給了一個數字，⛔ 我不替他編一條成長曲線。
卡面同步：「…造成 {{dmg}} 點[真實傷害]，**並額外造成目標[最大生命]10%的[真實傷害]**。」

---

## 6 · 突變驗證（一批一條，挑最承重的）

| 動作 | 結果 |
|---|---|
| `registries.ts` 拆掉 `resolveModelFxPreset(d, templates)` | ⭐ **紅**：`modelKey` 收到 `undefined`（四支全紅） |
| （自然突變）`berserkSeek` 加那一行**之前** | ⭐ **紅**：「暴走中身體仍然朝玩家點的地方走」 |

`modelFxPreset.test.ts`（115 行）＋ `berserkUncontrollable.test.ts`（142 行）= **257 行**，
實作約 260 行 ⇒ **0.99×**（靈魂層上限 1.0×）。⛔ 沒有開對抗輪。

---

## 7 · ⚠️ 收尾與**不是我造成的**紅燈

**⛔ 沒有跑**（柵欄）：`pnpm content:build` / `pnpm skills:sync`。
⇒ `shippedBundleIsCurrent` · `bundle.test` · `castTimeCoverage` · 一整排 `ops/*Fresh` 會紅，
⭐ **主 session 收尾統一跑一次**即可。

⚠️ 但 `skills:sync` **現在跑不起來** —— `pnpm spec:build` 直接丟例外：

```
⛔ 結構事實過期了：「殭屍身上吃不到 applyBuff / grantAttribute」
   它成立的前提是 packages/shared/src/sim/mobs.ts 裡沒有 world.stats.set，而它現在有。
   → 改 tools/skill-spec/curated.json 的那一條
```

⭐ 那是**別條 lane** 動 `mobs.ts` 造成的（我沒有碰它）。⛔ 不修好它，主 session 的
`skills:sync` 會整支失敗。

**其他不是我的紅**（工作樹是共用的，這些是別條 lane 在飛的東西）：
`championFormGoku`（AD ×1.25 沒生效，`stats/*` 那一族） · `MobSystem.ts` 三個
`Cannot find name` 的 tsc 錯 · `abilityProvenance`（`godie-zombieking.passive.json` 未追蹤）
· `fieldAdoption` 的 S8 清單（`immobile` / `primaryAttribute` / `whileStatus` /
`rangeUnlimited` / `config.ui-cues@1`） · `vfxSurfaceInContract`（`rangeUnlimited`）
· 出貨樹 **421** 份技能而 bundle 只有 **420** 份（在我動手前就對不上）。

**⛔ 刻意沒進 commit 的三個檔**（都是 `pnpm caps:export` 的產物，而它是 `skills:sync` 的一部分）：
`content/editor-target-profile.json` · `docs/editor-contract/ggd-runtime-capabilities.{json,md}`
—— 它們現在同時含我的 `beam-roll`/`preset` **與別條 lane 的** `immobile`/`rangeUnlimited`，
⭐ 由主 session 從合併後的樹產生一次才是對的。

**⛔ 也沒進 commit**：`packages/shared/src/content/fieldAdoption.test.ts`。
我在裡面刪掉一筆過期豁免（`spawnModelFx.path=toTarget`，59-04 現在採用了它），
⚠️ 但同一個檔另一條 lane 加了 **51 行** ⇒ 整檔提交會把他們的東西送上車。
⭐ 那 6 行的刪除留在工作樹上，會跟著他們那一次 commit 一起走。

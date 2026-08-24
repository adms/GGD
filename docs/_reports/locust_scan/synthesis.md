# 蝗蟲群移植 —— 三掃描合成（synthesis · 2026-08-25 · GH#688）
> ⚠️ **一次性偵察紀錄（保留，⛔ 不刪）** —— 正式版是產生的：`docs/蝗蟲群對應表.md`＋`tools/locust-census/census.json`（`pnpm locust:build` / `pnpm locust:check`）。

輸入：同目錄 `units.md`(236 隻普查) · `mdl-params.md`(7 支 stock MDL) · `jass-sites.md`(644 生成點)。
引擎現況逐格讀自 `packages/shared/src/content/schema/effects/spawnModelFx.ts` ·
`schema/model.ts` · `apps/client/src/render/modelFxRig.ts` · `content/ability-templates/tpl-beam-roll.json`
（本 lane 唯讀，⛔ 引擎側一行都沒改）。

## 0. 換算常數（pilot 與 Phase 6 共用，全部有出貨先例可對）

| 原作 | GGD | 依據 |
|---|---|---|
| 距離 ÷100 | 世界單位 | 09-04 沿線 6×200=1200 ↔ 出貨 `range: 12`（`godie-ogrh.r.json`） |
| `SetUnitScalePercent` ÷100（**絕對值取代 usca**，⛔ 不是相乘） | `spawnModelFx.scale` | tpl-beam-roll 檔頭：「scale 預設 2.5 ＝ 原作的 250%」（owner 已出貨值） |
| w3u tint 0..255 ÷255 | `model@1.fxTint` 0..1 | `imported.blackhole` / `imported.darkraor` 兩份出貨 doc |
| `TriggerSleepAction(n)` | `lifeSec: n` ／ `delayed.delaySec` | tpl-beam-roll `lifeSec` 預設 2 ＝ 原作那個 sleep(2) |
| `SetUnitVertexColorBJ` 第 4 參數 t% | alpha = (100−t)×2.55 | ⛔ 引擎側**還沒有住處**（見缺口表 alpha 列） |

## 1. 缺口表 —— 原作五欄 × 引擎現況

| 欄 | 原作的住處（量到的） | 引擎已有機制 | 缺什麼（指名） |
|---|---|---|---|
| **model** | w3u `umdl`；236 隻 → 135 個不同 model；32 隻**刻意隱形**（`.mdl`/`none.mdl`/`collision.mdl`） | ✅ `spawnModelFx.modelKey` → `model@1` → glb；`preset` 可補 | ① **stock MPQ 模型零轉換**：ReviveHuman／FragDriller／FlameStrike1／MonsoonBoltTarget… 在 `content/models/` 一份都沒有（`extract_stock_vfx.py` 只抽 emitter，且 family＋refCount≥100 兩道門只放行過 warstomp／thunderclap）② 已轉的 `netherstrike.glb` **0 亮像素**（tpl-beam-roll 檔頭「還沒解決」段；閘 `modelFxStagingContract.test.ts` ⑥）③ **modelFx 通道不播 glb 動畫剪輯**——`modelFxRig.ts`／`modelFxPath.ts` 全檔 0 個 Animation 字串，`spinDegPerSec` 是唯一程序動作；而原作 dummy 的視覺一半住在 stand/birth/death 動畫裡 |
| **scale** | `usca` ＋ `SetUnitScalePercent`（絕對值取代，常帶等級公式如 250+15×lv） | ✅ `spawnModelFx.scale`(≤`MODEL_FX_MAX_SCALE`=20) × `model@1.scale`；`fxSpawnHeight` 隨 scale 走（#673-③）；250%→2.5 換算已出貨 | 等級相依 scale 不可表達（單一數字；09-04 原作 lv1–3 ＝ 2.65→2.95，出貨定格 2.5 是 owner 的裁決）——差 ±0.3，列出⛔ 不裁決 |
| **tint** | w3u `uclr/uclg/uclb`（**缺值＝繼承**，鏈：entry→base→UnitUI.slk）＋ JASS `SetUnitVertexColor` 覆寫 | ✅ `model@1.fxTint`（只乘 albedo，同一份 glb 要兩色＝兩份 doc）；「tint 有來源」閘逐份比對 `UNIT_TINTS.json` | ① **回填 2/129**（只有 blackhole／darkraor）vs 需求面 **133/236 非白**——資料全在 `UNIT_TINTS.json`，剩勞力不是機制 ② `OBJECTS.json` 過期（tint 白名單在 #263 之後；修＝重跑 `python3 tools/w3x-import/src_objects.py`，**要加的行數 0**；Phase 2/6 直接讀 `UNIT_TINTS.json` 不必等）③ per-cast 覆寫（57 個 JASS 呼叫點）無對應——多數 dummy 恆同色可併 doc，真正 per-cast 漸變（黑龍波 60→90%）其實是 alpha 題 |
| **alpha** | ⭐ **w3u 結構上沒有欄位**（`ucua` 全檔 0 次）——只存在 runtime：57 個 `SetUnitVertexColorBJ` 呼叫點 | ⛔ **全缺**：`model@1` 無 fxAlpha；`applyFxTint` 刻意不動 alpha；`spawnModelFx` 無 alpha 格 | ① 資料側：要**新開一支 JASS 掃描**（變數/GetLastCreatedUnit ← CreateUnit rawcode 回溯；⛔ 不是加 w3u 白名單行）② 引擎側：alpha 欄的住處要裁決——57 呼叫點是 per-cast runtime，貼原作該住 `spawnModelFx`（與 fxTint 住 model@1 的理由**相反**）；Phase 4 落地時附預設＋開關 ③ 連帶：stock 轉換要先過 alpha 病族關（`CartoonCloud`／`Dust5A`／`Clouds8x8Mod` 三張 LUMA-KEY 候補＋出生 alpha=0 的 segmentAlpha 病，見 mdl-params §8） |
| **時序** | `TriggerSleepAction` · `UnitApplyTimedLife` · `SetUnitTimeScalePercent` · `SetUnitAnimation` · **一次擺 N 具沿線** | ✅ `lifeSec`(≤30) · `delayed.delaySec` · `castTimeSec` · `path:"static"`＋anchor（#649） | ① **static 單具 vs N 具沿線**＝已知 #673-④（schema 明文 count 只給 radial/orbit）② 動畫 timeScale 無對應（排序表裡 9 個呼叫點；h008 的 15%＋KillUnit＝**凍結死亡動畫**是招牌用法）③ `SetUnitAnimation` 選段（13 個呼叫點）無對應——與「不播動畫」同根，一起解 |

⭐ 一句話版：**scale 與 tint 是「資料回填」問題（機制已在），model 與時序是「轉換管線＋兩個機制」問題（#673-④、動畫播放/timeScale），alpha 是唯一「兩側都空白」的欄。**

## 2. 落地順序 —— 按 JASS 生成點的前 10 個 rawcode（限普查集 236 隻）

⭐⭐ **先剔隱藏施法**：排序表前段被隱形 dummy 佔據——`hfoo`(49 支) + `ogru`(12) + `hkni`(4) 共 **65 支技能**的 dummy 模型是 `.mdl` 空字串＝**原作就看不見**，引擎對應物是已出貨的 `proxyCast`／效果系統本身 ⇒ **零視覺移植工作**。真正的視覺工作從 o00E 開始。

| # | rawcode | 擋幾支（不同 Trig fn） | 名 / model | scale · tint | 模型管線現況 | 建議 |
|---|---|--:|---|---|---|---|
| 1 | `hfoo` | 49 | 共用隱藏施法單位 / **隱形** | — | 不適用 | ⛔ 不移植（proxyCast 已覆蓋）；只需在交叉表標「hidden-caster」防止誤排 |
| 2 | `ogru` | 12 | 天譴 / **隱形**（82 隻族紅 tint 對它無意義） | 2.3 · [255,0,0] | 不適用 | 同上 |
| 3 | `o00E` | 9 | 打雷 / `MonsoonBoltTarget.mdl` | 10 · [255,0,0] | stock，未轉；同模型另有 o00G/o02M/n00N 共 5 隻 dummy 在用 | ⭐ **視覺移植第一順位**：一次轉換解 9+4+2+2 支；貼圖族未量（Monsoon 家族），轉前跑一次 mdl_dump |
| 4 | `oshm` | 5 | （殘影族）/ `ChaosOrcRange.mdl` | 1.4 · 白 | stock **單位**模型（geoset 皮，非粒子）；h019/o031 也用 | 走單位 mdx→glb 路線；殘影族可能更適合既有殘影機制，先對 JASS 確認用法 |
| 5 | `hkni` | 4 | 共用隱藏施法單位 / **隱形** | 3 · 白 | 不適用 | ⛔ 不移植 |
| 6 | `o00G` | 4 | avalon / `MonsoonBoltTarget.mdl` | 6 · [100,0,0] | 同 #3 一批 | 搭 #3 順車（同 glb＋一份深紅 fxTint doc） |
| 7 | `u018` | 4 | 安云衝刺 / `DarkPortalTarget.mdl` | 2 · 白 | stock，未轉；帶 anim×2 ＋ timeScale×1 呼叫 | 會撞「動畫播放」缺口——排在機制落地後 |
| 8 | `o011` | 3 | 大地之怒 / `RockChunks0.mdl` | 2.2 · [100,100,100] | **地圖內嵌**模型（無路徑前綴）＝既有 w3x-import glb 管線就能轉 | 便宜：走既有管線即可 |
| 9 | `h007` | 3 | 特效龜派 / `ReviveHuman.mdl` | 1.25(usca)→JASS 250+15lv% · 白 | stock，未轉；粒子貼圖**全安全**（形狀住 RGB） | ⭐ **pilot（見 §3）** |
| 10 | `h008` | 3 | 特效三號 / `FragDriller.mdl` | 2(usca)→JASS 350+15lv% · 白 | stock，未轉；死亡段爆焰 emitter，貼圖非 alpha 病 | pilot 的外層，同批做 |

（緊接在後、同為 3 支的視覺 dummy：`h00S` ReviveHuman·紅[255,100,100]（20-03，與 h007 同 glb 異色＝fxTint 設計的教科書案例）· `o002` ANsaTarget·紅 · `o00A` Roots·紅 · `o00Z` FlameStrikeTarget·紅 · `o01N` BlackHole1（glb 已轉）· `o01P` TornadoElemental。`u005–u01K` 那批 3 支的是**出兵觸發**不是特效 dummy，⛔ 不進這張表。）

## 3. Pilot 規格 —— 悟空 09-04 龜派氣功（可直接派 lane）

### 3a. 原作配方（`Trig_Turtle_Power_Actions` @ war3map.j:31896–31950，全部量到）

| 層 | 是什麼 | 參數 | GGD 換算 |
|---|---|---|---|
| 砲口閃 | `AddSpecialEffectLocBJ` ×2：NEDeathSmall ＋ NeutralBuildingExplosion，一次性 | 在 LocPoint3＝施法者前方 150 朝目標 | 前方 1.5 世界單位；對應 `vfxKey`/`spawnVfx` 一發 |
| **內層氣功波** | `h007` ×1（ReviveHuman.mdl，白） | scale (250+15×lv)% ＝ 2.65/2.80/2.95；facing＝施法者→目標角度；⛔ 無 timedLife、⛔ 無位移 | `spawnModelFx` static · scale 用模板 2.5（owner 已出貨值，⛔ 不自己改成 2.65） |
| **外層爆殼** | `h008` ×1（FragDriller.mdl，白）同點同向 | scale (350+15×lv)% ＝ 3.65–3.95；`SetUnitTimeScalePercent 15%` ＋ 立即 `KillUnit` ＝ **死亡動畫以 15% 速度凍播** | ⛔ 撞「動畫 timeScale」缺口，fallback 見 3c-③ |
| **沿線火柱×6** | `h006` ×6（FlameStrike1.mdl），i×200（i=1..6） | 每點半徑 400 傷害＋第二輪效果 | 沿線 2..12 世界單位、半徑 4 ——＝ **#673-④ 的形狀** |
| 收尾 | `TriggerSleepAction(2)` → 清場 | 2 秒 | `lifeSec: 2`（模板預設已是 2） |

### 3b. 出貨現況（`content/abilities/godie-ogrh.r.json`）

`spawnProjectile`(imported.wave.ki)＋`onHit` 傷害 ＋ `spawnModelFx`{shape:single, preset:tpl-beam-roll}＋`onArrive` 爆炸。
⇒ 模板補進來的 modelKey 是 **`imported.netherstrike`＝0 亮像素 glb**（模板檔頭自己標「還沒解決」）。
**「特效完全沒看到」的成分＝ ① modelKey 落在 0 像素模型 ② h008 外層整層不存在 ③ h006 沿線整層不存在。**
（tint 在這支**不是**成分：h007/h008/h006 原作全是白，`fxTint` 正確地不填。）

### 3c. 移植清單（逐項可派）

1. **轉 ReviveHuman → glb**：輸入 `war3.mpq`（repo 根目錄，`W3XArchive` 開得了——`extract_stock_vfx.py` 已走過這條路）；轉換走 `w3xlib/mdx.py`＋`gltf.py`。⭐ 貼圖 5 張全部「形狀住 RGB、alpha=255」＝ **不是 alpha 病族**，⛔ 不會重演 netherstrike 的軟刪除分支。⚠️ 螺旋星屑的繞旋位移住**骨架動畫**——glb 要帶動畫剪輯才有螺旋；modelFx 通道目前不播剪輯（缺口表 model-③），所以第一階段接受「星柱＋星屑但不繞旋」。產出：`content/assets/models/` 下新 glb ＋ `content/models/w3x.stock.revivehuman.json`（model@1：glbPath／scale／fxLongAxis 照 beam 族慣例；**fxTint 不填**＝白）。
2. **09-04 節點補身分格**：`godie-ogrh.r.json` 的 spawnModelFx 節點加 `modelKey:"w3x.stock.revivehuman"`——模板檔頭明文「modelKey 是身分不是幾何」＋閘 `modelFxStagingContract` ⑤，逐支寫在節點上是設計不是繞路。其餘格照舊吃模板（static·lifeSec 2·scale 2.5·soundKey）。⚠️ 同一份 glb 之後給 20-03 用時**另開** `w3x.stock.revivehuman-red.json`（fxTint [1,0.392,0.392]＝h00S 的 [255,100,100]÷255）——兩份 doc 是 fxTint 的設計本身，⛔ 不是重複。
3. **h008 外層**：正解要「死亡動畫 15% 凍播」＝ Phase 4 機制（動畫播放＋animTimeScale 一格）。**pilot fallback**：把 FragDriller 的死亡段爆焰 emitter（mdl-params §6：additive·Clouds8x8Fade 8×8·紅橙·rate 80·0.75s）轉成 vfx doc `fx.w3x.stock.fragdriller.p00`——emitter→doc 這條路 warstomp/thunderclap 已有兩份出貨前例——掛在施放當下 `spawnVfx`。⛔ 別忘了它被 `extract_stock_vfx.py` 的兩道門擋（family=None·refCount 5）：手寫這一份 doc 或給工具開單檔旁路，⛔ 不要為 pilot 降全域 floor（那是 owner 可見的決策）。
4. **h006 沿線×6**：被 #673-④ 擋（static 不收 count）。pilot **不做**這層——owner 2026-08-24 已裁決「光束砲原地開火，只有波飛出去」，現行 spawnProjectile＋onArrive 爆炸覆蓋「波」那一半；沿線火柱列入 Phase 4 落地 #673-④ 之後回補。
5. **驗收（Phase 5 閘）**：beam-audition 亮像素 A/B（`calibrate()` 先自證）＋ `vfxDocsBirthVisibility`。⚠️ ReviveHuman 星柱的 segmentAlpha 是 **[0,255,0]＝出生透明、中段 peak**（mdl-params §4）——轉出來的 doc 若只取 start alpha 就是「終生透明」病（閘①的病型），colorStops 要帶 peak。
6. **用詞紀律**：1–5 全部落地＋閘綠之前，回報一律「鏈路已接上，⛔ 未驗收」。

### 3d. pilot 會證明／不會證明什麼

| 證明 | 不證明 |
|---|---|
| stock MPQ→glb 這條路通（第一支） | 動畫剪輯播放（h008 正解、u018、o018 族）——Phase 4 |
| model@1 身分格逐支覆蓋模板的形狀 | #673-④ N 具沿線 |
| 同 glb 異色＝兩份 doc 的 fxTint 設計（與 20-03 h00S 對照） | alpha 欄（09-04 原作沒用到 alpha——57 呼叫點裡零個屬於它） |

## 4. 給 Phase 4 的機制排序（按擋住的支數，⛔ 不是按技能順序）

| 機制 | 擋住 | 依據 |
|---|---|---|
| stock mdx→glb 轉換管線（含 alpha 病族 LUMA-KEY 關卡） | 視覺 dummy 的大多數（135 個 model 裡 stock 佔絕大宗；地圖內嵌那批已有管線） | units.md §四 |
| 動畫剪輯播放＋timeScale 一格 | anim 13＋timeScale 9 呼叫點，含 h008/u018/o018/o01A 族 | jass-sites 排序表 |
| #673-④ static N 具沿線 | 四支光束砲的沿線層＋h006 型全部 | tpl-beam-roll 檔頭·jass-sites |
| alpha（JASS 掃描＋spawnModelFx 一格） | 57 呼叫點（黑龍波漸隱、幻影 50%、RoCreateUnit 50%） | units.md §三 |
| fxTint 回填（勞力，非機制） | 133/236 非白，資料已全在 `UNIT_TINTS.json` | units.md §二 |

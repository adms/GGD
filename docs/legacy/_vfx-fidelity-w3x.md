# VFX 對原 w3x 的忠實度總帳 (`_vfx-fidelity-w3x.md`)

> 驗收標準（原文）：「[技能戰鬥效果] 及 [球體/蝗蟲群/粒子特效] 要記得明確比照原 w3x 實作」。
> 這份文件的唯一目的，是把「現在到底差多遠、差在哪一層、哪些根本救不回來」講白。
>
> **產出日期** 2026-07-24 · **HEAD** `49dca64` · **本輪為唯讀**：除本檔外未寫入任何檔案，未動 `content/**`，未 commit。
> **本檔應該變成 live page**（[[ggd-reports-as-live-pages]]：結論要在 App 內即時算，不是靜態文件）。
> 目前先以 md 落地，是因為修復計畫本身還沒開工；第 5 節的 L0 完成後，這頁應改由 codex 動態渲染。

**資料來源（權威順序）**
1. `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.w3a` — 技能物件資料（**不是** `OBJECTS.json`，後者不含任何美術欄位）
2. `War3Patch.mpq` > `War3x.mpq` > `war3.mpq` 的 `Units\{Human,Orc,NightElf,Undead,Neutral,Common,Item,Campaign}AbilityFunc.txt` — **繼承來的原版美術**（1017 筆）。`AbilityData.slk` 95 欄裡**一個美術欄位都沒有**，別再找它
3. `raw/war3map.j` — 觸發器（JASS 勝過 tooltip，永遠）
4. `raw/war3map.w3u` / `raw/war3map.w3h` — dummy 單位模型/縮放/染色、buff 美術
5. 132 個 imported `.mdx` 的 chunk 級解析（PRE2 / RIBB）

方法由 1 個 method 階段 + 10 個切片（`index % 10 == 0..9`）獨立跑完，**10 個切片聯集 = 632 個 doc 全覆蓋**，彼此互為交叉驗證。

---

## 1. 誠實計分板

現況（實測）：`content/abilities/` 662 份 doc。

| 綁定狀態 | 數量 |
|---|---:|
| `vfxKey` = `fx.prim.*`（#123 的樣式化重建） | **585** |
| `vfxKey` 缺席 / null | **47** |
| `vfxKey` = 具名 `fx.*`（8 個 doc：firestorm / cinder-ward / barkskin / root-snare / thorn-lash / scorch-ring / ember-bolt-cast / bramble-burst） | 30 |

**先講最難聽的一句**：那 30 個具名 `fx.*` **也不是**原圖。`content/vfx/` 裡 436 份 doc，沒有一份帶 provenance 欄位、沒有一份字串裡出現 `mdx` 或 `imported`。所以在本輪之前，**662 個技能沒有任何一個綁到原地圖的真實美術**。

### 632 個在範圍內的 doc，分桶（10 切片實測聯集）

| 桶 | 數量 | 佔比 | 意思 |
|---|---:|---:|---|
| **A. 已經夠忠實，不要動** | **34** | 5% | 其中 12 個是「正確地留空」（Pillage / Invisibility / Evasion 這類原本就沒特效）。另 22 個是元素與形狀都對得上的（真 Frost Nova → `ice.nova`、真 Blink → `arcane.dash`、真 Cyclone → `wind.tornado`、真 Purge → `lightning.pulse`…） |
| **B. CONFIRMED，真實美術已完全查明，等重綁** | **446** | 71% | 模型路徑 / 附著骨 / 飛行物 / 閃電 id / dummy 生成全部有出處 |
| **C. CONFIRMED-NEGATIVE，原圖根本沒特效** | **110** | 17% | 現在的 `fx.prim.*` 是**憑空加上去的**。忠實的作法是設回 null，不是換個顏色 |
| **D. UNRESOLVED（機械性殘留）** | **24** | 4% | 早期切片在發現 `*AbilityFunc.txt` 之前跑完，繼承美術沒查。抽取器已存在，這是純執行工作，不是未知 |
| **E. UNRESOLVED（真的沒有來源）** | **18** | 3% | 合成 doc：`champ.thorne` / `champ.sela` / `U01Q 測試英雄` / `H02N 腦包英雄` / `E00U 十六夜Sakuya` 的空技能格。**地圖裡不存在這些技能，不可以編**。應刪或標記為 synthetic |

> 桶 B / C 的切分是 10 份獨立切片計數的加總，各切片會計口徑略有差異，誤差約 ±3%。桶 A / D / E 是逐筆點過的。

### 另外三個必須放在同一張計分板上的數字

| 事實 | 數量 |
|---|---:|
| **PRE2 粒子發射器 doc 已經抽好、已入庫、但沒有任何技能引用** | **228** 份（73 個模型）+ **54** 份 ribbon（31 個模型） |
| 引用它們的技能 doc | **3**（`godie-hvwd.r` / `godie-h01o.e` / `godie-e00x.r`），而且這 3 份**同時**還掛著矛盾的 `fx.prim.*` |
| 這 228 份 doc 使用真 WC3 貼圖的比例 | **0 / 228**。全部指向 `assets/textures/particles/*.png`（Kenney 風泛用圖），真 BLP 只抽出 8 張 |
| 本輪切片引用到的 **原版 Blizzard 特效模型**，倉庫裡存在的數量 | **0**。`data/blizzard-overlay/models/` 40 個 glb 全是**英雄單位**模型，沒有任何 `Abilities\Spells\*` |

**這第四行才是本次審計最大的單一結論**：把 632 個綁定全部修對之後，其中約 **380 個技能的真實美術仍然是一個倉庫裡不存在的 Blizzard `.mdl` 路徑**。#98 的空 glb 只有 13 個檔案；缺 Blizzard 原版特效是它的 30 倍規模，而且是授權問題（#81 / #116），不是轉檔問題。

---

## 2. 方法上必須寫進交接的 6 個訂正

跳過任何一條，答案就會錯，而且錯得看不出來。

| # | 訂正 | 後果 |
|---|---|---|
| M1 | `OBJECTS.json` 的 ability 紀錄只有 21 個 key，**沒有任何美術欄位**。美術只在 `war3map.w3a` 二進位裡 | 只讀 OBJECTS.json → 464 個帶美術的技能全部漏掉 |
| M2 | w3a 只存**覆寫**。沒覆寫 ≠ 沒特效，而是**繼承原版 base 的美術**，來源是 MPQ 內的 `*AbilityFunc.txt`（欄位拼法是 `Casterattach` / `Targetattach`，不是 `…attachment`） | 約 1/3 技能會被誤報成「沒特效」 |
| M3 | **buff 是第二條獨立美術通道**。`abuf`/`aeff` → `war3map.w3h`（228 筆）→ 沒覆寫則再繼承 stock buff。所有 passive / DoT / aura 的視覺**只**在這裡 | 被動技全部誤報成無特效 |
| M4 | JASS 沒有一次 `AddSpecialEffect*` 原生呼叫，全走 BJ 包裝：`AddSpecialEffectTargetUnitBJ`(317) / `AddSpecialEffectLocBJ`(241) / `CreateNUnitsAtLoc*`(411)。同理 #50 的參數要抓 `*BJ` / `*Percent` 形式（`SetUnitScalePercent` 35、`SetUnitTimeScalePercent` 68、`SetUnitVertexColorBJ` 57、`SetUnitFlyHeightBJ` 68） | grep 原生名稱一律 0 筆，會得出「參數不存在」的錯誤結論 |
| M5 | 觸發器分組正則必須是 `^Trig_(.+?)_(?:Conditions\|Actions\|Func\d.*)$`（多一個 `\|.*` 分支會讓 `.+?` 停在第一個底線，把 `Trig_Love_Surrender_*` 併進 `Love` 桶）。並且要**遞移追 `EnableTrigger(gg_trg_X)`**：被 gate 的觸發器常常一個特效都沒有，全部在它 enable 的第二個觸發器裡（實測約 6% 技能，全域約 40 個） | 分組錯 → 張冠李戴；不追 enable → 整個特效消失 |
| M6 | 攻擊：`right,hand` / `hand,left` / `weapon,left` / `chest,mount` / `sprite,first` 是**一個**附著點寫成兩個 token；`ftat` 可以是多模型逗號串（`"wuqi.MDX,…Phoenix_Missile.mdl"`）。天真地 split(',') 會兩邊都毀掉 | 附著點與多層美術同時損壞 |

**還有 3 個一定要照抄、不要「修正」的原始值**（[[ggd-faithful-import-over-rescale]]）：
`A05B`/`A05C`/`A0EZ` 的 `targetAttach = "cheat"`（作者把 `chest` 打錯，WC3 靜默 fallback 到 origin）、`A04G Ebl1 = 13200`（原版 Blink 距離的 13 倍）、`A0QG` 算好卻沒用到的 4 個 256 單位偏移。

---

## 3. 逐技能對照表（依業主分類）

> **覆蓋聲明**：632 列不放在這裡。這裡放的是 **球體 / 蝗蟲群 / 粒子三類的完整清單**（它們本來就是可窮舉的小集合），加上「其他」類裡影響最大的代表列。剩下的其他類是**機械可導**的：跑第 5 節 L1 的抽取器就會生成完整 632 列。短而誠實的表勝過長而臆測的表。
>
> 欄位說明 — **資產**：`✓` 倉庫有且完好 / `⚠` 有但粒子層丟失 / `∅` 倉庫完全沒有（Blizzard 原版）。**信心**：C=CONFIRMED（物件資料/原版設定檔/JASS/buff 有出處）、C−=CONFIRMED-NEGATIVE（確認原圖無特效）、I=INFERRED、U=UNRESOLVED。

### 3.1 球體 ORB — `Asph` 常駐附著（不是施放，是黏在骨頭上）

`Asph` 是全地圖使用最多的 base（**76 個自訂技能**；亞軍 `ANcl` 42）。作者自己就把 18 個命名為 `球體(...)`。**內容庫裡目前一個都沒有實作**，因為 `ability@1` 沒有「附著模型」這種東西。

| 技能 / rawcode | 名稱 | 現綁 | 真實效果 | 資產 | 附著點 | 信心 |
|---|---|---|---|---|---|---|
| `A0WR` (Asph) ← `godie-nplh.e` 執行期授予 | 麻倉附身 | — | **`wuqi.MDX`** 常駐 | `wuqi.glb` 50,924 B ✓ | `right,hand` + `weapon`（count 2） | C |
| `A0HU` (Asph) ← `godie-nsjs.r` 召喚物攜帶 | 億年樹 | — | **`JapaneseCherry.mdx`** | ✓ | `origin`（count 1） | C |
| `A0XT` (Asph) ← `godie-o02w.r` dummy `o02X` | 令狐沖劍 | — | **`1hswd_01.mdx`** | ✓ | `right,hand` | C |
| `A0XZ` (Asph) ← 同上 | 獨孤攻擊特效 | — | `LightningShieldTarget.mdl` | ∅ | `weapon` | C |
| `A0I5` (Asph) ← `godie-othr.q` dummy `h019` | 雪代轟 | — | `LightningShieldTarget.mdl` | ∅ | `weapon` | C |
| `A09O` (Asph) ← `godie-ewrd.r` 授予 | Mirror | — | `IllidanMissile.mdl` | ∅ | `left,hand` + `right,hand` | C |
| `A09P` (Asph) ← 同上 | Mirror_Red | — | `Phoenix_Missile.mdl` | ∅ | `chest` + `foot` | C |
| `A0II` (Asph) ← 英雄 `N00P` | — | — | `IllidanMissile.mdl` | ∅ | `left,hand` + `right,hand` | C |
| `A0FR` (Asph) ← 英雄 `U01F` | — | — | `LargeBuildingFire1.mdl`（胸口常燃） | ∅ | `chest` | C |
| `godie-h00l.e` `Adef` | 60-03 海拉爾之盾的庇護 | `holy.pulse` | **`NE_Shield.MDX` 同時綁 caster/target/special 三格**，全部 `right,hand`。這是**手持盾**，不是施放 | `ne-shield.glb` 143,988 B ✓（1 geoset/104 tri/0 emitter，轉檔完好） | `right,hand` | C |
| `godie-e008.w` `A0BH` | 21-01 火羽 | `fire.nova` | `HeroShanaWingSmall.mdx` caster+target 兩格 + buff `B010` 同模型，常駐 | `heroshanawingsmall.glb` 28,292 B ✓ | `chest` | C |
| `godie-e008.passive` `A0BE` | 21-00 灼眼 | *(null)* | `SmallBuildingFire2.mdl` 當 **target art 綁在 `weapon`** — 永遠燃燒的刀 | ∅ | `weapon` | C |
| `godie-e00q.passive` `A0FN` | 69-001 黑化之力 | *(null)* | `PossessionCaster.mdl` caster+target+special 三格 | ∅ | `chest` | C |
| `godie-e002.w` / `godie-e00l.w` `A0DZ` | 20-01 風王結界 | `wind.tornado` / `wind.nova` | **`HolyAwakening.mdx` 綁 `weapon` 常駐**。同一個 rawcode，兩份 doc 綁兩種不同 preset | `holyawakening.glb` 30,808 B ⚠（6 PRE2 + RIBB 丟失） | `weapon` | C |
| `godie-e00j.q` 等 55 個其餘 `Asph` | — | 各種 | 55 個不同 orb 模型，其中 **18 個是地圖自訂**：`Magical_Sword`, `MidchilderNanohaAura`, `Gokuhead`, `Goku3head`, `HeroFateZemberForm{,Big}`, `HeroCloudKFKSword`, `Katana`, `JapaneseCherry`, `DivineRing`, `HeroSaber`, `NE_Shield`, `AWING`, `BWING`, `LOVE2`, `wuqi`, `1hswd_01`, `Darkraor`, `poweraura` | 多數 ✓ | 直方圖：`weapon` 19 / `chest` 17 / `origin` 12 / `right,hand` 11 / `left,hand` 5 / `head` 4 | C |

**球體結論**：`Gokuhead.mdx` / `Goku3head.mdx` 是 `Asph` orb，**不是身體 mesh 的一部分** — 這正是 #73 找到的「孫悟空沒有頭」的真正原因。球體不是特效系統的問題，是**模型附著系統缺席**的問題。

### 3.2 蝗蟲群 LOCUST — 兩件事，別混為一談

**(a) 真正的 Locust Swarm 大絕，地圖裡有一個，就一個。**

| 技能 | 名稱 | 現綁 | 真實效果 | 信心 |
|---|---|---|---|---|
| `godie-e00t.e` `A0IB`（base **`AUls`** = Crypt Lord Locust Swarm） | 66-03 七夜怪談 | `fx.prim.void.nova` | 每級 **7 / 12 / 17 / 22 隻**、間隔 0.05s、每擊 100 傷、範圍 800。而且地圖**把 `uloc` 換皮了**：`umdl = NetherDragon.mdl`, `usca 0.6`, `uclg=0 uclb=0` → **22 隻 0.6 倍的紅色淵龍繞著你轉**。`void.nova` 錯到不同物種 | C |

> method 階段判定「地圖沒有 Locust Swarm」是**錯的** — 它測的是單位 `'Uloc'`，技能 base 是 `AUls`。

**(b) 真正在跑的「群」，是 `Aloc` dummy 載體 + 多重生成。** 231 個自訂單位帶 `Aloc` 旗標（139 原版路徑 / 57 自訂 mdx / **35 是刻意隱形**）。

| 技能 | 真實的「群」結構 | 信心 |
|---|---|---|
| `godie-u00h.e` `A0DO` 39-03 蛟龍 | `CreateNUnitsAtLoc(**3**, 'u00W')` — `UnsummonTarget.mdl` scale 2.0，同時 3 發 | C |
| `godie-ucrl.passive` `A08Y` 06-00 猜猜拳 | `CreateNUnitsAtLoc(**5**, 'o016')` — `BarkSkinTarget.mdl` **scale 7.0**, fly 10 | C |
| `godie-h02s.ex` `A0VS` 91-002 亡靈大軍 | 8 圈迴圈：`PolarProjection(450, 45°·i)` 各生一隻 `u031`（Ghoul，**紅染 uclr=150**），20 秒壽命，全部下令 attack 中心 | C |
| `godie-u00b.r` `A07Z` 75-03 暴雷無限刃 | 一隻隱形 `ogru` 被 `SetUnitPositionLoc` **15 次**繞 `PolarProjection(650, 24°·i)`，每次朝中心下 `shockwave` → **15 道由外向內收束的衝擊波** | C |
| `godie-hpal.r` `A0U6` 35-04 光牙 | 8 隻隱形 dummy 各下 `shockwave` at `PolarProjection(256, facing ± rand(30°))` — 扇形 8 連發 | C |
| `godie-o00x.r` / `godie-ogrh.r` `A03S` 09-04 龜派氣功 | 光束 = `PolarProjection(counter × 200, angle)` 的**鏈式連爆**，配 3 個 dummy，`SetUnitTimeScalePercent(15.00)`（6.7 倍慢動作） | C |
| `godie-e012.e` `A013`→`A01B` 47-03 九頭龍閃 | **五隻完整的龍當 area art**：`NetherDragon, RedDragon, BronzeDragon, AzureDragon, Chimaera` + NetherDragon 飛行物 speed 4500 arc 1.0 | C |
| `godie-huth.ex` `A0VI` 28-002 普烏死亡 | `Spawn Hydra` 改成生 **9 隻 `HeroBuu.mdl`** | C |
| `godie-ubal.w` `A0KC` 37-03 災難之牆 | `PolarProjection(400 − 100·i, facing + 90°)` — 一**排**間隔 100 的 2.0 倍 `TownBurningFireEmitter` | C |
| `godie-hblm.e` `A091` 05-03 及喀爾度 | 黑色 Wisp 扇形，角度間隔 = **180° / 技能等級**（等級越高越密） | C |

**規則（給寫入階段）**：`Aloc` 單位若 `umdl` 是 `.mdl` / `" .mdl"` / `none.mdl` / 空 → **那是純玩法載體，絕對不要產 vfx doc**。實測共用隱形載體 `hfoo` / `hkni` / `ogru` / `o009` / `o01X` / `h01X` / `h02M` 全屬此類。`godie-ubal.passive` 37-00 鬼眼目前綁 `void.pulse-lg`，但它的 dummy 是 `" .mdl"` 且還被 `ShowUnitHide` — **原圖完全沒有畫面，這個綁定是憑空捏的**。

### 3.3 粒子 PARTICLE — #98 的真正範圍

238 個 PRE2 發射器散在 132 個 imported 模型裡，**轉檔 100% 丟棄**（`w3xlib/mdx.py` docstring 自己寫了：*"Particle/ribbon/camera/light/event chunks are skipped"*）。

**(a) 13 個零 geoset — 整個資產就是粒子，glb 是空殼**

| 模型 | PRE2 | ribbon | mdx | **glb** | 使用者 |
|---|---:|---|---:|---:|---|
| `DivineRing.mdx` | **20** | – | 7,268 | **1,020** | `A0TP 球體(趙雲)`, `A10W 78-002 加速爆體`, `godie-e008.r 21-04 討滅封絕` |
| `LasercannonfinalRED.mdx` | 8 | – | 5,984 | **288** | 單位 `n01I` |
| `BlackHole.mdx` | 7 | ✔ | 6,953 | 8,384 | `A0J8 34-冥道殘月破`, `A0JP 螺旋劍` |
| `SephBoom.mdx` | 7 | – | 6,117 | — | **無引用**（可能是死 import） |
| `HeroNarutoS4Effect.mdx` | 6 | – | 5,106 | **1,900** | `godie-hvwd.e 02-03 魂飛魄散`（飛行物 → 目前**完全看不見**） |
| `Boomnl.mdx` | 5 | – | 2,623 | **288** | `godie-u034.r 06-04 傑桑變化`(buff), `godie-u00k.r` dummy `o00M` |
| `Demonfilth.mdx` | 5 | – | 3,119 | **288** | 無引用 |
| `Enchant.MDX` | 5 | – | 4,215 | 5,536 | `godie-e008.e 21-03 赤焰爆發`（special art） |
| `MusicCast.mdx` | 2 | ✔ | 2,530 | — | 無引用 |
| `DarkBreathDamage.mdx` | 1 | – | 1,407 | **288** | `godie-ekee.q 93-01 期末報告`(buff `Bbof`/`Xbof`) |
| `LavaBreathDamage.mdx` | 1 | – | 1,407 | **288** | `A0BC 11-01 燒鬼斬` |
| `babyface.mdx` | 1 | – | 1,603 | **288** | 無引用 |
| `collision.mdx` | **0** | – | 1,188 | 1,148 | **假陽性 — 見下** |

**(b) 4 個「幾何上還在、但實際只有 4 個三角形」的準空殼**：`flamessmoke.glb` 5,164 B（1 geoset / **4 tri** / 4 PRE2）、`bloodbreathstream.glb` 4,008 B（**4 tri** / 3 PRE2）、`heroeva01s2.glb` 8,468 B（**22 tri** / 2 PRE2）、`supershinythingy.glb` 68,752 B（**44 tri** / 3 PRE2 + ribbon）。這些現在畫出來是一片碎屑。

**(c) 64 個有 mesh 的模型也帶 PRE2，粒子層無聲蒸發** — 這是**最大宗、最難察覺**的一類。代表：

| 模型 | geo/tri | PRE2 | glb | 使用者 |
|---|---|---:|---:|---|
| `EarthTornado2.mdx` | 3 / 114 | **14** | 39,000 ✓mesh | `godie-h02r.q 90-01 飛葉快刀`（**五格美術全綁它**）、`godie-e00x.q 百烈櫻華斬` |
| `LightningTornado.mdx` | 3 / 114 | **14** | 43,600 | `godie-osam.r 34-04 蒼龍破`、`godie-o00k.e 86-03 神鳴` |
| `AquaSpikeVersion2.mdx` | 1 / 60 | **12** | 32,064 | `godie-nplh.e 劍之精靈`、`godie-hvwd.ex 02-002 神通眼`(800% 縮放) |
| `Meteor` / `gumdam` / `herosasuke` / `frostnova` / `fireblast` | — | 8/5/4/4/4 | ✓ | 多處 |
| `Darkraor.mdx` | 3 / 129 | 3 | 117,624 | `A09I 邪王炎殺黑龍波` 的龍頭、`godie-edem.q 豪火龍之術` |
| `BlackHole1.mdx` | 3 / **12** | 3 | 39,492 | `godie-ekee.passive 93-00 小考` — **mesh 只有 12 面，3 個星塵發射器才是黑洞本體** |
| `NetherStrike.mdx` | 5 / 414 | 5 | 113,324 | `godie-edem.ex 45-002 天照`、Excalibur |
| `DeathWave.mdx` | 2 / 66 | 1 | 25,720 | `godie-h01n.e 月牙天衝` — 發射器帶完整動畫軌，靜態發射器重現不了 |
| `SD2.MDX` / `HeroMusashiMiyamoto.mdx` | — | 0/1 | ✓ | **ribbon 丟失** |

**(d) `collision.mdx` 是假陽性，但 method 階段「刪掉它」的結論也是錯的。**
chunk 只有 `VERS SEQS BONE ATCH PIVT CLID` — 0 geoset、0 emitter，1,148 B 的 glb 是「忠實地轉了一個沒有東西的東西」。但它是**三個活著的單位的 `umdl`**：`n010/n019/n01A` 億年樹（`usca 2.0`，樹本體由 `Asph` orb `A0HU` = `JapaneseCherry.mdx` 提供），另外 `U011 死亡老二`（英雄本體！）和 `godie-edem.e` 的 dummy `h02P` 也指向它。**保留檔案，標記為 `INVISIBLE_CARRIER`，不要刪。**

### 3.4 其他 — 影響最大的代表列（完整 632 列由 L1 抽取器生成）

| 技能 id | 名稱 | 現綁 | 真實 w3x 效果 | 資產 | #50 參數 | 信心 |
|---|---|---|---|---|---|---|
| `godie-e002.e` / `godie-e00l.e` `A0D5` | 20-03 約束與勝利之劍 | `holy.beam` / `holy.slash` **← 同 rawcode 兩種綁定** | caster `HolyAwakening.mdx` + JASS 常駐 `Magical_Sword.mdx` 在 `handright` + `NEDeathSmall` + `NeutralBuildingExplosion` + 3 個 dummy + **6 段 `PolarProjection(i×200)` 連爆到 1200 單位** | ⚠ mesh 有、7 emitter + 1 ribbon 丟 | `scale 250+15·lvl` / `350+15·lvl`；**`timeScale 15%`（6.7× 慢動作）** | C |
| `godie-e002.ex` `A0SP` | 20-002 解放.約束勝利劍MAX | `holy.beam-lg` | **7 連擊殘影**：每擊生一隻 `HeroSaber.mdl` 分身（`h02G`），`timeScale 600%`，`vertexColor(80,10,10,α50)`，收招 `timeScale 30%` 慢動作 + `Magical_Sword.mdx` 上手 + 900 範圍掃 | ⚠ | scale 350/400%、timeScale 600/100/30/15%、兩組 vertexColor | C |
| `godie-e00l.ex` `A0SP` | 同名 | `arcane.pulse-lg` | **`gg_trg_ExcaliburMAX` 只註冊給 `'E002'`。原圖裡 E00L 的 EX 根本不會觸發** | — | — | C− |
| `godie-u010.e` / `godie-uvng.e` `A09I` | 38-03 邪王炎殺黑龍波 | `void.beam` / `firestorm` | caster `WarStompCaster`@`weapon`、飛行物 **`Tectonicfury.mdx` speed 1350**、3 隻 `Darkraor.mdl`(黑龍頭) scale 2.0、12 次 `PolarProjection(350, i·30°)` 的 `FlameStrikeTarget`(黑龍波) | ⚠ | `timeScale 10% / 30%`、`vertexColor(0,0,0, 110−i)` 逐幀淡出 | C |
| `godie-h02r.q` `AOww`（原版被就地改寫） | 90-01 飛葉快刀 | `nature.slash` | **`EarthTornado2.mdx` 綁在 caster/target/special/effect/missile 五格全部**。這是常駐旋風，不是斬擊 | ⚠ 14 emitter 全丟 | — | C |
| `godie-o01z.e` / `godie-o02v.e` `A0XN` | 81-03 Divine Buster Extention | `holy.nova` / `ki.nova` | 兩隻 `MidchilderNanohaAura` dummy + `ReviveHuman` 柱，`PolarProjection(150 × index)` 分段推進 | ✓ 135,316 B（4 tri，靠貼圖） | **`scale(180,180,300)` Z 拉長 1.67 倍**；**`scale(50·lvl+100,100,100)` 只拉 X、隨等級** | C |
| `godie-hart.e` `A000` | 01-03 畫龍點睛 | `physical.beam` | 空中擒拿：`flyHeight(400, rate 600)` 把敵我**都**抬到 400 高、`timeScale 1000%` 旋轉、`facing +270°`、落地 `flyHeight(0, rate 2000)` | ∅ | flyHeight ×4、timeScale 1000→100%、facing +270° | C |
| `godie-u00n.q` `A0IS` | 76-01 伸縮自如的橡膠戰斧 | `physical.shockwave` | **`flyHeight = −1.5·(i−21)² + 600` 的明確拋物線**、`timeScale 40→100→200%`、`PolarProjection(距離 × −2.0)` 橡膠回彈 | ∅ | 拋物線 flyHeight、3 段 timeScale、負距離投影 | C |
| `godie-h01n.ex` / `godie-h01o.ex` `A0W5` | 79-002 虛化 | `void.explosion-lg` / `nature.pulse-lg` | **完全沒有粒子**：`SetUnitVertexColorBJ(30,30,30, 0)` 把英雄本體壓到 30% 亮度，結束時還原 | — | vertexColor 30%↔100% | C |
| `godie-h02u.q` / `godie-h02v.q` `A0W9` | 92-01 臥草泥馬 | `physical.shockwave` / `nature.pulse-sm` | 變身成 `horse.mdl` + `SetUnitAnimation("Victory")`。**原圖沒有任何特效** | — | 動畫名 | C− |
| `godie-o02l.e` / `godie-ofar.e` `A0C3` | 58-03 就決定是你了!小智 | `lightning.pulse` | 飛行物 = **`units\critters\VillagerKid1\VillagerKid1.mdl`**（丟一個小孩出去）+ `HumanLargeDeathExplode` | ∅ | speed 1200 | C |
| `godie-hblm.r` / `godie-h021.r` `A092` | 05-04 巴歐．薩喀爾嘎 | `lightning.nova-lg` | 飛行物 = **一整隻 `BronzeDragon.mdl`** speed 3000；JASS 再生 4 隻 **scale 4.0** 的青銅龍 | ∅ | usca 4.0 | C |
| `godie-orkn.r` `A01P` | 30-04 電車之狼衝擊 | `physical.shockwave-lg` | `alig = FORK` 閃電 + caster/target = `Sorceress_V1.mdl` + special = **`BloodElfWagon.mdl`（那台「電車」）** | ∅ | — | C |
| `godie-h02s.q` / `godie-h02z.q` `A0W3` | 91-01 死亡之握 | `void.nova` | **`alig = SPLK` 閃電光束** + `SetUnitPositionLoc` 把目標拉近 100 單位。這是 beam + 位移，不是 nova | ∅（閃電是 `Lightning.slk` id，無模型） | 拉近 100 | C |
| `godie-h001.q` `A015` | 41-01 吸血鬼之吻 | `blood.nova` | `alig = **AFOD,AFOD,AFOD**` — **三道並排的死亡之指光束**，通道型吸取 | ∅ | — | C |
| `godie-o02w.e` `A0Y0` | 96-03 吸星大法 | — | `alig = DRAB,DRAL,DRAM` — **三道疊加的吸取光束** + 四格美術全 `TomeOfRetrainingCaster` | ∅ | — | C |
| `godie-harf.ex` `A106` | 26-002 鄉民的正義 | `arcane.pulse-lg` | `PolarProjection(200, 75°·i)` 召出**一圈真的村民**（`VillagerMan.mdl` scale 1.5, 20 秒, 移速 380）。梗就是字面上的「鄉民」 | ∅ | 20s 壽命、r=200、75° | C |
| `godie-e00v.q` `A0CR` | 84-01 冷笑話 | `arcane.nova` | `FrostNovaTarget`（該是 **ice**）+ **8 個浮動文字標籤**（笑話台詞，velocity 70 @90°, 4s, 2s 淡出）— 引擎目前沒有這個通道 | ∅ | 文字標籤 | C |
| `godie-u00v.w` `A0L4` | 78-02 地走龍牙破 | `earth.shockwave` ✅ | 移動地裂 + **`TerrainDeformationRippleBJ(1.0, true, …, 100, 340, 48, 1, 200)` 真地形變形** — `vfx@1` 沒有這個欄位 | ∅ | 地形波紋半徑 340 深 48 | C |
| `godie-ekee.q` `Abof` | 93-01 期末報告 | — | 傷害視覺在 buff → **`DarkBreathDamage.mdx`**（0 geoset / 1 PRE2），對應 doc `godie-darkbreathdamage-p0` **已存在但沒綁** | **288 B** ⚠ | — | C |
| `godie-e00j.r` `A0Y9` 等 110 個 | — | 各種 `fx.prim.*` | **原圖沒有技能層美術**（w3a 無覆寫、原版 base 設定檔無美術、buff 無美術、JASS 無特效呼叫）。典型：`AOcr` 爆擊、`AEev` 閃避、`Aspb` 法術書、`Aegr` 月神恩典、`Aamk` 屬性加值 | — | — | C− |

**同一個 rawcode 綁到兩個不同 preset** —— 這是系統性缺陷，10 個切片各自獨立撞到，已確認至少 **14 組**：
`A0D5`, `A0SP`, `A0CT`, `A0MQ`, `A0DZ`, `A06N`, `A04X`, `A02W`, `A0SQ`, `A02K`, `A10N`, `A0OU`, `A09I`, `A06P`。
其中多數同時是 #113「同名英雄成對」的證據（E002/E00L、E007/Ewar、U01U/Udre、Nsjs/N00P 的 `uhab` 完全相同）。

---

## 4. #98 判決

### 4.1 假說對不對？

**對，但只講對了 5%。**

原假說：*WC3 的球體 / 蝗蟲群是「粒子發射器 + 附著點」而不是靜態 mesh，所以 mdx→glb 烤不出幾何、產生空殼。*
實測：13 個零 geoset 模型裡 **12 個確實是純 PRE2 發射器模型**，再轉一次不可能有用。**假說成立。**

但真正的範圍大 6 倍：

> **119 個有 mesh 的 imported 模型裡，64 個也帶 PRE2。全庫 238 個發射器，100% 被丟棄。**
> 那 12 個空殼只是冰山露出來的尖 —— 它們剛好是「發射器就是資產全部」的極端案例。
> 剩下 64 個是**沉默失敗**：mesh 轉對了、看起來有東西、但粒子層整層不見。這才是「感覺很像但就是不對」抱怨的主要來源。

三個必須分開處理的子類：
1. **純發射器資產**（12 個）— 今天畫面上是**什麼都沒有**
2. **mesh + 發射器**（64 個）— 今天畫面**部分正確**，最難抓
3. **RIBB ribbon**（`BlackHole`, `MusicCast`, `SD2`, `HeroMusashiMiyamoto`）— 拖尾條帶，不是粒子，要另一套映射

### 4.2 好消息：抽取這件事**已經做完了**

`tools/w3x-import/extract_particles.py` 存在且已經跑過。`content/vfx/` 裡有 **228 份 `godie-<model>-p<N>.json`（73 個模型）+ 54 份 ribbon doc（31 個模型）**，數量與我獨立解出的 PRE2 census 逐模型吻合（`divinering` 20↔20、`lightningtornado` 14↔14、`aquaspikeversion2` 12↔12、`holyawakening` 6↔6、`netherstrike` 5↔5、`enchant` 5↔5）。世界單位也已用專案的 `11/600` 常數換算過。

**問題是它們是孤兒**：662 個技能裡只有 3 個引用（`godie-hvwd.r`、`godie-h01o.e`、`godie-e00x.r`），而且這 3 個**同時還掛著矛盾的 `fx.prim.*`**。

所以 **#98 現在是綁定問題，不是抽取問題**。

### 4.3 還缺的兩件事（這才是 #98 真正剩下的工作）

**(i) 貼圖 0% 忠實。** 228 份 doc **全部**指向 `assets/textures/particles/*.png` 這種泛用素材；真 WC3 BLP 只抽出 **8 張**（`content/assets/textures/particles/wc3/`）。原始發射器指名的是 `Textures\firering6.blp`、`Textures\LavaLump2.blp`、`Textures\BloodWhiteSmall.blp`、`ReplaceableTextures\Weather\Clouds8x8.blp`、`Textures\star5tga.blp`、`Textures\White_64_Foam1.blp`、`Textures\GenericGlow2c.blp`、`Textures\LightningBall.blp`…。**幾何與時序是忠實的，顏色與紋理不是。**

**(ii) `ability@1` 表達不了。** `vfxKey` 是單一字串（`zRef("vfx", { soft: true }).optional()`）。`DivineRing` 有 20 個發射器、`EarthTornado2` 有 14 個 —— **一個字串綁不了 14 個 doc**。而且 schema 完全沒有「附著模型」「飛行物」「閃電光束」的概念。

### 4.4 參數契約（PRE2 → `vfx@1`，1:1 映射，不是重新設計）

`vfx@1` 的形狀已經對了（`emitter, mode, lifetimeSec, size, sizeStops, color, colorStops, speed, rate, burstCount, gravityY, blendMode, texture, spriteSheet, stretched, tailLength, anchorBone, ambient` + `ribbon@1` 的 `widthAbove/widthBelow/lifespanSec/uvScrollPerSec`）。

```
PRE2 二進位（little-endian，171 bytes payload）
+0    uint32  inclusiveSize
+4    uint32  node.inclusiveSize        (無 KGTR/KGRT/KGSC 軌時 = 96)
+8    char[80] name
+88   int32   objectId
+92   int32   parentId          → ATCH/BONE 名 → anchorBone
+96   uint32  flags             0x1000 particle · 0x8000 unshaded · 0x20000 lineEmitter
                                0x80000 modelSpace · 0x100000 xYQuad
+4+node.inclusiveSize:
  float32 speed, variation, latitude, gravity, lifespan, emissionRate, length, width
  uint32  filterMode {0 blend,1 additive,2 modulate,3 modulate2x,4 alphakey}
  uint32  rows, columns          → spriteSheet
  uint32  headOrTail {0 head,1 tail,2 both}
  float32 tailLength, timeMiddle
  float32 segmentColor[3][3]     // start/middle/end RGB 0..1
  uint8   segmentAlpha[3]
  float32 segmentScaling[3]
  int32   headIntervals[6], tailIntervals[6]
  uint32  textureId              → TEXS[textureId]
  uint32  squirt                 // 1 = 爆發式
  int32   priorityPlane ; uint32 replaceableId
然後可選動畫軌：KP2S speed · KP2R variation · KP2L latitude · KP2G gravity
              KP2E emissionRate · KP2N length · KP2W width · KP2V visibility
自檢：4 + 96 + 171 = 271。不等於就是 node 帶軌，改用 node.inclusiveSize。
```

映射：

| PRE2 | vfx@1 |
|---|---|
| `lifespan` | `lifetimeSec` |
| `emissionRate`（`squirt=1` → `mode:"burst"` + `burstCount`） | `rate` |
| `speed`, `variation` | `speed {min: s·(1−v), max: s·(1+v)}` |
| `latitude`(度) | `emitter{shape:"cone", angleDeg}` |
| `gravity` | `gravityY`（**取負** — WC3 正 gravity 是往下） |
| `length` / `width` | `emitter.radius` |
| `filterMode` | `blendMode`（additive/alpha/modulate/alphaKey） |
| `segmentColor` + `segmentAlpha` | `colorStops` @ t = 0, `timeMiddle/lifespan`, 1 |
| `segmentScaling` | `sizeStops` 同三點 |
| `rows`×`columns` | `spriteSheet` |
| `headOrTail` tail/both + `tailLength` | `stretched` + `tailLength` |
| `TEXS[textureId]` | `texture`（**目前是代用圖，見 4.3(i)**） |
| `parentId` → BONE/ATCH 名 | `anchorBone` |
| `KP2*` 動畫軌 | **`vfx@1` 目前沒有對應欄位** — `DeathWave` 的整個表現就在軌裡（`width 366→126→669` 波前張開），靜態發射器重現不了 |

**尺度**：`speed` / `length` / `width` / `segmentScaling` 是 WC3 世界單位，用 `11/600` 換算。`DivineRing` 的 `segmentScaling 20` = 20 WC3 單位 ≈ 0.37 GGD 單位，**不是「大了 20 倍」**。照實回報，要調上限就明知地調（[[ggd-faithful-import-over-rescale]]）。

**兩個已解碼的實例，可直接當回歸測試的黃金樣本：**

```
DivineRing.mdx  emitter 1/20  "BlizParticle02"  flags 0x29000
  speed 200  variation 0.02  latitude 0  gravity 0  lifespan 0.5  rate 40
  length/width 4/4  additive  head  timeMiddle 0.5
  color [1,0.902,0.247] → [0.988,0.867,0.043] → [1,1,0.749]
  alpha 255→255→0   scaling 20→20→20   texture Textures\firering6.blp
  （6–10 號是第二層藍：speed 150, color [0,0.502,1], alpha 128→128→0）

flamessmoke.mdx  emitter 1/4  "BlizParticle01"
  speed 160 var 0.5  lifespan 2.0  rate 75  L/W 125  additive
  color [0,0.518,1] → [1,0.471,0] → [1,0.918,0]   scaling 10→50→20
  texture Clouds8x8Fade.blp
  （03 號：speed 400 lat 45 gravity 300 life 4.0 rate 3 → 落下的餘燼）
```

---

## 5. 分層修復計畫（依相依順序）

**規則：每一層都吃下面那層的產出。跳層 = 上層白做。**

### L0 — Schema 層（**先做，否則以下全部無處可寫**）
- `ability@1` 加上三個表達不了的圖層：
  `attachedModels: [{model, bone, count}]`（球體）、`missile: {model, speed, arc, homing}`、`beam: {lightningId}`（`alig`：`SPLK/AFOD/FORK/CHIM/LEAS/CLPB,CLSB/HWPB,HWSB/MBUR/DRAB,DRAL,DRAM`）。
- `vfxKey: string` → 允許陣列（`DivineRing` 20 個、`EarthTornado2` 14 個發射器）。
- `vfx@1` 加 `KP2*` 動畫軌（至少 `rate` / `width` / `visibility` 隨時間）。
- **為什麼先做**：目前 `fx.prim.*` 全部只有 `{emitter, mode, burstCount, lifetime, size, color, blend, gravity, speed, texture}`。**632 個技能裡有超過 380 個的真實效果是一個「模型」**（orb / 飛行物 / dummy 載體 / area art / 閃電）。沒有 L0，這 380 個**在原理上就不可能綁對**，改顏色改到死都沒用。

### L1 — 資產層（#98 + #81/#116）
1. **綁定既有的 228 + 54 份發射器 doc**（零抽取工作，資料已經是對的）。
2. 抽真 BLP 貼圖（目前 8/73 個模型有真貼圖）。
3. 刪 `darkbreathdamage.glb` 等**確認被發射器 doc 取代**的 288 B 空殼；**保留 `collision*.glb`** 並標記 `INVISIBLE_CARRIER`（3.3(d)）。
4. **面對現實：約 380 個技能的真實美術是倉庫裡不存在的 Blizzard `.mdl`。** 這不是轉檔問題，是 #81 / #116 的授權/重製問題。在它解決之前，這些技能**只能**用 `fx.prim.*` 當**明知的近似**，並在 doc 裡標記為 approximate，不要假裝已修好。
   高頻優先（重建一次可服務多個技能）：`WarStompCaster`、`ThunderClapCaster`、`FlameStrikeTarget`、`StampedeMissileDeath`、`DeathPactTarget`、`MonsoonBoltTarget`、`TornadoElemental(Small)`、`NagaDeath`、`MirrorImageCaster`、`BlinkCaster/Target`、`ImpaleTargetDust`、`ThunderclapTarget`(overhead 暈眩環)。

### L2 — 綁定層（585 + 47）
- 跑一次完整抽取器（w3a + `*AbilityFunc.txt` 繼承 + `w3h` buff + JASS 含 `EnableTrigger` 遞移 + `w3u` dummy）生成 632 列，逐一改 `vfxKey` / 新欄位。
- **同時把 110 個 C− 設回 null。** 忠實是雙向的：原圖沒有的東西，加上去也是不忠實。
- **同時修 14 組同 rawcode 雙綁定**，並加一條 CI 不變量：一個 rawcode 只能有一組 VFX 定義。
- **依賴 L0**（沒有欄位可寫）與 **L1**（沒有資產可指）。在 L0 之前跑 L2，等於把 380 個模型型效果硬塞進粒子欄位，之後要全部重來。

### L3 — 每次施放參數層（#50）
把下列**全部**接上（實測分布：`SetUnitScalePercent` 35 站、`SetUnitTimeScalePercent` 68、`SetUnitVertexColorBJ` 57、`SetUnitFlyHeightBJ` 68、`SetUnitFacing*Timed` 63、`PolarProjectionBJ` 258、`UnitApplyTimedLifeBJ` 136）：
- **非等比縮放**（`(180,180,300)` Z 拉長 = 光束、`(level·50+100,100,100)` 只拉 X = 隨等級變長）
- **隨等級縮放**（`250 + 15·level`）
- **timeScale**（`15%` 6.7× 慢動作 ↔ `1000%` 10× 快轉）
- **vertexColor + alpha**（`(30,30,30, α0)` 虛化、`(100,0,0)` 暴走全紅、`(0,0,0, 110−i)` 逐幀淡出）
- **flyHeight**（`−2000 @1800/s` 吞噬下潛、`−1.5(i−21)²+600` 橡膠拋物線）
- **facing / PolarProjection 幾何**（環形 `r, θ·i`、扇形 `±30°`、螺旋 `12i @ 30i°`、牆 `400−100i @ +90°`、鏈 `150×index`）
- **來自 `w3u` 的單位級參數**（L2 常忘）：`usca` 基礎縮放（0.1 … 10.0）、`uclr/uclg/uclb` 頂點染色（實測 7/17 個 dummy 帶非預設色）、`umvh` 飛行高度、`ushu` 陰影移除
- **依賴 L2**：沒有正確的效果實體，這些參數無處可套。

### L4 — 效果/模擬層（sim 缺口）
- **`evasion` 這面牆已經拆了**（有並行工作流落地）：`Stat.Evasion` 存在（`statTypes.ts:29`，clamp `[0, 0.8]`），`sim/combat/evasion.ts` 有 seeded roll（僅普攻）。
  **但內容還是死的**：`content/abilities/` 裡 **0 份 doc 帶 `"evasion"` modifier**，而描述提到閃避/迴避的有 **16 份**。108 份被動 doc 裡 **40 份 modifiers 與 effects 都空**。
  → 這現在是**內容工作，不是引擎工作**：把 12-00 感應意脈的 0.20 等值填進 `passive.ranks[].modifiers`。
- 其餘 sim 缺口（照實記錄，不編）：**地形變形**（`TerrainDeformationRipple`，78-02 需要）、**浮動文字標籤通道**（84-01 冷笑話的 8 句台詞）、**變身/換形系統**（#119；`AEme` 的 `Eme1`/`Emeu` 單位對已抽好，至少 6 個技能是純換形）、**鏡頭震動**（`CameraClearNoiseForPlayer`）。
- **依賴 L3**：特效演對了但機制不生效，玩家只會覺得「畫面有動、沒感覺」。

---

## 6. 效果／成本排序 —— 家人在 3 分鐘一場裡會不會發現

### 會在 3 分鐘內被抓包（先修這些）

| 排 | 修什麼 | 為什麼會被發現 | 層 | 成本 |
|---|---|---|---|---|
| 1 | **綁上已存在的 228 份發射器 doc** | 資料已經對了、已入庫，只差引用。改完立刻有 73 個模型的真實粒子 | L0(陣列) + L2 | 低 |
| 2 | **把 110 個「原圖沒特效」設回 null** | 現在每個爆擊、每個閃避被動、每本法術書都在噴粒子。畫面雜訊比缺特效更明顯 | L2 | 低 |
| 3 | **13 個空殼 + 4 個準空殼模型改成發射器** | `DivineRing`(20)、`HeroNarutoS4Effect`(魂飛魄散的飛行物)、`Boomnl`、`DarkBreathDamage`、`flamessmoke`、`bloodbreathstream` —— 這些技能現在**畫面上什麼都沒有**，一放就知道壞了 | L1 | 中 |
| 4 | **球體（`Asph` 76 個）附著模型** | 常駐可見，整場都在。孫悟空沒有頭（#73）就是這個。而且是**類別性錯誤**，不是顏色偏差 | L0 + L1 | 中 |
| 5 | **14 組同 rawcode 雙綁定** | 同一招在兩個英雄身上長不一樣，家人一定會問 | L2 | 低 |
| 6 | **元素綁錯的高頻招** | 冷笑話該是冰卻是奧術、卍解該是金聖光卻是虛空、逆我必殺該是聖光卻是奧術、槍亂打該是紅卻是奧術。顏色錯是最直觀的 | L2 | 低 |
| 7 | **`EarthTornado2` 14 個發射器**（飛葉快刀五格全綁它）+ `LightningTornado` 14 個 | 一個發射器組服務兩個模型（同幾何、只差顏色與貼圖），CP 值最高的單筆重建 | L1 | 中 |
| 8 | **#50 的 timeScale / vertexColor / flyHeight** | 龜派氣功的 6.7× 慢動作、虛化的變黑、畫龍點睛的騰空 —— 這些是招式的**識別特徵**，不是裝飾 | L3 | 中 |
| 9 | **蝗蟲群本體**（66-03 七夜怪談：22 隻紅色淵龍） | 大絕，一定會用到，而且現在是一個 nova | L0 + L2 | 中 |
| 10 | **16 個閃避被動填 modifier** | 「這個被動寫了 20% 閃避但完全沒作用」 | L4（內容） | 低 |

### 長尾（正確，但沒人會在 3 分鐘裡發現）

- 64 個 mesh+發射器模型的**粒子層**（畫面已經「有東西」，只是不夠對） —— 量最大、單筆感知最弱
- 真 BLP 貼圖替換掉 228 份代用圖（顏色梯度已經是對的，只有紋理質感差）
- RIBB ribbon 拖尾（4 個模型）
- `PolarProjection` 幾何細節（環形間距、扇形角度）
- `KP2*` 動畫軌（除了 `DeathWave` 這種整個表現都在軌裡的例外）
- 380 個 Blizzard 原版特效的忠實重製（#81/#116）—— **成本最高、單筆感知最低**，而且被授權卡住
- 地形變形、浮動文字標籤、鏡頭震動三個 sim 通道（各只服務 1–2 個技能）

---

## 7. 明確救不回來的東西（不要在這些上面浪費時間）

| 項目 | 數量 | 為什麼救不回來 |
|---|---:|---|
| **合成技能 doc** | **18** | `champ.thorne` / `champ.sela` / `U01Q 測試英雄` / `H02N 腦包英雄` / `E00U 十六夜Sakuya` 的空技能格。這些英雄在 `war3map.w3u` 裡 `uhab` 是**空字串**。地圖裡不存在這些技能。**不可以編一個出來** —— 應刪除或標記 synthetic |
| **Blizzard 原版特效模型本體** | ~380 個技能所需，**倉庫 0 個** | 不是轉檔失敗，是從來沒抽過，而且抽了也不能散佈。這是 #81/#116 的授權問題。在它解決之前，唯一誠實的作法是標記為 approximate |
| **4 個無引用的 imported 模型** | `SephBoom`(7 PRE2)、`Demonfilth`(5)、`MusicCast`(2+ribbon)、`babyface`(1) | 地圖裡沒有任何技能或單位引用它們。可能是作者留下的死 import。**UNRESOLVED，不要硬找歸屬** |
| **`godie-efur.e` 13-03 快步的作者意圖** | 1 | 地圖把 `AEtq` Tranquility 的治療全部歸零改成位移技，但**留著**繼承的降雨美術。作者是想留還是忘了關，**來源無法判定**。照實出貨並標記 |
| **`u033` 疫病雲(較大) 的模型路徑** | 1 | `w3u` 裡沒有 `umdl`，繼承 base `uplg`，而該 base 的美術在原版表裡查不到確切項 |
| **`u031`（亡靈大軍召喚物）的模型** | 1 | 該 rawcode 在 `war3map.w3u` 裡**不存在**，只有它的技能 `A0VY` 有紀錄 |
| **PRE2 的 `KP2*` 動畫軌在 `vfx@1` 的表現** | — | schema 沒有這個維度。`DeathWave` 這類「整個表現都在軌裡」的資產，靜態發射器**原理上**重現不了，必須先擴 schema（L0） |

---

## 8. 可重現性

本輪的 scratch 腳本是暫時的（`/private/tmp/.../scratchpad/vfx*/`、`slice*/`），已在各切片報告中列出。要重跑，需要的是把下列**三個抽取器升格成 `tools/w3x-import/` 的常駐工具**（它們是本輪最有價值的可重用產出）：

1. `stock_abilityfunc.py` — 從 3 個 MPQ 合併 `Units\*AbilityFunc.txt` → 1017 筆原版美術（M2）
2. `pre2.py` — PRE2 / RIBB chunk 解碼器（第 4.4 節的契約）
3. `jass_attrib.py` — 觸發器分組 + `EnableTrigger` 遞移 + 平衡括號的引數掃描（M4/M5；行錨定正則會截斷多行 BJ 呼叫）

⚠️ 陷阱：`scratchpad/` 根目錄有一個 `inspect.py`，把它加進 `sys.path` 會遮蔽標準庫的 `inspect`，讓 `dataclasses` 以 `AttributeError` 炸掉。腳本要放在乾淨子目錄。

⚠️ 用 `out/GoDieEX22s-src/`（未加密、`Trig_*` 名稱完整）當主來源；`out/GoDieEX22s/` 是**混淆版**（函式名被打亂、`jass-spells/*.j` 是 call-graph 切片、只有 70 個檔且對共用 helper 過度收錄），只能當獨立交叉驗證。

> **待辦（本輪唯讀，未執行）**：依 [[ggd-rolling-log-discipline]]，本檔的結論需要在 `docs/_requirements-audit-gaps.md` 補一條指標行，並同步 3 個 live page。本輪被限定只能新增這一個檔案，故未動。

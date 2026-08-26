# MDL 特效家族總表

> **一顆 MDL ＝ 一個特效家族。** owner 2026-08-26 逐字：
> 「所有光束砲系列都是一樣的，只差在**顏色大小透明度**略有不同」
> 「光束砲家族**應該共用特效模板**，請你仔細掃描**所有使用相同 mdl 的蝗蟲群**對應到的特效」

> 資料 join：`OBJECTS.json`（461 單位）× census 644 個 JASS 生成點 × `JASS_BEHAVIOR.json` 行為卡 × 出貨名冊。
> ⚠️ 產生於 2026-08-26；⛔ 這是**對照表**不是產物，數字要重算就重跑 join。

## 總量

| | |
|---|---:|
| 多 dummy 的 MDL | **65** |
| dummy 總數 | **190** |
| 技能 → GGD 落點已對上 | **47** |
| 零生成點（待查 w3a 通道） | **79** |
| MDL 已清算／已裁定 | **16** |
| ⬜ 未清算（排隊中） | **49** |

## 判讀方式（六批 Phase 6 累積的課）

1. 建議表**會列死內容** ⇒ 逐列驗 sites
2. **sites=0 ≠ 無落點** ⇒ 再查 w3a（Art-Missile／召喚欄 Uin4／AOsw／`art:caster`）
3. 「**有主人但不是 GGD 的**」—— 物件編輯器零主人，或被別的 rawcode 取代
4. 原主未出貨（`content/_legacy/`）⇒ 可綁同身分出貨英雄，**但那是我挑的** ⇒ 要 rollback ＋守衛釘「原主出貨即紅」
5. 全族零**可見**落點（逐點 `ShowUnitHide` 隱形代理）⇒ 刻意不做
   ⚠️ ⭐ **但「零落點」有兩種，⛔ 不可以混**（2026-08-26 在 WarStompCaster 上犯過）：
   · **原作就沒有**（dummy 從不生成／隱形代理）⇒ ⛔ 刻意不轉
   · **我們還沒做到那一批**（主人未出貨、或該系列還在票上）⇒ 🟡 **待辦**，要指得出是哪張票
6. **近黑／低對比用亮像素量不到** ⇒ A/B **差分**尺

---

## ✅ `TornadoElemental.mdl` —— 9 dummies

> v0.27.5 已出貨（6 綁定 3 除名）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u00A` | 蒸汽球 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o01H` | 螺旋劍 | 4.0 | 1 | 〔trigger spiralAttack〕 ⚠️（未對上出貨名冊） |
| `e00Y` | 雷電風暴 | 3.0 | 1 | **15-03 雷電風暴** → `godie-emfr.e` |
| `o01P` | 天翔龍閃 | 3.0 | 3 | 47-04 天翔龍閃 ⚠️（未對上出貨名冊）<br>**78-03 廬山昇龍破** → `godie-u00v.e`<br>〔trigger init_Die〕 ⚠️（未對上出貨名冊） |
| `h01S` | 三千世界特效單位(龍捲風) | 2.0 | 1 | **11-04 三千世界** → `godie-u01u.r`, `godie-udre.r` |
| `u00Z` | starbreaker | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h027` | 三檔旋風 | 2.0 | 1 | 〔trigger Luf_Three_Effect〕 ⚠️（未對上出貨名冊） |
| `e013` | 畫龍點睛 | 2.0 | 1 | **01-03 畫龍點睛** → `godie-hart.e` |
| `e016` | 雷電風暴-千之雷 | 2.0 | 1 | **15-04 千之雷** → `godie-emfr.r` |

## ⬜ `GryphonAviary.mdl` —— 8 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `n00C` | 英靈殿 |  | 1 | ⚪ trigger 未解 |
| `n00D` | 英靈殿 |  | 1 | ⚪ trigger 未解 |
| `n00E` | 英靈殿 |  | 1 | ⚪ trigger 未解 |
| `n00F` | 英靈殿 |  | 1 | ⚪ trigger 未解 |
| `n00G` | 英靈殿 |  | 1 | ⚪ trigger 未解 |
| `n00U` | 英靈殿 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n01J` | 英靈殿 |  | 1 | ⚪ trigger 未解 |
| `n01K` | 英靈殿 |  | 1 | ⚪ trigger 未解 |

## ⬜ `CrystalShard.mdl` —— 7 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `e00A` | 防具飾品進階合成表 | 1.5 | 2 | ⚪ trigger 未解 |
| `e00O` | 防具飾品合成表(一) | 1.5 | 2 | ⚪ trigger 未解 |
| `n00X` | 黑核晶 | 3.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n00O` | 黑核晶 | 3.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n00Y` | 黑核晶 | 3.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n00Z` | 黑核晶 | 3.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `e011` | 防具飾品合成表(二) | 1.5 | 2 | ⚪ trigger 未解 |

## ⬜ `Hydralisk.mdl` —— 7 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u016` | 異形母體 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u019` | 小異形 | 1.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01B` | 異形母體 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01C` | 異形母體 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01D` | 小異形 | 1.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01E` | 小異形 | 1.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01T` | 異形皇后 | 3.0 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ✅ `MonsoonBoltTarget.mdl` —— 6 dummies

> v0.27.0 已出貨（o00E 一族 12 支）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o00E` | 打雷 | 10.0 | 10 | **25-04 ChangeDNA** → `godie-u00l.r`, `godie-umal.r`<br>32-03 閃光龍牙 ⚠️（未對上出貨名冊）<br>**45-02 千鳥流** → `godie-edem.w`<br>**86-04 打雷絕招** → `godie-o00k.r`<br>〔trigger Fifty_Sky_Effect〕 ⚠️（未對上出貨名冊）<br>〔trigger Open_Skill_of_Pikachu_Copy〕 ⚠️（未對上出貨名冊）<br>〔trigger Open_Skill_of_Pikachu〕 ⚠️（未對上出貨名冊）<br>十萬伏特放電 (LightningSpread, 不在 HERO_NUMBERS — 疑 EX/隱藏技) ⚠️（未對上出貨名冊） |
| `h00Q` | 雷斬刀 | 10.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o00G` | avalon | 6.0 | 4 | **20-02 感知能力** → `godie-e002.q`, `godie-e00l.q`<br>**20-04 Avalon-永恆的理想鄉** → `godie-e002.r`, `godie-e00l.r`<br>**65-002 永恆的愚蠢鄉 (EX)** → `godie-udea.ex`<br>〔trigger Open_Skill_of_Saber〕 ⚠️（未對上出貨名冊） |
| `n00N` | 閃電 | 2.0 | 2 | **34-04 奧義˙蒼龍破** → `godie-osam.r`<br>**45-03 千鳥** → `godie-edem.e` |
| `n011` | 涅吉雷之斧 | 5.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o02M` | 疾風怒雷 | 6.0 | 1 | 〔trigger LigtingHamm〕 ⚠️（未對上出貨名冊） |

## ⛔ `collision.mdl` —— 6 dummies

> 碰撞代理 —— 永不可見

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `n00T` | 天地崩裂 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n010` | 億年樹 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n019` | 億年樹 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n01A` | 億年樹 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h02P` | 麒麟特效目標 | 0.1 | 1 | **45-03 千鳥** → `godie-edem.e` |
| `h02Q` | 麒麟特效目標 | 0.1 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `WhiteWolf.mdl` —— 5 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `n007` | 妖狐 | 1.1 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n00H` | 妖狐 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n00I` | 妖狐 | 1.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n00J` | 妖狐 | 1.3 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u02D` | 狼 |  | 0 | ⚪ 零生成點（w3a 通道待查） |

## ✅ `crescent.mdl` —— 5 dummies

> v0.27.6（travel 紅月斬 3 落點）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u017` | 大紅蓮斬 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01L` | 大紅蓮斬 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01M` | 大紅蓮斬 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01N` | 大紅蓮斬 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01O` | 大紅蓮斬 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `Magical_Sword.mdl` —— 4 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `e009` | 武器合成表 | 2.2 | 2 | ⚪ trigger 未解 |
| `e00B` | 法器合成表 | 2.4 | 2 | ⚪ trigger 未解 |
| `e00C` | 神器合成表 | 2.4 | 2 | ⚪ trigger 未解 |
| `e00M` | 史詩級傳說合成表 | 3.2 | 2 | ⚪ trigger 未解 |

## ⬜ `Wisp.mdl` —— 4 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h003` | 阿彌陀丸 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h004` | 阿彌陀丸 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h005` | 阿彌陀丸 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o00H` | 磁力球 |  | 1 | 05-03 及喀爾度 ⚠️（未對上出貨名冊） |

## 🔄 `ReviveHuman.mdl` —— 4 dummies

> 光束砲家族修正中 —— 一具＋scaleAxis 非等向拉長

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h007` | 特效龜派 | 1.25 | 3 | 03-04 全彈發射 ⚠️（未對上出貨名冊）<br>**90-04 陽光烈焰** → `godie-h02r.r`, `godie-hgam.r`<br>〔trigger Turtle_Power〕 ⚠️（未對上出貨名冊） |
| `h00S` | 勝利劍 | 0.2 | 3 | **20-03 約束與勝利之劍 (Excalibur)** → `godie-e002.e`, `godie-e00l.e`<br>**20-04 EX (Avalon EX / ExcaliburMAX)** → `godie-e002.r`, `godie-e00l.r`<br>〔trigger Open_Skill_of_Saber〕 ⚠️（未對上出貨名冊） |
| `h01V` | 81-03天神烈破 | 3.0 | 1 | 81-03 Divine Buster Extention ⚠️（未對上出貨名冊） |
| `n00V` | 星光炸裂 delete | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ✅ `TomeOfRetrainingCaster.mdl` —— 4 dummies

> v0.27.6 已出貨（4 支）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h00N` | 特效全彈 | 1.25 | 1 | 03-04 全彈發射 ⚠️（未對上出貨名冊） |
| `o00R` | 王者之笛 | 6.0 | 1 | 物品英雄之笛 (HeroCome) ⚠️（未對上出貨名冊） |
| `h025` | 騎英之守綱(特效) | 4.0 | 2 | **48-00 石化之眼** → `godie-hvsh.passive`<br>**48-04 騎英之疆繩** → `godie-hvsh.r` |
| `h02I` | 騎英之守綱(特效3) | 5.0 | 1 | 〔trigger Initate_Crazy〕 ⚠️（未對上出貨名冊） |

## ✅ `Meteor.mdl` —— 4 dummies

> v0.27.6（重轉 —— 舊 glb 6/7 面軟刪除）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `n00L` | 流星雨 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n009` | 火焰彈 | 1.6 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n00R` | 最終流星雨 | 5.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n01F` | 隕石擊 | 0.8 | 0 | ⚪ 零生成點（w3a 通道待查） |

## 🟡 `WarStompCaster.mdl` —— 4 dummies

> ⚠️ **2026-08-26 更正**（owner 質疑「why?」，逐隻複查後推翻原判）：
> 原本標「全族零落點 —— 刻意不轉」，⛔ **四隻裡有兩隻是錯的**。
> ⭐ 「零落點」有**兩種**，只有第一種才配得上「刻意不轉」：
> · **原作就沒有**（dummy 定義了卻從不生成）⇒ 綁它＝發明原作沒有的畫面 ⇒ ⛔ 刻意不轉
> · **我們還沒做到那一批** ⇒ 🟡 那是**待辦**，⛔ 不是裁決
>
> | dummy | 真相 | 判定 |
> |---|---|---|
> | `o00V` 蒼月道術特效2 | **0 個 JASS 生成點**（蒼月道術本身有出貨在 `godie-hpb1`，但這顆 dummy 從未被生成） | ⛔ 真·死內容 |
> | `h00Z` 九頭龍閃 | 有生成點（j:43351，`udg_Kenshine`），但主人**劍心 `godie-e012` 在 `content/_legacy/`** | ⚪ 主人未出貨 |
> | **`o019` 動地剁** | 有生成點（j:25772，`udg_KOFMaster`）＝ **龍虎亂舞家族** | 🟡 **卡 #672（OPEN，owner 點名）** |
> | **`o01U` 接技特效(動地跺)** | 有生成點（j:39425，`udg_HeavyTiger` 大虎）＝ 同族 | 🟡 **同 #672** |
>
> ⇒ owner 2026-08-23 逐字：「也別忘了**動地剁**，跟相關的音效要播出來」——
> 它**有**落點，只是那條線還沒做到。⛔ 模型該轉（#672 要用）。

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o00V` | 蒼月道術特效2 | 1.5 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h00Z` | 九頭龍閃 | 2.0 | 1 | 47-03 九頭龍閃 ⚠️（未對上出貨名冊） |
| `o019` | 動地剁 | 2.0 | 1 | 〔trigger DragonTigerReady〕 ⚠️（未對上出貨名冊） |
| `o01U` | 接技特效(動地跺) | 5.0 | 1 | 〔trigger Hell_Timer8〕 ⚠️（未對上出貨名冊） |

## ✅ `ForgottenOneTent.mdl` —— 4 dummies

> v0.27.7 已出貨（聖杯黑泥）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u02S` | 黑洞聖杯泥 | 2.0 | 1 | 疑似 69-03 (黑洞/InSpace; A0FK 不在 HERO_NUMBERS 69 技能表) ⚠️（未對上出貨名冊） |
| `u02W` | 聖杯黑泥 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u02V` | 聖杯黑泥 | 1.5 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u02X` | 聖杯黑泥 | 1.75 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⛔ `ChaosOrcRange.mdl` —— 3 dummies

> 全族隱形代理（逐點 ShowUnitHide）—— 刻意不轉

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `oshm` | None | 1.4 | 5 | (EX被動: 攻擊時嗚鎖打, 借用A0SR=22-003 嗚鎖打) ⚠️（未對上出貨名冊）<br>**22-00 嗚鎖打!** → `godie-e001.passive`, `godie-e00n.passive`<br>22-003 嗚鎖打 (EX 夜間追擊) ⚠️（未對上出貨名冊）<br>**89-03 憤怒的胸毛** → `godie-h02k.e`<br>**89-04 憤怒的簡諧運動** → `godie-h02k.r` |
| `h019` | 金鋼狼 | 1.6 | 1 | 31-01 迴旋爪擊 ⚠️（未對上出貨名冊） |
| `o031` | 安云加速 | 1.4 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `ANsaTarget.mdl` —— 3 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o002` | 死亡筆記本 |  | 3 | **44-03 火車輾過** → `godie-emns.e`<br>**44-04 心臟麻痺** → `godie-emns.r` |
| `o00B` | 天地魔鬥 |  | 1 | HolyShit 環狀衝擊 (A01W 不在 HERO_NUMBERS 37 清單) ⚠️（未對上出貨名冊） |
| `o000` | 復仇之袍 |  | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `Roots.mdl` —— 3 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o00A` | 魔界植物 |  | 3 | **18-02 寄生種子** → `godie-n00p.w`, `godie-nsjs.w`<br>**18-03 妖狐變化 (妖狐型態反擊, 與 A0P7 等級連動)** → `godie-n00p.e`, `godie-nsjs.e`<br>億年樹EX/超級老樹 (A00O 未列於 HERO_NUMBERS 18 技能表) ⚠️（未對上出貨名冊） |
| `n00Q` | 千年練成樹精 | 1.5 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n01M` | 千年練成樹精 | 1.5 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `Tichondrius.mdl` —— 3 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u001` | 巴恩大魔王 | 1.85 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u00D` | 巴恩大魔王 | 1.85 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u00E` | 巴恩大魔王 | 1.85 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `BanditSpearThrower.mdl` —— 3 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h00B` | Pikeman | 1.3 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h00C` | Pikeman | 1.3 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o02A` | 愛爾摩士兵 |  | 0 | ⚪ 零生成點（w3a 通道待查） |

## ✅ `ThunderClapCaster.mdl` —— 3 dummies

> v0.27.7（雷切）＋ PRE2 出貨

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `e00G` | Chain Ball Effect | 2.7 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o006` | 雷切 | 3.5 | 2 | 23-04 雷焰聖劍 ⚠️（未對上出貨名冊）<br>**45-03 千鳥** → `godie-edem.e` |
| `o01F` | 雷光劍(落雷) | 2.0 | 1 | 〔trigger Light_Fight〕 ⚠️（未對上出貨名冊） |

## ✅ `MarkOfChaosTarget.mdl` —— 3 dummies

> v0.28.1（PRE2×4 ＋ 家族規則 9 支）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h013` | 新龍破斬2 |  | 1 | **04-03 龍破斬** → `godie-h020.e`, `godie-hjai.e` |
| `o01S` | 卍解 | 5.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n015` | 死之王 |  | 0 | ⚪ 零生成點（w3a 通道待查） |

## ✅ `MidchilderNanohaAura.mdl` —— 3 dummies

> v0.28.0（長尾五族）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h01Y` | 奈葉魔法陣 |  | 2 | 81-03 Divine Buster Extention ⚠️（未對上出貨名冊）<br>81-04 Starlight Breaker Plus ⚠️（未對上出貨名冊） |
| `h01Z` | 奈葉魔法陣（放大） | 2.0 | 2 | 81-03 Divine Buster Extention ⚠️（未對上出貨名冊）<br>81-04 Starlight Breaker Plus ⚠️（未對上出貨名冊） |
| `h02D` | 騎英魔法陣 | 1.5 | 1 | 〔trigger Initate_Crazy〕 ⚠️（未對上出貨名冊） |

## ⬜ `UnholyAura.mdl` —— 3 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o026` | 23魔法陣 | 2.0 | 1 | 23-01 電離光槍 - 繁星飛躍 ⚠️（未對上出貨名冊） |
| `o027` | 23魔法陣2 | 3.0 | 1 | 23-04 雷焰聖劍 ⚠️（未對上出貨名冊） |
| `u02R` | 黃色魔法陣 | 3.0 | 1 | 23-03 雷牙一閃˙雷牙烈霸 ⚠️（未對上出貨名冊） |

## ⬜ `GargoyleSpire.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `utod` | 野野村病院 |  | 3 | ⚪ trigger 未解 |
| `eilw` | None |  | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `VillagerMan.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `nvl2` | 好國民打鐵舖 |  | 2 | ⚪ trigger 未解 |
| `h031` | 鄉民 | 1.5 | 1 | 〔trigger Ptt_Judge〕 ⚠️（未對上出貨名冊） |

## ⬜ `NetherDragon.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `uloc` | None | 0.6 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u028` | 冥龍 | 0.8 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `BloodElfBall.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `uktg` | Gantz | 8.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `e014` | Gantz(商店) | 7.0 | 2 | ⚪ trigger 未解 |

## ⬜ `boxcat.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `oeye` | 保險箱 | 3.0 | 5 | ⚪ trigger 未解 |
| `o028` | 保險箱 | 3.0 | 5 | ⚪ trigger 未解 |

## ⬜ `HeroRyuk.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `nhar` | 死神 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `n012` | 路克 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `BlackHole1.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `osp1` | 教室 | 3.0 | 1 | 小考 (quiz, A0WK 不在 HERO_NUMBERS 93 清單) ⚠️（未對上出貨名冊） |
| `o01N` | 重力之球 | 2.5 | 3 | **34-002 冥道殘月破 (EX)** → `godie-osam.ex`<br>〔trigger AKT_3〕 ⚠️（未對上出貨名冊）<br>〔trigger GravityBall〕 ⚠️（未對上出貨名冊） |

## ⬜ `ChimaeraRoost.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u004` | 神殿-愛與和平 | 1.2 | 2 | ⚪ trigger 未解 |
| `n01H` | 英靈殿 | 1.2 | 1 | ⚪ trigger 未解 |

## ⬜ `Student.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u005` | 痴漢戰士 |  | 3 | 〔trigger GoDie_Center_SpawnF〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_North_SpawnF〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_South_SpawnF〕 ⚠️（未對上出貨名冊） |
| `u01I` | 痴漢戰士 |  | 3 | 〔trigger GoDie_Center_SpawnF〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_North_SpawnF〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_South_SpawnF〕 ⚠️（未對上出貨名冊） |

## ⬜ `KonYui.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u006` | 愛的戰士 |  | 3 | 〔trigger Love_Center_SpawnF〕 ⚠️（未對上出貨名冊）<br>〔trigger Love_North_SpawnF〕 ⚠️（未對上出貨名冊）<br>〔trigger Love_South_SpawnF〕 ⚠️（未對上出貨名冊） |
| `u01H` | 愛的戰士 |  | 3 | 〔trigger Love_Center_SpawnF〕 ⚠️（未對上出貨名冊）<br>〔trigger Love_North_SpawnF〕 ⚠️（未對上出貨名冊）<br>〔trigger Love_South_SpawnF〕 ⚠️（未對上出貨名冊） |

## ⬜ `Ritsu.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u007` | 科科鼓手 | 1.2 | 3 | 〔trigger GoDie_Center_SpawnM〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_North_SpawnM〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_South_SpawnM〕 ⚠️（未對上出貨名冊） |
| `u01K` | 科科鼓手 | 1.2 | 3 | 〔trigger GoDie_Center_SpawnM〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_North_SpawnM〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_South_SpawnM〕 ⚠️（未對上出貨名冊） |

## ⬜ `AzuNyan.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u008` | 害羞吉他手 | 1.2 | 3 | 〔trigger Love_Center_SpawnM〕 ⚠️（未對上出貨名冊）<br>〔trigger Love_North_SpawnM〕 ⚠️（未對上出貨名冊）<br>〔trigger Love_South_SpawnM〕 ⚠️（未對上出貨名冊） |
| `u01J` | 害羞吉他手 | 1.2 | 3 | 〔trigger Love_Center_SpawnM〕 ⚠️（未對上出貨名冊）<br>〔trigger Love_North_SpawnM〕 ⚠️（未對上出貨名冊）<br>〔trigger Love_South_SpawnM〕 ⚠️（未對上出貨名冊） |

## ⬜ `MortarMissile.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u009` | None | 4.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h00H` | 仙氣 | 2.5 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `VolcanoDeath.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o004` | 火山爆炸石 | 5.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o024` | 81爆裂 | 3.0 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `Standard0.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `e00D` | 愛你團專武合成表 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `e00E` | 去死團專武合成表 |  | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `Knight.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h00D` | Horseman |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h00E` | Horseman |  | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `ShockwaveMissile.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h00K` | Holy Strike Missile |  | 2 | 16-02 阿彌陀流真空佛陀斬 (comment: 真空佛陀斬) ⚠️（未對上出貨名冊）<br>〔trigger Soul_Shock〕 ⚠️（未對上出貨名冊） |
| `h02H` | 騎英之守綱(特效2) | 3.0 | 1 | 〔trigger Initate_Crazy〕 ⚠️（未對上出貨名冊） |

## ⬜ `FarseerMissile.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `e00H` | Chain Bolt | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o01T` | 接技特效兼隱藏施法 | 3.5 | 3 | 〔trigger Hell_Rock_Move〕 ⚠️（未對上出貨名冊）<br>〔trigger Hell_Timer2〕 ⚠️（未對上出貨名冊）<br>〔trigger Hell_Timer4〕 ⚠️（未對上出貨名冊） |

## 🔄 `Awaken.mdl` —— 2 dummies

> 同上（模型 2026-08-26 新轉）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h00M` | 特效加農炮 | 1.25 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h01P` | 野戰電子砲 |  | 1 | **59-04 野戰型陽電子砲** → `godie-e00r.r` |

## ⬜ `FrostNovaTarget.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o00P` | 寒冰 | 1.8 | 1 | 〔trigger Run_Effect〕 ⚠️（未對上出貨名冊） |
| `u013` | 世界終結 | 3.0 | 2 | 〔trigger The_End_ofWorldCasting_EX〕 ⚠️（未對上出貨名冊）<br>〔trigger The_End_ofWorldCasting〕 ⚠️（未對上出貨名冊） |

## ⬜ `PossessionCaster.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o00S` | 黑洞 | 10.0 | 1 | 疑似 69-03 (黑洞/InSpace; A0FK 不在 HERO_NUMBERS 69 技能表) ⚠️（未對上出貨名冊） |
| `o029` | 毀滅彈 | 10.0 | 1 | **28-04 破滅能量彈** → `godie-huth.r` |

## 🔄 `NetherStrike.mdl` —— 2 dummies

> 同上（20-03 黑化分支 · 45-002 天照）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h00X` | 勝利劍 黑化 | 0.2 | 2 | **20-03 約束與勝利之劍 (Excalibur)** → `godie-e002.e`, `godie-e00l.e`<br>〔trigger Open_Skill_of_DarkSaber〕 ⚠️（未對上出貨名冊） |
| `h030` | 佐助萬花筒效果 | 4.0 | 1 | **45-002 天照 (EX)** → `godie-edem.ex` |

## 🔄 `DeathWave.mdl` —— 2 dummies

> 同上（79-03 月牙天衝虛化）

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o00T` | 固有結界 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o01R` | 月牙天衝(虛化) | 2.0 | 1 | 〔trigger Bleach_Moon〕 ⚠️（未對上出貨名冊） |

## ⬜ `DuneWorm.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o010` | 黑龍波龍形 |  | 1 | 〔trigger Open_Skill_of_Hehi〕 ⚠️（未對上出貨名冊） |
| `o01V` | 黑龍波龍形2 | 5.0 | 2 | **38-04 黑龍波吸收** → `godie-u010.r`, `godie-uvng.r`<br>〔trigger Open_Skill_of_Hehi〕 ⚠️（未對上出貨名冊） |

## ⬜ `DiabloCar.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u002` | 兄貴戰士 |  | 3 | 〔trigger AICallHelp〕 ⚠️（未對上出貨名冊）<br>〔trigger GoDie_CenterFi〕 ⚠️（未對上出貨名冊） |
| `u02U` | 援軍戰士 |  | 1 | 〔trigger Wood_Warrior〕 ⚠️（未對上出貨名冊） |

## ⬜ `ParasiteMissile.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h000` | 龍氣 | 2.0 | 1 | **12-04 龍氣爆發** → `godie-e007.r`, `godie-ewar.r` |
| `h02X` | 太陽光束 | 7.0 | 1 | 〔trigger SunFire_pre〕 ⚠️（未對上出貨名冊） |

## ⬜ `HeroSaber.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u00C` | None |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h02G` | Saber殘影 | 1.1 | 1 | **20-04 EX (Avalon EX / ExcaliburMAX)** → `godie-e002.r`, `godie-e00l.r` |

## ⬜ `DarkPortalTarget.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o017` | 九刀流特效 | 2.0 | 1 | **11-03 鬼氣九刀流-阿修羅壹霧銀** → `godie-u01u.e`, `godie-udre.e` |
| `u018` | 安云衝刺 | 2.0 | 4 | 16-03 無無明亦無 (comment: 無無明亦無) ⚠️（未對上出貨名冊）<br>19-03 瞬切百殺 ⚠️（未對上出貨名冊）<br>19-04 幻影暗殺 ⚠️（未對上出貨名冊）<br>**20-04 EX (Avalon EX / ExcaliburMAX)** → `godie-e002.r`, `godie-e00l.r` |

## ⬜ `HeroMusashiMiyamoto.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o018` | 索龍分身 |  | 6 | **11-03 鬼氣九刀流-阿修羅壹霧銀** → `godie-u01u.e`, `godie-udre.e` |
| `h01T` | 三千世界特效單位(索隆) | 1.5 | 1 | **11-04 三千世界** → `godie-u01u.r`, `godie-udre.r` |

## ⬜ `AbsorbManaBirthMissile.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u00P` | 式神 | 3.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `h024` | 騎英之守綱 | 15.0 | 1 | **48-04 騎英之疆繩** → `godie-hvsh.r` |

## ⬜ `OblivionAura.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o01G` | 東風檜扇南風末廣 |  | 2 | 〔trigger Wind_Effect〕 ⚠️（未對上出貨名冊） |
| `o01L` | 召喚顯示特效 | 5.0 | 1 | 〔trigger AKT_Effect〕 ⚠️（未對上出貨名冊） |

## ⬜ `VillagerWoman.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h01G` | 和香 | 1.0 | 1 | 〔trigger AKT_start〕 ⚠️（未對上出貨名冊） |
| `h01Q` | 佩 |  | 1 | 35-00 召喚佩 ⚠️（未對上出貨名冊） |

## ⬜ `DoomDeath.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o01M` | 火焰爆炸 | 8.0 | 2 | 〔trigger AKT_2〕 ⚠️（未對上出貨名冊）<br>〔trigger BR_Law〕 ⚠️（未對上出貨名冊） |
| `o021` | 豪火龍之術-末日 | 2.0 | 1 | **45-01 火遁-豪火龍之術** → `godie-edem.q` |

## ⬜ `OrbOfDeathMissile.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `u00U` | Rider衝刺 | 7.0 | 2 | 〔trigger Bleach_Moon_Effect〕 ⚠️（未對上出貨名冊）<br>〔trigger Crazy_Movement〕 ⚠️（未對上出貨名冊） |
| `u00X` | 胖虎搖滾 | 10.0 | 1 | 〔trigger Hell_Timer9〕 ⚠️（未對上出貨名冊） |

## ⬜ `BronzeDragon.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h01K` | 金色巨龍 | 4.0 | 6 | 〔trigger GoldDrgan_Effect〕 ⚠️（未對上出貨名冊）<br>金龍吞噬 (EX, 無NN編號) ⚠️（未對上出貨名冊） |
| `o01Y` | 龍拳 | 4.0 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `NeutralizationMissile.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o01Q` | 月牙天衝 | 10.0 | 1 | 〔trigger Bleach_Moon〕 ⚠️（未對上出貨名冊） |
| `o01W` | 呂布斷光 | 6.0 | 0 | ⚪ 零生成點（w3a 通道待查） |

## ⬜ `Darkraor.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o020` | 豪火龍之術 | 2.0 | 1 | **45-01 火遁-豪火龍之術** → `godie-edem.q` |
| `h02F` | 黑龍頭 | 2.0 | 3 | **38-03 邪王炎殺黑龍波** → `godie-u010.e`, `godie-uvng.e` |

## ⬜ `Banditmissile.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o02J` | 涅吉雷之投擲 | 4.0 | 1 | 82-03 雷之投擲 ⚠️（未對上出貨名冊） |
| `o02K` | 戰鬥涅吉巨神殺 | 8.0 | 1 | 82-00-01 魔法射手-光箭 ⚠️（未對上出貨名冊） |

## ⬜ `LightningTornado.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h00R` | 神鳴 |  | 0 | ⚪ 零生成點（w3a 通道待查） |
| `o02U` | 雷光投射 | 0.5 | 1 | 〔trigger Light_sword〕 ⚠️（未對上出貨名冊） |

## ⬜ `TidalGuardian.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `h00Y` | 老二 | 2.0 | 0 | ⚪ 零生成點（w3a 通道待查） |
| `u01P` | 死亡老二映像 | 1.5 | 1 | 〔trigger DMC_Dead〕 ⚠️（未對上出貨名冊） |

## ⬜ `AquaSpikeVersion2.mdl` —— 2 dummies

> 未清算

| rawcode | dummy 名 | scale | 生成點 | 技能 → GGD 落點 |
|---|---|---:|---:|---|
| `o02Y` | 涅吉風花武裝解除 | 2.0 | 1 | **15-002 風花-武裝解除 (EX)** → `godie-emfr.ex` |
| `h032` | 龍氣2 GodEye | 2.0 | 2 | **02-002 神通眼 (EX)** → `godie-hvwd.ex`<br>**02-04 百鬼夜行** → `godie-hvwd.r` |


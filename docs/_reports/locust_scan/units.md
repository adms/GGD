# 蝗蟲群/特效 dummy 普查（locust_scan · 2026-08-25 · 唯讀）
> ⚠️ **一次性偵察紀錄（保留，⛔ 不刪）** —— 正式版是產生的：`docs/蝗蟲群對應表.md`＋`tools/locust-census/census.json`（`pnpm locust:build` / `pnpm locust:check`）。

來源：`tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json` 的 `units`（461 隻，非英雄）
＋ `UNIT_TINTS.json`（#263 的解析後頂點色）。機讀版：同目錄 `units.json`（236 列）。

## 一、判準（⛔ 逐字寫死，不是印象）

一隻 unit 進普查集，當它命中**任一**條：

| 代號 | 條件 | 命中數 |
|---|---|---:|
| `Aloc` | `abilities` 含 `Aloc`（蝗蟲 = WC3 的「不可選取 dummy」標記） | 231 |
| `fx-name` | `name` 含「特效」 | 24（其中 2 隻**沒有** Aloc） |
| `hp1-noatk` | `hp <= 1` 且 `dmg_base ∈ {0, null}` | 27（其中 3 隻**沒有** Aloc） |

聯集 = **236 隻**（Aloc 231 + fx-name-only 2 + hp1-only 3）。

### ⚠️ 任務原判準「base 是 hpea/ushd 類」與實測不符

231 隻 Aloc dummy 的 base 橫跨 **19 個 rawcode**，`ushd` 只有 1 隻。實測分佈（普查集 236）：

| base | 隻數 | base | 隻數 |
|---|---:|---|---:|
| `ogru` | 82 | `uban` | 2 |
| `hpea` | 55 | `uplg` | 2 |
| `uaco` | 37 | `hmpr` | 1 |
| `hfoo` | 13 | `hkni` | 1 |
| `ewsp` | 11 | `ncg2` | 1 |
| `hwat` | 9 | `ngsp` | 1 |
| `ninf` | 9 | `osp1` | 1 |
| `hspt` | 4 | `uloc` | 1 |
| `ncg3` | 2 | `ugho` | 1 |
| `oshm` | 2 | `ushd` | 1 |

⇒ 用 base 當判準會漏掉大半；**`Aloc` 才是承重判準**，base 只是各作者的習慣。
⭐ 最大宗 `ogru`（Grunt，82 隻）不是巧合 —— 見第三節：**original 表的 `ogru` 本身被改成紅色 tint**，
82 隻 dummy 全部繼承。

### 灰色地帶（逐隻列，⛔ 不是掃過去）

**① Aloc 但有戰鬥數值（34 隻，`gray: combat-stats`）** —— 有 Aloc（不可選取）但 `dmg_base > 0` 或 `hp >= 100`：
多是「會攻擊的鎖定系統/召喚物」（`u00G` 自動鎖定系統 hp 1285/dmg 250、`h00C` Pikeman、`h00G` Samurai…）。
**留在集內**（它們仍是 locust 單位、多半掛特效模型），但機讀檔標了 `combat-stats`，
Phase 2/6 拿去做「純視覺 dummy」清單時要自行過濾。
名單：`h000` `h00C` `h00E` `h00G` `h012` `h01A` `h01B` `h01X` `h02E` `h02F` `h02O` `h02X` `h032` `n01F` `o000` `o004` `o009` `o00I` `o015` `o01G` `o01L` `o01S` `o02X` `u00A` `u00G` `u00I` `u00P` `u00Q` `u00S` `u014` `u02S` `u02V` `u02W` `u02X`

**② 沒有 Aloc、只靠名字/血量進集（5 隻，`gray: no-Aloc`）**：

| id | name | 為什麼灰 |
|---|---|---|
| `h02M` | B叔特效 (聚氣目標) | hp 10000＋Avul，是「可被指定的特效錨點」不是 locust |
| `h02Q` | 麒麟特效目標 | 同上（collision.mdl，scale 0.1） |
| `h01D` | 集氣用單位 | hp 1、none.mdl，行為上是 dummy 但沒掛 Aloc |
| `n00S` | 屍暴 | ncg3 基底、hp 1、爆屍模型 —— 生成型一次性特效 |
| `n01D` | 聖夜 | 同上 |

**③ 邊界外但值得知道**：`heroes` 表（另 127 筆）沒掃 —— 任務指定 `units`（461）。
英雄變身用的 dummy 若掛在 hero rawcode 上不在本表。

## 二、逐隻表（236 隻）

欄位說明：`tint` = UNIT_TINTS.json 解析後的 rgb255（**空 = 未染色 255/255/255**）；
`alpha` 一欄**整張表都是 —**，因為 w3u 根本沒有這個欄位（見第三節）。
model 特殊值：`(承襲)` = null（用 base 單位的模型）；`(隱形)` = `.mdl`/` .mdl`/`none.mdl`/`collision.mdl`。

| id | name | model | scale | tint | 判準 | 灰 |
|---|---|---|---:|---|---|---|
| `e003` | 特效 | `RedDragonMissile.mdl` | 4 |  | Aloc+fx-name |  |
| `e004` | 隕石特效 | `InfernalBirth.mdl` |  |  | Aloc+fx-name |  |
| `e00F` | 暫存單位 | (隱形:`.mdl`) |  |  | Aloc |  |
| `e00G` | Chain Ball Effect | `ThunderClapCaster.mdl` | 2.7 | 0,255,255 | Aloc |  |
| `e00H` | Chain Bolt | `FarseerMissile.mdl` | 2 | 0,255,255 | Aloc |  |
| `e00I` | 蒸氣球 | (隱形:`.mdl`) |  |  | Aloc |  |
| `e00Y` | 雷電風暴 | `TornadoElemental.mdl` | 3 | 150,150,255 | Aloc |  |
| `e013` | 畫龍點睛 | `TornadoElemental.mdl` | 2 | 150,150,255 | Aloc |  |
| `e016` | 雷電風暴-千之雷 | `TornadoElemental.mdl` | 2 | 255,0,255 | Aloc |  |
| `e017` | 30變態紳士 | `HeroShadowHunter.mdl` |  |  | Aloc |  |
| `ewsp` |  | (承襲) |  |  | Aloc |  |
| `h000` | 龍氣 | `ParasiteMissile.mdl` | 2 |  | Aloc | combat-stats |
| `h002` | 幻影 | `HeroCloudStrife.mdl` | 1.3 |  | Aloc |  |
| `h006` | 龜派氣功 | `FlameStrike1.mdl` |  |  | Aloc+hp1-noatk |  |
| `h007` | 特效龜派 | `ReviveHuman.mdl` | 1.25 |  | Aloc+fx-name+hp1-noatk |  |
| `h008` | 特效三號 | `FragDriller.mdl` | 2 |  | Aloc+fx-name+hp1-noatk |  |
| `h009` | 手裡劍 | `GlaiveMissile.mdl` | 0.8 |  | Aloc |  |
| `h00A` | 廣域特效 | (隱形:`.mdl`) |  |  | Aloc+fx-name |  |
| `h00C` | Pikeman | `BanditSpearThrower.mdl` | 1.3 | 255,200,200 | Aloc | combat-stats |
| `h00E` | Horseman | `Knight.mdl` |  |  | Aloc | combat-stats |
| `h00G` | Samurai | (承襲) |  |  | Aloc | combat-stats |
| `h00H` | 仙氣 | `MortarMissile.mdl` | 2.5 | 100,100,255 | Aloc+hp1-noatk |  |
| `h00I` | 幻影 | `SD2.mdl` | 1.3 |  | Aloc |  |
| `h00J` | 靈魂衝擊 | `ResurrectCaster.mdl` |  |  | Aloc |  |
| `h00K` | Holy Strike Missile | `ShockwaveMissile.mdl` |  |  | Aloc |  |
| `h00M` | 特效加農炮 | `Awaken.mdl` | 1.25 | 150,150,0 | Aloc+fx-name+hp1-noatk |  |
| `h00N` | 特效全彈 | `TomeOfRetrainingCaster.mdl` | 1.25 | 150,150,0 | Aloc+fx-name+hp1-noatk |  |
| `h00O` | 特效集氣 | `MassTeleportTarget.mdl` | 1.25 | 150,150,0 | Aloc+fx-name+hp1-noatk |  |
| `h00P` | 迴旋標 | `BloodElfSpellThiefMISSILE.mdl` | 1.8 |  | Aloc |  |
| `h00Q` | 雷斬刀 | `MonsoonBoltTarget.mdl` | 10 |  | Aloc |  |
| `h00R` | 神鳴 | `LightningTornado.mdl` |  |  | Aloc |  |
| `h00S` | 勝利劍 | `ReviveHuman.mdl` | 0.2 | 255,100,100 | Aloc+hp1-noatk |  |
| `h00T` | Rider幻影 | `HeroRider.mdl` | 1.4 |  | Aloc |  |
| `h00U` | Frostsphere | `AIfbTarget.mdl` | 5 |  | Aloc |  |
| `h00V` | Frostsphere | `FlameThrowerSpawnObj.mdl` |  |  | Aloc |  |
| `h00X` | 勝利劍 黑化 | `NetherStrike.mdl` | 0.2 |  | Aloc+hp1-noatk |  |
| `h00Y` | 老二 | `TidalGuardian.mdl` | 2 | 0,0,0 | Aloc |  |
| `h00Z` | 九頭龍閃 | `WarStompCaster.mdl` | 2 | 255,100,100 | Aloc+hp1-noatk |  |
| `h010` | 夜晚 | (隱形:`.mdl`) |  |  | Aloc+hp1-noatk |  |
| `h011` | 白天 | (隱形:`.mdl`) |  |  | Aloc+hp1-noatk |  |
| `h012` | 枷鎖 | (隱形:`.mdl`) |  |  | Aloc | combat-stats |
| `h013` | 新龍破斬2 | `MarkOfChaosTarget.mdl` |  |  | Aloc |  |
| `h014` | 新龍破斬1 | `FireBlast.mdl` | 4.5 |  | Aloc |  |
| `h015` | 騎英之守綱 | `AWING.mdl` | 3 |  | Aloc |  |
| `h016` | 飛鼠先生殘影 | `HeroDeathKnight.mdl` |  |  | Aloc |  |
| `h017` | 安云殘影 | `HeroKunoichi.mdl` |  |  | Aloc |  |
| `h018` | 賽飛殘影 | `HeroSephiroth.mdl` |  |  | Aloc |  |
| `h019` | 金鋼狼 | `ChaosOrcRange.mdl` | 1.6 | 255,255,0 | Aloc+hp1-noatk |  |
| `h01A` | 三檔 | (承襲) |  |  | Aloc | combat-stats |
| `h01B` | 二檔 | (承襲) |  |  | Aloc | combat-stats |
| `h01C` | 魯夫殘影兼隱藏施法 | `Luffe.mdl` | 1.3 |  | Aloc |  |
| `h01D` | 集氣用單位 | (隱形:`none.mdl`) | 0.5 |  | hp1-noatk | no-Aloc |
| `h01E` | 集氣用單位(施法) | (隱形:`none.mdl`) | 1.5 |  | Aloc |  |
| `h01F` | 皮卡 | `HeroPika.mdl` | 0.4 |  | Aloc |  |
| `h01G` | 和香 | `VillagerWoman.mdl` | 1 | 255,100,100 | Aloc |  |
| `h01H` | 夏娜 | `HeroShana.mdl` | 1.25 |  | Aloc |  |
| `h01I` | 涼宮 | `Sorceress_V1.mdl` | 1 |  | Aloc |  |
| `h01M` | 集氣用單位(施法胖虎) | (隱形:`none.mdl`) | 1.5 |  | Aloc |  |
| `h01P` | 野戰電子砲 | `Awaken.mdl` |  | 100,100,0 | Aloc+hp1-noatk |  |
| `h01R` | 光牙 | `Owl.mdl` |  |  | Aloc |  |
| `h01S` | 三千世界特效單位(龍捲風) | `TornadoElemental.mdl` | 2 | 100,150,255 | Aloc+fx-name |  |
| `h01T` | 三千世界特效單位(索隆) | `HeroMusashiMiyamoto.mdl` | 1.5 | 100,150,255 | Aloc+fx-name |  |
| `h01V` | 81-03天神烈破 | `ReviveHuman.mdl` | 3 | 255,50,100 | Aloc+hp1-noatk |  |
| `h01X` | 大石頭 | (隱形:`.mdl`) |  |  | Aloc | combat-stats |
| `h01Y` | 奈葉魔法陣 | `MidchilderNanohaAura.mdl` |  | 255,100,100 | Aloc+hp1-noatk |  |
| `h01Z` | 奈葉魔法陣（放大） | `MidchilderNanohaAura.mdl` | 2 | 255,100,100 | Aloc+hp1-noatk |  |
| `h023` | 熊熊幻影 | `PolarBear.mdl` |  | 255,200,0 | Aloc |  |
| `h024` | 騎英之守綱 | `AbsorbManaBirthMissile.mdl` | 15 | 255,0,255 | Aloc |  |
| `h025` | 騎英之守綱(特效) | `TomeOfRetrainingCaster.mdl` | 4 | 255,0,255 | Aloc+fx-name |  |
| `h026` | 三檔拳頭 | `Luffe punch.mdl` | 10 |  | Aloc |  |
| `h027` | 三檔旋風 | `TornadoElemental.mdl` | 2 |  | Aloc |  |
| `h02A` | 白天 | (隱形:`.mdl`) |  |  | Aloc+hp1-noatk |  |
| `h02B` | 夜晚 | (隱形:`.mdl`) |  |  | Aloc+hp1-noatk |  |
| `h02C` | 絕對屏障 | `AnimateDeadTarget.mdl` |  |  | Aloc+hp1-noatk |  |
| `h02D` | 騎英魔法陣 | `MidchilderNanohaAura.mdl` | 1.5 | 255,100,100 | Aloc+hp1-noatk |  |
| `h02E` | 黑龍身體 | `BlackHole.mdl` | 0.1 | 0,0,0 | Aloc | combat-stats |
| `h02F` | 黑龍頭 | `Darkraor.mdl` | 2 | 0,0,0 | Aloc | combat-stats |
| `h02G` | Saber殘影 | `HeroSaber.mdl` | 1.1 |  | Aloc |  |
| `h02H` | 騎英之守綱(特效2) | `ShockwaveMissile.mdl` | 3 |  | Aloc+fx-name |  |
| `h02I` | 騎英之守綱(特效3) | `TomeOfRetrainingCaster.mdl` | 5 |  | Aloc+fx-name |  |
| `h02J` | 普烏細胞 | (隱形:`.mdl`) |  |  | Aloc |  |
| `h02L` | 剎那施法單位 | (隱形:`none.mdl`) | 1 |  | Aloc |  |
| `h02M` | B叔特效 (聚氣目標) | (隱形:`.mdl`) |  |  | fx-name | no-Aloc |
| `h02O` | 麒麟特效 | (隱形:`.mdl`) |  |  | Aloc+fx-name | combat-stats |
| `h02P` | 麒麟特效目標 | (隱形:`collision.mdl`) | 0.1 |  | Aloc+fx-name |  |
| `h02Q` | 麒麟特效目標 | (隱形:`collision.mdl`) | 0.1 |  | fx-name | no-Aloc |
| `h02T` | 馬頭 | `horsehead.mdl` |  |  | Aloc |  |
| `h02W` | 81-01彗星灼烈 | `StasisTotemTarget.mdl` | 5 |  | Aloc |  |
| `h02X` | 太陽光束 | `ParasiteMissile.mdl` | 7 | 255,150,0 | Aloc | combat-stats |
| `h030` | 佐助萬花筒效果 | `NetherStrike.mdl` | 4 |  | Aloc |  |
| `h032` | 龍氣2 GodEye | `AquaSpikeVersion2.mdl` | 2 |  | Aloc | combat-stats |
| `hfoo` | 共用隱藏施法單位 | (隱形:`.mdl`) |  |  | Aloc |  |
| `hkni` | 共用隱藏施法單位 | (隱形:`.mdl`) | 3 |  | Aloc |  |
| `hpea` |  | `DeathCoilMissile.mdl` |  |  | Aloc |  |
| `n009` | 火焰彈 | `Meteor.mdl` | 1.6 | 255,0,0 | Aloc |  |
| `n00L` | 流星雨 | `Meteor.mdl` |  |  | Aloc |  |
| `n00M` | 賽飛天使 | `ReviveDemon.mdl` | 2 | 255,150,150 | Aloc |  |
| `n00N` | 閃電 | `MonsoonBoltTarget.mdl` | 2 |  | Aloc |  |
| `n00R` | 最終流星雨 | `Meteor.mdl` | 5 |  | Aloc |  |
| `n00S` | 屍暴 | `OrcSmallDeathExplode.mdl` | 5 |  | hp1-noatk | no-Aloc |
| `n00T` | 天地崩裂 | (隱形:`collision.mdl`) |  |  | Aloc |  |
| `n00V` | 星光炸裂 delete | `ReviveHuman.mdl` | 2 | 255,0,0 | Aloc |  |
| `n015` | 死之王 | `MarkOfChaosTarget.mdl` |  |  | Aloc |  |
| `n01D` | 聖夜 | `AIilTarget.mdl` |  |  | hp1-noatk | no-Aloc |
| `n01F` | 隕石擊 | `Meteor.mdl` | 0.8 | 200,150,150 | Aloc | combat-stats |
| `n01I` | 星光爆裂 | `LasercannonfinalRED.mdl` |  |  | Aloc |  |
| `ngsp` |  | (承襲) |  |  | Aloc |  |
| `o000` | 復仇之袍 | `ANsaTarget.mdl` |  | 255,0,0 | Aloc | combat-stats |
| `o001` | 北斗神拳 | `AbominationExplosion.mdl` |  | 255,0,0 | Aloc |  |
| `o002` | 死亡筆記本 | `ANsaTarget.mdl` |  | 255,0,0 | Aloc |  |
| `o003` | 生命之音 | (隱形:`.mdl`) |  | 255,0,0 | Aloc |  |
| `o004` | 火山爆炸石 | `VolcanoDeath.mdl` | 5 | 255,0,0 | Aloc | combat-stats |
| `o006` | 雷切 | `ThunderClapCaster.mdl` | 3.5 | 255,0,0 | Aloc |  |
| `o007` | 武神 | `cloud.mdl` | 0.8 | 255,0,0 | Aloc |  |
| `o008` | 流星 | (隱形:`.mdl`) |  | 255,0,0 | Aloc |  |
| `o009` | 隱藏特效單位 | (隱形:`.mdl`) |  | 255,0,0 | Aloc+fx-name | combat-stats |
| `o00A` | 魔界植物 | `Roots.mdl` |  | 255,0,0 | Aloc |  |
| `o00B` | 天地魔鬥 | `ANsaTarget.mdl` |  | 255,0,0 | Aloc |  |
| `o00D` | 自動鎖定系統 | (隱形:`.mdl`) |  | 255,0,0 | Aloc |  |
| `o00E` | 打雷 | `MonsoonBoltTarget.mdl` | 10 | 255,0,0 | Aloc |  |
| `o00F` | 黑化Saber | (隱形:`.mdl`) |  | 255,0,0 | Aloc |  |
| `o00G` | avalon | `MonsoonBoltTarget.mdl` | 6 | 100,0,0 | Aloc |  |
| `o00H` | 磁力球 | `Wisp.mdl` |  | 0,0,0 | Aloc |  |
| `o00I` | 竹蜻蜓 | `DeathPactTarget.mdl` | 3 | 0,0,0 | Aloc | combat-stats |
| `o00J` | 撲克牌 | (隱形:`.mdl`) |  | 255,0,0 | Aloc |  |
| `o00M` | 獸王爆裂陣 | `Boomnl.mdl` | 1 | 255,0,0 | Aloc |  |
| `o00N` | 獸王結界 | `VampiricAura.mdl` | 0.5 | 255,0,0 | Aloc |  |
| `o00O` | 狂戰士 | `HCancelDeath.mdl` | 3 | 255,0,0 | Aloc |  |
| `o00P` | 寒冰 | `FrostNovaTarget.mdl` | 1.8 | 255,0,0 | Aloc |  |
| `o00Q` | 魔法膨脹 | `UCancelDeath.mdl` | 4 | 0,0,0 | Aloc+hp1-noatk |  |
| `o00R` | 王者之笛 | `TomeOfRetrainingCaster.mdl` | 6 | 0,0,0 | Aloc+hp1-noatk |  |
| `o00S` | 黑洞 | `PossessionCaster.mdl` | 10 | 255,0,0 | Aloc |  |
| `o00T` | 固有結界 | `DeathWave.mdl` |  | 255,0,0 | Aloc |  |
| `o00U` | 真夜幻影 | `HeroGirl.mdl` |  | 255,0,0 | Aloc |  |
| `o00V` | 蒼月道術特效2 | `WarStompCaster.mdl` | 1.5 | 255,0,0 | Aloc+fx-name |  |
| `o00W` | 蒼月道術特效 | `StampedeMissileDeath.mdl` | 3 | 255,0,0 | Aloc+fx-name |  |
| `o00Y` | 白木束縛 | `SpiritWalkerChange.mdl` | 4 | 255,0,0 | Aloc |  |
| `o00Z` | 黑龍波 | `FlameStrikeTarget.mdl` |  | 255,0,0 | Aloc |  |
| `o010` | 黑龍波龍形 | `DuneWorm.mdl` |  | 0,0,0 | Aloc |  |
| `o011` | 大地之怒 | `RockChunks0.mdl` | 2.2 | 100,100,100 | Aloc+hp1-noatk |  |
| `o012` | 安云迴切 | `Bladestorm_SwordEffect.mdl` | 0.85 | 255,0,0 | Aloc |  |
| `o013` | 剎那 | `mfls.mdl` | 1.2 | 255,0,0 | Aloc |  |
| `o014` | 獸王牙操彈 | `IllidanMissile.mdl` | 3 | 255,0,0 | Aloc |  |
| `o015` | 夏娜封絕 | `GrandOrcAura.mdl` | 0.1 | 100,100,100 | Aloc | combat-stats |
| `o016` | 拳頭集氣 | `BarkSkinTarget.mdl` | 7 | 255,0,0 | Aloc |  |
| `o017` | 九刀流特效 | `DarkPortalTarget.mdl` | 2 | 255,0,0 | Aloc+fx-name |  |
| `o018` | 索龍分身 | `HeroMusashiMiyamoto.mdl` |  | 50,0,0 | Aloc |  |
| `o019` | 動地剁 | `WarStompCaster.mdl` | 2 | 255,0,0 | Aloc |  |
| `o01A` | 閃電 | `AIlbSpecialArt.mdl` | 2.5 | 255,0,0 | Aloc |  |
| `o01B` | 龍虎-昇龍拳 | `RoarCaster.mdl` | 2.5 | 255,0,0 | Aloc |  |
| `o01C` | 殺生丸幻影 | `Sesshomaru.mdl` |  | 255,0,0 | Aloc |  |
| `o01D` | 百烈櫻華斬 | `EarthTornado2.mdl` | 1.5 | 255,100,0 | Aloc |  |
| `o01E` | 雷光劍 | `BlinkTarget.mdl` | 5 | 255,0,0 | Aloc |  |
| `o01F` | 雷光劍(落雷) | `ThunderClapCaster.mdl` | 2 | 255,0,0 | Aloc |  |
| `o01G` | 東風檜扇南風末廣 | `OblivionAura.mdl` |  | 100,100,100 | Aloc | combat-stats |
| `o01H` | 螺旋劍 | `TornadoElemental.mdl` | 4 | 120,0,0 | Aloc |  |
| `o01J` | 強吻 | `LOVE2.mdl` | 6 | 255,0,0 | Aloc |  |
| `o01L` | 召喚顯示特效 | `OblivionAura.mdl` | 5 | 100,100,100 | Aloc+fx-name | combat-stats |
| `o01M` | 火焰爆炸 | `DoomDeath.mdl` | 8 | 100,100,100 | Aloc |  |
| `o01N` | 重力之球 | `BlackHole1.mdl` | 2.5 | 100,0,0 | Aloc |  |
| `o01O` | 嗜血邪書 | `MagicRunes0.mdl` | 7 | 255,0,200 | Aloc |  |
| `o01P` | 天翔龍閃 | `TornadoElemental.mdl` | 3 | 200,100,100 | Aloc |  |
| `o01Q` | 月牙天衝 | `NeutralizationMissile.mdl` | 10 | 255,0,0 | Aloc |  |
| `o01R` | 月牙天衝(虛化) | `DeathWave.mdl` | 2 | 255,0,0 | Aloc |  |
| `o01S` | 卍解 | `MarkOfChaosTarget.mdl` | 5 | 255,100,0 | Aloc | combat-stats |
| `o01T` | 接技特效兼隱藏施法 | `FarseerMissile.mdl` | 3.5 | 255,0,0 | Aloc+fx-name |  |
| `o01U` | 接技特效(動地跺) | `WarStompCaster.mdl` | 5 | 255,0,0 | Aloc+fx-name |  |
| `o01V` | 黑龍波龍形2 | `DuneWorm.mdl` | 5 | 0,0,0 | Aloc |  |
| `o01W` | 呂布斷光 | `NeutralizationMissile.mdl` | 6 | 255,0,0 | Aloc |  |
| `o01X` | 呂布隱藏專用單位 | (承襲) | 6 | 255,0,0 | Aloc |  |
| `o01Y` | 龍拳 | `BronzeDragon.mdl` | 4 | 255,0,0 | Aloc |  |
| `o020` | 豪火龍之術 | `Darkraor.mdl` | 2 | 100,0,0 | Aloc |  |
| `o021` | 豪火龍之術-末日 | `DoomDeath.mdl` | 2 | 255,0,0 | Aloc |  |
| `o022` | 千鳥流閃電 | `PurgeBuffTarget.mdl` | 3 | 100,0,0 | Aloc |  |
| `o023` | Accel Shooter | `Phoenix_Missile_mini.mdl` | 1 | 255,0,0 | Aloc |  |
| `o024` | 81爆裂 | `VolcanoDeath.mdl` | 3 | 255,0,0 | Aloc |  |
| `o025` | 81衝刺 | `ResurrectTarget.mdl` | 3 | 255,0,0 | Aloc |  |
| `o026` | 23魔法陣 | `UnholyAura.mdl` | 2 | 255,0,0 | Aloc |  |
| `o027` | 23魔法陣2 | `UnholyAura.mdl` | 3 | 255,0,0 | Aloc |  |
| `o029` | 毀滅彈 | `PossessionCaster.mdl` | 10 | 255,100,100 | Aloc |  |
| `o02I` | 涅吉隱藏專用單位 | (承襲) | 2 | 255,0,0 | Aloc |  |
| `o02J` | 涅吉雷之投擲 | `Banditmissile.mdl` | 4 | 255,0,0 | Aloc |  |
| `o02K` | 戰鬥涅吉巨神殺 | `Banditmissile.mdl` | 8 | 255,0,0 | Aloc |  |
| `o02M` | 疾風怒雷 | `MonsoonBoltTarget.mdl` | 6 | 100,0,0 | Aloc |  |
| `o02T` | B叔殘影 | `FelgaurdBlue.mdl` | 1.3 | 255,0,0 | Aloc |  |
| `o02U` | 雷光投射 | `LightningTornado.mdl` | 0.5 | 255,0,0 | Aloc |  |
| `o02X` | 96-04x 獨孤九劍殘影 | `hzyn.mdl` | 1 | 0,0,0 | Aloc | combat-stats |
| `o02Y` | 涅吉風花武裝解除 | `AquaSpikeVersion2.mdl` | 2 | 255,0,0 | Aloc |  |
| `o031` | 安云加速 | `ChaosOrcRange.mdl` | 1.4 |  | Aloc |  |
| `ogru` | 天譴 | (隱形:`.mdl`) | 2.3 | 255,0,0 | Aloc |  |
| `oshm` |  | `ChaosOrcRange.mdl` | 1.4 |  | Aloc |  |
| `osp1` | 教室 | `BlackHole1.mdl` | 3 |  | Aloc |  |
| `u00A` | 蒸汽球 | `TornadoElemental.mdl` |  |  | Aloc | combat-stats |
| `u00F` | 水藍色脈動 | (隱形:`none.mdl`) | 0.35 |  | Aloc |  |
| `u00G` | 自動鎖定系統 | (隱形:`.mdl`) |  |  | Aloc | combat-stats |
| `u00I` |  | `SpiritWyvern.mdl` | 0.4 | 255,0,0 | Aloc | combat-stats |
| `u00P` | 式神 | `AbsorbManaBirthMissile.mdl` | 3 | 255,150,255 | Aloc | combat-stats |
| `u00Q` | 式神 | `BansheeGhost.mdl` | 1.2 | 100,10,10 | Aloc | combat-stats |
| `u00R` | 災難之牆 | `TownBurningFireEmitter.mdl` | 2 |  | Aloc |  |
| `u00S` | 打塔隱藏單位 | (隱形:`.mdl`) |  |  | Aloc | combat-stats |
| `u00T` | 白鵠 | `SorceressMissile.mdl` | 10 |  | Aloc |  |
| `u00U` | Rider衝刺 | `OrbOfDeathMissile.mdl` | 7 |  | Aloc |  |
| `u00W` | 鬼眼衝刺 | `UnsummonTarget.mdl` | 2 |  | Aloc |  |
| `u00X` | 胖虎搖滾 | `OrbOfDeathMissile.mdl` | 10 | 255,150,0 | Aloc |  |
| `u00Z` | starbreaker | `TornadoElemental.mdl` | 2 | 255,0,0 | Aloc |  |
| `u013` | 世界終結 | `FrostNovaTarget.mdl` | 3 |  | Aloc |  |
| `u014` | 光箭 | `FireFly.mdl` | 3 |  | Aloc | combat-stats |
| `u017` | 大紅蓮斬 | `crescent.mdl` | 2 | 255,30,30 | Aloc |  |
| `u018` | 安云衝刺 | `DarkPortalTarget.mdl` | 2 |  | Aloc |  |
| `u01A` | 假死之王 | `EredarWarlock.mdl` |  |  | Aloc |  |
| `u01L` | 大紅蓮斬 | `crescent.mdl` | 2 | 255,30,30 | Aloc |  |
| `u01M` | 大紅蓮斬 | `crescent.mdl` | 2 | 255,30,30 | Aloc |  |
| `u01N` | 大紅蓮斬 | `crescent.mdl` | 2 | 255,30,30 | Aloc |  |
| `u01O` | 大紅蓮斬 | `crescent.mdl` | 2 | 255,30,30 | Aloc |  |
| `u01P` | 死亡老二映像 | `TidalGuardian.mdl` | 1.5 | 50,50,50 | Aloc |  |
| `u01R` | Rider鎖鏈 | `WardenMissile.mdl` | 2 |  | Aloc |  |
| `u01W` | 鳥人 | `HarpyWitch.mdl` | 1.2 |  | Aloc |  |
| `u025` | 熊貓 | `FurbolgPanda.mdl` |  |  | Aloc |  |
| `u027` | 蜘蛛 | `Spider.mdl` |  |  | Aloc |  |
| `u028` | 冥龍 | `NetherDragon.mdl` | 0.8 |  | Aloc |  |
| `u02C` | 烏龜 | `GiantSeaTurtleRange.mdl` | 0.6 |  | Aloc |  |
| `u02D` | 狼 | `WhiteWolf.mdl` |  | 150,150,150 | Aloc |  |
| `u02H` | 鳳凰 | `phoenix.mdl` | 0.9 | 180,80,80 | Aloc |  |
| `u02I` | 老鷹 | `WarEagle.mdl` |  |  | Aloc |  |
| `u02M` | 黏液獸 | `DalaranReject.mdl` | 1.3 | 255,0,100 | Aloc |  |
| `u02R` | 黃色魔法陣 | `UnholyAura.mdl` | 3 |  | Aloc |  |
| `u02S` | 黑洞聖杯泥 | `ForgottenOneTent.mdl` | 2 | 30,0,0 | Aloc | combat-stats |
| `u02T` | 防止雙英雄 | (隱形:`.mdl`) |  |  | Aloc |  |
| `u02V` | 聖杯黑泥 | `ForgottenOneTent.mdl` | 1.5 | 30,0,0 | Aloc | combat-stats |
| `u02W` | 聖杯黑泥 | `ForgottenOneTent.mdl` | 2 | 30,0,0 | Aloc | combat-stats |
| `u02X` | 聖杯黑泥 | `ForgottenOneTent.mdl` | 1.75 | 30,0,0 | Aloc | combat-stats |
| `u02Y` | 旗子 | `OrcCaptureFlag.mdl` |  |  | Aloc |  |
| `u02Z` | 毒液殘留 | `SmokeSmudge2.mdl` | 5 | 50,100,50 | Aloc |  |
| `u030` | 惡夢天線 | `txbbb.mdl` | 6 |  | Aloc |  |
| `u032` |  | `PlagueCloudtarget.mdl` |  |  | Aloc |  |
| `u033` | 疫病雲(較大) | (承襲) |  |  | Aloc |  |

統計：scale 為 null（承襲 base 預設）**73/236**；有非白 tint **133/236**。

## 三、⚠️ 抽取器有沒有浮出頂點色/透明度？—— 一半有、一半結構上不存在

### 頂點色（uclr/uclg/uclb）：抽取器**程式已經會抽，但出貨的 OBJECTS.json 是舊的**

| 事實 | 證據 |
|---|---|
| raw 欄位 id 是 `uclr`/`uclg`/`uclb`（Art Red/Green/Blue Tint，0..255，各 channel **缺值 = 繼承，⛔ 不是 0**） | `war3map.w3u` 二進位計數：uclr×93 · uclg×140 · uclb×129；`ucua` **0 次 —— w3u 沒有 alpha 欄位** |
| `src_objects.py` **已經**把三顆放進白名單並輸出 `tint_raw` | `tools/w3x-import/src_objects.py:53`（`_UNIT_CODES` 收 uclr/uclg/uclb）與 `:176`（`unit_rec` 寫 `"tint_raw": [e.get("uclr"), …]`）；scale 同型在 `:46`（usca）/`:153` |
| ⛔ 但出貨的 `OBJECTS.json` **沒有這些欄位** —— 不是 null，是**整顆 key 不存在** | `grep -c tint_raw OBJECTS.json` = 0、`grep -c uclr` = 0、`grep -c rawMods` = 0 |
| 根因：OBJECTS.json 最後 commit 於 **2026-07-31**（`3e9634e8`），tint 白名單是之後 #263（`c670b105`）才加進 src_objects.py 的 | `git log` 兩個檔各自的最後 commit |
| ⭐ 解析後的 tint **已經另有一份完整的**：`UNIT_TINTS.json`（`resolve_unit_tints.py` 產，繼承鏈 w3u entry → w3u base → UnitUI.slk → 255） | 普查集 236 隻**全數**在裡面，133 隻非白 |

**要加的行數 = 0。** 修法是**重跑產生器**把 OBJECTS.json 刷新：

```bash
python3 tools/w3x-import/src_objects.py   # 重生成 OBJECTS.json（會帶出 tint_raw + rawMods）
```

（本 lane 唯讀，⛔ 沒有跑。要注意它同時重寫 JASS_INDEX/HERO_NUMBERS/SANITY，是同一支的其他產物。）
若 Phase 2/6 只要「解析後」的顏色，直接讀 `UNIT_TINTS.json` 即可，⛔ 不必等 OBJECTS.json 刷新 ——
而且 raw 值有繼承語意（缺 = 繼承），拿 `tint_raw` 自己解會重蹈 #49 漏掉繼承鏈的坑。

### 透明度（alpha）：**w3u 結構上沒有這個欄位**，只存在於 JASS runtime

- `ucua` 之類的 per-unit alpha raw 欄位**不存在**：w3u 全檔掃描 0 次；WC3 物件編輯器本來就只有 RGB 三欄。
- alpha 全部來自觸發：`SetUnitVertexColorBJ(unit, r%, g%, b%, transparency%)` —— `war3map.j` 有 **57 個呼叫點**，
  第 4 參數是**透明度百分比**（BJ 轉 alpha = (100−t)×2.55）。典型：黑龍波 60→90% 漸隱、`udg_RoCreateUnit` 50%、幻影 50%。
- ⇒ 要浮出 alpha，加的不是 w3u 欄位，是一支 **JASS 掃描**：對 57 個 `SetUnitVertexColorBJ` 呼叫點做
  「變數 ← CreateUnit rawcode」的回溯（多數是 `udg_*` 變數或 `GetLastCreatedUnit()`，要在同函式內找
  `CreateUnit`/`CreateNUnitAtLoc` 的 rawcode）。落點建議：`tools/w3x-import/` 新開一支（或併入
  `scan_ability_effects.py` 的三軸掃描），輸出 per-rawcode 的 `{r,g,b,t}` 建議值 —— ⛔ 本 lane 未動手。
- 機讀檔 `units.json` 的 `alpha` 因此**全為 null**（meta 有註明），⛔ 不要把 null 讀成「不透明」。

## 四、模型使用頻率（= Phase 2/6 的優先序）

普查集 236 隻 → **135 個不同 model 值**。次數 = 幾隻 dummy 用它。

| 次數 | model |
|---:|---|
| 17 | **(invisible: ".mdl")** |
| 9 | `Abilities\Spells\Other\Tornado\TornadoElemental.mdl` |
| 8 | **(null → inherits base model)** |
| 7 | **(invisible: " .mdl")** |
| 5 | `Abilities\Spells\Other\Monsoon\MonsoonBoltTarget.mdl` |
| 5 | **(invisible: "none.mdl")** |
| 5 | `crescent.mdl` |
| 4 | `Abilities\Spells\Human\ReviveHuman\ReviveHuman.mdl` |
| 4 | `Abilities\Spells\Items\TomeOfRetraining\TomeOfRetrainingCaster.mdl` |
| 4 | `Abilities\Spells\Orc\WarStomp\WarStompCaster.mdl` |
| 4 | `Meteor.mdl` |
| 4 | `Units\Creeps\ForgottenOne\ForgottenOneTent.mdl` |
| 3 | `Abilities\Spells\Human\Thunderclap\ThunderClapCaster.mdl` |
| 3 | `Abilities\Spells\Human\MarkOfChaos\MarkOfChaosTarget.mdl` |
| 3 | `Units\Demon\ChaosOrcRange\ChaosOrcRange.mdl` |
| 3 | `MidchilderNanohaAura.mdl` |
| 3 | **(invisible: "collision.mdl")** |
| 3 | `Abilities\Spells\other\ANsa\ANsaTarget.mdl` |
| 3 | `Abilities\Spells\Undead\UnholyAura\UnholyAura.mdl` |
| 2 | `Abilities\Weapons\FarseerMissile\FarseerMissile.mdl` |
| 2 | `Abilities\Spells\Other\Parasite\ParasiteMissile.mdl` |
| 2 | `Abilities\Spells\Orc\Shockwave\ShockwaveMissile.mdl` |
| 2 | `Abilities\Spells\Other\Awaken\Awaken.mdl` |
| 2 | `LightningTornado.mdl` |
| 2 | `NetherStrike.mdl` |
| 2 | `buildings\naga\TidalGuardian\TidalGuardian.mdl` |
| 2 | `HeroMusashiMiyamoto.mdl` |
| 2 | `Abilities\Spells\Undead\AbsorbMana\AbsorbManaBirthMissile.mdl` |
| 2 | `Darkraor.mdl` |
| 2 | `AquaSpikeVersion2.mdl` |
| 2 | `Abilities\Spells\Other\Volcano\VolcanoDeath.mdl` |
| 2 | `Abilities\Spells\Undead\FrostNova\FrostNovaTarget.mdl` |
| 2 | `Abilities\Spells\Undead\Possession\PossessionCaster.mdl` |
| 2 | `DeathWave.mdl` |
| 2 | `units\critters\DuneWorm\DuneWorm.mdl` |
| 2 | `Abilities\Spells\Demon\DarkPortal\DarkPortalTarget.mdl` |
| 2 | `OblivionAura.mdl` |
| 2 | `Abilities\Spells\Other\Doom\DoomDeath.mdl` |
| 2 | `BlackHole1.mdl` |
| 2 | `Abilities\Spells\Items\WandOfNeutralization\NeutralizationMissile.mdl` |
| 2 | `Abilities\Weapons\Banditmissile\Banditmissile.mdl` |
| 2 | `Abilities\Spells\Undead\OrbOfDeath\OrbOfDeathMissile.mdl` |
| 1 | `Abilities\Weapons\RedDragonBreath\RedDragonMissile.mdl` |
| 1 | `Units\Demon\Infernal\InfernalBirth.mdl` |
| 1 | `units\orc\HeroShadowHunter\HeroShadowHunter.mdl` |
| 1 | `HeroCloudStrife.mdl` |
| 1 | `Abilities\Spells\Human\FlameStrike\FlameStrike1.mdl` |
| 1 | `Abilities\Weapons\FragDriller\FragDriller.mdl` |
| 1 | `Abilities\Weapons\GlaiveMissile\GlaiveMissile.mdl` |
| 1 | `units\creeps\BanditSpearThrower\BanditSpearThrower.mdl` |
| 1 | `units\human\Knight\Knight.mdl` |
| 1 | `Abilities\Weapons\Mortar\MortarMissile.mdl` |
| 1 | `SD2.mdl` |
| 1 | `Abilities\Spells\Human\Resurrect\ResurrectCaster.mdl` |
| 1 | `Abilities\Spells\Human\MassTeleport\MassTeleportTarget.mdl` |
| 1 | `Abilities\Weapons\BloodElfSpellThiefMISSILE\BloodElfSpellThiefMISSILE.mdl` |
| 1 | `HeroRider.mdl` |
| 1 | `Abilities\Spells\Items\AIfb\AIfbTarget.mdl` |
| 1 | `Objects\Spawnmodels\Other\FlameThrower\FlameThrowerSpawnObj.mdl` |
| 1 | `FireBlast.mdl` |
| 1 | `AWING.mdl` |
| 1 | `units\undead\HeroDeathKnight\HeroDeathKnight.mdl` |
| 1 | `HeroKunoichi.mdl` |
| 1 | `HeroSephiroth.mdl` |
| 1 | `Luffe.mdl` |
| 1 | `HeroPika.mdl` |
| 1 | `units\critters\VillagerWoman\VillagerWoman.mdl` |
| 1 | `HeroShana.mdl` |
| 1 | `units\human\Sorceress\Sorceress_V1.mdl` |
| 1 | `Units\NightElf\Owl\Owl.mdl` |
| 1 | `units\creeps\PolarBear\PolarBear.mdl` |
| 1 | `Luffe punch.mdl` |
| 1 | `Abilities\Spells\Undead\AnimateDead\AnimateDeadTarget.mdl` |
| 1 | `BlackHole.mdl` |
| 1 | `HeroSaber.mdl` |
| 1 | `horsehead.mdl` |
| 1 | `Abilities\Spells\Orc\StasisTrap\StasisTotemTarget.mdl` |
| 1 | `Abilities\Spells\Undead\DeathCoil\DeathCoilMissile.mdl` |
| 1 | `Abilities\Spells\Demon\ReviveDemon\ReviveDemon.mdl` |
| 1 | `Objects\Spawnmodels\Orc\OrcSmallDeathExplode\OrcSmallDeathExplode.mdl` |
| 1 | `Abilities\Spells\Items\AIil\AIilTarget.mdl` |
| 1 | `LasercannonfinalRED.mdl` |
| 1 | `Units\Undead\Abomination\AbominationExplosion.mdl` |
| 1 | `cloud.mdl` |
| 1 | `Abilities\Spells\NightElf\EntangleMine\Roots.mdl` |
| 1 | `units\nightelf\Wisp\Wisp.mdl` |
| 1 | `Abilities\Spells\Undead\DeathPact\DeathPactTarget.mdl` |
| 1 | `Boomnl.mdl` |
| 1 | `Abilities\Spells\Undead\VampiricAura\VampiricAura.mdl` |
| 1 | `Objects\Spawnmodels\Human\HCancelDeath\HCancelDeath.mdl` |
| 1 | `Objects\Spawnmodels\Undead\UCancelDeath\UCancelDeath.mdl` |
| 1 | `HeroGirl.mdl` |
| 1 | `Abilities\Spells\Other\Stampede\StampedeMissileDeath.mdl` |
| 1 | `Abilities\Spells\Orc\EtherealForm\SpiritWalkerChange.mdl` |
| 1 | `Abilities\Spells\Human\FlameStrike\FlameStrikeTarget.mdl` |
| 1 | `Doodads\Terrain\RockChunks\RockChunks0.mdl` |
| 1 | `Bladestorm_SwordEffect.mdl` |
| 1 | `mfls.mdl` |
| 1 | `Abilities\Weapons\IllidanMissile\IllidanMissile.mdl` |
| 1 | `GrandOrcAura.mdl` |
| 1 | `Abilities\Spells\NightElf\Barkskin\BarkSkinTarget.mdl` |
| 1 | `Abilities\Spells\Items\AIlb\AIlbSpecialArt.mdl` |
| 1 | `Abilities\Spells\NightElf\BattleRoar\RoarCaster.mdl` |
| 1 | `Sesshomaru.mdl` |
| 1 | `EarthTornado2.mdl` |
| 1 | `Abilities\Spells\NightElf\Blink\BlinkTarget.mdl` |
| 1 | `LOVE2.mdl` |
| 1 | `Doodads\Cityscape\Props\MagicRunes\MagicRunes0.mdl` |
| 1 | `units\creeps\BronzeDragon\BronzeDragon.mdl` |
| 1 | `Abilities\Spells\Orc\Purge\PurgeBuffTarget.mdl` |
| 1 | `Abilities\Weapons\PhoenixMissile\Phoenix_Missile_mini.mdl` |
| 1 | `Abilities\Spells\Human\Resurrect\ResurrectTarget.mdl` |
| 1 | `units\demon\FelgaurdBlue\FelgaurdBlue.mdl` |
| 1 | `hzyn.mdl` |
| 1 | `units\orc\SpiritWyvern\SpiritWyvern.mdl` |
| 1 | `units\creeps\BansheeGhost\BansheeGhost.mdl` |
| 1 | `Doodads\Cinematic\TownBurningFireEmitter\TownBurningFireEmitter.mdl` |
| 1 | `Abilities\Weapons\SorceressMissile\SorceressMissile.mdl` |
| 1 | `Abilities\Spells\Undead\Unsummon\UnsummonTarget.mdl` |
| 1 | `FireFly.mdl` |
| 1 | `units\demon\EredarWarlock\EredarWarlock.mdl` |
| 1 | `Abilities\Weapons\WardenMissile\WardenMissile.mdl` |
| 1 | `units\creeps\HarpyWitch\HarpyWitch.mdl` |
| 1 | `units\creeps\FurbolgPanda\FurbolgPanda.mdl` |
| 1 | `units\creeps\Spider\Spider.mdl` |
| 1 | `units\creeps\NetherDragon\NetherDragon.mdl` |
| 1 | `Units\Creeps\GiantSeaTurtleRange\GiantSeaTurtleRange.mdl` |
| 1 | `units\creeps\WhiteWolf\WhiteWolf.mdl` |
| 1 | `units\human\phoenix\phoenix.mdl` |
| 1 | `units\creeps\WarEagle\WarEagle.mdl` |
| 1 | `units\other\DalaranReject\DalaranReject.mdl` |
| 1 | `Objects\InventoryItems\OrcCaptureFlag\OrcCaptureFlag.mdl` |
| 1 | `Doodads\LordaeronSummer\Props\SmokeSmudge\SmokeSmudge2.mdl` |
| 1 | `txbbb.mdl` |
| 1 | `Units\Undead\PlagueCloud\PlagueCloudtarget.mdl` |

⚠️ 前三名的解讀：
- **隱形佔位（`.mdl`/` .mdl`/`none.mdl`/`collision.mdl` 共 32 隻）**：本體不畫東西，特效全靠 JASS 掛
  attachment/AddSpecialEffect —— 這批對 Phase 2 是「不用轉模型」的好消息，但要對 SFX_BINDINGS 的掛點。
- **(null → 承襲 base 模型) 8 隻**：畫出來的是 base 單位的原模型（如 `hpea` 農民）。
- **`TornadoElemental.mdl` ×9** 是最大宗的實體模型 —— 龍捲風族 dummy。

---
產生方式：唯讀掃描腳本（本檔 + `units.json`），⛔ 未動任何程式/內容檔。

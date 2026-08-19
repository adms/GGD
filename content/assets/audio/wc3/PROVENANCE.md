# wc3 —— 原作音效的**出處帳本**（GH#402）

**132 個 clip**，合計 **11.85 MB**，權利人 **Blizzard Entertainment**，
22050 Hz / 單聲道 / 16-bit PCM，逐位元組**原封不動**（⛔ 沒有轉檔、沒有正規化、沒有裁切）。

兩批來源合流在這一個目錄：

| 來源 | 是什麼 | 數量 |
|---|---|---:|
| `model-soundset` | mdx 的 `SNDx` 事件軌（GH#402） | 73 |
| `ability-declared` | JASS 的 `gg_snd_*`（task #78） | 60 |
| （兩者都有） | 同一份位元組，一個 key | 1 |

---

## 一 · 為什麼這些位元組可以進版控

這個目錄推翻了 `content/assets/blizzard-local/README.md` 立的規則
（「do not commit them, do not bake them into an image」）。**推翻它的是 owner 本人**，
**分兩次**：

> owner 2026-08-19 ①：「請幫我**註記取消這個規則**，現在的線上已經是
> **雙重審查只給認識的親友玩了**，請**直接上架但註記來源就好 不要ignore**」
>
> owner 2026-08-19 ②：「**既有 60 個 wc3.* 沒一起搬 => move**」

這與 owner 2026-07-26 退掉版權/環境閘（#127 / #239）是同一個立場的延伸：
線上是雙重審查的親友私站。⭐ **條件是「註記來源」—— 這份檔案就是那個條件。**

⚠️ **沒有出處的位元組就是違規。** 這不是散文，是一條會紅的閘：
`apps/client/src/render/views/blizzardOverlayGate.test.ts` 逐檔比對這份帳本，
**兩個方向都關**（有檔沒列 → 紅；有列沒檔 → 紅；sha256 對不上 → 紅）。

### ⛔ 豁免的**界線**（⚠️ 這一格最容易被讀太寬）

owner 兩次點名的都是**技能／武器／特效音**。⛔ **角色語音台詞不在裡面。**

| | 數量 | 這一輪 |
|---|---:|---|
| **原作技能／武器／特效音**（這個目錄） | 132 | ✅ 進版控、正式站供應 |
| `data/blizzard-overlay/sounds/` 的**角色語音台詞** | 511 | ⛔ **不動**（#10 / #81 的範圍） |
| `data/blizzard-overlay/models/` 的模型 | 40 | ⛔ **不動** |
| 地圖作者自己 import 的 mp3（`kind: imported`） | — | ⛔ **不動**（出處不明，另有住處） |

⇒ 放行的是 **132 個技能/武器/特效音效**，⛔ **不含 511 個角色語音台詞**。

⚠️ **這 132 個不是那 511 個的子集。** 那 511 個是 #10 抽的角色語音
（Yes / What / Ready / Warcry / Pissed / Death，31 個資料夾）；這一批是照
`VFX_SOUND_JOIN.json` 與 `SFX_BINDINGS.json` 兩張清單**另外從 MPQ 抽的**。
兩批的交集只有 **5 個**。

---

## 二 · 這些位元組是怎麼來的（可重現）

```bash
python3 tools/w3x-import/build_vfx_sound_bindings.py            # 重抽 + 重寫帳本
python3 tools/w3x-import/build_vfx_sound_bindings.py --check    # 只比對，過期就回非零
```

來源是**使用者自己安裝的**零售 MPQ（repo 根目錄的 `war3.mpq` / `War3x.mpq` /
`War3xLocal.mpq` / `War3Patch.mpq`，本身**沒有**進版控）。挑哪些檔**不是人選的**：

```
① mdx 的 SNDx 事件軌 → AnimLookups.slk → sound label → AnimSounds.slk → wav 路徑
② w3a/JASS 的 gg_snd_* → SFX_BINDINGS.json 的 bindings → wav 路徑
```

key 一律是 `wc3.<wav 基名小寫>`。⭐ 兩批**共用這一條規則** —— 實測 task #78
那 60 個的 `gg_snd` 基名與 wav 基名 **60/60 完全相同**，所以合併之後
**既有 key 一個字都沒改**，只有它指到的路徑從 `assets/blizzard-local/` 換成
`assets/audio/wc3/`。

---

## 三 · 逐 clip 帳本

「綁定」欄是**推導**的（掃 `content/config/vfx-families.json` 有沒有人指到這個 key），
⛔ 不是宣告的 —— 判例同 `sfxLabCredits.ts` 的「使用中 vs 收錄未啟用」。
目前 **54 / 132** 已綁定；
⚠️ **`—` ⛔ 不是死位元組**：它是**鑄技工坊下拉選單裡的一格**，
owner 在後台把任何一支技能指過來就會響（第一守則）。

| # | 我們的 key | 來源 | 來源 MPQ | 原始路徑 | 原始檔名 | sound label | 時機 | 綁定 | bytes | sha256 |
|---:|---|---|---|---|---|---|---|---|---:|---|
| 1 | `wc3.akamapissed8` | ability-declared | `War3xLocal.mpq` | `Units\Other\DranaiAkama\AkamaPissed8.wav` | `AkamaPissed8.wav` |  | Launch | `godie-emfr.w` | 153,222 | `978636f2113a8e8b644c5f1c628ca83bdea434f7bf02f9470f849a170b58c143` |
| 2 | `wc3.altarofelderswhat1` | ability-declared | `war3.mpq` | `Buildings\NightElf\AltarOfElders\AltarOfEldersWhat1.wav` | `AltarOfEldersWhat1.wav` |  | Launch | `godie-n00p.e`, `godie-nsjs.e` | 154,296 | `d409ae5d63eb1deac49b983ab14284c5914938a9432041336e0063abee1288c0` |
| 3 | `wc3.ancestralspirit` | model-soundset | `War3x.mpq` | `Abilities\Spells\Orc\AncestralSpirit\AncestralSpirit.wav` | `AncestralSpirit.wav` | AncestralSpirit | Launch | — | 135,346 | `c1aa786499684f1b36b52fb1e036d91dee42c1a7e8e1effa651b4d292a75d2d6` |
| 4 | `wc3.archerdeath1` | model-soundset | `war3.mpq` | `Units\NightElf\Archer\ArcherDeath1.wav` | `ArcherDeath1.wav` | ArcherDeath | Impact | — | 160,584 | `53cc13fadf88c9997cb3b0d7dbb4271c203677e5f6cbf93668a8c73953a3c56c` |
| 5 | `wc3.axemissilelaunch1` | ability-declared | `war3.mpq` | `Abilities\Weapons\Axe\AxeMissileLaunch1.wav` | `AxeMissileLaunch1.wav` |  | Launch | `godie-h00l.r` | 27,258 | `c206e1ecb258845273d4886eb728eaaed11b2a6e5b7ef7a2ae0d3e10ebcf379d` |
| 6 | `wc3.banditdeath1` | model-soundset | `war3.mpq` | `Units\Creeps\Bandit\BanditDeath1.wav` | `BanditDeath1.wav` | BanditDeath | Impact | — | 78,454 | `2eb4b0a979009b2ff086fac0fdcec3fdaddc5f7bf5f8e692906016308688fab1` |
| 7 | `wc3.blademasterwhirlwind` | model-soundset | `war3.mpq` | `Units\Orc\HeroBladeMaster\BladeMasterWhirlwind.wav` | `BladeMasterWhirlwind.wav` | Whirlwind | Launch | `godie-h00l.r`, `godie-h02r.q`, `godie-hgam.q`, `godie-o00k.e`, `godie-osam.r` | 37,432 | `e9149cafa4e2101c1b51152d7d7b48f0aa0c6f8a7c08a7b6ab197a6d01eabf80` |
| 8 | `wc3.blinkbirth1` | model-soundset | `War3x.mpq` | `Abilities\Spells\NightElf\Blink\BlinkBirth1.wav` | `BlinkBirth1.wav` | BlinkCaster | Launch | `godie-hlgr.e` | 20,216 | `86da67b768bd021b5f9a9d4ade63f2a19504b018e5c30fc8c4d5c66ce39f5e49` |
| 9 | `wc3.bloodelfsorcerordeath` | model-soundset | `War3xLocal.mpq` | `Units\Human\HeroBloodElf\BloodElfSorcerorDeath.wav` | `BloodElfSorcerorDeath.wav` | HeroBloodElfDeath | Impact | — | 145,718 | `8728a841920f6b3d5a971028ea6c0db4996c6c11e5aa6f093f33f03044de5794` |
| 10 | `wc3.bloodlusttarget` | ability-declared | `war3.mpq` | `Abilities\Spells\Orc\Bloodlust\BloodlustTarget.wav` | `BloodlustTarget.wav` |  | Launch | — | 114,042 | `6193bdfae7774dc4aae99c4404dbd915b74258909c39c622f29e92998bed9179` |
| 11 | `wc3.brewmasterdeath1` | model-soundset | `War3xLocal.mpq` | `Units\Creeps\PandarenBrewmaster\BrewMasterDeath1.wav` | `BrewMasterDeath1.wav` | PandarenBrewmasterDeath | Impact | — | 119,112 | `9282496c33fc7086e45476cdc8f9ef2782ad1baee968e946af63238d970e1048` |
| 12 | `wc3.buildingdeathlargehuman` | model-soundset | `war3.mpq` | `Sound\Buildings\Death\BuildingDeathLargeHuman.wav` | `BuildingDeathLargeHuman.wav` | DeathHumanLargeBuilding | Impact | — | 152,620 | `9c8e2892a87c7ec41c3eda7ec570e02d6f720f7b1c4566fce85ef39d577d1ed6` |
| 13 | `wc3.catapultmissile1` | model-soundset | `war3.mpq` | `Abilities\Weapons\Catapult\CatapultMissile1.wav` | `CatapultMissile1.wav` | Catapult | Launch | — | 56,748 | `3844e06fdf4c3c640714739583cae15b6c238f37446190fa52937354d2eae396` |
| 14 | `wc3.catapultmissile2` | model-soundset | `war3.mpq` | `Abilities\Weapons\Catapult\CatapultMissile2.wav` | `CatapultMissile2.wav` | Catapult | Launch | — | 55,340 | `510e62613e351d5670d281e062367fca007b089666e2b52a525633cece01ef73` |
| 15 | `wc3.catapultmissile3` | model-soundset | `war3.mpq` | `Abilities\Weapons\Catapult\CatapultMissile3.wav` | `CatapultMissile3.wav` | Catapult | Launch | — | 53,550 | `e8ce8f5c21f02d5ff2119618a1cf29884179cf2da693a7a182dd613caa9a3939` |
| 16 | `wc3.catapultmissile4` | model-soundset | `war3.mpq` | `Abilities\Weapons\Catapult\CatapultMissile4.wav` | `CatapultMissile4.wav` | Catapult | Launch | — | 53,678 | `3a4d400b8740cf9497950cd51c09d545d67efc23b8b12c71ccb31cbe37e0a3da` |
| 17 | `wc3.chickenwhat1` | ability-declared | `War3Patch.mpq` | `Units\Critters\EasterChicken\ChickenWhat1.wav` | `ChickenWhat1.wav` |  | Launch | — | 39,544 | `f63017a5f9e312bd10d41e299f1ff85d022be39b2f01f59bb3b0641781a90299` |
| 18 | `wc3.coldarrow1` | model-soundset | `war3.mpq` | `Abilities\Weapons\ColdArrow\ColdArrow1.wav` | `ColdArrow1.wav` | ColdArrow | Launch | `godie-ntin.e`, `godie-ntin.q` | 83,194 | `9da7e5ca7b41644e97b82fe8117dc8c423fdeb5101c37f787a743ebeba8857a1` |
| 19 | `wc3.coldarrow2` | model-soundset | `war3.mpq` | `Abilities\Weapons\ColdArrow\ColdArrow2.wav` | `ColdArrow2.wav` | ColdArrow | Launch | — | 65,390 | `bc2275d9523745079563d3d1fde74c8440f2961edaaa206c494ace1ea459cb40` |
| 20 | `wc3.coldarrow3` | model-soundset | `war3.mpq` | `Abilities\Weapons\ColdArrow\ColdArrow3.wav` | `ColdArrow3.wav` | ColdArrow | Launch | — | 76,412 | `8dc6a487101fc2ecac20e102200aa3e56069fde08c2ee4870fa194d488e74bf7` |
| 21 | `wc3.criticalstrike` | model-soundset | `war3.mpq` | `Units\Orc\HeroBladeMaster\CriticalStrike.wav` | `CriticalStrike.wav` | CriticalStrike | Launch | — | 86,646 | `3f0877c437890ea5148def4a5664b0ae2d4623d664ba55b293d90985004288d1` |
| 22 | `wc3.crushingwavecaster1` | model-soundset | `War3x.mpq` | `Abilities\Spells\Other\CrushingWave\CrushingWaveCaster1.wav` | `CrushingWaveCaster1.wav` | CrushingWave | Launch | — | 87,942 | `a2a3f986442dbab5c7009522a511745eb302af78d570ba929ef7c52649efc929` |
| 23 | `wc3.darksummoninglaunch1` | ability-declared | `war3.mpq` | `Abilities\Spells\Undead\DarkSummoning\DarkSummoningLaunch1.wav` | `DarkSummoningLaunch1.wav` |  | Launch | `godie-e00w.q`, `godie-e00x.q`, `godie-hpb1.w`, `godie-u010.q`, `godie-uvng.q` | 115,756 | `6c5b90e5de88f8a75ad107444b434ea09e13f0e42412ae65ca90c4df3bb0ca4a` |
| 24 | `wc3.deathcoilmissilelaunch1` | model-soundset | `war3.mpq` | `Abilities\Spells\Undead\DeathCoil\DeathCoilMissileLaunch1.wav` | `DeathCoilMissileLaunch1.wav` | DeathCoilMissile | Impact | — | 27,180 | `01c4f23f1d12dbef835fe6bdcc1f6ec775198d35f6fa2f4f16910db0fef99fee` |
| 25 | `wc3.defendcaster` | ability-declared | `war3.mpq` | `Abilities\Spells\Human\Defend\DefendCaster.wav` | `DefendCaster.wav` |  | Launch | `godie-h01u.r`, `godie-h01u.w`, `godie-o01z.q`, `godie-o01z.w`, `godie-o02v.q`, `godie-o02v.w` | 51,594 | `ffa8b0f086740eeb4d2b16b0f608aff09c0deedb891678837d43bf98cf46aae0` |
| 26 | `wc3.demonhuntermissilehit3` | ability-declared | `war3.mpq` | `Abilities\Weapons\DemonHunterMissile\DemonHunterMissileHit3.wav` | `DemonHunterMissileHit3.wav` |  | Impact | `godie-u00n.e`, `godie-u00o.e` | 37,972 | `1c539036fa385b0ba2352961b9e90ba514f018a85590c20f42ae937271c35250` |
| 27 | `wc3.dispelmagictarget` | model-soundset | `war3.mpq` | `Abilities\Spells\Human\DispelMagic\DispelMagicTarget.wav` | `DispelMagicTarget.wav` | DispelMagic | Launch | — | 86,202 | `7e49973388d8489ad1d9c18834b4b8ae06a4a13ea6c5b1359f37572248dc399f` |
| 28 | `wc3.dragonroostwhat1` | ability-declared | `war3.mpq` | `Buildings\Other\DragonRoost\DragonRoostWhat1.wav` | `DragonRoostWhat1.wav` |  | Launch | `godie-u010.r`, `godie-uvng.r` | 136,326 | `ae7db2ab35a04c0b8f1aabca88f8ad11176929b0ec2e44ee9d962fcba56e3972` |
| 29 | `wc3.dragonyes2` | ability-declared | `war3.mpq` | `Units\Creeps\AzureDragon\DragonYes2.wav` | `DragonYes2.wav` |  | Launch | `godie-u00h.r`, `godie-u00v.e`, `godie-u010.e`, `godie-uvng.e` | 67,372 | `d9b92a007615d459ed3de09472b405104e106bc7cf67e691867f05e96604283f` |
| 30 | `wc3.druidofthetalonmissilelaunch2` | ability-declared | `war3.mpq` | `Abilities\Weapons\DruidoftheTalonMissile\DruidOfTheTalonMissileLaunch2.wav` | `DruidOfTheTalonMissileLaunch2.wav` |  | Launch | `godie-h00l.q` | 39,036 | `45ef058ffcea68c139447bccce7cf5c9ed001052f75d8180aef485562afe078b` |
| 31 | `wc3.eggsackdeath1` | ability-declared | `war3.mpq` | `Doodads\Dungeon\Terrain\EggSack\EggSackDeath1.wav` | `EggSackDeath1.wav` |  | Impact | `godie-huth.w` | 92,602 | `b42c8ad4c5198989a752f4603ba783df1a36ebc8fccd0478e887aad41409a60d` |
| 32 | `wc3.fanofknives` | model-soundset | `War3xLocal.mpq` | `Units\NightElf\HeroWarden\FanOfKnives.wav` | `FanOfKnives.wav` | FanOfKnives | Launch | — | 103,800 | `0aca5b9edcd1c72620d3d2e5aff8c4847ff5d29ab419b6a4ec6829812d8988f1` |
| 33 | `wc3.farmwhat1` | ability-declared | `war3.mpq` | `Buildings\Human\Farm\FarmWhat1.wav` | `FarmWhat1.wav` |  | Launch | — | 151,084 | `22879efd8084547e526835cf4e8bf5c50864ad9dd95a663131c31986409ea5ee` |
| 34 | `wc3.farseermissile` | model-soundset | `war3.mpq` | `Abilities\Weapons\FarseerMissile\FarseerMissile.wav` | `FarseerMissile.wav` | FarseerMissile | Launch | — | 50,296 | `d2b6d71401ba8d633320899cf55a9f113a9b68128c5506ff103ad9344fd156b0` |
| 35 | `wc3.feralspirittarget1` | model-soundset | `war3.mpq` | `Abilities\Spells\Orc\FeralSpirit\FeralSpiritTarget1.wav` | `FeralSpiritTarget1.wav` | FeralSpiritTarget | Launch | — | 107,462 | `701a482feca926661ef2943883aaf437af6910a6825467d4cc414e8e90dea7e6` |
| 36 | `wc3.fireballmissilelaunch1` | model-soundset | `war3.mpq` | `Abilities\Weapons\FireBallMissile\FireBallMissileLaunch1.wav` | `FireBallMissileLaunch1.wav` | FireballLaunch | Launch | — | 28,780 | `7528485c4201cf0de680591aca2a3f94ef9eb975df8dc50d03f74e43d7863e85` |
| 37 | `wc3.fireballmissilelaunch2` | model-soundset | `war3.mpq` | `Abilities\Weapons\FireBallMissile\FireBallMissileLaunch2.wav` | `FireBallMissileLaunch2.wav` | FireballLaunch | Launch | — | 26,734 | `8ed812dba28c6219b21a0bd5d749a6c873bff3be61aa8c499a1ff82e7c76ca37` |
| 38 | `wc3.fireballmissilelaunch3` | model-soundset | `war3.mpq` | `Abilities\Weapons\FireBallMissile\FireBallMissileLaunch3.wav` | `FireBallMissileLaunch3.wav` | FireballLaunch | Launch | — | 35,156 | `bcc4438484badc6c8862da0c9637ea69c084e75128ceffaf43ca9048ed2579d1` |
| 39 | `wc3.flamestrikebirth1` | model-soundset | `War3x.mpq` | `Abilities\Spells\Human\FlameStrike\FlameStrikeBirth1.wav` | `FlameStrikeBirth1.wav` | FlameStrike | Launch | — | 229,930 | `ea780cb9abf8e51a2470e8f0c21759f6880ef257996605374f75aa6729759c0b` |
| 40 | `wc3.flaretarget1` | ability-declared | `war3.mpq` | `Abilities\Spells\Human\Flare\FlareTarget1.wav` | `FlareTarget1.wav` |  | Launch | `godie-e008.r` | 158,180 | `b3346d3609b664975b851d8ba3311d39d63c52348fe2413fdda5f2a5fb5ec08a` |
| 41 | `wc3.flaretarget2` | ability-declared | `war3.mpq` | `Abilities\Spells\Human\Flare\FlareTarget2.wav` | `FlareTarget2.wav` |  | Launch | `godie-e00k.e`, `godie-e00z.e`, `godie-u00h.e` | 59,386 | `1f3ae221f4310b4e348ff3571ade416c601f044fc2e25070f77109edccf25a85` |
| 42 | `wc3.flaretarget3` | ability-declared | `war3.mpq` | `Abilities\Spells\Human\Flare\FlareTarget3.wav` | `FlareTarget3.wav` |  | Launch | `godie-e008.q`, `godie-o01z.q`, `godie-o01z.w`, `godie-o02v.q`, `godie-o02v.w` | 41,904 | `35c2fad2176417f9db8b02925937e01e226dab5188abd18cde6b0061b6d1c670` |
| 43 | `wc3.flashback1second` | ability-declared | `War3x.mpq` | `Sound\Ambient\DoodadEffects\FlashBack1Second.wav` | `FlashBack1Second.wav` |  | Launch | `godie-u010.r`, `godie-uvng.r` | 192,156 | `39f800ca8d5ebbb5c11a923365c8b388edbb01cb8cb1440284fedac9d57821ae` |
| 44 | `wc3.footmandeath` | model-soundset | `war3.mpq` | `Units\Human\Footman\FootmanDeath.wav` | `FootmanDeath.wav` | FootmanDeath | Impact | — | 54,954 | `2ce1831933748b54d911f6fd8dfb35d29a2bd7cf20591790dd7ae387f296955e` |
| 45 | `wc3.fountainoflifewhat1` | ability-declared | `war3.mpq` | `Buildings\Other\FountainOfLife\FountainOfLifeWhat1.wav` | `FountainOfLifeWhat1.wav` |  | Launch | `godie-emns.q` | 131,190 | `13e9e85282c1a05c74015ff113404e861362efcab25977dbd4f2a7bd6ce8d6d4` |
| 46 | `wc3.furbolgdeath1` | model-soundset | `war3.mpq` | `Units\Creeps\Furbolg\FurbolgDeath1.wav` | `FurbolgDeath1.wav` | FurbolgDeath | Impact | — | 123,436 | `6dc532d199d22e113a3bb2eaa1f2d10c6ad6182ed7b42e746ba266c7cebaf735` |
| 47 | `wc3.gluescreenmeteorhit1` | ability-declared | `war3.mpq` | `Sound\Interface\GlueScreenMeteorHit1.wav` | `GlueScreenMeteorHit1.wav` |  | Impact | `godie-obla.e`, `godie-u00v.w` | 66,194 | `f62828c511aba5d4855e9be5bee9eeb7744689a736a52af81476a036d335f51e` |
| 48 | `wc3.gluescreenmeteorhit2` | ability-declared | `war3.mpq` | `Sound\Interface\GlueScreenMeteorHit2.wav` | `GlueScreenMeteorHit2.wav` |  | Impact | `godie-obla.e`, `godie-u00v.w` | 66,326 | `e59514fcdcfcc92e4221f1983856ec4dcdce0a759964f55da144c2c40944da37` |
| 49 | `wc3.gruntpissed3` | ability-declared | `war3.mpq` | `Units\Orc\Grunt\GruntPissed3.wav` | `GruntPissed3.wav` |  | Launch | — | 104,382 | `7f8ecaf0d95e18868684dc7dd33dc698c07d1314806f684fd3cd2b5a8ee1def1` |
| 50 | `wc3.gruntwhat2` | ability-declared | `war3.mpq` | `Units\Orc\Grunt\GruntWhat2.wav` | `GruntWhat2.wav` |  | Launch | `godie-u00l.q`, `godie-umal.q` | 17,718 | `374f0373592233bba697668b14d864f6021866d50913c83e00202d02d88b9461` |
| 51 | `wc3.gruntyesattack1` | ability-declared | `war3.mpq` | `Units\Orc\Grunt\GruntYesAttack1.wav` | `GruntYesAttack1.wav` |  | Launch | `godie-emns.q` | 55,206 | `2bc29c2804d03eade2761919fac3d973c84c2e00d4a8c118dbe758b55756b4eb` |
| 52 | `wc3.gruntyesattack3` | ability-declared | `war3.mpq` | `Units\Orc\Grunt\GruntYesAttack3.wav` | `GruntYesAttack3.wav` |  | Launch | `godie-emns.r` | 74,218 | `7d3756e69c3c9c21b50e5c5e5490bfccd11dbc7678d179f8138bcace5365dcad` |
| 53 | `wc3.hcancelbuilding` | ability-declared | `war3.mpq` | `Sound\Buildings\Death\HCancelBuilding.wav` | `HCancelBuilding.wav` |  | Dissipate | `godie-u010.w`, `godie-ubal.w`, `godie-uvng.w` | 124,502 | `8f9d259bf52c8b568515cbbeaa17f70207f4b43c8f00221553bd285378225751` |
| 54 | `wc3.headhunteryes4` | ability-declared | `war3.mpq` | `Units\Orc\HeadHunter\HeadHunterYes4.wav` | `HeadHunterYes4.wav` |  | Launch | `godie-h00l.w`, `godie-h02s.q`, `godie-h02z.q`, `godie-orkn.q` | 100,394 | `35e7e123372a975d060ff6a0824991e5ed4a05cae407320c905d1898ac3f38ff` |
| 55 | `wc3.healtarget` | model-soundset | `war3.mpq` | `Abilities\Spells\Human\Heal\HealTarget.wav` | `HealTarget.wav` | Heal | Launch | — | 61,738 | `5bc3cb4aa847820cac1ac934e1568700197ca988cdda424858b635aff8af670d` |
| 56 | `wc3.heroblademasterattack1` | model-soundset | `war3.mpq` | `Units\Orc\HeroBladeMaster\HeroBladeMasterAttack1.wav` | `HeroBladeMasterAttack1.wav` | HeroBladeMasterAttack1 | Launch | — | 53,038 | `bfeb8fd53fc18a90ab504ac4f73740fbb3f232f79a0f1ff9f1af05f544e245a4` |
| 57 | `wc3.heroblademasterattack2` | model-soundset | `war3.mpq` | `Units\Orc\HeroBladeMaster\HeroBladeMasterAttack2.wav` | `HeroBladeMasterAttack2.wav` | HeroBladeMasterAttack2 | Launch | — | 41,334 | `eb58265fc1b0c155800426539792884f4065e6ed1082e25bd3281c1de4c6cb5c` |
| 58 | `wc3.heroblademasterdeath` | model-soundset | `war3.mpq` | `Units\Orc\HeroBladeMaster\HeroBladeMasterDeath.wav` | `HeroBladeMasterDeath.wav` | HeroBladeMasterDeath | Impact | — | 103,738 | `879c78e716d55c0359490c0dd7fd7943bae0c9c36181e833361ef1f0b2f397a4` |
| 59 | `wc3.herodeathknightattack1` | model-soundset | `war3.mpq` | `Units\Undead\HeroDeathKnight\HeroDeathKnightAttack1.wav` | `HeroDeathKnightAttack1.wav` | HeroDeathKnightAttack1 | Impact | — | 62,326 | `16bdac8febfa27ea6eac1980cf7ce9e7d7b48fe54a7795c43b44e0645104a606` |
| 60 | `wc3.herodeathknightdeath` | model-soundset | `war3.mpq` | `Units\Undead\HeroDeathKnight\HeroDeathKnightDeath.wav` | `HeroDeathKnightDeath.wav` | HeroDeathKnightDeath | Impact | — | 102,518 | `6efa132e33b756780443d099efd368dcc831f9433efc205d5b92f6de89ee004e` |
| 61 | `wc3.herodemonhunterdeath1` | model-soundset | `war3.mpq` | `Units\NightElf\HeroDemonHunter\HeroDemonHunterDeath1.wav` | `HeroDemonHunterDeath1.wav` | HeroDemonHunterDeath | Impact | — | 182,398 | `2da4b23f03b966c1331dbcbdf4dca2afb6527d9684421af2a29b3ee838feb0a5` |
| 62 | `wc3.heropaladindeath` | model-soundset | `war3.mpq` | `Units\Human\HeroPaladin\HeroPaladinDeath.wav` | `HeroPaladinDeath.wav` | HeroPaladinDeath | Impact | — | 73,846 | `8e49a3f8114a670b52b9a2a158edc54c6db62a42aa48590ed802d048a571c40b` |
| 63 | `wc3.holybolt` | model-soundset | `war3.mpq` | `Abilities\Spells\Human\HolyBolt\HolyBolt.wav` | `HolyBolt.wav` | HolyBolt | Launch | — | 70,264 | `77365c2aa31375f76bc606ad9dc9749f8383f81dc9e2ffe119fe10a0417c4bbe` |
| 64 | `wc3.humandissipate1` | model-soundset | `war3.mpq` | `Sound\Units\Human\HumanDissipate1.wav` | `HumanDissipate1.wav` | HumanDissipate | Dissipate | — | 100,140 | `073644b8398dd1cfd25a2bbdfbb228078675a48027df0652c8819e25720d3c2f` |
| 65 | `wc3.infernalbirth1` | model-soundset | `war3.mpq` | `Units\Demon\Infernal\InfernalBirth1.wav` | `InfernalBirth1.wav` | InfernalBirth | Launch | — | 110,294 | `d826c70f9a4836ae7ac8d83bcfa06c0225f636f3ed026e74a636a814f1d4cf64` |
| 66 | `wc3.invisibilitytarget` | model-soundset | `war3.mpq` | `Abilities\Spells\Human\Invisibility\InvisibilityTarget.wav` | `InvisibilityTarget.wav` | Invisibility | Launch | `godie-e007.r`, `godie-ewar.r`, `godie-h02r.r`, `godie-hgam.r` | 180,346 | `c3181367c07e6bc4a9cf8bc370cd113b7e8e39282a1b6b5f3ef70891ef5afbe4` |
| 67 | `wc3.irongolemattack1` | model-soundset | `war3.mpq` | `Units\Creeps\IronGolem\IronGolemAttack1.wav` | `IronGolemAttack1.wav` | IronGolemAttack1 | Launch | — | 95,646 | `06d47b53c5ebd5612558565a3990da7abe7e144f15e02af6a8176b1a88821334` |
| 68 | `wc3.irongolemdeath1` | model-soundset | `war3.mpq` | `Units\Creeps\IronGolem\IronGolemDeath1.wav` | `IronGolemDeath1.wav` | IronGolemDeath | Impact | — | 176,112 | `eb45c7ede06c88174b741fcf71008178dff715ea6bf2d120c4f1e5774236e5f8` |
| 69 | `wc3.jainaonfootdeath1` | model-soundset | `war3.mpq` | `Units\Human\Jaina\JainaOnFootDeath1.wav` | `JainaOnFootDeath1.wav` | JainaDeath | Impact | — | 138,870 | `93bda57253945d6b57b25253fb5b9a5af4eff65d11e6b189a533a4cf208a52d6` |
| 70 | `wc3.kaelyesattack3` | ability-declared | `War3xLocal.mpq` | `Units\Human\Kael\KaelYesAttack3.wav` | `KaelYesAttack3.wav` |  | Launch | `godie-emns.ex` | 72,198 | `67230c8cd35ee4965fd4fbcd486b005d7ea11fc04a09cef43441ac8f270f534a` |
| 71 | `wc3.keeperofthegrovemissilehit1` | model-soundset | `war3.mpq` | `Abilities\Weapons\KeeperGroveMissile\KeeperOfTheGroveMissileHit1.wav` | `KeeperOfTheGroveMissileHit1.wav` | KeeperOfTheGroveMissileHit | Impact | `godie-u010.w`, `godie-uvng.w` | 35,358 | `eb76e3df0dbf90ce17262d3ce38b9d631a27a1c0dc903f7bf117e6aa19321c07` |
| 72 | `wc3.keeperofthegrovemissilehit2` | model-soundset | `war3.mpq` | `Abilities\Weapons\KeeperGroveMissile\KeeperOfTheGroveMissileHit2.wav` | `KeeperOfTheGroveMissileHit2.wav` | KeeperOfTheGroveMissileHit | Impact | — | 35,448 | `b379ca862ba7f04111bd9d219498380ac293bf00b2c826723b54bc7e81343244` |
| 73 | `wc3.keeperofthegrovemissilehit3` | model-soundset | `war3.mpq` | `Abilities\Weapons\KeeperGroveMissile\KeeperOfTheGroveMissileHit3.wav` | `KeeperOfTheGroveMissileHit3.wav` | KeeperOfTheGroveMissileHit | Impact | — | 35,448 | `25b320e8eb9ce8fa55adae3160f2b6c1a1a3cebf0bf126505e9fe7198400bac9` |
| 74 | `wc3.keeperofthegrovemissilelaunch1` | model-soundset | `war3.mpq` | `Abilities\Weapons\KeeperGroveMissile\KeeperOfTheGroveMissileLaunch1.wav` | `KeeperOfTheGroveMissileLaunch1.wav` | KeeperOfTheGroveMissileLaunch | Launch | — | 39,542 | `1714a65db86389ef8cc5bfb82da2820ee0fd7d655b761b79908a61fe7d155628` |
| 75 | `wc3.keeperofthegrovemissilelaunch2` | model-soundset | `war3.mpq` | `Abilities\Weapons\KeeperGroveMissile\KeeperOfTheGroveMissileLaunch2.wav` | `KeeperOfTheGroveMissileLaunch2.wav` | KeeperOfTheGroveMissileLaunch | Launch | — | 39,632 | `fb1ef7ac54528d8a3d51458d302b5318ea9ef8260655557a08047a77a58b09a4` |
| 76 | `wc3.keeperofthegrovemissilelaunch3` | model-soundset | `war3.mpq` | `Abilities\Weapons\KeeperGroveMissile\KeeperOfTheGroveMissileLaunch3.wav` | `KeeperOfTheGroveMissileLaunch3.wav` | KeeperOfTheGroveMissileLaunch | Launch | — | 38,966 | `d15cab940974e59b7dce28a60fbd891a5ad1bb1312c40ac708a12df062b9d2f2` |
| 77 | `wc3.knightnoriderdeath1` | model-soundset | `war3.mpq` | `Units\Human\KnightNoRider\KnightNoRiderDeath1.wav` | `KnightNoRiderDeath1.wav` | HorseDeath | Impact | — | 126,048 | `15c5a2617caadfe45dbb28f62ef1f796958174a0b0be73c159480cd8cc4c3e0a` |
| 78 | `wc3.markofchaos` | model-soundset+ability-declared | `War3x.mpq` | `Abilities\Spells\Human\MarkOfChaos\MarkOfChaos.wav` | `MarkOfChaos.wav` | MarkOfChaos | Launch | `godie-e002.e`, `godie-e002.q`, `godie-e002.w`, `godie-e00l.e`, `godie-e00l.q`, `godie-e00l.w`, `godie-e00q.e`, `godie-e00r.r`, `godie-o01z.e`, `godie-o02v.e` | 176,698 | `5e58c8a136160881a2019bbc3864dc68f509fc9ac566674f0a5e52988177bea7` |
| 79 | `wc3.meatwagonmissilehit1` | model-soundset | `war3.mpq` | `Abilities\Weapons\MeatwagonMissile\MeatwagonMissileHit1.wav` | `MeatwagonMissileHit1.wav` | MeatWagonMissileHit | Impact | — | 66,168 | `ef7b004c8a08601b569cfa8de50ac84f1d0a207975918ad4d3077e16b7c8aa3d` |
| 80 | `wc3.mercenarywhat1` | ability-declared | `war3.mpq` | `Buildings\Other\Mercenary\MercenaryWhat1.wav` | `MercenaryWhat1.wav` |  | Launch | — | 159,096 | `871463aef00080b25a113126729d8e9b666c2f7fa39b6ca32406b63e9377d790` |
| 81 | `wc3.mortarimpact` | ability-declared | `war3.mpq` | `Abilities\Weapons\Mortar\MortarImpact.wav` | `MortarImpact.wav` |  | Impact | `godie-h02k.ex` | 83,338 | `6155f8167c48f4eca457d3b9b4c5cb582b85b8a67f93ed4fdd3577438542700d` |
| 82 | `wc3.mortarteampissed9` | ability-declared | `war3.mpq` | `Units\Human\MortarTeam\MortarTeamPissed9.wav` | `MortarTeamPissed9.wav` |  | Launch | `godie-u034.e`, `godie-u034.passive`, `godie-u034.q`, `godie-u034.w`, `godie-ucrl.e`, `godie-ucrl.passive`, `godie-ucrl.q`, `godie-ucrl.w` | 128,630 | `643754fbf656acdf30294ff284f792bb03b7865654e76bdcdc7c31e5ec55cf87` |
| 83 | `wc3.nagabuildingcancel` | model-soundset | `War3x.mpq` | `Sound\Buildings\Naga\NagaBuildingCancel.wav` | `NagaBuildingCancel.wav` | NagaBuildingDeath | Dissipate | — | 91,526 | `8eebec5fe39335b57bdd90daedb1e1bb2cef390e5572306456b8eba2771d8b10` |
| 84 | `wc3.nazgrelyes2` | ability-declared | `War3xLocal.mpq` | `Units\Other\Nazgrel\NazgrelYes2.wav` | `NazgrelYes2.wav` |  | Launch | — | 27,528 | `a4a67defe29f339b103f75a1c84890d179d98cdfaba20f3973499832ca651cea` |
| 85 | `wc3.necropolisupgrade2` | ability-declared | `war3.mpq` | `Buildings\Undead\Necropolis\NecropolisUpgrade2.wav` | `NecropolisUpgrade2.wav` |  | Launch | — | 257,988 | `0a9b7775d5216451864187ffa1ff1c28148ab91d3fac70fa875c297b16417f8d` |
| 86 | `wc3.nightelfdissipate1` | model-soundset | `war3.mpq` | `Sound\Units\NightElf\NightElfDissipate1.wav` | `NightElfDissipate1.wav` | NightElfDissipate | Dissipate | — | 100,140 | `073644b8398dd1cfd25a2bbdfbb228078675a48027df0652c8819e25720d3c2f` |
| 87 | `wc3.orcdissipate1` | model-soundset | `war3.mpq` | `Sound\Units\Orc\OrcDissipate1.wav` | `OrcDissipate1.wav` | OrcDissipate | Dissipate | — | 100,140 | `073644b8398dd1cfd25a2bbdfbb228078675a48027df0652c8819e25720d3c2f` |
| 88 | `wc3.pandarenbrewmasterpissed8` | ability-declared | `War3xLocal.mpq` | `Units\Creeps\PandarenBrewmaster\PandarenBrewmasterPissed8.wav` | `PandarenBrewmasterPissed8.wav` |  | Launch | `godie-h02k.w` | 72,974 | `55f00ed67c7132a8c3fb1324068a82baec2495bcd9a685f5de10ac4054cbde03` |
| 89 | `wc3.pandarenbrewmasterwarcry1` | ability-declared | `War3xLocal.mpq` | `Units\Creeps\PandarenBrewmaster\PandarenBrewmasterWarcry1.wav` | `PandarenBrewmasterWarcry1.wav` |  | Launch | `godie-h02k.e` | 112,526 | `67f753273a6704b3facd1c1aefc6fbf7afb662808cb35ded15314fd8a1eb16a9` |
| 90 | `wc3.pandarenbrewmasteryes1` | ability-declared | `War3xLocal.mpq` | `Units\Creeps\PandarenBrewmaster\PandarenBrewmasterYes1.wav` | `PandarenBrewmasterYes1.wav` |  | Launch | `godie-h02k.r` | 70,798 | `911fcb040a89f5a9e94d59a47d2f99efca5f58d98edf0f2c77c217358ef583b1` |
| 91 | `wc3.parasite` | ability-declared | `War3x.mpq` | `Abilities\Spells\Other\Parasite\Parasite.wav` | `Parasite.wav` |  | Launch | `godie-e00q.ex`, `godie-u00k.e` | 87,930 | `61c55f0bace9b29c42da8cd2dcbd301410d294962a32f690dabbd95e403a8828` |
| 92 | `wc3.peasantdeath` | model-soundset | `war3.mpq` | `Units\Human\Peasant\PeasantDeath.wav` | `PeasantDeath.wav` | PeasantDeath | Impact | — | 160,886 | `aff3bfb6260ca4d5febf28905af00bf562b2ee16168017e2fa8d6fe7c687c953` |
| 93 | `wc3.peasantpissed3` | ability-declared | `war3.mpq` | `Units\Human\Peasant\PeasantPissed3.wav` | `PeasantPissed3.wav` |  | Launch | — | 114,806 | `95aad252de84c153b4ea5fc8014ff3c5265590c45dbd70b7116849501fea0d53` |
| 94 | `wc3.peondeath` | ability-declared | `war3.mpq` | `Units\Orc\Peon\PeonDeath.wav` | `PeonDeath.wav` |  | Impact | `godie-e015.q`, `godie-u00l.q`, `godie-umal.q` | 81,530 | `c46dd952a4dca36cc3e71b5594d6b102ad8366380ca411190e38290090d258c8` |
| 95 | `wc3.peonwhat2` | ability-declared | `war3.mpq` | `Units\Orc\Peon\PeonWhat2.wav` | `PeonWhat2.wav` |  | Launch | — | 22,762 | `51d3de60bbb1973f291b7059dc1a8c0d44ff7f524d31881c4ab790c5a2922ef2` |
| 96 | `wc3.priestdeath` | model-soundset | `war3.mpq` | `Units\Human\Priest\PriestDeath.wav` | `PriestDeath.wav` | PriestDeath | Impact | — | 95,052 | `4bf7130aa5bac74f533a93ccfe1f00d5e5378c24ed9dca805a441fc1472a3e5a` |
| 97 | `wc3.reincarnation` | model-soundset | `war3.mpq` | `Abilities\Spells\Orc\Reincarnation\Reincarnation.wav` | `Reincarnation.wav` | Reincarnation | Launch | — | 120,362 | `4230a41c146b140611b212972114479f07d6600e8dcec52e270df0380855c0f1` |
| 98 | `wc3.rokhanwhat2` | ability-declared | `War3xLocal.mpq` | `Units\Other\Rokhan\RokhanWhat2.wav` | `RokhanWhat2.wav` |  | Launch | `godie-emns.e` | 95,880 | `6811170e0fc180a859b1510e98607f99fd9e5787f877f65cb004172a12368824` |
| 99 | `wc3.sealwhat2` | ability-declared | `war3.mpq` | `Units\Critters\Seal\SealWhat2.wav` | `SealWhat2.wav` |  | Launch | — | 79,696 | `ca7b6edef02b87a37790dc5a4853afcfa63143c866e5ad98b0c2f64415fb9b29` |
| 100 | `wc3.shadowhunterready1` | ability-declared | `War3xLocal.mpq` | `Units\Orc\HeroShadowHunter\ShadowHunterReady1.wav` | `ShadowHunterReady1.wav` |  | Launch | `godie-ubal.r` | 132,052 | `dcb4b594e02c4f14bdd5f769f22ee512b436d98defebed9ab074bb581f50513e` |
| 101 | `wc3.shamanready1` | ability-declared | `war3.mpq` | `Units\Orc\Shaman\ShamanReady1.wav` | `ShamanReady1.wav` |  | Launch | — | 232,822 | `8e879a03d8dd81e61d6af1742e010dc58bd3290c2f88ab41877928c73165d46b` |
| 102 | `wc3.shimmeringportaldeath` | ability-declared | `War3x.mpq` | `Sound\Ambient\DoodadEffects\ShimmeringPortalDeath.wav` | `ShimmeringPortalDeath.wav` |  | Impact | `godie-u010.e`, `godie-uvng.e` | 210,988 | `bb552ba21845bdbedbaff598a1adfd050800bc91b8522c8ce392843c3bf47b69` |
| 103 | `wc3.shockwave` | model-soundset | `war3.mpq` | `Abilities\Spells\Orc\Shockwave\Shockwave.wav` | `Shockwave.wav` | ShockWave | Launch | — | 125,700 | `97e804a2b3099489c082b606381bc233db772b1252d269c0be1271655386bed6` |
| 104 | `wc3.snapdragonmissilelaunch1` | ability-declared | `War3x.mpq` | `Abilities\Weapons\snapMissile\SnapDragonMissileLaunch1.wav` | `SnapDragonMissileLaunch1.wav` |  | Launch | `godie-o01z.e`, `godie-o01z.r`, `godie-o02v.e`, `godie-o02v.r`, `godie-u00j.w` | 52,856 | `5557a2989c7b40c5cdcfd98b7e6bc565164858a49d23ce249ba594baf21bcd30` |
| 105 | `wc3.soulgem` | ability-declared | `war3.mpq` | `Abilities\Spells\Items\AIso\SoulGem.wav` | `SoulGem.wav` |  | Launch | — | 197,660 | `c73b95b740d225f7a57064f5cc069a79fd363863c61910496141c863b5e20fe2` |
| 106 | `wc3.soulpreservation` | ability-declared | `war3.mpq` | `Abilities\Spells\Demon\SoulPreservation\SoulPreservation.wav` | `SoulPreservation.wav` |  | Launch | `godie-e008.r` | 159,360 | `b266e99ec97ed80bfc0585e73a845d2aa56d3fd3318e258a89468801b8312bab` |
| 107 | `wc3.spellbreakerpissed4` | ability-declared | `War3xLocal.mpq` | `Units\Human\BloodElfSpellThief\SpellbreakerPissed4.wav` | `SpellbreakerPissed4.wav` |  | Launch | `godie-n00b.w` | 109,966 | `8e6adeec90a03aa0e385bb64220808ec285f96f5c12a5669719bc7b3a1f43053` |
| 108 | `wc3.spiritofvengeanceyes3` | ability-declared | `War3xLocal.mpq` | `Units\NightElf\SpiritOfVengeance\SpiritOfVengeanceYes3.wav` | `SpiritOfVengeanceYes3.wav` |  | Launch | `godie-n00p.w` | 115,576 | `611022c8eb623c292fc958437efe3490062c78f9b63b588bbe66fd6874d9fe51` |
| 109 | `wc3.stampedecaster1` | ability-declared | `War3x.mpq` | `Abilities\Spells\Other\Stampede\StampedeCaster1.wav` | `StampedeCaster1.wav` |  | Launch | — | 117,802 | `bb70540d7f7d427724a9fc8b4b62dbcb3375bc9fef20f01467cb3e1e5625f436` |
| 110 | `wc3.stasistotem` | model-soundset | `war3.mpq` | `Units\Orc\StasisTotem\StasisTotem.wav` | `StasisTotem.wav` | StasisTotemDeath | Impact | `godie-h022.e`, `godie-ntin.r` | 82,148 | `84cf15326dd7f0f0f8a57335c9ec69de22f1124c78edae722e4a6d47a178752a` |
| 111 | `wc3.step1` | model-soundset | `war3.mpq` | `Sound\Units\Footsteps\Step1.wav` | `Step1.wav` | DeepFootstep | Launch | — | 44,624 | `a8d63432eeda9fabba322f0abf613eab8decd040518fe3ab0e1f6d56ab481418` |
| 112 | `wc3.step2` | model-soundset | `war3.mpq` | `Sound\Units\Footsteps\Step2.wav` | `Step2.wav` | DeepFootstep | Launch | — | 43,862 | `547fe25c7dd5be594e0e32c95f1152fd26019246c5056a5b10922dd406f8cb17` |
| 113 | `wc3.step3` | model-soundset | `war3.mpq` | `Sound\Units\Footsteps\Step3.wav` | `Step3.wav` | DeepFootstep | Launch | — | 42,750 | `e655e53c077166034342ee9c7678238683cca4bbf4cc26480043100f0023a752` |
| 114 | `wc3.step4` | model-soundset | `war3.mpq` | `Sound\Units\Footsteps\Step4.wav` | `Step4.wav` | DeepFootstep | Launch | — | 42,256 | `3c3466644bb9f00b86ce490ee8261c2a6abd43131888f34442035b50fe8a8ee8` |
| 115 | `wc3.succubusdeath1` | model-soundset | `War3xLocal.mpq` | `Units\Demon\Demoness\SuccubusDeath1.wav` | `SuccubusDeath1.wav` | DemonessDeath | Impact | — | 80,974 | `8f8ea065e0fc5e8aa0842d24c0d224879d6729e948d5e16a599700e35e4cab07` |
| 116 | `wc3.taunt` | ability-declared | `War3x.mpq` | `Abilities\Spells\NightElf\Taunt\Taunt.wav` | `Taunt.wav` |  | Launch | `godie-h02u.w`, `godie-h02v.w`, `godie-o00l.r`, `godie-u00k.r`, `godie-udea.e` | 124,282 | `d8b100d8f6413bdc7a175cb78ce9abe780e46507a77c848c9415b5a53a5e4058` |
| 117 | `wc3.thunderboltmissiledeath` | ability-declared | `war3.mpq` | `Abilities\Spells\Human\StormBolt\ThunderBoltMissileDeath.wav` | `ThunderBoltMissileDeath.wav` |  | Impact | `godie-edem.r` | 98,632 | `bc66dbf49a467e5b1a075b2c7553ac53b18508500b8a8a052039ec97bee1d709` |
| 118 | `wc3.thunderclapcaster` | ability-declared | `war3.mpq` | `Abilities\Spells\Human\ThunderClap\ThunderClapCaster.wav` | `ThunderClapCaster.wav` |  | Launch | `godie-n01c.e`, `godie-nbbc.e` | 152,306 | `4b05dc7887580a225cf0b23e13fbf29ec7d652840d22d4c7657ba2ce2312c02a` |
| 119 | `wc3.treantready1` | ability-declared | `war3.mpq` | `Buildings\NightElf\AncientProtector\TreantReady1.wav` | `TreantReady1.wav` |  | Launch | `godie-e00s.q`, `godie-ubal.r` | 108,002 | `8c7188d75fae3cd60f15140b7dcdd1ff61c5f32f42a482a6136d832f254e8465` |
| 120 | `wc3.trollbatriderpissed2` | ability-declared | `War3xLocal.mpq` | `Units\Orc\BatTroll\TrollbatriderPissed2.wav` | `TrollbatriderPissed2.wav` |  | Launch | `godie-ubal.w` | 138,638 | `67bcfce73261cf48abfe0757821c7724d40501415734207528e775d7c633db74` |
| 121 | `wc3.trollwoodworkswhat1` | ability-declared | `war3.mpq` | `Buildings\Orc\WarMill\TrollWoodWorksWhat1.wav` | `TrollWoodWorksWhat1.wav` |  | Launch | `godie-u00n.passive`, `godie-u00o.passive` | 132,476 | `98ea13e7248ffe1e08ad1966b1e3aeb8adc2ba0ab2e3510397b78006bf78707b` |
| 122 | `wc3.tuskarrdeath1` | model-soundset | `War3xLocal.mpq` | `Units\Creeps\tuskar\TuskarrDeath1.wav` | `TuskarrDeath1.wav` | TuskarrDeath | Impact | — | 99,392 | `c9a3389d0b5a4b7b6a47355a9f79873a17648b3bfbf6d24c517c29354c6f4add` |
| 123 | `wc3.undeaddissipate2` | model-soundset | `war3.mpq` | `Sound\Units\Undead\Dissipate\UndeadDissipate2.wav` | `UndeadDissipate2.wav` | UndeadDissipate | Dissipate | — | 159,450 | `c2dd04c317aa287392f9df448402326638da1009bd1b9356a5dd1acf6d2af39c` |
| 124 | `wc3.villagerchilddeath1` | model-soundset | `war3.mpq` | `Units\Critters\VillagerKid\VillagerChildDeath1.wav` | `VillagerChildDeath1.wav` | VillagerChildDeath | Impact | — | 58,742 | `fca4d12bb44a62b0b50657d60cd2e351814d6e15d347575f2afc17584c7ee850` |
| 125 | `wc3.villagermaledeath1` | model-soundset | `war3.mpq` | `Units\Critters\VillagerMan\VillagerMaleDeath1.wav` | `VillagerMaleDeath1.wav` | VillagerManDeath | Impact | — | 70,262 | `f0d38fb2a7e309cfe51097f0887d6f95101c436c99cc74652bd7e4f247eb8656` |
| 126 | `wc3.wandofneutralization` | model-soundset | `War3x.mpq` | `Abilities\Spells\Items\WandOfNeutralization\WandOfNeutralization.wav` | `WandOfNeutralization.wav` | NeutralizationWandHit | Impact | `godie-h01u.w`, `godie-n01c.r`, `godie-nbbc.r` | 42,598 | `36725f64c37259d6c40beaf0f981d8273cb9fd3a3afce8d2b3fd4f5779442610` |
| 127 | `wc3.wardenattackeffort1` | model-soundset | `War3xLocal.mpq` | `Units\NightElf\HeroWarden\WardenAttackEffort1.wav` | `WardenAttackEffort1.wav` | WardenAttack | Launch | — | 60,026 | `a9087b61576af1682cf5ce907af60cb90ebd371082fe8e30a6ee17719968bbda` |
| 128 | `wc3.wardendeath1` | model-soundset | `War3xLocal.mpq` | `Units\NightElf\HeroWarden\WardenDeath1.wav` | `WardenDeath1.wav` | HeroWardenDeath | Impact | — | 61,098 | `858b6837424e404d09f43faa921010b357f6508491c4b42f485e9a2de6104fdd` |
| 129 | `wc3.warstomp` | model-soundset | `war3.mpq` | `Units\Orc\Tauren\Warstomp.wav` | `Warstomp.wav` | Pulverize | Launch | — | 95,598 | `c21dc389b19ce79cbda3df2f910ed03c488f874ff4daafa07bdef972611c9ac5` |
| 130 | `wc3.waterelementalmissile3` | ability-declared | `war3.mpq` | `Abilities\Weapons\WaterElementalMissile\WaterElementalMissile3.wav` | `WaterElementalMissile3.wav` |  | Launch | `godie-u00n.e`, `godie-u00o.e` | 66,686 | `803d6cdf70867eea4668613b95595df3cc46504012c352c406cd1bf9decfb013` |
| 131 | `wc3.waygatewhat1` | ability-declared | `war3.mpq` | `Buildings\Other\Waygate\WayGateWhat1.wav` | `WayGateWhat1.wav` |  | Launch | `godie-o00l.e`, `godie-o02s.r` | 111,642 | `7a6f3f6146f6620c21c03267d1a9c7c9014c31bda268b9d11c4c02d17f5b15e8` |
| 132 | `wc3.witchdoctorcastattack1` | ability-declared | `war3.mpq` | `Abilities\Weapons\WitchDoctorMissile\WitchDoctorCastAttack1.wav` | `WitchDoctorCastAttack1.wav` |  | Launch | `godie-h00l.q` | 60,428 | `c0ad98d38d7d685faf316ade2c29dd0d3013dac9192668e534a171ec8fc5fa11` |

---

## 四 · 缺口（⛔ 靜默跳過就是說謊）

74 條路徑裡有 1 條抽不到，另有 5 顆事件解不開。**沒有任何一個模型因此全啞** ——
每一個都還有別的事件解得開（逐個查過，見下）。

| 種類 | 模型 | 事件 / 路徑 | 為什麼 | 要不要緊 |
|---|---|---|---|---|
| 有 label 沒檔名 | `goku` | `SNDXAAMS` | AnimSounds.slk 有這一列但 FileNames 是空的 | 該模型另有解得開的事件 |
| 有 label 沒檔名 | `herobuu` | `SNDXAAMS` | AnimSounds.slk 有這一列但 FileNames 是空的 | 該模型另有解得開的事件 |
| 有 label 沒檔名 | `luffe` | `SNDXAAMS` | AnimSounds.slk 有這一列但 FileNames 是空的 | 該模型另有解得開的事件 |
| MPQ 裡沒有這個檔 | `mfls` | `Units\Critters\VillagerWoman\VillagerFemaleDeath1.wav` | 四個零售 MPQ 都沒有這個路徑 → 這一顆事件沒有聲音 | 該模型另有解得開的事件 |
| MPQ 裡沒有這個檔 | `` | `war3mapImported\sawch.mp3` | 四個零售 MPQ 都沒有這個路徑 → 這一顆事件沒有聲音 | 該模型另有解得開的事件 |
| 事件碼解不開 | `crescent` | `SNDXAEFL` | AnimLookups.slk 沒有這個 4 碼事件碼 → 翻不出 sound label | 該模型另有解得開的事件 |
| 事件碼解不開 | `rabbit` | `SNDXKPES` | AnimLookups.slk 沒有這個 4 碼事件碼 → 翻不出 sound label | 該模型另有解得開的事件 |

---

## 五 · 這些位元組被動過什麼

**什麼都沒有。** 從 MPQ 讀出來的位元組直接落檔，sha256 就是 MPQ 裡那一份的 sha256。
⛔ 沒有重新取樣、沒有正規化音量、沒有轉成 mp3、沒有去頭尾靜音。
音量與節流住在 `content/config/audio-map.json`（`gain` / `cooldownMs` /
`maxConcurrent`），⭐ **那是後台改得動的一格**，⛔ 不是烘進檔案裡的。


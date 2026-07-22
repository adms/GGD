# GoDie EX22s — trigger tree (war3map.wtg / war3map.wct)

- WTG version: 7 (classic TFT format)
- Categories (folders): 127
- Triggers: 1112  (executable 927, comment 91, disabled 94)
- Custom-text triggers: 55  (WCT non-empty bodies: 55, mismatches: 0)
- war3map.j InitCustomTriggers order match: 0.9957 (927 vs 927 calls)

Legend: `[C]` custom-text trigger, `[x]` disabled, `#` comment/separator. Triggers listed in map (tree) order.


- **全域傷害觸發**  `#39` (2 triggers)
    - Damage Event Set
    - Damage_Event_System `[C]`

- **測試碼**  `#12` (34 triggers)
    - SinglePlayer
    - nolag
    - CreateHero
    - CreateEmeHero
    - LevelControl
    - testEX
    - testMoriya
    - testMoriya2
    - Wood Hero
    - Wood Archer
    - Wood Warrior
    - HPMP
    - GoldWoodUp
    - ZeroCD
    - ZeroCD Start
    - CallMoriya
    - Scodie
    - SnowStop
    - PeterTurtle
    - Ex
    - beginnig
    - d8246505 pno
    - d8246505 1
    - d8246505 2
    - d8246505 3
    - d8246505 4
    - d8246505 5
    - d8246505 6
    - d8246505 7
    - Iamacoward
    - Iamacoward 1
    - Iamacoward 2
    - Iamacoward control `[x]`
    - Iamacoward set `[x]`

- **記分版**  `#15` (6 triggers)
    - Multiboard Setup
    - Create Multiboard
    - Tally Score Hero
    - Tally Clock
    - Tally Deaths
    - Sort Multiboard

- **遊戲模式與指令設定**  `#11` (47 triggers)
    - --- 房主(藍色)指令 --- `#`
    - NewMode
    - NewMode 2
    - BR Law
    - --- 玩家指令 --- `#`
    - Killme
    - Matchup
    - Movespeed
    - OpenBox
    - KillWords
    - go
    - go left
    - go right
    - help
    - back
    - --- 玩家放話 --- `#`
    - MP
    - dont touch me
    - yooooooooooooo
    - hate
    - god
    - new
    - h
    - come
    - no
    - good
    - gg
    - --- 遊戲執行 --- `#`
    - EX burst
    - Soul expense
    - MoveItem
    - BoxMoveLimit
    - NoticeAI
    - Time is 5 seconds
    - Time is 15 seconds
    - Time is 30 seconds
    - Time is 45 seconds
    - Turn On Spawns0
    - 人物編號 `#`
    - Command All Pick auto
    - Command Item Drop
    - Command Death Match
    - Command Short Mode
    - Command Ultra Short Mode
    - Command Uber
    - Command Kuso
    - Command Multiboard Deaths

- **選英雄(酒館)**  `#6` (16 triggers)
    - 英雄陣列 `#`
    - Init Random Hero List `[C]`
    - 英雄選取 `#`
    - SetIndex
    - Select Hero `[C]`
    - Select Random Hero `[C]`
    - Select Hero Sub `[C]`
    - 時間到自動選取 `#`
    - Turn off Select
    - 隨機選取 `#`
    - random mode
    - -ar `#`
    - All Random `[C]`
    - 提示字幕 `#`
    - Notice
    - Turn off All Rand

- **英雄單位事件**  `#21` (10 triggers)
    - SetName
    - WaitPlayerName
    - Revive Hero
    - Revive Hero Timer
    - Revive Hero Tavern
    - Move Heroes
    - Item Drop
    - Death Match
    - Uber Mode
    - Kuso Mode

- **玩家設定**  `#2` (4 triggers)
    - Setup Players
    - 玩者顏色陣列&名字初始化 `#`
    - Player Colors
    - PlayerNameChange

- **玩家事件**  `#14` (2 triggers)
    - Player Leaves Game
    - Free Gold

- **雙方小兵單位事件**  `#10` (29 triggers)
    - GoDie North SpawnF
    - GoDie North SpawnM
    - Godie North Move
    - Godie North Move Fix
    - Godie North Creep
    - GoDie CenterAch
    - GoDie CenterFi
    - GoDie Center SpawnF
    - GoDie Center SpawnM
    - GoDie Center Move
    - GoDie South SpawnF
    - GoDie South SpawnM
    - GoDie South Move
    - GoDie South Creep
    - GoDie Relief
    - Love North SpawnF
    - Love North SpawnM
    - Love North Move
    - Love North Creep
    - Love CenterAch
    - Love CenterFi
    - Love Center SpawnF
    - Love Center SpawnM
    - Love Center Move
    - Love South SpawnF
    - Love South SpawnM
    - Love South Move
    - Love South Creep
    - Love Relief

- **中立怪設定**  `#3` (4 triggers)
    - CreepRevive `[C]`
    - ZombKing
    - Hidden Treasure
    - Treasury

- **科技提升設定**  `#18` (29 triggers)
    - Tower Broken
    - Soldier 500secRed
    - Soldier 500secGreen
    - Soldier 1000secRed
    - Soldier 1000secGreen
    - Soldier 1400secRed
    - Soldier 1400secGreen
    - Soldier 1800secRed
    - Soldier 1800secGreen
    - Soldier 2200secRed
    - Soldier 2200secGreen
    - Soldier 2800secRed
    - Soldier 2800secGreen
    - Soldier 3600secRed
    - Soldier 3600secGreen
    - Tower 600sec `[x]`
    - Tower 1200sec `[x]`
    - Tower 2000sec `[x]`
    - 吸取經驗值設定 `#`
    - EXP 60sec
    - EXP 100sec
    - EXP 400sec
    - EXP 600sec
    - EXP 1000sec
    - EXP 1200sec
    - EXP 1800sec
    - EXP 2000sec
    - EXP 2300sec
    - EXP 2500sec

- **防偷爆設定**  `#4` (4 triggers)
    - Setup Invunerable
    - --------------------------- `#`
    - Love Base
    - GoDie Base

- **其他**  `#16` (15 triggers)
    - TowerSPStart
    - TowerSP
    - DestroyBuilding
    - jumpBadReg
    - jumpBadReg2
    - jumpBadReg3
    - Turn on Chat
    - Lumber
    - Combine Charged Items `[C]`
    - Beef
    - Regrow Trees Setup
    - RegrowTrees
    - Goblin Shop
    - The Lord Ring `[x]`
    - HeavenSwordGiNow `[x]`

- **據點系統**  `#109` (4 triggers)
    - 占領 `#`
    - Create `[x]`
    - 偵查 `#`
    - UseSearch `[x]`

- **投降系統**  `#124` (5 triggers)
    - Surrender system init
    - Surrender system
    - Love Surrender
    - Die Surrender
    - Safe Vote

## ==========地圖==========

- **遊戲初始化**  `#0` (16 triggers)
    - Map Initialization
    - GameOver Red
    - GameOver Green
    - FinalFight
    - Kill Unit Tri
    - SmallMap Singnal
    - ExpRateUpTo60 `[x]`
    - CantKill
    - HeroDead
    - Killrewardwood
    - Message
    - InitMode
    - Message Choice
    - Begining Item
    - DayOrNightInit
    - DayOrNight

- **AI**  `#7` (17 triggers)
    - AI Init
    - AILearning
    - ai temp `[x]`
    - ai temp2 `[x]`
    - AIRAttacked
    - AINotice
    - AICallHelpTrg
    - AICallHelp
    - AIRef `[x]`
    - AIgoHomeBuy
    - AIGAttacked
    - AIG3 delete `[x]`
    - AIGSkills
    - AILast
    - AImove
    - AImove LoveFinal
    - AImove GoDieFinal

- **提示字樣**  `#22` (1 triggers)
    - ChatDialog

- **任務設定**  `#1` (50 triggers)
    - 以下是隨機任務 `#`
    - RandomKillHero
    - HatredSystem
    - 以下是固定任務 `#`
    - ChungFeReward
    - Night 3600
    - NightReward
    - FireGragon 1200
    - FireDragonReward
    - FireDragonKill
    - GodTear 1100
    - GodTearReward
    - OceanBoss 1800
    - OceanBossReward
    - Whale 700
    - Whale Reward
    - Pig950
    - PigReward
    - PigKill
    - Ocean 600
    - OceanReward
    - MissingSheep900
    - MissingSheepGo
    - MissingSheepGoal
    - MissingSheepDeath
    - MissingSheepAttacked
    - Baha 1500
    - BahaReward
    - Turtle
    - TurtlePower
    - TutleDie
    - TurtleKill
    - Black2
    - EatMan
    - --------------------------- `#`
    - Keroro
    - Keroro SpeedUp
    - Keroro Dead
    - Keroro Recall
    - keroro Copy `[x]`
    - --------------------------- `#`
    - Tanatai
    - TanataiDeath
    - TanataiKill
    - LordRing
    - HeavenSword
    - tenCow Normal
    - NiLow
    - NiLowGift
    - NiLow Never Craze

- **任務提示**  `#36` (9 triggers)
    - mission turtle
    - mission crossHo
    - mission heaven
    - mission ring
    - mission meat
    - mission Gantz
    - mission flog
    - mission taitan
    - mission nairo

## ==========資訊==========

## ==========寵物==========

- **寵物**  `#41` (4 triggers)
    - pet init
    - pet move
    - pet adopt
    - pet again

## ==========道具==========

- **積分兌換系統(Gantz)**  `#44` (7 triggers)
    - Inventory
    - CassiopeiaWreckage
    - Empty Can
    - Old Clothes
    - Sparta
    - Burdock
    - TitanPrimal

- **道具合成**  `#9` (79 triggers)
    - 積分道具 `#`
    - Item5000
    - Item5001
    - Item5002
    - Item5004
    - Item5005
    - Item5006
    - Item5007
    - Item5008
    - 初階武器 `#`
    - Item1100
    - Item1101
    - Item1102
    - Item1103
    - Item1104
    - Item1105
    - Item1106
    - Item1107 `[x]`
    - Item1108
    - Item1109
    - Item1110
    - Item1111
    - 初階飾品防具 `#`
    - Item2100
    - Item2101
    - Item2102
    - Item2103
    - Item2104
    - Item2105
    - Item2106
    - Item2107
    - Item2108
    - Item2109
    - Item2110
    - Item2111
    - Item2112
    - 二階神器 `#`
    - Item1200
    - Item1201
    - Item1202
    - Item1203
    - Item1204
    - Item1205
    - Item1206
    - Item1207
    - Item1208
    - Item1209 `[x]`
    - Item1210
    - Item1211
    - Item1212
    - 二階飾品防具 `#`
    - Item2201
    - Item2202
    - Item2203
    - Item2204
    - 史詩級傳說道具 `#`
    - Item3000
    - Item3001 `[x]`
    - Item3002
    - Item3003
    - Item3004
    - Item3005
    - Item3006
    - Item3007
    - Item3008
    - Item3009
    - 法術道具 `#`
    - Item4000
    - Item4001
    - Item4002
    - Item4003
    - Item4004
    - Item4005
    - Item4006
    - Item4007
    - 其他合成 `#`
    - FourSoul
    - 隱武 `#`
    - secretroom

- **道具事件**  `#8` (33 triggers)
    - MagicDefStone `[x]`
    - DofuLvSet `[x]`
    - DofuItemGet `[x]`
    - DofuItemLose `[x]`
    - BloodBook `[x]`
    - Vengeance Robe
    - GoldDeft `[x]`
    - Light Wand `[C]`
    - IceTigerAttack
    - SkyWolfInstall
    - SkyWolfAttack `[C]`
    - Hell
    - KillPig
    - spiralAttack
    - spiralAttackEffect
    - AtheaAttatk
    - RareMeat
    - LigtingHamm
    - GravityBall
    - NoviceChange
    - Boold
    - InvBook
    - DieTooh `[x]`
    - Longinus
    - OldLa
    - JustticePunish
    - CurseDagger `[x]`
    - LosingHeart
    - MagicArmEffect
    - FireLord
    - Closeaeff
    - Sword
    - RemoveDef `[C]` `[x]`

## ==========技能==========

- **CP怪**  `#37` (3 triggers)
    - DeadWhale
    - LokDeathEye
    - Stumble

- **共同觸發技能**  `#33` (4 triggers)
    - comeon
    - Initate Crazy
    - AdjustCrazy
    - Crazy Movement

- **測試中技能**  `#27` (2 triggers)
    - DragonTigerReady
    - DragonTigerMove

- **不明技能觸發**  `#5` (11 triggers)
    - Tidal Wave
    - Near To Death
    - Soulless Hunter
    - Destroy Effect
    - Blood Wave `[C]`
    - First Greed `[C]`
    - juidam `[C]`
    - Recover `[C]`
    - InfinetSlash `[C]`
    - DeathUnit `[C]`
    - MoDoOver `[C]`

### ----------愛與和平

- **妙蛙種子**  `#121` (5 triggers)  _(hero · 愛與和平)_
    - Open Skill of Frog
    - Parasitism Seed
    - Vine
    - SunFire pre
    - SunFire

- **小傑**  `#28` (8 triggers)  _(hero · 愛與和平)_
    - Open Skill of XHunter `[x]`
    - XHunter2
    - XHunterStone pre
    - XHunterStone
    - XHunterStone Effect
    - XHunter
    - XHunterStoneX pre `[x]`
    - XHunterStoneX `[x]`

- **瘋狂假面**  `#69` (2 triggers)  _(hero · 愛與和平)_
    - ComeToEat
    - ComeToEatEffect

- **安云**  `#70` (9 triggers)  _(hero · 愛與和平)_
    - Open Skill of HideAzumi `[x]`
    - FitCutExecute
    - HundredKill
    - HundredKillEffect
    - AzumiShadow
    - AzumiHit
    - AzumiShadowNew
    - AzumiATK
    - AzmuiJugATK

- **藏馬**  `#71` (7 triggers)  _(hero · 愛與和平)_
    - Open Skill of HideHorse `[x]`
    - plant
    - EvilFox
    - OldTree
    - OldTreeDie
    - SuperOldTree
    - Gorama

- **賈修**  `#72` (5 triggers)  _(hero · 愛與和平)_
    - Open Skill of EvilChild `[x]`
    - closeMe
    - GoldDrgan
    - GoldDrgan Effect
    - GoldDragonEat

- **真夜**  `#73` (6 triggers)  _(hero · 愛與和平)_
    - Open Skill of TrueNight `[x]`
    - SpaceCut `[C]`
    - WildCut
    - WildCut Effect
    - DragonEyes `[C]`
    - DragonEyesAgi

- **小呆**  `#74` (5 triggers)  _(hero · 愛與和平)_
    - Open Skill of LittleDie `[x]`
    - LightSpeed `[C]`
    - DraBom
    - ABanX `[C]`
    - DragonMan `[x]`

- **索龍**  `#75` (7 triggers)  _(hero · 愛與和平)_
    - Open Skill of three knife `[x]`
    - Threesword
    - Roaction
    - Romove
    - Learn Burn Beat
    - ThworldStart
    - ThworldMove

- **天地志狼**  `#76` (7 triggers)  _(hero · 愛與和平)_
    - Open Skill of SG `[x]`
    - GodTakeMd
    - DragonExp
    - DragonChannel
    - DragonExpGo
    - PowerBack
    - PowerBack Effect

- **莉娜**  `#77` (7 triggers)  _(hero · 愛與和平)_
    - Open Skill of Lina `[x]`
    - LinaS
    - LinaS Effect
    - Fire NOVA
    - DragonSlaveSet
    - DragonSlaveMove
    - GigaSlave

- **木乃香**  `#78` (16 triggers)  _(hero · 愛與和平)_
    - MoveSlaveOrder
    - MoveSlaveStart
    - Wind Effect
    - MagicFan
    - Wind CloseEffect
    - SlaveExp
    - AKT start
    - AKT stop
    - AKT 1
    - AKT 1 Effect
    - AKT 2
    - AKT 3
    - AKT 4
    - AKT 4 Effect
    - AKT Effect
    - AKT CloseEffect

- **菲特**  `#79` (6 triggers)  _(hero · 愛與和平)_
    - Open Skill of Fate `[x]`
    - LightLancer
    - LightLancerEffect `[C]`
    - Gas to Stop Tower
    - HolySword
    - LigtingExp

- **麻倉葉**  `#80` (13 triggers)  _(hero · 愛與和平)_
    - Open Skill of GosofKing `[x]`
    - 式神招來 `#`
    - Soul Shock
    - 附身合體 `#`
    - GosIn
    - 無無明亦無 `#`
    - Empty
    - 真空佛陀斬 `#`
    - GDD
    - 阿彌陀丸 `#`
    - MU
    - EX `#`
    - ComOne

- **孫悟空**  `#81` (5 triggers)  _(hero · 愛與和平)_
    - Open Skill of Goku `[x]`
    - SSJ Affect
    - SSJ
    - Goku
    - Turtle Power

- **SABER**  `#82` (10 triggers)  _(hero · 愛與和平)_
    - Open Skill of Saber
    - saber
    - Air
    - Air value deal
    - Air Attack
    - Air MagicBook
    - Excalibur
    - avalonReady
    - avalonStart
    - ExcaliburMAX

- **黑Saber**  `#119` (4 triggers)  _(hero · 愛與和平)_
    - Open Skill of DarkSaber
    - ManaIcrease
    - InSpace
    - MudAttackCP `[x]`

- **鋼彈**  `#83` (2 triggers)  _(hero · 愛與和平)_
    - Open Skill of Gundam
    - Allbullet

- **夏娜**  `#84` (6 triggers)  _(hero · 愛與和平)_
    - Open Skill of ShaNa
    - FireSwordSkill
    - CloseDest
    - CloseDestAddAb
    - CloseDestEffect
    - SpaceBreaker

- **龍宮禮奈**  `#85` (3 triggers)  _(hero · 愛與和平)_
    - Open Skill of WoSoDA `[x]`
    - KillPowerEX
    - KillPower

- **克勞德**  `#86` (9 triggers)  _(hero · 愛與和平)_
    - Open Skill of Cloud `[x]`
    - Super Sword
    - Toro
    - XFight
    - Toro Rotation
    - BreakLight
    - StoJump Start
    - StoJump Effect
    - SuperFF7

- **桔梗**  `#87` (7 triggers)  _(hero · 愛與和平)_
    - Open Skill of Hiun `[x]`
    - Learn FeedBack
    - FeedBack Effect `[C]` `[x]`
    - FeedBack `[C]`
    - FinalShotting
    - FinalShottingMove
    - HudGhosts

- **蒼月潮**  `#24` (6 triggers)  _(hero · 愛與和平)_
    - Open Skill of Moon `[x]`
    - order123
    - Jump Start
    - Jump Effect
    - MoonKnock
    - Beast Spear

- **法師涅吉**  `#48` (13 triggers)  _(hero · 愛與和平)_
    - Open Skill of MT `[x]`
    - Sleep Air
    - LiteningWind
    - ThTh
    - 暫定契約 `#`
    - AgreementTarget
    - AgreementStart
    - AgreementJudg
    - 風精召喚 `#`
    - WindWizard
    - 風花-武裝解除 `#`
    - WindFlowerStart
    - WindFlower

- **戰鬥涅吉**  `#42` (28 triggers)  _(hero · 愛與和平)_
    - Open Skill of Negi
    - NegiAccJudg
    - KillUnit
    - 崩拳系列 `#`
    - NegiAttack
    - NegiAttJudg
    - fist
    - 光箭 `#`
    - LightArrow
    - LightFire
    - MoveLightPoint
    - LightDam
    - 縮地 `#`
    - MoveStart
    - MoveInst
    - 雷之投擲 `#`
    - ThunderLance
    - ThunderCreate
    - ThunderMove
    - ThunderFist
    - 闇之魔法 `#`
    - DarkMagic
    - WindThunder
    - HellFire
    - 太陰道 `#`
    - absorpStart
    - absorp
    - KillGodMove

- **奈葉**  `#89` (5 triggers)  _(hero · 愛與和平)_
    - Open Skill of Nanoha `[x]`
    - AcxelShooter
    - BarrelShot
    - DivineBusterEx
    - StarlightBreakerPlus

- **魯夫**  `#102` (12 triggers)  _(hero · 愛與和平)_
    - Open Skill of Luffe
    - Luf died
    - Luf Axe
    - Luf Axe Effect
    - Luf gun
    - Luf two Effect
    - Luf RockFire D8
    - Luf RockFire Effect D8
    - Luf Three
    - Luf Three Effect
    - 霸王色 `#`
    - KingColor `[C]`

### ----------去死去死

- **鬼王達**  `#126` (1 triggers)  _(hero · 去死去死)_
    - GhostDaEX

- **臭作**  `#125` (2 triggers)  _(hero · 去死去死)_
    - Open Skill of Henti
    - HentiEX

- **黑崎一護**  `#47` (13 triggers)  _(hero · 去死去死)_
    - ----------黑崎一護 `#`
    - Open Skill of Bleach `[x]`
    - 瞬步 `#`
    - Bleach Rush
    - 斬擊 `#`
    - Bleach Strike
    - 月牙天衝 `#`
    - Bleach Moon
    - Bleach Moon Effect
    - 虛化 `#`
    - Bleach Null start
    - Bleach Null close
    - Bleach Null

- **伊文潔琳**  `#17` (7 triggers)  _(hero · 去死去死)_
    - Open Skill of EVN `[x]`
    - The End ofWorld
    - The End ofWorldStart
    - The End ofWorldCasting
    - The End ofWorldCasting EX
    - MagicStamp
    - MagicAttackPoint

- **牛丸**  `#19` (3 triggers)  _(hero · 去死去死)_
    - Open Skill of CowBall `[x]`
    - godJumpWall
    - godback

- **鄭先生**  `#20` (3 triggers)  _(hero · 去死去死)_
    - Open Skill of EatSon `[x]`
    - Open World
    - Ptt Judge `[C]`

- **Rider**  `#26` (13 triggers)  _(hero · 去死去死)_
    - Open Skill of Rider `[x]`
    - Riderspell `[C]`
    - link `[C]`
    - linkmove `[C]`
    - linkback `[C]`
    - RiderSprint `[C]`
    - Ridermoveline `[C]`
    - Ridermovecir `[C]`
    - RidermovelineDam `[C]`
    - Maga Arm
    - Blood Cast
    - Blood
    - BloodKill

- **拳四郎**  `#30` (5 triggers)  _(hero · 去死去死)_
    - Open Skill of NG `[x]`
    - YouDie
    - ChangeDNA
    - LightAttack
    - HunrThum

- **殺生丸**  `#34` (7 triggers)  _(hero · 去死去死)_
    - Open Skill of Dog `[x]`
    - BlueDragonWave
    - lzfs
    - lzfsEffect
    - EX 冥道殘月破 `#`
    - newlzfs
    - newlzfsmove

- **胖虎**  `#52` (13 triggers)  _(hero · 去死去死)_
    - GrantSound
    - Micphone
    - Hell Rock
    - Hell Rock Move
    - Hell Timer1
    - Hell Timer2
    - Hell Timer3
    - Hell Timer4
    - Hell Timer5
    - Hell Timer6
    - Hell Timer7
    - Hell Timer8
    - Hell Timer9

- **鬼畜狂刀**  `#53` (6 triggers)  _(hero · 去死去死)_
    - Open Skill of CrzGos `[x]`
    - TrueBody
    - FireBird `[C]`
    - ShanWindDragon
    - ShanWindDragonMove
    - GodWind

- **傑洛士**  `#54` (6 triggers)  _(hero · 去死去死)_
    - Open Skill of Zeros `[x]`
    - DefMagic
    - AnKiMagic
    - AnKiMagic Effect
    - KaoLight
    - Get Magic EX

- **皮卡丘**  `#55` (5 triggers)  _(hero · 去死去死)_
    - Open Skill of Pikachu
    - Sadosi
    - LightningSpread
    - WildPika
    - WildPikaAttacked

- **皮卡娘**  `#120` (3 triggers)  _(hero · 去死去死)_
    - Open Skill of Pikachu Copy
    - NoCute
    - PIKACHU

- **普烏**  `#56` (6 triggers)  _(hero · 去死去死)_
    - Open Skill of pu `[x]`
    - Cookie
    - Eat
    - NO Eat
    - EarthBoom
    - EarthBoomCheck

- **金鋼狼**  `#57` (6 triggers)  _(hero · 去死去死)_
    - Open Skill of wo `[x]`
    - Wolf EX
    - Legendary Strike `[C]`
    - WolfStrike
    - WolfStrikeEffect
    - Dontkick

- **風魔**  `#58` (8 triggers)  _(hero · 去死去死)_
    - Open Skill of Nija `[x]`
    - Visiable
    - Initiate Fan Toss
    - Fan Movement
    - Set Charges
    - Elemental Buff Attempt
    - Deal Elemental Effect
    - FlySwallow

- **宇志波佐助**  `#59` (10 triggers)  _(hero · 去死去死)_
    - Open Skill of ChoChu `[x]`
    - Row Eye Set
    - Spell Mark `[C]`
    - ThuBird
    - LightCut
    - LightCutRun
    - Kylin
    - Kylin2
    - ChoChuFireDro
    - ImbaEye

- **夜神月**  `#60` (6 triggers)  _(hero · 去死去死)_
    - Open Skill of Light `[x]`
    - DeathEye
    - DeathTrain
    - DeathHeart
    - DeathHeartBuff
    - ChangeNote

- **趙子龍**  `#61` (10 triggers)  _(hero · 去死去死)_
    - Voice
    - Open Skill of Snow `[x]`
    - KnockBack
    - KnockBack Effect
    - KniSkill
    - KniSkillEffect
    - DefStartC
    - DefEndC
    - SevenOut `[C]` `[x]`
    - SevenIn `[C]` `[x]`

- **藤井八雲**  `#62` (6 triggers)  _(hero · 去死去死)_
    - Open Skill of 3X3EYES `[x]`
    - CallPay
    - PayDie
    - EightCloud
    - Light
    - LightMove

- **劍心**  `#63` (4 triggers)  _(hero · 去死去死)_
    - Open Skill of Kenshine `[x]`
    - SkySlash
    - NineSlash
    - NineSlashEffect

- **牧太郎**  `#64` (6 triggers)  _(hero · 去死去死)_
    - Open Skill of Tai `[x]`
    - chieken
    - farmer
    - GaiaAngre
    - animal
    - goagain

- **飛影**  `#65` (9 triggers)  _(hero · 去死去死)_
    - Open Skill of Hehi
    - FireSword
    - FireSwordAdded
    - HehiSword
    - HehiSwordEffect
    - BlackDragon
    - EatDragon
    - DarkDragonEX
    - DarkDragonEXMove

- **巴恩**  `#66` (8 triggers)  _(hero · 去死去死)_
    - Open Skill of BaM `[x]`
    - EvilEye
    - CombineOne
    - HolyShit
    - DestWall
    - BlackBoom
    - 真黑核晶 `#`
    - TrueBlackBoom

- **斑剎**  `#67` (2 triggers)  _(hero · 去死去死)_
    - Open Skill of Lineage
    - AbsoluteDefence

### ----------中立隱英及尚未分類

- **令狐沖**  `#112` (6 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of LHC
    - HuashanSword
    - StarSucking
    - NineSwords
    - NineSwords LVup
    - NineSwords counter `[x]`

- **阿福**  `#68` (5 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of AFu
    - fastStep
    - fastStepGo
    - BeDragon Target
    - BeDragon

- **超爆幹帥草泥馬**  `#50` (17 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Horse
    - 憂鬱的眼神 `#`
    - UnhappyEyes `[C]`
    - 臥草泥馬 `#`
    - SecHorse `[C]`
    - 狂草泥馬 `#`
    - TrdHorse `[x]`
    - TrdHorseAtk
    - TrdHorseJugATK
    - TrdHorseDamNew
    - TrdHorseDam `[C]` `[x]`
    - NewTrdHorse
    - 固有-馬勒戈壁 `#`
    - MLGBTemp
    - MLGBTempSteal
    - MLGB `[C]` `[x]`
    - MLGBDam `[x]`

- **哆啦A夢**  `#13` (9 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Dora
    - PacketItem
    - Wohoo
    - JumpsDamage
    - CutUHead
    - CutUHead effect
    - Copy
    - TimeMachine
    - TimeMachineRev

- **林克**  `#90` (8 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Link
    - Initiate Fan Toss 2
    - Fan Movement 2
    - CircleCut
    - CircleCut Moving
    - DefStart
    - DefEnd
    - DeathSlashEX

- **異型**  `#91` (5 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Hydralisk
    - LearnReTurn
    - ReTurn
    - 撲殺爪擊 `#`
    - KillAtk

- **約翰走路**  `#92` (6 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of John
    - Whisky
    - Wine Extract Initiate
    - Wine Timer
    - Initiate Mark
    - Marking

- **飛鼠先生**  `#93` (10 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Moriya
    - Run
    - Run Effect
    - MagicUp
    - MoriyaBYEBYE
    - HeroCome
    - StupidReady
    - stupidStart
    - MoriyaShadow
    - InfniLight

- **黑人牙膏**  `#94` (3 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of BP
    - BlackTooth
    - ManyStar

- **初號機**  `#96` (5 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of First
    - EVA Complete
    - FirstDie
    - EVA ON
    - ElecPower

- **白木**  `#97` (4 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of WhiteTree
    - TreeSea
    - whiterOldTree
    - WoodStone

- **死之王**  `#98` (8 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of KOD
    - NightMaster
    - NightContract
    - MagicReturn
    - DeathMeteo
    - BadNightSoul
    - AllSinReturn
    - SAIadd

- **賽菲洛斯**  `#100` (7 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Seph
    - OneCut
    - OneCutMove
    - EndBurn
    - FinalBolide
    - Supernova
    - Hell Gate

- **貞子**  `#101` (8 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of ButtyGhost
    - ButtyAfraid
    - ButtyGhost Afraid `[C]`
    - ButtyGhost Scare
    - ButtyGhost SoulDash Level
    - ButtyGhost SoulDash Cast
    - ButtyGhost SoulDash Stop
    - DeathSpread

- **剎那**  `#103` (20 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Setsuna
    - AngleRdDam `[C]`
    - SaKu `[C]`
    - SaKuSpaNew
    - Control Light
    - LightATK `[C]`
    - Cloud ready
    - Cloud move
    - Cloud reset
    - Light Judg
    - Light Final
    - Light Final Dam
    - Light Fight
    - Flow
    - SizeChange
    - InshouATK
    - InshouJugATK
    - GLADIARIA ALAT
    - Light sword `[C]`
    - Light sword move `[C]`

- **監獄兔**  `#104` (6 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Rabbit
    - GroundAttack
    - HoLuKen
    - PowerKnockBack
    - PowerKnockBack Effect
    - TwoPowerEX

- **呂布**  `#105` (9 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of LuBu
    - FlyHeroAch
    - skill1
    - skill3
    - skill4end
    - skill4
    - skill4eff
    - RabbitYell
    - Get Rabbit EX

- **克勞薩先生**  `#106` (9 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of DMC
    - DMC Dead
    - DMC Deadagain
    - DMC Revive
    - DMC Ass
    - DMC Forst
    - DMC Pig
    - DMC Evilball
    - DMC Kill

- **小熊維尼**  `#31` (9 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Bear
    - FindyouEX
    - GiveMeHoney
    - GiveMeHoney Effect
    - GiveMeHoney KB
    - Sugoi
    - ColdJoke
    - Bowling
    - BowlingEffect

- **berserker**  `#43` (17 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of WildHqlis
    - 狂暴化 `#`
    - berserker
    - berserker 2
    - 蹂躪編年史 `#`
    - Trample Start
    - Trample Effect
    - Trample Effect2
    - 巨神一擊 `#`
    - Gigantomakhia 0
    - Gigantomakhia 1
    - Gigantomakhia 2
    - 獵殺百頭 `#`
    - Nine Lives EX
    - Nine Lives Hits
    - Nine Lives out
    - Nine Lives clear

- **熊貓**  `#49` (13 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of Panda
    - ----------Panda `#`
    - PandaParty
    - Saber_in_panda
    - Saber_in_pandaClose
    - Saber_in_panda Copy
    - Saber_in_pandaLVUp
    - Saber_in_pandaDie
    - Saber_in_pandaChrysanthemum
    - Saber_in_pandaJizz
    - Saber_in_pandaDecrease
    - Saber_in_pandaEX
    - Saber_in_pandaTree

- **DarkKnight**  `#25` (16 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of DarkKnight
    - 墮落十字軍符文 `#`
    - CrusadeRune
    - CrusadeRune close
    - 死亡之握 `#`
    - DeathGrip
    - DeathGrip effect
    - 疫病 `#`
    - PlagueLV
    - PlagueStrike
    - IcyTouch
    - DeathStrike
    - 碎心打擊 `#`
    - HeartStrike
    - 亡靈大軍 `#`
    - ArmyOfTheDead

- **叫獸**  `#51` (12 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of professor
    - 小考 `#`
    - quiz
    - 隨機抽點 `#`
    - attendance
    - attendance effect
    - 這次考試很簡單 `#`
    - TestsoEasy
    - TestsoEasyEff
    - 二ㄧ `#`
    - flunkOut
    - flunkOutEff

- **金居福**  `#108` (15 triggers)  _(hero · 中立隱英及尚未分類)_
    - Open Skill of NightMarket
    - 恰恰 `#`
    - chacha
    - 北斗爆橘拳 `#`
    - Oran
    - 橘山斬空破 `#`
    - OranMon
    - 珍奶顏射 `#`
    - MilkTea
    - 賣扣 `#`
    - Mic
    - MicEff
    - MicTimer
    - 歹戲拖棚 `#`
    - TooLong

### ---------未開放英雄

- **騜**  `#35` (15 triggers)  _(hero · 未開放英雄)_
    - Open Skill of HE
    - 紅色龍氣 `#`
    - RedDragon
    - 謝謝指教 `#`
    - Thankyou
    - Thankyou Effect
    - 五十重天 `#`
    - Fifty Sky
    - Fifty Sky Effect
    - 一百重天 `#`
    - Hundred Sky
    - 和諧世界 `#`
    - FriendComeBack
    - Crab World `[x]`
    - Crab World Effect

- **志志雄真實**  `#123` (0 triggers)  _(hero · 未開放英雄)_

- **火拳愛斯**  `#122` (0 triggers)  _(hero · 未開放英雄)_

- **初音未來**  `#116` (9 triggers)  _(hero · 未開放英雄)_
    - Open Skill of Miku
    - 初音未來的消失 `#`
    - MikuDisappear
    - MikuDisappearEffect
    - 世界第一的公主殿下 `#`
    - MikuNo1
    - MikuNo1Effect
    - 把你給MikuMiku掉 `#`
    - MikuEX

- **林默娘**  `#117` (0 triggers)  _(hero · 未開放英雄)_

- **十六夜**  `#95` (4 triggers)  _(hero · 未開放英雄)_
    - Open Skill of Sakuya `[x]`
    - Sakuya SpaceMagic `[C]` `[x]`
    - Sakuya StopKnife `[C]` `[x]`
    - Untitled Trigger 003 `[x]`

- **彗星小雞**  `#99` (9 triggers)  _(hero · 未開放英雄)_
    - Open Skill of Chicken `[x]`
    - Chicken Grow Int `[x]`
    - Chicken Attack SW `[x]`
    - Chicken Attack Action `[C]` `[x]`
    - Chicken Attack Damage `[x]`
    - Chicken Attack Grow `[x]`
    - Chicken LaLaShell `[x]`
    - Chicken LaLaShell Damage `[x]`
    - Chicken Insnare `[x]`

- **木偶人**  `#111` (0 triggers)  _(hero · 未開放英雄)_

- **三本柱**  `#113` (0 triggers)  _(hero · 未開放英雄)_

- **愛德華**  `#114` (0 triggers)  _(hero · 未開放英雄)_

- **學姊**  `#115` (12 triggers)  _(hero · 未開放英雄)_
    - Open Skill of Mentor
    - 正妹優勢 `#`
    - Advantage `[C]`
    - 理財 `#`
    - GoldWood
    - 平易近人的笑容 `#`
    - Smile
    - 分身 `#`
    - FlyAway `[C]`
    - 夢想前程的彼方 `#`
    - FutureDream
    - BeginFutureDream

- **賣火柴小女孩**  `#118` (0 triggers)  _(hero · 未開放英雄)_

- **基紐**  `#88` (4 triggers)  _(hero · 未開放英雄)_
    - ChangeBody `[x]`
    - cleanunit `[x]`
    - PoisWalkPre `[x]`
    - PoisWalkEffect `[x]`

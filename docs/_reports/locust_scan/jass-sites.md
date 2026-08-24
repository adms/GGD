# JASS × dummy 交叉表（任務③ locust scan）
> ⚠️ **一次性偵察紀錄（保留，⛔ 不刪）** —— 正式版是產生的：`docs/蝗蟲群對應表.md`＋`tools/locust-census/census.json`（`pnpm locust:build` / `pnpm locust:check`）。

- 來源: `/Users/Takuro/GGD/tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j`（56,765 行）
- 掃描呼叫: `CreateUnit` / `CreateNUnitsAtLoc` / `CreateNUnitsAtLocFacingLocBJ`
- 生成點總數: **644**（Trig_ 函式內 = 技能歸屬 **411**（含 5 個動態 id）；地圖擺放/初始化等非 Trig_ 函式 233）
- 不同 rawcode: **263**（另有 6 個動態 id 生成點：選英雄/寵物/creep 重生，非 dummy）
- 演出時序欄位以「生成行 → 同函式下一個生成行」為歸屬視窗；sleep/timedLife 超出視窗的歸最後一個生成點。

## Phase 6 排序：每個 rawcode 擋住幾支技能（只算 Trig_ 函式，按不同函式數）

| rawcode | 生成點 | 不同 Trig_ 函式 | sleep | timedLife | moves | scale | vertexColor | anim | timeScale | 觸發器 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| hfoo | 61 | 49 | 20 | 36 | 4 | 0 | 1 | 2 | 2 | Advantage, ArmyOfTheDead, ChoChuFireDro, DMC Forst, DMC Pig, DeathMeteo … |
| ogru | 12 | 12 | 6 | 11 | 1 | 1 | 0 | 0 | 0 | ButtyGhost Scare, EvilEye, Gas to Stop Tower, GhostDaEX, GodTakeMd, InfniLight … |
| o00E | 10 | 9 | 4 | 4 | 2 | 2 | 0 | 0 | 0 | ChangeDNA, Fifty Sky Effect, KniSkillEffect, LightAttack, LightningSpread, Open Skill of Pikachu … |
| oshm | 5 | 5 | 1 | 5 | 0 | 0 | 1 | 0 | 0 | KillPower, KillPowerEX, Saber_in_pandaDie, Saber_in_pandaJizz, TwoPowerEX |
| hkni | 9 | 4 | 2 | 6 | 0 | 0 | 0 | 0 | 0 | Light, NightMaster, SkySlash, init Die |
| o00G | 4 | 4 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | Open Skill of Saber, avalonStart, saber, stupidStart |
| u018 | 4 | 4 | 1 | 1 | 1 | 0 | 1 | 2 | 1 | AzumiShadow, Empty, ExcaliburMAX, HundredKillEffect |
| o011 | 5 | 3 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | GaiaAngre, GroundAttack, fastStepGo |
| h007 | 3 | 3 | 1 | 0 | 0 | 3 | 0 | 0 | 0 | Allbullet, SunFire, Turtle Power |
| h008 | 3 | 3 | 2 | 0 | 0 | 3 | 0 | 0 | 3 | Excalibur, ExcaliburMAX, Turtle Power |
| h00S | 3 | 3 | 0 | 1 | 0 | 2 | 0 | 0 | 0 | Excalibur, ExcaliburMAX, Open Skill of Saber |
| o002 | 3 | 3 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | DeathHeart, DeathTrain |
| o00A | 3 | 3 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | EvilFox, SuperOldTree, plant |
| o00Z | 3 | 3 | 3 | 2 | 0 | 0 | 0 | 0 | 0 | DarkDragonEX, EatDragon, Open Skill of Hehi |
| o01N | 3 | 3 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | AKT 3, GravityBall, newlzfsmove |
| o01P | 3 | 3 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | HoLuKen, SkySlash, init Die |
| o01T | 3 | 3 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | Hell Rock Move, Hell Timer2, Hell Timer4 |
| u005 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | GoDie Center SpawnF, GoDie North SpawnF, GoDie South SpawnF |
| u006 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Love Center SpawnF, Love North SpawnF, Love South SpawnF |
| u007 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | GoDie Center SpawnM, GoDie North SpawnM, GoDie South SpawnM |
| u008 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Love Center SpawnM, Love North SpawnM, Love South SpawnM |
| u01H | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Love Center SpawnF, Love North SpawnF, Love South SpawnF |
| u01I | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | GoDie Center SpawnF, GoDie North SpawnF, GoDie South SpawnF |
| u01J | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Love Center SpawnM, Love North SpawnM, Love South SpawnM |
| u01K | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | GoDie Center SpawnM, GoDie North SpawnM, GoDie South SpawnM |
| h01K | 6 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | GoldDragonEat, GoldDrgan Effect |
| h02E | 6 | 2 | 1 | 0 | 5 | 0 | 0 | 0 | 0 | DarkDragonEXMove, newlzfs |
| h00A | 4 | 2 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | Deal Elemental Effect |
| Ogld | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | d8246505 7, testMoriya |
| e00F | 3 | 2 | 1 | 3 | 0 | 0 | 1 | 0 | 0 | OldLa, Saber_in_pandaChrysanthemum |
| o02I | 3 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | LightFire, fist |
| e000 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | AICallHelp, Love CenterAch |
| e003 | 2 | 2 | 2 | 1 | 1 | 0 | 0 | 0 | 0 | ABanX, DraBom |
| h006 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | Allbullet, Turtle Power |
| h00J | 2 | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | GDD, Soul Shock |
| h00K | 2 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | GDD, Soul Shock |
| h00X | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | Excalibur, Open Skill of DarkSaber |
| h01Y | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | DivineBusterEx, StarlightBreakerPlus |
| h01Z | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | DivineBusterEx, StarlightBreakerPlus |
| h025 | 2 | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | RidermovelineDam, Riderspell |
| h032 | 2 | 2 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | FinalShotting, HudGhosts |
| n00A | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Command All Pick auto |
| n00K | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | AICallHelp, GoDie CenterAch |
| n00N | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | BlueDragonWave, LightCut |
| o001 | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 2 | 0 | Oran, YouDie |
| o006 | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | HolySword, LightCutRun |
| o009 | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | Hell, KingColor |
| o00Q | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | MagicUp, NewTrdHorse |
| o015 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | AKT 1, CloseDest |
| o01D | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | Flow, SaKuSpaNew |
| o01E | 2 | 2 | 2 | 0 | 1 | 1 | 1 | 0 | 0 | Light Fight, Light sword move |
| o01M | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | AKT 2, BR Law |
| o01V | 2 | 2 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | EatDragon, Open Skill of Hehi |
| u002 | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | AICallHelp, GoDie CenterFi |
| u003 | 2 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | AICallHelp, Love CenterFi |
| u00U | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | Bleach Moon Effect, Crazy Movement |
| u013 | 2 | 2 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | The End ofWorldCasting, The End ofWorldCasting EX |
| u00S | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | TowerSPStart |
| o018 | 6 | 1 | 1 | 0 | 0 | 0 | 6 | 6 | 0 | Roaction |
| o01A | 4 | 1 | 1 | 0 | 4 | 0 | 0 | 1 | 1 | DragonTigerReady |

（其餘 135 個 rawcode 見 jass-sites.json）

## Pilot：悟空 09-04 龜派氣功 = A03S = `Trig_Turtle_Power`（逐行）

- 確認來源: `HERO_NUMBERS.json` numbers/09 skills[3] = `{'rawcode':'A03S','name':'09-04 龜派氣功'}`；`Trig_Turtle_Power_Conditions` 檢查 `GetSpellAbilityId() == 'A03S'`。
- dummy 三件套: **h007**（內層氣功波，scale 250+15×lv%）· **h008**（外層，scale 350+15×lv%，`SetUnitTimeScalePercent 15%` + 立即 `KillUnit` = 凍結在死亡動畫）· **h006**（傷害節點 dummy，沿線 6 點 × 200 距離步長，在 loop 內生成）。
- 無 `UnitApplyTimedLife` / 無 `SetUnitPositionLoc` —— 光束不是移動的投射物，是**一次擺出整條線**；dummy 壽命靠單位資料的死亡計時（不在 JASS）。
- 終場 `TriggerSleepAction(2)` 後清相機噪動；SunFire（青蛙）同樣用 h007 且 sleep 2 秒後 `KillUnit+RemoveUnit` 收掉。

```jass
31896: function Trig_Turtle_Power_Actions takes nothing returns nothing
31897:     set udg_LocPoint1 = GetUnitLoc(GetSpellAbilityUnit())
31898:     set udg_LocPoint2 = GetSpellTargetLoc()
31899:     set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, 150.00, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
31900:     set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(512, udg_LocPoint1, Condition(function Trig_Turtle_Power_Func005002003))
31901:     call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func006A )
31902:     call DestroyGroup( udg_TempUnitGroup ) 
31903:     call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\NightElf\\NEDeathSmall\\NEDeathSmall.mdl" )
31904:     call TriggerExecute( gg_trg_Destroy_Effect )
31905:     call AddSpecialEffectLocBJ( udg_LocPoint3, "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
31906:     call TriggerExecute( gg_trg_Destroy_Effect )
31907:     call CreateNUnitsAtLoc( 1, 'h007', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
31908:     call SetUnitScalePercent( GetLastCreatedUnit(), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
31909:     call CreateNUnitsAtLoc( 1, 'h008', GetOwningPlayer(GetSpellAbilityUnit()), udg_LocPoint3, AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2) )
31910:     call SetUnitScalePercent( GetLastCreatedUnit(), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ), ( 350.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 15 )) ) )
31911:     call SetUnitTimeScalePercent( GetLastCreatedUnit(), 15.00 )
31912:     call KillUnit( GetLastCreatedUnit() )
31913:     call RemoveLocation( udg_LocPoint3 ) 
31914:     if ( Trig_Turtle_Power_Func019C() ) then
31915:         if ( Trig_Turtle_Power_Func019Func001C() ) then
31916:             set udg_LocReal = ( ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 5.00 ) ) + 150.00 )
31917:         else
31918:             set udg_LocReal = ( ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 10.00 ) ) + 150.00 )
31919:         endif
31920:     else
31921:         set udg_LocReal = ( ( ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 2.00 ) ) + 150.00 )
31922:     endif
31923:     set udg_TurtlePowerCounter = 1
31924:     loop
31925:         exitwhen udg_TurtlePowerCounter > 6
31926:         set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_TurtlePowerCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
31927:         call CreateNUnitsAtLoc( 1, 'h006', GetOwningPlayer(GetTriggerUnit()), udg_LocPoint3, bj_UNIT_FACING )
31928:         set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Turtle_Power_Func020Func003002003))
31929:         call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func020Func004A )
31930:         call DestroyGroup( udg_TempUnitGroup ) 
31931:         call EnumDestructablesInCircleBJ( 400.00, udg_LocPoint3, function Trig_Turtle_Power_Func020Func006A )
31932:         call RemoveLocation( udg_LocPoint3 ) 
31933:         set udg_TurtlePowerCounter = udg_TurtlePowerCounter + 1
31934:     endloop
31935:     set udg_TurtlePowerCounter = 1
31936:     loop
31937:         exitwhen udg_TurtlePowerCounter > 6
31938:         set udg_LocPoint3 = PolarProjectionBJ(udg_LocPoint1, ( I2R(udg_TurtlePowerCounter) * 200.00 ), AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2))
31939:         set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(400.00, udg_LocPoint3, Condition(function Trig_Turtle_Power_Func021Func002002003))
31940:         call ForGroupBJ( udg_TempUnitGroup, function Trig_Turtle_Power_Func021Func003A )
31941:         call DestroyGroup( udg_TempUnitGroup ) 
31942:         call RemoveLocation( udg_LocPoint3 ) 
31943:         set udg_TurtlePowerCounter = udg_TurtlePowerCounter + 1
31944:     endloop
31945:     call RemoveLocation( udg_LocPoint1 ) 
31946:     call RemoveLocation( udg_LocPoint2 ) 
31947:     call RemoveLocation( udg_LocPoint3 ) 
31948:     call TriggerSleepAction( 2 )
31949:     call ForForce( GetPlayersAll(), function Trig_Turtle_Power_Func026A )
31950: endfunction
```

### h007 出現的全部 3 個生成點

| 行 | 函式 | 位置 | facing | scale | sleep |
|--:|---|---|---|---|---|
| 26790 | `Trig_SunFire_Actions` | `udg_LocPoint3` | `AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2)` | 200.00/200.00/400.00 | 2 |
| 31907 | `Trig_Turtle_Power_Actions` | `udg_LocPoint3` | `AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2)` | ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityI | - |
| 32916 | `Trig_Allbullet_Actions` | `udg_LocPoint3` | `AngleBetweenPoints(udg_LocPoint1, udg_LocPoint2)` | ( 250.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityI | - |

## 讀法備註
- `SetUnitVertexColorBJ(u, R, G, B, transparencyPct)` —— 第 5 參數是**透明度%**（100=全隱形），不是 alpha；JSON 內 `vertexColorCalls` 依 [R,G,B,transparency%] 排列。
- `inLoop=true` 的生成點代表同一次施放會沿線/沿圈生成 N 個（步長看 `pos` 內的 PolarProjectionBJ 距離表達式）。
- 地圖初始化擺放（`CreateUnitsForPlayer0`/`CreateNeutral*` 等非 Trig_ 函式）已從排序表排除，但完整保留在 JSON。

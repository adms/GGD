// rawcode: A06P
// nameZh: 11-03 鬼氣九刀流-阿修羅壹霧銀
// w3a base: AHtb  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 100, "2": 130, "3": 160, "4": 190}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Roaction

// === family Roaction (passive) events=none ===

// --- Trig_Roaction_Func004C (family, line 28976) ---
function Trig_Roaction_Func004C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_RoMaster, 'B02Y') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Roaction_Func005C (family, line 28983) ---
function Trig_Roaction_Func005C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_RoMaster) == 'U01U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Roaction_Actions (family, line 28990) ---
function Trig_Roaction_Actions takes nothing returns nothing
    set udg_RoCaster = GetTriggerUnit()
    set udg_RoMaster = GetEventDamageSource()
    set udg_RoAngle = AngleBetweenPoints(GetUnitLoc(udg_RoMaster), GetUnitLoc(udg_RoCaster))
    if ( Trig_Roaction_Func004C() ) then
        set udg_RoDamage = I2R(( ( ( ( GetUnitAbilityLevelSwapped('A06P', udg_RoMaster) * 150 ) + ( GetHeroStatBJ(bj_HEROSTAT_STR, udg_RoMaster, true) * 2 ) ) + 150 ) * 1 ))
    else
        set udg_RoDamage = I2R(( ( ( ( GetUnitAbilityLevelSwapped('A06P', udg_RoMaster) * 150 ) + 0 ) + 150 ) * 1 ))
    endif
    if ( Trig_Roaction_Func005C() ) then
        set udg_RoDamage = ( udg_RoDamage + I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, udg_RoMaster, true) * 3 )) )
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_RoMaster), "Doodads\\Terrain\\RockChunks\\RockChunks3.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
    set udg_DistanCount = 0
    set udg_ActivePoint = GetUnitLoc(udg_RoCaster)
    call PauseUnitBJ( true, udg_RoCaster )
    call PauseUnitBJ( true, udg_RoMaster )
    call SetUnitAnimation( udg_RoMaster, "spell slam" )
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -100.00, udg_RoAngle), bj_UNIT_FACING )
    set udg_RoCreateUnit[1] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[1], 100, 0.00, 0.00, 50.00 )
    call SetUnitAnimation( udg_RoCreateUnit[1], "attack walk stand spin" )
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -100.00, ( udg_RoAngle - 120.00 )), bj_UNIT_FACING )
    set udg_RoCreateUnit[2] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[2], 100, 0.00, 0.00, 50.00 )
    call SetUnitAnimation( udg_RoCreateUnit[2], "attack walk stand spin" )
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -100.00, ( udg_RoAngle + 120.00 )), bj_UNIT_FACING )
    set udg_RoCreateUnit[3] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[3], 100, 0.00, 0.00, 50.00 )
    call SetUnitAnimation( udg_RoCreateUnit[3], "attack walk stand spin" )
    // 旋轉分身分界
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -200.00, udg_RoAngle), udg_RoAngle )
    call SetUnitAnimation( GetLastCreatedUnit(), "stand ready" )
    call SetUnitVertexColorBJ( udg_RoCreateUnit[4], 100, 0.00, 0.00, 50.00 )
    set udg_RoCreateUnit[4] = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -200.00, ( udg_RoAngle - 120.00 )), ( udg_RoAngle - 120.00 ) )
    call SetUnitAnimation( GetLastCreatedUnit(), "stand ready" )
    set udg_RoCreateUnit[5] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[5], 100, 0.00, 0.00, 50.00 )
    call CreateNUnitsAtLoc( 1, 'o018', GetOwningPlayer(udg_RoMaster), PolarProjectionBJ(udg_ActivePoint, -200.00, ( udg_RoAngle + 120.00 )), ( udg_RoAngle + 120.00 ) )
    call SetUnitAnimation( GetLastCreatedUnit(), "stand ready" )
    set udg_RoCreateUnit[6] = GetLastCreatedUnit()
    call SetUnitVertexColorBJ( udg_RoCreateUnit[6], 100, 0.00, 0.00, 50.00 )
    call UnitAddAbilityBJ( 'A0J6', udg_RoMaster )
    call UnitAddAbilityBJ( 'A0J7', udg_RoMaster )
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(udg_RoMaster), 25.00 )
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(udg_RoCaster), 25.00 )
    call EnableTrigger( gg_trg_Romove )
    call TriggerSleepAction( 0.30 )
    call CameraClearNoiseForPlayer( GetOwningPlayer(udg_RoCaster) )
    call CameraClearNoiseForPlayer( GetOwningPlayer(udg_RoMaster) )
    call SetUnitAnimation( udg_RoCaster, "death" )
    set udg_drop_bloods = 1
    loop
        exitwhen udg_drop_bloods > 10
        call AddSpecialEffectTargetUnitBJ( "weapon", udg_RoCaster, "Objects\\Spawnmodels\\Human\\HumanBlood\\HumanBloodPriest.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.01 )
        set udg_drop_bloods = udg_drop_bloods + 1
    endloop
    call TriggerSleepAction( 0.50 )
    call UnitRemoveAbilityBJ( 'A0J6', udg_RoMaster )
    call UnitRemoveAbilityBJ( 'A0J7', udg_RoMaster )
endfunction

// --- InitTrig_Roaction (family, line 29058) ---
function InitTrig_Roaction takes nothing returns nothing
    set gg_trg_Roaction = CreateTrigger(  )
    call DisableTrigger( gg_trg_Roaction )
    call TriggerAddAction( gg_trg_Roaction, function Trig_Roaction_Actions )
endfunction

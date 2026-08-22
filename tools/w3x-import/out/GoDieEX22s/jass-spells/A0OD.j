// rawcode: A0OD
// nameZh: 23-04 雷焰聖劍
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 160, "2": 290, "3": 420}
// range: {"1": 500.0, "2": 500.0, "3": 500.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HolySword

// === family HolySword (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HolySword_Conditions (family, line 31173) ---
function Trig_HolySword_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OD' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HolySword_Func010Func012C (family, line 31180) ---
function Trig_HolySword_Func010Func012C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_FateUnit))] == true ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(GetSpellTargetUnit(), 'Bprg') == true ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(udg_FateUnit, 'B00K') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HolySword_Func010C (family, line 31193) ---
function Trig_HolySword_Func010C takes nothing returns boolean
    if ( not Trig_HolySword_Func010Func012C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_HolySword_Func012A (family, line 31200) ---
function Trig_HolySword_Func012A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 25.00 )
endfunction

// --- Trig_HolySword_Func018A (family, line 31204) ---
function Trig_HolySword_Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HolySword_Func019A (family, line 31209) ---
function Trig_HolySword_Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HolySword_Func020A (family, line 31214) ---
function Trig_HolySword_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HolySword_Func021A (family, line 31219) ---
function Trig_HolySword_Func021A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HolySword_Actions (family, line 31224) ---
function Trig_HolySword_Actions takes nothing returns nothing
    set udg_HolySwordPoint = GetUnitLoc(GetTriggerUnit())
    set udg_FateUnit = GetTriggerUnit()
    call UnitAddAbilityBJ( 'A0RE', udg_FateUnit )
    call AddSpecialEffectLocBJ( udg_HolySwordPoint, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( udg_HolySwordPoint, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'o027', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), ( 90.00 + GetUnitFacing(GetTriggerUnit()) ) )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    if ( Trig_HolySword_Func010C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), 2300.00, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "righthand", GetTriggerUnit(), "HeroFateZemberFormBig.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "hand,right", GetTriggerUnit(), "HeroFateZemberFormBig.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "weapon", GetTriggerUnit(), "Objects\\Spawnmodels\\Naga\\NagaDeath\\NagaDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TerrainDeformationRippleBJ( 2.00, true, GetUnitLoc(GetSpellTargetUnit()), 600.00, 600.00, 128.00, 1.00, 300.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
        call CreateNUnitsAtLoc( 1, 'o006', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_CAMERA_DEFAULT_ROTATION )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    else
    endif
    call TriggerSleepAction( 0.50 )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_HolySwordPoint, 1600.00, 1600.00)), function Trig_HolySword_Func012A )
    call AddSpecialEffectLocBJ( udg_HolySwordPoint, "Objects\\Spawnmodels\\Undead\\UCancelDeath\\UCancelDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( ( I2R(GetUnitAbilityLevelSwapped('A0OD', udg_FateUnit)) * 4.00 ) )
    call UnitRemoveAbilityBJ( 'A0RE', udg_FateUnit )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FateUnit), 'o006'), function Trig_HolySword_Func018A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FateUnit), 'o027'), function Trig_HolySword_Func019A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FateUnit), 'o026'), function Trig_HolySword_Func020A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FateUnit), 'e00F'), function Trig_HolySword_Func021A )
endfunction

// --- InitTrig_HolySword (family, line 31268) ---
function InitTrig_HolySword takes nothing returns nothing
    set gg_trg_HolySword = CreateTrigger(  )
    call DisableTrigger( gg_trg_HolySword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HolySword, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HolySword, Condition( function Trig_HolySword_Conditions ) )
    call TriggerAddAction( gg_trg_HolySword, function Trig_HolySword_Actions )
endfunction

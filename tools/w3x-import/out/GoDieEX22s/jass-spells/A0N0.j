// rawcode: A0N0
// nameZh: 80-03 鬼神烈戟
// w3a base: Aroa  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 250, "2": 350, "3": 450, "4": 550}
// area: {"2": 500.0, "3": 500.0, "4": 500.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: skill3

// === family skill3 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_skill3_Conditions (family, line 50390) ---
function Trig_skill3_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0N0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill3_Func006Func001C (family, line 50397) ---
function Trig_skill3_Func006Func001C takes nothing returns boolean
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill3_Func006A (family, line 50404) ---
function Trig_skill3_Func006A takes nothing returns nothing
    if ( Trig_skill3_Func006Func001C() ) then
        call UnitDamageTargetBJ( udg_LuBuMaster, GetEnumUnit(), ( ( 150.00 + ( 200.00 * I2R(GetUnitAbilityLevelSwapped('A0N0', udg_LuBuMaster)) ) ) + ( 3.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_LuBuMaster, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "origin", GetEnumUnit(), "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_skill3_Actions (family, line 50413) ---
function Trig_skill3_Actions takes nothing returns nothing
    set udg_LuBuMaster = GetTriggerUnit()
    set udg_LuBuP1[4] = GetUnitLoc(GetTriggerUnit())
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 3
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call CreateNUnitsAtLoc( 1, 'o01X', GetOwningPlayer(GetTriggerUnit()), udg_LuBuP1[4], bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0N2', GetLastCreatedUnit() )
        set udg_LuBuP1[5] = PolarProjectionBJ(udg_LuBuP1[4], 256, GetRandomDirectionDeg())
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "stampede", udg_LuBuP1[5] )
        call RemoveLocation( udg_LuBuP1[5])
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call CreateNUnitsAtLoc( 1, 'o01X', GetOwningPlayer(GetTriggerUnit()), udg_LuBuP1[4], bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(530.00, udg_LuBuP1[4]), function Trig_skill3_Func006A )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    call RemoveLocation( udg_LuBuP1[4])
endfunction

// --- InitTrig_skill3 (family, line 50437) ---
function InitTrig_skill3 takes nothing returns nothing
    set gg_trg_skill3 = CreateTrigger(  )
    call DisableTrigger( gg_trg_skill3 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_skill3, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_skill3, Condition( function Trig_skill3_Conditions ) )
    call TriggerAddAction( gg_trg_skill3, function Trig_skill3_Actions )
endfunction

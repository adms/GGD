// rawcode: A06M
// nameZh: 16-002 布都御魂
// w3a base: ANbr  levels: 1
// cooldown: {"1": 45.0}
// mana: {"1": 210}
// area: {"1": 0.5}
// duration: {"1": 15.0}
// hero_duration: {"1": 15.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ComOne

// === family ComOne (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ComOne_Conditions (family, line 31584) ---
function Trig_ComOne_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A06M' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ComOne_Func003Func001Func002C (family, line 31591) ---
function Trig_ComOne_Func003Func001Func002C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetEnumUnit()) == 'h005' ) ) then
        return true
    endif
    if ( ( udg_GosofKing_MUTemp != null ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_ComOne_Func003Func001Func007Func001C (family, line 31601) ---
function Trig_ComOne_Func003Func001Func007Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ComOne_Func003Func001Func007A (family, line 31614) ---
function Trig_ComOne_Func003Func001Func007A takes nothing returns nothing
    if ( Trig_ComOne_Func003Func001Func007Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 8.00 ) + 750.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\Bolt\\BoltImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_ComOne_Func003Func001C (family, line 31624) ---
function Trig_ComOne_Func003Func001C takes nothing returns boolean
    if ( not Trig_ComOne_Func003Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ComOne_Func003A (family, line 31631) ---
function Trig_ComOne_Func003A takes nothing returns nothing
    if ( Trig_ComOne_Func003Func001C() ) then
        set udg_GosofKing_MUTemp = null
        call CreateNUnitsAtLoc( 1, 'u00T', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), GetUnitFacing(GetTriggerUnit()) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "move", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 750.00, GetUnitFacing(GetTriggerUnit())) )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 450.00, GetUnitFacing(GetTriggerUnit()))), function Trig_ComOne_Func003Func001Func007A )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_ComOne_Func005A (family, line 31642) ---
function Trig_ComOne_Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ComOne_Actions (family, line 31647) ---
function Trig_ComOne_Actions takes nothing returns nothing
    set udg_GosoKingUnit = GetTriggerUnit()
    set udg_GosofKing_MUTemp = udg_GosofKingMU
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(GetTriggerUnit()), 450.00, 450.00)), function Trig_ComOne_Func003A )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_GosoKingUnit), 'u00T'), function Trig_ComOne_Func005A )
endfunction

// --- InitTrig_ComOne (family, line 31656) ---
function InitTrig_ComOne takes nothing returns nothing
    set gg_trg_ComOne = CreateTrigger(  )
    call DisableTrigger( gg_trg_ComOne )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ComOne, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ComOne, Condition( function Trig_ComOne_Conditions ) )
    call TriggerAddAction( gg_trg_ComOne, function Trig_ComOne_Actions )
endfunction

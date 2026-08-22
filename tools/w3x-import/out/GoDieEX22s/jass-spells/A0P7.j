// rawcode: A0P7
// nameZh: 18-04 億年樹
// w3a base: AUin  levels: 3
// cooldown: {"1": 75.0, "2": 75.0, "3": 75.0}
// mana: {"1": 200, "2": 375, "3": 550}
// range: {"1": 350.0, "2": 350.0, "3": 350.0}
// area: {"1": 450.0, "2": 450.0, "3": 450.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: EvilFox, OldTree

// === family EvilFox (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_EvilFox_Func001Func001C (family, line 27980) ---
function Trig_EvilFox_Func001Func001C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetAttackedUnitBJ()) == 'Nsjs' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetAttackedUnitBJ()) == 'N00P' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_EvilFox_Func001Func003C (family, line 27990) ---
function Trig_EvilFox_Func001Func003C takes nothing returns boolean
    if ( ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_Fox_Unit))] == true ) ) then
        return true
    endif
    if ( ( GetRandomInt(1, 10) <= GetUnitAbilityLevelSwapped('A0P7', udg_Fox_Unit) ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_EvilFox_Func001C (family, line 28000) ---
function Trig_EvilFox_Func001C takes nothing returns boolean
    if ( not Trig_EvilFox_Func001Func001C() ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(GetAttackedUnitBJ(), 'B036') == true ) ) then
        return false
    endif
    if ( not Trig_EvilFox_Func001Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_EvilFox_Conditions (family, line 28013) ---
function Trig_EvilFox_Conditions takes nothing returns boolean
    if ( not Trig_EvilFox_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_EvilFox_Actions (family, line 28020) ---
function Trig_EvilFox_Actions takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'o00A', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetAttacker()), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0PA', GetLastCreatedUnit() )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetAttacker(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "entanglingroots", GetAttacker() )
endfunction

// --- InitTrig_EvilFox (family, line 28029) ---
function InitTrig_EvilFox takes nothing returns nothing
    set gg_trg_EvilFox = CreateTrigger(  )
    call DisableTrigger( gg_trg_EvilFox )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EvilFox, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_EvilFox, Condition( function Trig_EvilFox_Conditions ) )
    call TriggerAddAction( gg_trg_EvilFox, function Trig_EvilFox_Actions )
endfunction

// === family OldTree (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_OldTree_Conditions (family, line 28040) ---
function Trig_OldTree_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0P7' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OldTree_Func003A (family, line 28047) ---
function Trig_OldTree_Func003A takes nothing returns nothing
    set udg_OldTreeUnit = GetEnumUnit()
endfunction

// --- Trig_OldTree_Func005A (family, line 28051) ---
function Trig_OldTree_Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_OldTree_Func006A (family, line 28056) ---
function Trig_OldTree_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_OldTree_Actions (family, line 28061) ---
function Trig_OldTree_Actions takes nothing returns nothing
    set udg_Fox_Unit = GetTriggerUnit()
    call TriggerSleepAction( 1.50 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Fox_Unit), 'n010'), function Trig_OldTree_Func003A )
    call TriggerSleepAction( I2R(( GetUnitAbilityLevelSwapped('A0P7', udg_Fox_Unit) * 9 )) )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Fox_Unit), 'o00A'), function Trig_OldTree_Func005A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Fox_Unit), 'n010'), function Trig_OldTree_Func006A )
endfunction

// --- InitTrig_OldTree (family, line 28071) ---
function InitTrig_OldTree takes nothing returns nothing
    set gg_trg_OldTree = CreateTrigger(  )
    call DisableTrigger( gg_trg_OldTree )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_OldTree, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_OldTree, Condition( function Trig_OldTree_Conditions ) )
    call TriggerAddAction( gg_trg_OldTree, function Trig_OldTree_Actions )
endfunction

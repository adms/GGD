// rawcode: A043
// nameZh: 16-04 劍之精靈
// w3a base: Arsg  levels: 3
// cooldown: {"1": 65.0, "2": 65.0, "3": 65.0, "4": 120.0}
// mana: {"1": 100, "2": 200, "3": 300, "4": 350}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GosIn, MU

// === family GosIn (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GosIn_Conditions (family, line 31406) ---
function Trig_GosIn_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0WS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GosIn_Actions (family, line 31413) ---
function Trig_GosIn_Actions takes nothing returns nothing
    set udg_GosofKingP = GetUnitLoc(udg_GosofKing)
    set udg_GosofKingMU = GetTriggerUnit()
    call PauseUnitBJ( true, udg_GosofKingMU )
    call ShowUnitHide( udg_GosofKingMU )
    call UnitAddAbilityBJ( 'A0WR', udg_GosofKing )
    call AddSpecialEffectLocBJ( udg_GosofKingP, "AquaSpikeVersion2.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call RemoveLocation(udg_GosofKingP)
    call SetUnitAbilityLevelSwapped( 'A0WQ', udg_GosofKing, ( 1 + GetUnitAbilityLevelSwapped('A043', udg_GosofKing) ) )
    call EnableTrigger( gg_trg_Empty )
    call EnableTrigger( gg_trg_GDD )
    call TriggerSleepAction( 15.00 )
    call DisableTrigger( gg_trg_Empty )
    call DisableTrigger( gg_trg_GDD )
    call PauseUnitBJ( false, udg_GosofKingMU )
    call ShowUnitShow( udg_GosofKingMU )
    set udg_GosofKingP = GetUnitLoc(udg_GosofKing)
    call SetUnitPositionLoc( udg_GosofKingMU, udg_GosofKingP )
    set udg_GosofKingMU = null
    call RemoveLocation(udg_GosofKingP)
    call SetUnitAbilityLevelSwapped( 'A0WQ', udg_GosofKing, 1 )
    call UnitRemoveAbilityBJ( 'A0WR', udg_GosofKing )
endfunction

// --- InitTrig_GosIn (family, line 31439) ---
function InitTrig_GosIn takes nothing returns nothing
    set gg_trg_GosIn = CreateTrigger(  )
    call DisableTrigger( gg_trg_GosIn )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GosIn, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GosIn, Condition( function Trig_GosIn_Conditions ) )
    call TriggerAddAction( gg_trg_GosIn, function Trig_GosIn_Actions )
endfunction

// === family MU (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MU_Conditions (family, line 31561) ---
function Trig_MU_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A043' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MU_Actions (family, line 31568) ---
function Trig_MU_Actions takes nothing returns nothing
    set udg_GosofKingMU = null
endfunction

// --- InitTrig_MU (family, line 31573) ---
function InitTrig_MU takes nothing returns nothing
    set gg_trg_MU = CreateTrigger(  )
    call DisableTrigger( gg_trg_MU )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MU, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MU, Condition( function Trig_MU_Conditions ) )
    call TriggerAddAction( gg_trg_MU, function Trig_MU_Actions )
endfunction

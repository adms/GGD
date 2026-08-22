// rawcode: A0WS
// nameZh: 16-04-01 附身合體
// w3a base: ANcl  levels: 1
// cooldown: {"1": 60.0, "2": 55.0, "3": 55.0, "4": 55.0}
// mana: {"1": 300, "2": 200, "3": 250, "4": 300}
// range: {"1": 100.0, "2": 600.0, "3": 600.0, "4": 600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GosIn

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

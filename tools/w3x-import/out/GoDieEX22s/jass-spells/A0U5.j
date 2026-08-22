// rawcode: A0U5
// nameZh: 52-002 射殺百頭
// w3a base: AHtb  levels: 1
// cooldown: {"1": 60.0}
// mana: {"1": 400}
// range: {"1": 450.0}
// duration: {"1": 1.0}
// hero_duration: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Nine_Lives_EX

// === family Nine_Lives_EX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Nine_Lives_EX_Conditions (family, line 52050) ---
function Trig_Nine_Lives_EX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0U5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Nine_Lives_EX_Actions (family, line 52057) ---
function Trig_Nine_Lives_EX_Actions takes nothing returns nothing
    set udg_Buncle_Nine_Caster = GetTriggerUnit()
    set udg_Buncle_Nine_Target = GetSpellTargetUnit()
    set udg_Buncle_Nine_CD = 1.00
    set udg_Buncle_Nine_CD2 = 1.00
    set udg_Buncle_Nine_Count = 0
    set udg_Buncle_Nine_Index = 0
    call UnitAddAbilityBJ( 'Avul', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'Avul', udg_Buncle_Nine_Target )
    call PauseUnitBJ( true, GetTriggerUnit() )
    call PauseUnitBJ( true, udg_Buncle_Nine_Target )
    call TriggerSleepAction( 0.20 )
    set udg_Buncle_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Buncle_P2 = GetUnitLoc(udg_Buncle_Nine_Target)
    set udg_Buncle_Nine_Angle = AngleBetweenPoints(udg_Buncle_P2, udg_Buncle_P1)
    set udg_Buncle_P3 = PolarProjectionBJ(udg_Buncle_P2, 100.00, udg_Buncle_Nine_Angle)
    call AddSpecialEffectLocBJ( udg_Buncle_P1, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLocFacingLocBJ( GetTriggerUnit(), udg_Buncle_P3, udg_Buncle_P2 )
    call RemoveLocation( udg_Buncle_P1 )
    call RemoveLocation( udg_Buncle_P2 )
    call RemoveLocation( udg_Buncle_P3 )
    call StartTimerBJ( udg_Buncle_Nine_Timer2, false, 1.10 )
    call EnableTrigger( gg_trg_Nine_Lives_Hits )
    call EnableTrigger( gg_trg_Nine_Lives_out )
    call EnableTrigger( gg_trg_Nine_Lives_clear )
    call TriggerExecute( gg_trg_Nine_Lives_Hits )
endfunction

// --- InitTrig_Nine_Lives_EX (family, line 52087) ---
function InitTrig_Nine_Lives_EX takes nothing returns nothing
    set gg_trg_Nine_Lives_EX = CreateTrigger(  )
    call DisableTrigger( gg_trg_Nine_Lives_EX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Nine_Lives_EX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Nine_Lives_EX, Condition( function Trig_Nine_Lives_EX_Conditions ) )
    call TriggerAddAction( gg_trg_Nine_Lives_EX, function Trig_Nine_Lives_EX_Actions )
endfunction

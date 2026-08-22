// rawcode: A07N
// nameZh: 17-04 狂龍斬
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 150, "2": 200, "3": 250}
// range: {"1": 250.0, "2": 250.0, "3": 250.0}
// duration: {"1": 0.5, "2": 0.5, "3": 0.5}
// hero_duration: {"1": 0.5, "2": 0.5, "3": 0.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: WildCut

// === family WildCut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WildCut_Conditions (family, line 28589) ---
function Trig_WildCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07N' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WildCut_Actions (family, line 28596) ---
function Trig_WildCut_Actions takes nothing returns nothing
    set udg_KnockBack_IndexTN = 0
    set udg_KnockBack_TargetTN = GetTriggerUnit()
    set udg_KnockBack_AngleTN = GetUnitFacing(GetTriggerUnit())
    set udg_wildCutDamage = ( 100.00 + ( 0.70 * ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_KnockBack_TargetTN, true)) * I2R(GetUnitAbilityLevelSwapped('A07N', udg_KnockBack_TargetTN)) ) ) )
    call CreateTextTagUnitBJ( "TRIGSTR_4785", GetTriggerUnit(), -30.00, 24.00, 100, 0.00, 0.00, 10.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call SetUnitPathing( GetTriggerUnit(), false )
    call UnitAddAbilityBJ( 'A09O', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )
    call GroupClear( udg_WildCutGroup )
    call UnitAddAbilityBJ( 'Avul', GetTriggerUnit() )
    call EnableTrigger( gg_trg_WildCut_Effect )
endfunction

// --- InitTrig_WildCut (family, line 28615) ---
function InitTrig_WildCut takes nothing returns nothing
    set gg_trg_WildCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_WildCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WildCut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WildCut, Condition( function Trig_WildCut_Conditions ) )
    call TriggerAddAction( gg_trg_WildCut, function Trig_WildCut_Actions )
endfunction

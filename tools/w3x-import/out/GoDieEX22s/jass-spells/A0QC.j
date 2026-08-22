// rawcode: A0QC
// nameZh: 82-00-02 暫定契約
// w3a base: AHbn  levels: 1
// cooldown: {"1": 60.0}
// mana: {"1": 0}
// range: {"1": 200.0}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AgreementTarget

// === family AgreementTarget (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AgreementTarget_Conditions (family, line 34697) ---
function Trig_AgreementTarget_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0QC' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AgreementTarget_Actions (family, line 34704) ---
function Trig_AgreementTarget_Actions takes nothing returns nothing
    call UnitRemoveAbilityBJ( 'A0Q8', udg_NegiAgreeMentUnit )
    set udg_NegiAgreeMentUnit = GetSpellTargetUnit()
    call AddSpecialEffectTargetUnitBJ( "overhead", udg_NegiAgreeMentUnit, "LOVE2.MDX" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- InitTrig_AgreementTarget (family, line 34712) ---
function InitTrig_AgreementTarget takes nothing returns nothing
    set gg_trg_AgreementTarget = CreateTrigger(  )
    call DisableTrigger( gg_trg_AgreementTarget )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AgreementTarget, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_AgreementTarget, Condition( function Trig_AgreementTarget_Conditions ) )
    call TriggerAddAction( gg_trg_AgreementTarget, function Trig_AgreementTarget_Actions )
endfunction

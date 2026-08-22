// rawcode: A0OP
// nameZh: 61-01惡魔球
// w3a base: AEsh  levels: 4
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 60, "2": 70, "3": 80, "4": 90}
// range: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// duration: {"1": 1.0, "2": 1.5, "3": 2.0, "4": 2.5}
// hero_duration: {"1": 1.0, "2": 1.5, "3": 2.0, "4": 2.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DMC_Evilball

// === family DMC_Evilball (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_DMC_Evilball_Conditions (family, line 50901) ---
function Trig_DMC_Evilball_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Evilball_Actions (family, line 50908) ---
function Trig_DMC_Evilball_Actions takes nothing returns nothing
    call CreateTextTagUnitBJ( "TRIGSTR_1044", GetAttackedUnitBJ(), 50.00, 16.00, 100, 50.00, 50.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
endfunction

// --- InitTrig_DMC_Evilball (family, line 50917) ---
function InitTrig_DMC_Evilball takes nothing returns nothing
    set gg_trg_DMC_Evilball = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Evilball )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Evilball, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_DMC_Evilball, Condition( function Trig_DMC_Evilball_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Evilball, function Trig_DMC_Evilball_Actions )
endfunction

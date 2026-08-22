// rawcode: A0G0
// nameZh: 07-01 臨、兵、鬥
// w3a base: ANss  levels: 3
// cooldown: {"1": 65.0, "2": 55.0, "3": 45.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: order123

// === family order123 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_order123_Conditions (family, line 34144) ---
function Trig_order123_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0G0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_order123_Actions (family, line 34151) ---
function Trig_order123_Actions takes nothing returns nothing
    call CreateTextTagUnitBJ( "TRIGSTR_523", GetTriggerUnit(), -30.00, 16.00, 100.00, 100.00, 100.00, 10.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    set udg_MoonCombo = 1
    call TriggerSleepAction( 1.00 )
    set udg_MoonCombo = 0
endfunction

// --- InitTrig_order123 (family, line 34163) ---
function InitTrig_order123 takes nothing returns nothing
    set gg_trg_order123 = CreateTrigger(  )
    call DisableTrigger( gg_trg_order123 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_order123, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_order123, Condition( function Trig_order123_Conditions ) )
    call TriggerAddAction( gg_trg_order123, function Trig_order123_Actions )
endfunction

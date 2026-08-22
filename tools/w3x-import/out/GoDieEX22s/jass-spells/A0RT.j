// rawcode: A0RT
// nameZh: 正義之杖
// cooldown: {"1": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: JustticePunish

// === family JustticePunish (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_JustticePunish_Conditions (family, line 24881) ---
function Trig_JustticePunish_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RT' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_JustticePunish_Actions (family, line 24888) ---
function Trig_JustticePunish_Actions takes nothing returns nothing
    call CreateTextTagUnitBJ( "TRIGSTR_195", GetSpellTargetUnit(), 90.00, 18.00, 100.00, 100.00, 100.00, 10.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 5.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
endfunction

// --- InitTrig_JustticePunish (family, line 24897) ---
function InitTrig_JustticePunish takes nothing returns nothing
    set gg_trg_JustticePunish = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_JustticePunish, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_JustticePunish, Condition( function Trig_JustticePunish_Conditions ) )
    call TriggerAddAction( gg_trg_JustticePunish, function Trig_JustticePunish_Actions )
endfunction

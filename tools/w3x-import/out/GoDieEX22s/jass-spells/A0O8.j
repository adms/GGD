// rawcode: A0O8
// nameZh: 94-00 恰恰~
// cooldown: {"1": 15.0}
// mana: {"1": 25}
// duration: {"1": 10.0}
// hero_duration: {"1": 10.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: chacha

// === family chacha (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_chacha_Conditions (family, line 53817) ---
function Trig_chacha_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0O8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_chacha_Actions (family, line 53824) ---
function Trig_chacha_Actions takes nothing returns nothing
    call TextUse("恰恰~", udg_NM_Master , 20 , 2 , 100,0,0)
endfunction

// --- InitTrig_chacha (family, line 53829) ---
function InitTrig_chacha takes nothing returns nothing
    set gg_trg_chacha = CreateTrigger(  )
    call DisableTrigger( gg_trg_chacha )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_chacha, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_chacha, Condition( function Trig_chacha_Conditions ) )
    call TriggerAddAction( gg_trg_chacha, function Trig_chacha_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

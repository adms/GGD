// rawcode: A0Z8
// nameZh: 82-001 太陰道-敵彈吸收陣
// cooldown: {"1": 75.0}
// mana: {"1": 400}
// duration: {"1": 6.0}
// hero_duration: {"1": 6.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: absorpStart

// === family absorpStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_absorpStart_Conditions (family, line 35686) ---
function Trig_absorpStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Z8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_absorpStart_Actions (family, line 35693) ---
function Trig_absorpStart_Actions takes nothing returns nothing
    call TriggerSleepAction( 7.00 )
    set udg_NegiAbsorpFinDam = udg_NegiAbsorpDam
    set udg_NegiAbsorpDam = 0.00
endfunction

// --- InitTrig_absorpStart (family, line 35700) ---
function InitTrig_absorpStart takes nothing returns nothing
    set gg_trg_absorpStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_absorpStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_absorpStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_absorpStart, Condition( function Trig_absorpStart_Conditions ) )
    call TriggerAddAction( gg_trg_absorpStart, function Trig_absorpStart_Actions )
endfunction

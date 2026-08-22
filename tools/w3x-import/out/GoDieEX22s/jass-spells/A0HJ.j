// rawcode: A0HJ
// nameZh: 71-03 厄夜靈魂
// w3a base: AUdd  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 160, "2": 320, "3": 480, "4": 640, "5": 850, "6": 1000}
// range: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0, "5": 600.0, "6": 600.0}
// area: {"1": 250.0, "2": 250.0, "3": 250.0, "4": 250.0, "5": 450.0, "6": 450.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0, "5": 4.0, "6": 4.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0, "5": 4.0, "6": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: BadNightSoul

// === family BadNightSoul (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BadNightSoul_Conditions (family, line 48194) ---
function Trig_BadNightSoul_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0HJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BadNightSoul_Func003C (family, line 48201) ---
function Trig_BadNightSoul_Func003C takes nothing returns boolean
    if ( not ( udg_IsDay == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BadNightSoul_Actions (family, line 48208) ---
function Trig_BadNightSoul_Actions takes nothing returns nothing
    set udg_KingOfDeath = GetTriggerUnit()
    if ( Trig_BadNightSoul_Func003C() ) then
        call UnitAddAbilityBJ( 'A0HL', udg_NightContractUnit )
    else
        call DoNothing(  )
    endif
    call PlaySoundOnUnitBJ( gg_snd_Parasite, 100, GetTriggerUnit() )
    call TriggerSleepAction( 3.00 )
    call UnitRemoveAbilityBJ( 'A0HL', udg_NightContractUnit )
endfunction

// --- InitTrig_BadNightSoul (family, line 48221) ---
function InitTrig_BadNightSoul takes nothing returns nothing
    set gg_trg_BadNightSoul = CreateTrigger(  )
    call DisableTrigger( gg_trg_BadNightSoul )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BadNightSoul, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BadNightSoul, Condition( function Trig_BadNightSoul_Conditions ) )
    call TriggerAddAction( gg_trg_BadNightSoul, function Trig_BadNightSoul_Actions )
endfunction

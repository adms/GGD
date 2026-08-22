// rawcode: A0PS
// nameZh: 82-04-02 術式兵裝-獄炎煉我
// cooldown: {"1": 20.0}
// mana: {"1": 100}
// area: {"1": 0.0}
// duration: {"1": 1.0}
// hero_duration: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HellFire

// === family HellFire (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HellFire_Conditions (family, line 35662) ---
function Trig_HellFire_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0PS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HellFire_Actions (family, line 35669) ---
function Trig_HellFire_Actions takes nothing returns nothing
    call UnitRemoveAbilityBJ( 'A0PV', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A0PY', GetTriggerUnit() )
endfunction

// --- InitTrig_HellFire (family, line 35675) ---
function InitTrig_HellFire takes nothing returns nothing
    set gg_trg_HellFire = CreateTrigger(  )
    call DisableTrigger( gg_trg_HellFire )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HellFire, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HellFire, Condition( function Trig_HellFire_Conditions ) )
    call TriggerAddAction( gg_trg_HellFire, function Trig_HellFire_Actions )
endfunction

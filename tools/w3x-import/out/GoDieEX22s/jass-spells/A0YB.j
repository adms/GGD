// rawcode: A0YB
// nameZh: 95-00 紅色龍氣
// cooldown: {"1": 30.0}
// mana: {"1": 0}
// duration: {"1": 25.0}
// hero_duration: {"1": 25.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: RedDragon

// === family RedDragon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_RedDragon_Conditions (family, line 54277) ---
function Trig_RedDragon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0YB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RedDragon_Actions (family, line 54284) ---
function Trig_RedDragon_Actions takes nothing returns nothing
    call SetUnitLifePercentBJ( GetTriggerUnit(), ( GetUnitLifePercent(GetTriggerUnit()) + 10.00 ) )
    call SetUnitManaPercentBJ( GetTriggerUnit(), ( GetUnitManaPercent(GetTriggerUnit()) + 10.00 ) )
    call SetUnitAbilityLevelSwapped( 'A0YC', GetTriggerUnit(), 2 )
    call TriggerSleepAction( 10.00 )
    call SetUnitAbilityLevelSwapped( 'A0YC', GetTriggerUnit(), 1 )
endfunction

// --- InitTrig_RedDragon (family, line 54293) ---
function InitTrig_RedDragon takes nothing returns nothing
    set gg_trg_RedDragon = CreateTrigger(  )
    call DisableTrigger( gg_trg_RedDragon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_RedDragon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_RedDragon, Condition( function Trig_RedDragon_Conditions ) )
    call TriggerAddAction( gg_trg_RedDragon, function Trig_RedDragon_Actions )
endfunction

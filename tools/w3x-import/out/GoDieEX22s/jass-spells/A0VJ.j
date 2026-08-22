// rawcode: A0VJ
// nameZh: 52-01 狂戰士之怒
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0, "5": 57.0}
// mana: {"2": 110, "3": 160, "4": 210, "5": 175}
// area: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0, "5": 50.0}
// duration: {"1": 12.0, "2": 12.0, "3": 12.0, "4": 12.0}
// hero_duration: {"1": 12.0, "2": 12.0, "3": 12.0, "4": 12.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: berserker

// === family berserker (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_berserker_Conditions (family, line 51659) ---
function Trig_berserker_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_berserker_Actions (family, line 51666) ---
function Trig_berserker_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0VK', GetTriggerUnit(), ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) + 1 ) )
    call SetUnitVertexColorBJ( udg_BerserkerUnit, 100, 30.00, 30.00, 0 )
    call EnableTrigger( gg_trg_berserker_2 )
endfunction

// --- InitTrig_berserker (family, line 51673) ---
function InitTrig_berserker takes nothing returns nothing
    set gg_trg_berserker = CreateTrigger(  )
    call DisableTrigger( gg_trg_berserker )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_berserker, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_berserker, Condition( function Trig_berserker_Conditions ) )
    call TriggerAddAction( gg_trg_berserker, function Trig_berserker_Actions )
endfunction

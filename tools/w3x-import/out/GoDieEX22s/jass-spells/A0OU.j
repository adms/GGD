// rawcode: A0OU
// nameZh: 11-00 三刀流
// w3a base: ANht  levels: 1
// cooldown: {"1": 30.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 45, "2": 150, "3": 225, "4": 300}
// area: {"1": 0.0, "2": 700.0, "3": 800.0, "4": 900.0}
// duration: {"1": 0.5, "2": 8.0, "3": 8.0, "4": 8.0}
// hero_duration: {"1": 0.5, "2": 8.0, "3": 8.0, "4": 8.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Threesword

// === family Threesword (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Threesword_Conditions (family, line 28950) ---
function Trig_Threesword_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OU' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Threesword_Actions (family, line 28957) ---
function Trig_Threesword_Actions takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0CN', GetLastCreatedUnit() )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "unholyfrenzy", GetTriggerUnit() )
endfunction

// --- InitTrig_Threesword (family, line 28965) ---
function InitTrig_Threesword takes nothing returns nothing
    set gg_trg_Threesword = CreateTrigger(  )
    call DisableTrigger( gg_trg_Threesword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Threesword, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Threesword, Condition( function Trig_Threesword_Conditions ) )
    call TriggerAddAction( gg_trg_Threesword, function Trig_Threesword_Actions )
endfunction

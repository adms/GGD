// rawcode: A05S
// nameZh: 65-02 寒冰破碎
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0}
// mana: {"1": 150, "2": 215, "3": 280}
// range: {"1": 600.0, "2": 600.0, "3": 600.0}
// area: {"1": 200.0, "2": 200.0, "3": 200.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Run

// === family Run (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Run_Conditions (family, line 46781) ---
function Trig_Run_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05S' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Run_Actions (family, line 46788) ---
function Trig_Run_Actions takes nothing returns nothing
    set udg_KnockBack_Index = 0
    set udg_KnockBack_Target = GetTriggerUnit()
    set udg_KnockBack_Angle = GetUnitFacing(GetTriggerUnit())
    call EnableTrigger( gg_trg_Run_Effect )
endfunction

// --- InitTrig_Run (family, line 46796) ---
function InitTrig_Run takes nothing returns nothing
    set gg_trg_Run = CreateTrigger(  )
    call DisableTrigger( gg_trg_Run )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Run, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Run, Condition( function Trig_Run_Conditions ) )
    call TriggerAddAction( gg_trg_Run, function Trig_Run_Actions )
endfunction

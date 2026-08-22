// rawcode: A0PM
// nameZh: 82-02 虛空瞬動
// cooldown: {"1": 40.0, "2": 35.0, "3": 30.0}
// mana: {"1": 150, "2": 225, "3": 300}
// area: {"1": 0.0, "2": 0.0, "3": 0.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MoveStart

// === family MoveStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MoveStart_Conditions (family, line 35295) ---
function Trig_MoveStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0PM' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveStart_Actions (family, line 35302) ---
function Trig_MoveStart_Actions takes nothing returns nothing
    set udg_NegiUnit = GetTriggerUnit()
    call EnableTrigger( gg_trg_MoveInst )
    call TriggerSleepAction( ( 0.50 * I2R(GetUnitAbilityLevelSwapped('A0PM', GetTriggerUnit())) ) )
    call DisableTrigger( gg_trg_MoveInst )
endfunction

// --- InitTrig_MoveStart (family, line 35310) ---
function InitTrig_MoveStart takes nothing returns nothing
    set gg_trg_MoveStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_MoveStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MoveStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MoveStart, Condition( function Trig_MoveStart_Conditions ) )
    call TriggerAddAction( gg_trg_MoveStart, function Trig_MoveStart_Actions )
endfunction

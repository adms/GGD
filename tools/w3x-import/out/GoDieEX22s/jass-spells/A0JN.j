// rawcode: A0JN
// nameZh: 57-04 竹蜻蜓
// cooldown: {"1": 55.0, "2": 55.0, "3": 55.0, "4": 26.0}
// mana: {"1": 300, "2": 500, "3": 700, "4": 255}
// range: {"1": 350.0, "2": 350.0, "3": 350.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 4.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: CutUHead

// === family CutUHead (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CutUHead_Conditions (family, line 45709) ---
function Trig_CutUHead_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JN' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CutUHead_Actions (family, line 45716) ---
function Trig_CutUHead_Actions takes nothing returns nothing
    set udg_DoraFlyCaster = GetTriggerUnit()
    set udg_DoraFlyPoint = GetUnitLoc(GetSpellTargetUnit())
    set udg_DoraFlyLV = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_DoraFlyIndex = 0
    set udg_DoraFly_Angle = GetUnitFacing(GetTriggerUnit())
    call EnableTrigger( gg_trg_CutUHead_effect )
endfunction

// --- InitTrig_CutUHead (family, line 45726) ---
function InitTrig_CutUHead takes nothing returns nothing
    set gg_trg_CutUHead = CreateTrigger(  )
    call DisableTrigger( gg_trg_CutUHead )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CutUHead, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CutUHead, Condition( function Trig_CutUHead_Conditions ) )
    call TriggerAddAction( gg_trg_CutUHead, function Trig_CutUHead_Actions )
endfunction

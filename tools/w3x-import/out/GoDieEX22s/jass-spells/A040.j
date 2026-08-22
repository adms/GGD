// rawcode: A040
// nameZh: 58-04 瘋狂皮卡丘
// w3a base: AEIl  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 90, "2": 180, "3": 270, "4": 360}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 6.0, "2": 12.0, "3": 18.0, "4": 24.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: WildPika

// === family WildPika (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WildPika_Conditions (family, line 40317) ---
function Trig_WildPika_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A040' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WildPika_Actions (family, line 40324) ---
function Trig_WildPika_Actions takes nothing returns nothing
    set udg_PikaUnit = GetTriggerUnit()
    call EnableTrigger( gg_trg_WildPikaAttacked )
    call TriggerSleepAction( ( I2R(GetUnitAbilityLevelSwapped('A040', GetTriggerUnit())) * 6.00 ) )
    call DisableTrigger( gg_trg_WildPikaAttacked )
    call SetUnitVertexColorBJ( udg_PikaUnit, 100, 100, 100, 0 )
endfunction

// --- InitTrig_WildPika (family, line 40333) ---
function InitTrig_WildPika takes nothing returns nothing
    set gg_trg_WildPika = CreateTrigger(  )
    call DisableTrigger( gg_trg_WildPika )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WildPika, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WildPika, Condition( function Trig_WildPika_Conditions ) )
    call TriggerAddAction( gg_trg_WildPika, function Trig_WildPika_Actions )
endfunction

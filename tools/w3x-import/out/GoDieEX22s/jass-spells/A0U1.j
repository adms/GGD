// rawcode: A0U1
// nameZh: 52-02 蹂躪編年史
// w3a base: AOcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"2": 155, "3": 190, "4": 225}
// range: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// area: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Trample_Start

// === family Trample_Start (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Trample_Start_Conditions (family, line 51709) ---
function Trig_Trample_Start_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0U1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Trample_Start_Actions (family, line 51716) ---
function Trig_Trample_Start_Actions takes nothing returns nothing
    // 變數設定
    set udg_Buncle_trample_Damage = ( 250.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    set udg_Buncle_trample_Index = 0.00
    set udg_Buncle_trample_Caster = GetTriggerUnit()
    set udg_Buncle_trample_Target = GetSpellTargetUnit()
    set udg_Buncle_P1 = GetUnitLoc(udg_Buncle_trample_Target)
    set udg_Buncle_P2 = GetUnitLoc(GetTriggerUnit())
    set udg_Buncle_trample_Angle = AngleBetweenPoints(udg_Buncle_P1, udg_Buncle_P2)
    call RemoveLocation( udg_Buncle_P1 )
    call RemoveLocation( udg_Buncle_P2 )
    // 施法者設定
    call PauseUnitBJ( true, udg_Buncle_trample_Target )
    call SetUnitPathing( udg_Buncle_trample_Target, false )
    call UnitAddAbilityBJ( 'Arav', udg_Buncle_trample_Target )
    call UnitAddAbilityBJ( 'Avul', udg_Buncle_trample_Target )
    // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    call EnableTrigger( gg_trg_Trample_Effect )
endfunction

// --- InitTrig_Trample_Start (family, line 51737) ---
function InitTrig_Trample_Start takes nothing returns nothing
    set gg_trg_Trample_Start = CreateTrigger(  )
    call DisableTrigger( gg_trg_Trample_Start )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Trample_Start, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Trample_Start, Condition( function Trig_Trample_Start_Conditions ) )
    call TriggerAddAction( gg_trg_Trample_Start, function Trig_Trample_Start_Actions )
endfunction

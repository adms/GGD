// rawcode: A0CV
// nameZh: 84-02 保齡球
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 0.0}
// mana: {"1": 120, "2": 150, "3": 180, "4": 0}
// range: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Bowling

// === family Bowling (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bowling_Conditions (family, line 51448) ---
function Trig_Bowling_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bowling_Actions (family, line 51455) ---
function Trig_Bowling_Actions takes nothing returns nothing
    // 變數設定
    set udg_Bowling_IndexBear = 0
    set udg_BearUnit = GetTriggerUnit()
    set udg_P1Bear = GetUnitLoc(GetTriggerUnit())
    set udg_P2Bear = GetSpellTargetLoc()
    set udg_Bowling_AngleBear = AngleBetweenPoints(udg_P1Bear, udg_P2Bear)
    set udg_BearDamage = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_BearUnit, true)) * 2.00 ) + ( ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0CV', udg_BearUnit)) ) + 50.00 ) )
    call SetUnitTimeScalePercent( udg_BearUnit, 700.00 )
    call GroupClear( udg_BearGroup )
    call RemoveLocation( udg_P1Bear )
    call RemoveLocation( udg_P2Bear )
    call EnableTrigger( gg_trg_BowlingEffect )
endfunction

// --- InitTrig_Bowling (family, line 51471) ---
function InitTrig_Bowling takes nothing returns nothing
    set gg_trg_Bowling = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bowling )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bowling, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bowling, Condition( function Trig_Bowling_Conditions ) )
    call TriggerAddAction( gg_trg_Bowling, function Trig_Bowling_Actions )
endfunction

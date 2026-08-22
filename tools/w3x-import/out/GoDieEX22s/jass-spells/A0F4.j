// rawcode: A0F4
// nameZh: 74-03 闇之天使
// w3a base: AHfs  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 200, "2": 275, "3": 350, "4": 425}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// area: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 3.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: EndBurn

// === family EndBurn (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EndBurn_Conditions (family, line 48489) ---
function Trig_EndBurn_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0F4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EndBurn_Func006A (family, line 48496) ---
function Trig_EndBurn_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EndBurn_Actions (family, line 48501) ---
function Trig_EndBurn_Actions takes nothing returns nothing
    set udg_SephUnit = GetTriggerUnit()
    set udg_SephAngelPoint = GetSpellTargetLoc()
    set udg_SephAngelLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_SephAngelCounter = 1
    loop
        exitwhen udg_SephAngelCounter > 8
        set udg_SephAngelRandomPoint = GetRandomLocInRect(RectFromCenterSizeBJ(udg_SephAngelPoint, 600.00, 600.00))
        call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_SephUnit), udg_SephAngelPoint, udg_SephAngelRandomPoint )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A011', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A011', GetLastCreatedUnit(), udg_SephAngelLevel )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", udg_SephAngelRandomPoint )
        call TriggerSleepAction( 0.30 )
        set udg_SephAngelCounter = udg_SephAngelCounter + 1
    endloop
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SephUnit), 'hfoo'), function Trig_EndBurn_Func006A )
endfunction

// --- InitTrig_EndBurn (family, line 48522) ---
function InitTrig_EndBurn takes nothing returns nothing
    set gg_trg_EndBurn = CreateTrigger(  )
    call DisableTrigger( gg_trg_EndBurn )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EndBurn, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EndBurn, Condition( function Trig_EndBurn_Conditions ) )
    call TriggerAddAction( gg_trg_EndBurn, function Trig_EndBurn_Actions )
endfunction

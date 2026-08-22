// rawcode: A0C0
// nameZh: 86-04 打雷絕招
// w3a base: AOw2  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 150, "2": 250, "3": 350}
// area: {"2": 450.0, "3": 650.0}
// duration: {"1": 0.5, "2": 0.5, "3": 0.5}
// hero_duration: {"1": 0.5, "2": 0.5, "3": 0.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: PIKACHU

// === family PIKACHU (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_PIKACHU_Conditions (family, line 40445) ---
function Trig_PIKACHU_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0C0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PIKACHU_Func005A (family, line 40452) ---
function Trig_PIKACHU_Func005A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_PIKACHU_Func006Func001A (family, line 40462) ---
function Trig_PIKACHU_Func006Func001A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_PIKACHU_Func006C (family, line 40472) ---
function Trig_PIKACHU_Func006C takes nothing returns boolean
    if ( not ( GetHeroLevel(udg_PikaUnit) >= 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PIKACHU_Func011A (family, line 40479) ---
function Trig_PIKACHU_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_PIKACHU_Func013A (family, line 40484) ---
function Trig_PIKACHU_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_PIKACHU_Actions (family, line 40489) ---
function Trig_PIKACHU_Actions takes nothing returns nothing
    set udg_PikaUnit = GetTriggerUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(( 100.00 + ( 200.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) ), GetUnitLoc(GetTriggerUnit())), function Trig_PIKACHU_Func005A )
    if ( Trig_PIKACHU_Func006C() ) then
        call ForGroupBJ( GetUnitsInRangeOfLocAll(( 600.00 + ( 200.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) ), GetUnitLoc(GetTriggerUnit())), function Trig_PIKACHU_Func006Func001A )
    else
    endif
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 4.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'o00E'), function Trig_PIKACHU_Func011A )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'hfoo'), function Trig_PIKACHU_Func013A )
endfunction

// --- InitTrig_PIKACHU (family, line 40508) ---
function InitTrig_PIKACHU takes nothing returns nothing
    set gg_trg_PIKACHU = CreateTrigger(  )
    call DisableTrigger( gg_trg_PIKACHU )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PIKACHU, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_PIKACHU, Condition( function Trig_PIKACHU_Conditions ) )
    call TriggerAddAction( gg_trg_PIKACHU, function Trig_PIKACHU_Actions )
endfunction

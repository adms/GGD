// rawcode: A0Z6
// nameZh: 02-04 百鬼夜行
// w3a base: AOls  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 120, "2": 210, "3": 300}
// duration: {"1": 8.0, "2": 8.0, "3": 8.0}
// hero_duration: {"1": 8.0, "2": 8.0, "3": 8.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HudGhosts

// === family HudGhosts (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HudGhosts_Conditions (family, line 55362) ---
function Trig_HudGhosts_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Z6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HudGhosts_Func001A (family, line 55369) ---
function Trig_HudGhosts_Func001A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HudGhosts_Func005Func001Func003C (family, line 55374) ---
function Trig_HudGhosts_Func005Func001Func003C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[udg_RandomKillHeroCounter] != null ) ) then
        return false
    endif
    if ( not ( udg_PlayerHeroUnit[udg_RandomKillHeroCounter] != udg_TargetKillHero ) ) then
        return false
    endif
    if ( not ( IsUnitType(udg_PlayerHeroUnit[udg_RandomKillHeroCounter], UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(udg_PlayerHeroUnit[udg_RandomKillHeroCounter]) != 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HudGhosts_Func005Func001C (family, line 55390) ---
function Trig_HudGhosts_Func005Func001C takes nothing returns boolean
    if ( not Trig_HudGhosts_Func005Func001Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_HudGhosts_Actions (family, line 55397) ---
function Trig_HudGhosts_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h032'), function Trig_HudGhosts_Func001A )
    call CreateNUnitsAtLoc( 1, 'h032', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), GetUnitFacing(GetTriggerUnit()) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 300.00, 300.00, 300.00 )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    set udg_RandomKillHeroCounter = 2
    loop
        exitwhen udg_RandomKillHeroCounter > 12
        if ( Trig_HudGhosts_Func005Func001C() ) then
            call UnitAddAbilityBJ( 'A11J', GetLastCreatedUnit() )
            call IssuePointOrderLocBJ( GetLastCreatedUnit(), "farsight", GetUnitLoc(udg_PlayerHeroUnit[udg_RandomKillHeroCounter]) )
        else
        endif
        set udg_RandomKillHeroCounter = udg_RandomKillHeroCounter + 1
    endloop
endfunction

// --- InitTrig_HudGhosts (family, line 55415) ---
function InitTrig_HudGhosts takes nothing returns nothing
    set gg_trg_HudGhosts = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HudGhosts, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HudGhosts, Condition( function Trig_HudGhosts_Conditions ) )
    call TriggerAddAction( gg_trg_HudGhosts, function Trig_HudGhosts_Actions )
endfunction

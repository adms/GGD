// rawcode: A03L
// nameZh: 71-01 死亡隕落
// w3a base: ANin  levels: 3
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0}
// mana: {"1": 85, "2": 135, "3": 185}
// area: {"1": 300.0, "2": 300.0, "3": 300.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DeathMeteo

// === family DeathMeteo (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DeathMeteo_Func001C (family, line 48137) ---
function Trig_DeathMeteo_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A03L' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathMeteo_Conditions (family, line 48147) ---
function Trig_DeathMeteo_Conditions takes nothing returns boolean
    if ( not Trig_DeathMeteo_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathMeteo_Func019A (family, line 48154) ---
function Trig_DeathMeteo_Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DeathMeteo_Actions (family, line 48159) ---
function Trig_DeathMeteo_Actions takes nothing returns nothing
    set udg_KingOfDeath = GetTriggerUnit()
    set udg_Immediately_P1 = GetUnitLoc(udg_KingOfDeath)
    set udg_DeathMeterPoint = GetSpellTargetLoc()
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_DeathMeterPoint, bj_UNIT_FACING )
    call UnitAddAbilityBJ( 'A095', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A095', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", udg_DeathMeterPoint )
    call TriggerSleepAction( 0.30 )
    call CreateNUnitsAtLoc( 1, 'u01A', GetOwningPlayer(udg_KingOfDeath), udg_Immediately_P1, GetUnitFacing(udg_KingOfDeath) )
    call KillUnit( GetLastCreatedUnit() )
    call ShowUnitHide( udg_KingOfDeath )
    call TriggerSleepAction( 0.30 )
    call SetUnitPositionLoc( udg_KingOfDeath, udg_DeathMeterPoint )
    call ShowUnitShow( udg_KingOfDeath )
    call SelectUnitForPlayerSingle( udg_KingOfDeath, GetOwningPlayer(udg_KingOfDeath) )
    call TriggerSleepAction( 3.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_KingOfDeath), 'hfoo'), function Trig_DeathMeteo_Func019A )
    call RemoveLocation( udg_Immediately_P1 )
    call RemoveLocation( udg_DeathMeterPoint )
endfunction

// --- InitTrig_DeathMeteo (family, line 48183) ---
function InitTrig_DeathMeteo takes nothing returns nothing
    set gg_trg_DeathMeteo = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathMeteo )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathMeteo, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DeathMeteo, Condition( function Trig_DeathMeteo_Conditions ) )
    call TriggerAddAction( gg_trg_DeathMeteo, function Trig_DeathMeteo_Actions )
endfunction

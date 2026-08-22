// rawcode: A0UO
// nameZh: 21-002 天破壤碎
// cooldown: {"2": 40.0, "3": 35.0, "4": 30.0}
// mana: {"1": 800, "2": 120, "3": 160, "4": 200}
// area: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SpaceBreaker

// === family SpaceBreaker (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SpaceBreaker_Conditions (family, line 33140) ---
function Trig_SpaceBreaker_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0UO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SpaceBreaker_Func011A (family, line 33147) ---
function Trig_SpaceBreaker_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SpaceBreaker_Actions (family, line 33152) ---
function Trig_SpaceBreaker_Actions takes nothing returns nothing
    call SetUnitLifeBJ( GetTriggerUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) - 1000.00 ) )
    set udg_Shana_SB_Caster = GetTriggerUnit()
    set udg_Shana_SB_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_Shana_SB_Caster), udg_Shana_SB_P1, bj_UNIT_FACING )
    set udg_Shana_SB_Unit = GetLastCreatedUnit()
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0V9', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0V9', GetLastCreatedUnit(), 1 )
    set udg_Shana_SB_Index = 1
    loop
        exitwhen udg_Shana_SB_Index > 40
        call TriggerSleepAction( 0.01 )
        set udg_Shana_SB_P2 = GetRandomLocInRect(RectFromCenterSizeBJ(udg_Shana_SB_P1, 1200.00, 1200.00))
        call SetUnitFacingToFaceLocTimed( udg_Shana_SB_Unit, udg_Shana_SB_P2, 0 )
        call IssuePointOrderLocBJ( udg_Shana_SB_Unit, "inferno", udg_Shana_SB_P2 )
        call AddSpecialEffectLocBJ( udg_Shana_SB_P2, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectLocBJ( udg_Shana_SB_P2, "Doodads\\Cinematic\\FirePillarMedium\\FirePillarMedium.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectLocBJ( udg_Shana_SB_P2, "Doodads\\Outland\\Rocks\\Outland_MagmaRock\\Outland_MagmaRock0.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_Shana_SB_Index = udg_Shana_SB_Index + 1
    endloop
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Shana_SB_Caster), 'hfoo'), function Trig_SpaceBreaker_Func011A )
endfunction

// --- InitTrig_SpaceBreaker (family, line 33181) ---
function InitTrig_SpaceBreaker takes nothing returns nothing
    set gg_trg_SpaceBreaker = CreateTrigger(  )
    call DisableTrigger( gg_trg_SpaceBreaker )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SpaceBreaker, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SpaceBreaker, Condition( function Trig_SpaceBreaker_Conditions ) )
    call TriggerAddAction( gg_trg_SpaceBreaker, function Trig_SpaceBreaker_Actions )
endfunction

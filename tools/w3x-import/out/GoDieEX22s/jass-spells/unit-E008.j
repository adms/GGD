// unit rawcode: E008
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_ShaNa, CloseDest, FireSwordSkill, SpaceBreaker

// === family Open_Skill_of_ShaNa (armed) events=none ===

// --- Trig_Open_Skill_of_ShaNa_Conditions (family, line 32970) ---
function Trig_Open_Skill_of_ShaNa_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnteringUnit()) == 'E008' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_ShaNa_Actions (family, line 32977) ---
function Trig_Open_Skill_of_ShaNa_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_FireSwordSkill )
    call EnableTrigger( gg_trg_CloseDest )
    call EnableTrigger( gg_trg_SpaceBreaker )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "夏娜: 把波蘿麵包還來!!!!" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_ShaNa (family, line 32987) ---
function InitTrig_Open_Skill_of_ShaNa takes nothing returns nothing
    set gg_trg_Open_Skill_of_ShaNa = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_ShaNa, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_ShaNa, Condition( function Trig_Open_Skill_of_ShaNa_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_ShaNa, function Trig_Open_Skill_of_ShaNa_Actions )
endfunction

// === family CloseDest (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CloseDest_Conditions (family, line 33025) ---
function Trig_CloseDest_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0HB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CloseDest_Actions (family, line 33032) ---
function Trig_CloseDest_Actions takes nothing returns nothing
    set udg_ShanaUnit = GetTriggerUnit()
    set udg_ZeroTimeUnit = GetTriggerUnit()
    set udg_ShanaAngelPoint = GetUnitLoc(GetTriggerUnit())
    call DisableTrigger( GetTriggeringTrigger() )
    call CreateNUnitsAtLoc( 1, 'o015', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    set udg_ShanaDesUnit = GetLastCreatedUnit()
    call EnableTrigger( gg_trg_CloseDestAddAb )
    call EnableTrigger( gg_trg_CloseDestEffect )
    set udg_CloseDesEffectCount = 0
    call PlaySoundOnUnitBJ( gg_snd_FlareTarget1, 100.00, GetTriggerUnit() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "DivineRing.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( ( I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), udg_ShanaUnit) * 4 )) + 2.00 ) )
    call KillUnit( udg_ShanaDesUnit )
    call RemoveUnit( udg_ShanaDesUnit )
    call DisableTrigger( gg_trg_CloseDestAddAb )
    call EnableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_CloseDest (family, line 33053) ---
function InitTrig_CloseDest takes nothing returns nothing
    set gg_trg_CloseDest = CreateTrigger(  )
    call DisableTrigger( gg_trg_CloseDest )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CloseDest, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CloseDest, Condition( function Trig_CloseDest_Conditions ) )
    call TriggerAddAction( gg_trg_CloseDest, function Trig_CloseDest_Actions )
endfunction

// === family FireSwordSkill (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FireSwordSkill_Conditions (family, line 32997) ---
function Trig_FireSwordSkill_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0BD' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSwordSkill_Actions (family, line 33004) ---
function Trig_FireSwordSkill_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.01 )
    call PlaySoundOnUnitBJ( gg_snd_FlareTarget3, 100.00, GetKillingUnitBJ() )
    call UnitAddAbilityBJ( 'A0DF', GetTriggerUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DF', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0BD', GetTriggerUnit()) )
    call PolledWait( ( 4.00 * I2R(GetUnitAbilityLevelSwapped('A0BD', GetTriggerUnit())) ) )
    call UnitRemoveAbilityBJ( 'A0DF', GetTriggerUnit() )
endfunction

// --- InitTrig_FireSwordSkill (family, line 33014) ---
function InitTrig_FireSwordSkill takes nothing returns nothing
    set gg_trg_FireSwordSkill = CreateTrigger(  )
    call DisableTrigger( gg_trg_FireSwordSkill )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireSwordSkill, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FireSwordSkill, Condition( function Trig_FireSwordSkill_Conditions ) )
    call TriggerAddAction( gg_trg_FireSwordSkill, function Trig_FireSwordSkill_Actions )
endfunction

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

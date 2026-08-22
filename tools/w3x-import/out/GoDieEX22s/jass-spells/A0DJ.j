// rawcode: A0DJ
// nameZh: 39-04 祕奧義．金色的神風
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 90.0}
// mana: {"1": 175, "2": 275, "3": 375, "4": 500}
// area: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 0.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GodWind

// === family GodWind (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GodWind_Conditions (family, line 39784) ---
function Trig_GodWind_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0DJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GodWind_Func005Func001Func001C (family, line 39791) ---
function Trig_GodWind_Func005Func001Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_WindDragonUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GodWind_Func005Func001C (family, line 39798) ---
function Trig_GodWind_Func005Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetTriggerPlayer()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GodWind_Func005A (family, line 39808) ---
function Trig_GodWind_Func005A takes nothing returns nothing
    if ( Trig_GodWind_Func005Func001C() ) then
        if ( Trig_GodWind_Func005Func001Func001C() ) then
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * ( 2.00 * I2R(GetUnitAbilityLevelSwapped('A0DJ', GetTriggerUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * ( 1.00 * I2R(GetUnitAbilityLevelSwapped('A0DJ', GetTriggerUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
    else
    endif
endfunction

// --- Trig_GodWind_Func072A (family, line 39819) ---
function Trig_GodWind_Func072A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GodWind_Actions (family, line 39824) ---
function Trig_GodWind_Actions takes nothing returns nothing
    set udg_WindDragonUnit = GetTriggerUnit()
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(550.00, GetUnitLoc(GetTriggerUnit())), function Trig_GodWind_Func005A )
    // 四神
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, 0), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DM', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DM', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\other\\ANsa\\ANsaTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_100", GetLastCreatedUnit(), 0, 12.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call PlaySoundOnUnitBJ( gg_snd_DragonYes2, 100.00, GetTriggerUnit() )
    // 四神
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, 90.00), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DL', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DL', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\other\\ANsa\\ANsaTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_101", GetLastCreatedUnit(), 0, 12.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    // 四神
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, 180.00), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DN', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DN', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\other\\ANsa\\ANsaTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_154", GetLastCreatedUnit(), 0, 12.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    // 四神
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, 270.00), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DK', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DK', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\other\\ANsa\\ANsaTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_198", GetLastCreatedUnit(), 0, 16.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call TriggerSleepAction( 1.50 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_WindDragonUnit), 'hfoo'), function Trig_GodWind_Func072A )
endfunction

// --- InitTrig_GodWind (family, line 39900) ---
function InitTrig_GodWind takes nothing returns nothing
    set gg_trg_GodWind = CreateTrigger(  )
    call DisableTrigger( gg_trg_GodWind )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GodWind, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GodWind, Condition( function Trig_GodWind_Conditions ) )
    call TriggerAddAction( gg_trg_GodWind, function Trig_GodWind_Actions )
endfunction

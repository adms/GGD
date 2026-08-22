// rawcode: A0JL
// nameZh: 14-01 東風繪扇、南風末廣
// w3a base: AEtq  levels: 3
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 60.0}
// mana: {"1": 120, "2": 170, "3": 220, "4": 210}
// area: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MagicFan, Wind_Effect

// === family MagicFan (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MagicFan_Conditions (family, line 30262) ---
function Trig_MagicFan_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicFan_Func007Func001Func001Func002C (family, line 30269) ---
function Trig_MagicFan_Func007Func001Func001Func002C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_MoNiUnit)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicFan_Func007Func001Func001C (family, line 30279) ---
function Trig_MagicFan_Func007Func001Func001C takes nothing returns boolean
    if ( not Trig_MagicFan_Func007Func001Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicFan_Func007Func001A (family, line 30286) ---
function Trig_MagicFan_Func007Func001A takes nothing returns nothing
    if ( Trig_MagicFan_Func007Func001Func001C() ) then
        call SetUnitLifeBJ( GetEnumUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetEnumUnit()) + udg_MoNiReHP ) )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( ( I2S(R2I(udg_MoNiReHP)) + "!" ), GetEnumUnit(), -30.00, 10.00, 30.00, 85.00, 30.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
        call DoNothing(  )
    endif
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "purge", GetEnumUnit() )
endfunction

// --- Trig_MagicFan_Func007Func002Func001Func002C (family, line 30303) ---
function Trig_MagicFan_Func007Func002Func001Func002C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_MoNiUnit)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicFan_Func007Func002Func001C (family, line 30313) ---
function Trig_MagicFan_Func007Func002Func001C takes nothing returns boolean
    if ( not Trig_MagicFan_Func007Func002Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicFan_Func007Func002A (family, line 30320) ---
function Trig_MagicFan_Func007Func002A takes nothing returns nothing
    if ( Trig_MagicFan_Func007Func002Func001C() ) then
        call SetUnitLifeBJ( GetEnumUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetEnumUnit()) + udg_MoNiReHP ) )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( ( I2S(R2I(udg_MoNiReHP)) + "!" ), GetEnumUnit(), -30.00, 10.00, 30.00, 85.00, 30.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
        call DoNothing(  )
    endif
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "purge", GetEnumUnit() )
endfunction

// --- Trig_MagicFan_Func007C (family, line 30337) ---
function Trig_MagicFan_Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_MoNiUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicFan_Func009A (family, line 30344) ---
function Trig_MagicFan_Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicFan_Func010A (family, line 30349) ---
function Trig_MagicFan_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicFan_Actions (family, line 30354) ---
function Trig_MagicFan_Actions takes nothing returns nothing
    set udg_MoNiUnit = GetTriggerUnit()
    set udg_MoNiReHP = ( 150.00 + I2R(( ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), udg_MoNiUnit) + 1 ) * GetHeroStatBJ(bj_HEROSTAT_INT, udg_MoNiUnit, true) )) )
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(udg_MoNiUnit), GetUnitLoc(udg_MoNiUnit), 0.00 )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A02H', GetLastCreatedUnit() )
    if ( Trig_MagicFan_Func007C() ) then
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_MoNiUnit), 1200.00, 1200.00)), function Trig_MagicFan_Func007Func001A )
    else
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_MoNiUnit), 650.00, 650.00)), function Trig_MagicFan_Func007Func002A )
    endif
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoNiUnit), 'ogru'), function Trig_MagicFan_Func009A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoNiUnit), 'o01G'), function Trig_MagicFan_Func010A )
endfunction

// --- InitTrig_MagicFan (family, line 30372) ---
function InitTrig_MagicFan takes nothing returns nothing
    set gg_trg_MagicFan = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MagicFan, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MagicFan, Condition( function Trig_MagicFan_Conditions ) )
    call TriggerAddAction( gg_trg_MagicFan, function Trig_MagicFan_Actions )
endfunction

// === family Wind_Effect (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Wind_Effect_Conditions (family, line 30230) ---
function Trig_Wind_Effect_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wind_Effect_Actions (family, line 30237) ---
function Trig_Wind_Effect_Actions takes nothing returns nothing
    set udg_MoNiUnit = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o01G', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    set udg_Magiccure[1] = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'o01G', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    set udg_Magiccure[2] = GetLastCreatedUnit()
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\NightElf\\Starfall\\StarfallCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_MagicSpecial[1] = GetLastCreatedEffectBJ()
    call EnableTrigger( gg_trg_Wind_CloseEffect )
endfunction

// --- InitTrig_Wind_Effect (family, line 30250) ---
function InitTrig_Wind_Effect takes nothing returns nothing
    set gg_trg_Wind_Effect = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Wind_Effect, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Wind_Effect, Condition( function Trig_Wind_Effect_Conditions ) )
    call TriggerAddAction( gg_trg_Wind_Effect, function Trig_Wind_Effect_Actions )
endfunction

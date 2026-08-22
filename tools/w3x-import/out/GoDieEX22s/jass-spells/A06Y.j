// rawcode: A06Y
// nameZh: 92-04 馬勒戈壁
// w3a base: ACro  levels: 3
// cooldown: {"1": 75.0, "2": 75.0, "3": 75.0}
// mana: {"1": 300, "2": 420, "3": 540}
// area: {"1": 1.0, "2": 1.0, "3": 1.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MLGBTemp, MLGBTempSteal

// === family MLGBTemp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MLGBTemp_Conditions (family, line 45412) ---
function Trig_MLGBTemp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A06Y' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MLGBTemp_Actions (family, line 45419) ---
function Trig_MLGBTemp_Actions takes nothing returns nothing
    call EnableTrigger( gg_trg_MLGBTempSteal )
    call TriggerSleepAction( 6.00 )
    call DisableTrigger( gg_trg_MLGBTempSteal )
endfunction

// --- InitTrig_MLGBTemp (family, line 45426) ---
function InitTrig_MLGBTemp takes nothing returns nothing
    set gg_trg_MLGBTemp = CreateTrigger(  )
    call DisableTrigger( gg_trg_MLGBTemp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MLGBTemp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MLGBTemp, Condition( function Trig_MLGBTemp_Conditions ) )
    call TriggerAddAction( gg_trg_MLGBTemp, function Trig_MLGBTemp_Actions )
endfunction

// === family MLGBTempSteal (passive) events=none ===

// --- Trig_MLGBTempSteal_Func002Func001Func001Func001C (family, line 45437) ---
function Trig_MLGBTempSteal_Func002Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetPlayerState(GetOwningPlayer(GetEnumUnit()), PLAYER_STATE_RESOURCE_GOLD) >= ( 150 * GetUnitAbilityLevelSwapped('A06Y', udg_Horse) ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MLGBTempSteal_Func002Func001Func001Func002C (family, line 45444) ---
function Trig_MLGBTempSteal_Func002Func001Func001Func002C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_Horse))] == true ) ) then
        return false
    endif
    if ( not ( GetPlayerState(GetOwningPlayer(GetEnumUnit()), PLAYER_STATE_RESOURCE_LUMBER) >= 75 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MLGBTempSteal_Func002Func001Func001C (family, line 45454) ---
function Trig_MLGBTempSteal_Func002Func001Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( GetPlayerState(GetOwningPlayer(GetEnumUnit()), PLAYER_STATE_RESOURCE_GOLD) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MLGBTempSteal_Func002Func001C (family, line 45464) ---
function Trig_MLGBTempSteal_Func002Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_Horse)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MLGBTempSteal_Func002A (family, line 45480) ---
function Trig_MLGBTempSteal_Func002A takes nothing returns nothing
    if ( Trig_MLGBTempSteal_Func002Func001C() ) then
        if ( Trig_MLGBTempSteal_Func002Func001Func001C() ) then
            if ( Trig_MLGBTempSteal_Func002Func001Func001Func001C() ) then
                call AdjustPlayerStateBJ( ( GetUnitAbilityLevelSwapped('A06Y', udg_Horse) * -150 ), GetOwningPlayer(GetEnumUnit()), PLAYER_STATE_RESOURCE_GOLD )
                call AdjustPlayerStateBJ( ( GetUnitAbilityLevelSwapped('A06Y', udg_Horse) * 150 ), GetOwningPlayer(udg_Horse), PLAYER_STATE_RESOURCE_GOLD )
                call CreateTextTagUnitBJ( ( "-" + I2S(( GetUnitAbilityLevelSwapped('A06Y', udg_Horse) * 150 )) ), GetEnumUnit(), -40.00, 10.00, 90.00, 90.00, 0.00, 0.00 )
                call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
                call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
                call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
                call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
                call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "UI\\Feedback\\GoldCredit\\GoldCredit.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
                call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Other\\ToonBoom\\ToonBoom.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            else
            endif
            if ( Trig_MLGBTempSteal_Func002Func001Func001Func002C() ) then
                call AdjustPlayerStateBJ( -75, GetOwningPlayer(GetEnumUnit()), PLAYER_STATE_RESOURCE_LUMBER )
                call AdjustPlayerStateBJ( 75, GetOwningPlayer(udg_Horse), PLAYER_STATE_RESOURCE_LUMBER )
                call CreateTextTagUnitBJ( ( "-" + "75" ), GetEnumUnit(), -40.00, 10.00, 0.00, 90.00, 0.00, 0.00 )
                call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
                call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
                call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
                call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            else
            endif
        else
        endif
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Undead\\UDeathSmall\\UDeathSmall.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( udg_Horse, GetEnumUnit(), ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A06Y', udg_Horse)) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- Trig_MLGBTempSteal_Actions (family, line 45516) ---
function Trig_MLGBTempSteal_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_Horse), 900.00, 900.00)), function Trig_MLGBTempSteal_Func002A )
endfunction

// --- InitTrig_MLGBTempSteal (family, line 45521) ---
function InitTrig_MLGBTempSteal takes nothing returns nothing
    set gg_trg_MLGBTempSteal = CreateTrigger(  )
    call DisableTrigger( gg_trg_MLGBTempSteal )
    call TriggerRegisterTimerEventPeriodic( gg_trg_MLGBTempSteal, 0.98 )
    call TriggerAddAction( gg_trg_MLGBTempSteal, function Trig_MLGBTempSteal_Actions )
endfunction

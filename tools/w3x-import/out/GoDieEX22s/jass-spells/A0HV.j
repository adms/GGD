// rawcode: A0HV
// nameZh: 25-03 北斗百裂拳
// w3a base: ANc3  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 165, "2": 240, "3": 315, "4": 390}
// range: {"1": 150.0, "2": 150.0, "3": 150.0, "4": 150.0}
// area: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 0.5}
// hero_duration: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 0.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HunrThum

// === family HunrThum (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HunrThum_Conditions (family, line 38781) ---
function Trig_HunrThum_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0HV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HunrThum_Func002Func001Func002Func003C (family, line 38788) ---
function Trig_HunrThum_Func002Func001Func002Func003C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_YouDieKiller))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U00L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HunrThum_Func002Func001Func002C (family, line 38798) ---
function Trig_HunrThum_Func002Func001Func002C takes nothing returns boolean
    if ( not Trig_HunrThum_Func002Func001Func002Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_HunrThum_Func002Func001C (family, line 38805) ---
function Trig_HunrThum_Func002Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HunrThum_Func002A (family, line 38818) ---
function Trig_HunrThum_Func002A takes nothing returns nothing
    if ( Trig_HunrThum_Func002Func001C() ) then
        if ( Trig_HunrThum_Func002Func001Func002C() ) then
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 250.00 ) + 50.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 6.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 250.00 ) + 50.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 2.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( "TRIGSTR_5862", GetEnumUnit(), 0, 12.00, 100.00, 50.00, 50.00, 0 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, GetRandomDirectionDeg() )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_HunrThum_Actions (family, line 38837) ---
function Trig_HunrThum_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.10 )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, GetSpellTargetLoc()), function Trig_HunrThum_Func002A )
endfunction

// --- InitTrig_HunrThum (family, line 38843) ---
function InitTrig_HunrThum takes nothing returns nothing
    set gg_trg_HunrThum = CreateTrigger(  )
    call DisableTrigger( gg_trg_HunrThum )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HunrThum, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HunrThum, Condition( function Trig_HunrThum_Conditions ) )
    call TriggerAddAction( gg_trg_HunrThum, function Trig_HunrThum_Actions )
endfunction

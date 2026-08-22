// rawcode: A0Y4
// nameZh: 90-03 藤鞭
// w3a base: ANhs  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 125, "2": 200, "3": 275, "4": 350}
// range: {"1": 500.0, "2": 700.0, "3": 900.0, "4": 1100.0}
// area: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Vine

// === family Vine (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Vine_Conditions (family, line 26628) ---
function Trig_Vine_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Vine_Func006Func001C (family, line 26635) ---
function Trig_Vine_Func006Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Frog_Hero)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Vine_Func006Func002C (family, line 26648) ---
function Trig_Vine_Func006Func002C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( GetOwningPlayer(GetEnumUnit()) != Player(PLAYER_NEUTRAL_AGGRESSIVE) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Vine_Func006A (family, line 26661) ---
function Trig_Vine_Func006A takes nothing returns nothing
    if ( Trig_Vine_Func006Func001C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\IllidanMissile\\IllidanMissile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( udg_Frog_Hero, GetEnumUnit(), udg_Frog_Vine_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
    if ( Trig_Vine_Func006Func002C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\NightElf\\TargetArtLumber\\TargetArtLumber.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call SetUnitPositionLoc( GetEnumUnit(), udg_Frog_P )
    else
    endif
endfunction

// --- Trig_Vine_Actions (family, line 26676) ---
function Trig_Vine_Actions takes nothing returns nothing
    set udg_Frog_Hero = GetTriggerUnit()
    set udg_Frog_Vine_TargetP = GetSpellTargetLoc()
    set udg_Frog_Vine_Damage = ( 200.00 + ( 150.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    call TriggerSleepAction( 1.00 )
    set udg_Frog_P = GetUnitLoc(udg_Frog_Hero)
    call ForGroupBJ( GetUnitsInRangeOfLocAll(480.00, udg_Frog_Vine_TargetP), function Trig_Vine_Func006A )
    call RemoveLocation( udg_Frog_Vine_TargetP)
    call RemoveLocation( udg_Frog_P)
endfunction

// --- InitTrig_Vine (family, line 26688) ---
function InitTrig_Vine takes nothing returns nothing
    set gg_trg_Vine = CreateTrigger(  )
    call DisableTrigger( gg_trg_Vine )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Vine, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Vine, Condition( function Trig_Vine_Conditions ) )
    call TriggerAddAction( gg_trg_Vine, function Trig_Vine_Actions )
endfunction

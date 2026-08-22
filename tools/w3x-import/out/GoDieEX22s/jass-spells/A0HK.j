// rawcode: A0HK
// nameZh: 71-04 萬惡歸宗
// w3a base: AEsb  levels: 5
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0, "5": 60.0}
// mana: {"1": 150, "2": 250, "3": 350, "4": 450, "5": 550}
// area: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0, "5": 600.0}
// duration: {"1": 2.0, "2": 2.0, "3": 2.0, "4": 2.0, "5": 2.0}
// hero_duration: {"1": 2.0, "2": 2.0, "3": 2.0, "4": 2.0, "5": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AllSinReturn

// === family AllSinReturn (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AllSinReturn_Conditions (family, line 48232) ---
function Trig_AllSinReturn_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0HK' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AllSinReturn_Func004Func005C (family, line 48239) ---
function Trig_AllSinReturn_Func004Func005C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'Udea' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AllSinReturn_Func004A (family, line 48252) ---
function Trig_AllSinReturn_Func004A takes nothing returns nothing
    set udg_SumOfSinMagic = ( udg_SumOfSinMagic + GetUnitStateSwap(UNIT_STATE_MANA, GetEnumUnit()) )
    call SetUnitManaPercentBJ( GetEnumUnit(), 0.00 )
    call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    if ( Trig_AllSinReturn_Func004Func005C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_DeathPowerUnitGroup )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_AllSinReturn_Func006Func002C (family, line 48264) ---
function Trig_AllSinReturn_Func006Func002C takes nothing returns boolean
    if ( not ( udg_IsDay == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AllSinReturn_Func006A (family, line 48271) ---
function Trig_AllSinReturn_Func006A takes nothing returns nothing
    call SetUnitAnimationWithRarity( GetEnumUnit(), "Death", RARITY_FREQUENT )
    if ( Trig_AllSinReturn_Func006Func002C() ) then
        call UnitDamageTargetBJ( udg_KingOfDeath, GetEnumUnit(), ( ( udg_SumOfSinMagic + 500.00 ) * ( I2R(GetUnitAbilityLevelSwapped('A0HK', GetTriggerUnit())) * 0.15 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( udg_KingOfDeath, GetEnumUnit(), ( ( udg_SumOfSinMagic + 0.00 ) * ( I2R(GetUnitAbilityLevelSwapped('A0HK', GetTriggerUnit())) * 0.15 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call PlaySoundOnUnitBJ( gg_snd_Taunt, 100, GetEnumUnit() )
    call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- Trig_AllSinReturn_Actions (family, line 48285) ---
function Trig_AllSinReturn_Actions takes nothing returns nothing
    set udg_KingOfDeath = GetTriggerUnit()
    set udg_SumOfSinMagic = 0.00
    call GroupClear( udg_DeathPowerUnitGroup )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, GetUnitLoc(GetTriggerUnit())), function Trig_AllSinReturn_Func004A )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( udg_DeathPowerUnitGroup, function Trig_AllSinReturn_Func006A )
endfunction

// --- InitTrig_AllSinReturn (family, line 48295) ---
function InitTrig_AllSinReturn takes nothing returns nothing
    set gg_trg_AllSinReturn = CreateTrigger(  )
    call DisableTrigger( gg_trg_AllSinReturn )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AllSinReturn, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_AllSinReturn, Condition( function Trig_AllSinReturn_Conditions ) )
    call TriggerAddAction( gg_trg_AllSinReturn, function Trig_AllSinReturn_Actions )
endfunction

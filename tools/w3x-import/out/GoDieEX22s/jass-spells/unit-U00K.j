// unit rawcode: U00K
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_KOD, AllSinReturn, BadNightSoul, DeathMeteo, NightContract, NightMaster, SAIadd

// === family Open_Skill_of_KOD (armed) events=none ===

// --- Trig_Open_Skill_of_KOD_Conditions (family, line 47967) ---
function Trig_Open_Skill_of_KOD_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_KOD_Actions (family, line 47974) ---
function Trig_Open_Skill_of_KOD_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    set udg_KingOfDeath = GetTriggerUnit()
    set udg_IsDay = true
    call CreateNUnitsAtLoc( 1, 'h011', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_KOD), bj_UNIT_FACING )
    set udg_NightContractUnit = GetLastCreatedUnit()
    set udg_DiekingAcc = 0
    set udg_DiekingLevel = 1
    call EnableTrigger( gg_trg_NightContract )
    call EnableTrigger( gg_trg_DeathMeteo )
    call EnableTrigger( gg_trg_BadNightSoul )
    call EnableTrigger( gg_trg_AllSinReturn )
    call EnableTrigger( gg_trg_SAIadd )
    call EnableTrigger( gg_trg_NightMaster )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "死之王: 我是可愛又迷人的反派角色^.<" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_KOD (family, line 47993) ---
function InitTrig_Open_Skill_of_KOD takes nothing returns nothing
    set gg_trg_Open_Skill_of_KOD = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_KOD, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_KOD, Condition( function Trig_Open_Skill_of_KOD_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_KOD, function Trig_Open_Skill_of_KOD_Actions )
endfunction

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

// === family BadNightSoul (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BadNightSoul_Conditions (family, line 48194) ---
function Trig_BadNightSoul_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0HJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BadNightSoul_Func003C (family, line 48201) ---
function Trig_BadNightSoul_Func003C takes nothing returns boolean
    if ( not ( udg_IsDay == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BadNightSoul_Actions (family, line 48208) ---
function Trig_BadNightSoul_Actions takes nothing returns nothing
    set udg_KingOfDeath = GetTriggerUnit()
    if ( Trig_BadNightSoul_Func003C() ) then
        call UnitAddAbilityBJ( 'A0HL', udg_NightContractUnit )
    else
        call DoNothing(  )
    endif
    call PlaySoundOnUnitBJ( gg_snd_Parasite, 100, GetTriggerUnit() )
    call TriggerSleepAction( 3.00 )
    call UnitRemoveAbilityBJ( 'A0HL', udg_NightContractUnit )
endfunction

// --- InitTrig_BadNightSoul (family, line 48221) ---
function InitTrig_BadNightSoul takes nothing returns nothing
    set gg_trg_BadNightSoul = CreateTrigger(  )
    call DisableTrigger( gg_trg_BadNightSoul )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BadNightSoul, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BadNightSoul, Condition( function Trig_BadNightSoul_Conditions ) )
    call TriggerAddAction( gg_trg_BadNightSoul, function Trig_BadNightSoul_Actions )
endfunction

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

// === family NightContract (armed) events=none ===

// --- Trig_NightContract_Func001Func001C (family, line 48042) ---
function Trig_NightContract_Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'h010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NightContract_Func001C (family, line 48049) ---
function Trig_NightContract_Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'h011' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NightContract_Actions (family, line 48056) ---
function Trig_NightContract_Actions takes nothing returns nothing
    if ( Trig_NightContract_Func001C() ) then
        set udg_IsDay = false
        set udg_NightContractUnit = GetTriggerUnit()
    else
        if ( Trig_NightContract_Func001Func001C() ) then
            set udg_IsDay = true
            set udg_NightContractUnit = GetTriggerUnit()
        else
            call DoNothing(  )
        endif
    endif
endfunction

// --- InitTrig_NightContract (family, line 48071) ---
function InitTrig_NightContract takes nothing returns nothing
    set gg_trg_NightContract = CreateTrigger(  )
    call DisableTrigger( gg_trg_NightContract )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NightContract, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddAction( gg_trg_NightContract, function Trig_NightContract_Actions )
endfunction

// === family NightMaster (armed) events=none ===

// --- Trig_NightMaster_Func008C (family, line 48003) ---
function Trig_NightMaster_Func008C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00K' ) ) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NightMaster_Conditions (family, line 48013) ---
function Trig_NightMaster_Conditions takes nothing returns boolean
    if ( not Trig_NightMaster_Func008C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_NightMaster_Actions (family, line 48020) ---
function Trig_NightMaster_Actions takes nothing returns nothing
    set udg_Immediately_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), udg_Immediately_P1, bj_UNIT_FACING )
    call UnitAddItemByIdSwapped( 'moon', GetLastCreatedUnit() )
    call UnitUseItem( GetLastCreatedUnit(), GetLastCreatedItem() )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    call RemoveLocation( udg_Immediately_P1 )
endfunction

// --- InitTrig_NightMaster (family, line 48031) ---
function InitTrig_NightMaster takes nothing returns nothing
    set gg_trg_NightMaster = CreateTrigger(  )
    call DisableTrigger( gg_trg_NightMaster )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NightMaster, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_NightMaster, Condition( function Trig_NightMaster_Conditions ) )
    call TriggerAddAction( gg_trg_NightMaster, function Trig_NightMaster_Actions )
endfunction

// === family SAIadd (passive) events=EVENT_PLAYER_UNIT_DEATH ===

// --- Trig_SAIadd_Conditions (family, line 48306) ---
function Trig_SAIadd_Conditions takes nothing returns boolean
    if ( not ( GetKillingUnitBJ() == udg_KingOfDeath ) ) then
        return false
    endif
    if ( not ( GetUnitAbilityLevelSwapped('A08T', udg_KingOfDeath) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SAIadd_Func006C (family, line 48316) ---
function Trig_SAIadd_Func006C takes nothing returns boolean
    if ( not ( udg_DiekingAcc <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SAIadd_Actions (family, line 48323) ---
function Trig_SAIadd_Actions takes nothing returns nothing
    set udg_DiekingAcc = ( udg_DiekingAcc + 1 )
    set udg_DiekingLevel = ( IMinBJ(10, udg_DiekingAcc) * GetUnitAbilityLevelSwapped('A08T', udg_KingOfDeath) )
    call SetUnitAbilityLevelSwapped( 'A0RC', udg_KingOfDeath, udg_DiekingLevel )
    call TriggerSleepAction( 20.00 )
    set udg_DiekingAcc = ( udg_DiekingAcc - 1 )
    if ( Trig_SAIadd_Func006C() ) then
        set udg_DiekingLevel = 0
    else
        set udg_DiekingLevel = ( IMinBJ(10, udg_DiekingAcc) * GetUnitAbilityLevelSwapped('A08T', udg_KingOfDeath) )
    endif
    call SetUnitAbilityLevelSwapped( 'A0RC', udg_KingOfDeath, udg_DiekingLevel )
endfunction

// --- InitTrig_SAIadd (family, line 48338) ---
function InitTrig_SAIadd takes nothing returns nothing
    set gg_trg_SAIadd = CreateTrigger(  )
    call DisableTrigger( gg_trg_SAIadd )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SAIadd, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_SAIadd, Condition( function Trig_SAIadd_Conditions ) )
    call TriggerAddAction( gg_trg_SAIadd, function Trig_SAIadd_Actions )
endfunction

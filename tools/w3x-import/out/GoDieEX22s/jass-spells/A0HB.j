// rawcode: A0HB
// nameZh: 21-04 討滅封絕
// w3a base: ACro  levels: 3
// cooldown: {"1": 75.0, "2": 75.0, "3": 75.0}
// mana: {"1": 200, "2": 350, "3": 500}
// area: {"1": 1.0, "2": 1.0, "3": 1.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: CloseDest, CloseDestAddAb

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

// === family CloseDestAddAb (passive) events=EVENT_PLAYER_UNIT_DEATH ===

// --- Trig_CloseDestAddAb_Func003C (family, line 33064) ---
function Trig_CloseDestAddAb_Func003C takes nothing returns boolean
    if ( not ( IsUnitType(GetDyingUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetKillingUnitBJ()) == 'E008' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CloseDestAddAb_Conditions (family, line 33074) ---
function Trig_CloseDestAddAb_Conditions takes nothing returns boolean
    if ( not Trig_CloseDestAddAb_Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_CloseDestAddAb_Actions (family, line 33081) ---
function Trig_CloseDestAddAb_Actions takes nothing returns nothing
    call SetUnitLifePercentBJ( GetKillingUnitBJ(), 100 )
    call SetUnitManaPercentBJ( GetKillingUnitBJ(), 100 )
    call ModifyHeroStat( bj_HEROSTAT_STR, GetKillingUnitBJ(), bj_MODIFYMETHOD_ADD, GetUnitAbilityLevelSwapped('A0HB', GetKillingUnitBJ()) )
    call ModifyHeroStat( bj_HEROSTAT_STR, GetKillingUnitBJ(), bj_MODIFYMETHOD_ADD, 1 )
    call ModifyHeroStat( bj_HEROSTAT_AGI, GetKillingUnitBJ(), bj_MODIFYMETHOD_ADD, GetUnitAbilityLevelSwapped('A0HB', GetKillingUnitBJ()) )
    call ModifyHeroStat( bj_HEROSTAT_AGI, GetKillingUnitBJ(), bj_MODIFYMETHOD_ADD, 1 )
    call ModifyHeroStat( bj_HEROSTAT_INT, GetKillingUnitBJ(), bj_MODIFYMETHOD_ADD, GetUnitAbilityLevelSwapped('A0HB', GetKillingUnitBJ()) )
    call ModifyHeroStat( bj_HEROSTAT_INT, GetKillingUnitBJ(), bj_MODIFYMETHOD_ADD, 1 )
    call CreateTextTagUnitBJ( "TRIGSTR_164", GetKillingUnitBJ(), -30.00, 8.00, 100, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 10.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetDyingUnit()), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PlaySoundOnUnitBJ( gg_snd_SoulPreservation, 100.00, GetKillingUnitBJ() )
endfunction

// --- InitTrig_CloseDestAddAb (family, line 33101) ---
function InitTrig_CloseDestAddAb takes nothing returns nothing
    set gg_trg_CloseDestAddAb = CreateTrigger(  )
    call DisableTrigger( gg_trg_CloseDestAddAb )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CloseDestAddAb, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_CloseDestAddAb, Condition( function Trig_CloseDestAddAb_Conditions ) )
    call TriggerAddAction( gg_trg_CloseDestAddAb, function Trig_CloseDestAddAb_Actions )
endfunction

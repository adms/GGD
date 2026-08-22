// rawcode: A04R
// nameZh: 04-03 龍破斬
// w3a base: ANc1  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 230, "2": 395, "3": 560, "4": 725}
// range: {"1": 900.0, "2": 900.0, "3": 900.0, "4": 900.0}
// area: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DragonSlaveSet, Fire_NOVA

// === family DragonSlaveSet (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DragonSlaveSet_Conditions (family, line 29937) ---
function Trig_DragonSlaveSet_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A04R' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveSet_Func008C (family, line 29944) ---
function Trig_DragonSlaveSet_Func008C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H020' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonSlaveSet_Actions (family, line 29951) ---
function Trig_DragonSlaveSet_Actions takes nothing returns nothing
    set udg_DragonSlaverCaster = GetTriggerUnit()
    set udg_DrganSlaveCastPoint = GetSpellTargetLoc()
    set udg_DrganSlaveMovePoint = GetUnitLoc(GetTriggerUnit())
    set udg_DrgaonSlaveFacing = AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), udg_DrganSlaveCastPoint)
    set udg_DrgaonSlaveCounter = 0
    set udg_DragonSlaverDamage = ( ( I2R(GetUnitAbilityLevelSwapped('A04R', udg_DragonSlaverCaster)) * 500.00 ) + 200.00 )
    if ( Trig_DragonSlaveSet_Func008C() ) then
        set udg_DragonSlaverDamage = ( udg_DragonSlaverDamage + I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 7 )) )
    else
    endif
    call CreateNUnitsAtLoc( 1, 'h013', GetOwningPlayer(GetTriggerUnit()), udg_DrganSlaveMovePoint, udg_DrgaonSlaveFacing )
    set udg_DragonSlaveUnit2 = GetLastCreatedUnit()
    call SetUnitScalePercent( udg_DragonSlaveUnit2, 230.00, 230.00, 230.00 )
    call GroupClear( udg_DragonSlaveGroup )
    call AddSpecialEffectTargetUnitBJ( "chest ", GetTriggerUnit(), "Abilities\\Spells\\Other\\Doom\\DoomTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call EnableTrigger( gg_trg_DragonSlaveMove )
endfunction

// --- InitTrig_DragonSlaveSet (family, line 29972) ---
function InitTrig_DragonSlaveSet takes nothing returns nothing
    set gg_trg_DragonSlaveSet = CreateTrigger(  )
    call DisableTrigger( gg_trg_DragonSlaveSet )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DragonSlaveSet, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DragonSlaveSet, Condition( function Trig_DragonSlaveSet_Conditions ) )
    call TriggerAddAction( gg_trg_DragonSlaveSet, function Trig_DragonSlaveSet_Actions )
endfunction

// === family Fire_NOVA (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Fire_NOVA_Conditions (family, line 29886) ---
function Trig_Fire_NOVA_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A04R' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Fire_NOVA_Actions (family, line 29893) ---
function Trig_Fire_NOVA_Actions takes nothing returns nothing
    call CreateTextTagUnitBJ( "TRIGSTR_3337", GetTriggerUnit(), -30.00, 18.00, 100, 0.00, 0.00, 40.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 0.50 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.50 )
    call TriggerSleepAction( 0.20 )
    call CreateTextTagUnitBJ( "TRIGSTR_3598", GetTriggerUnit(), -30.00, 18.00, 100, 0.00, 0.00, 40.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 0.50 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.50 )
    call TriggerSleepAction( 0.20 )
    call CreateTextTagUnitBJ( "TRIGSTR_3599", GetTriggerUnit(), -30.00, 18.00, 100, 0.00, 0.00, 40.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 0.50 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.50 )
    call TriggerSleepAction( 0.20 )
    call CreateTextTagUnitBJ( "TRIGSTR_3600", GetTriggerUnit(), -30.00, 18.00, 100, 0.00, 0.00, 40.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 0.50 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.50 )
    call TriggerSleepAction( 0.20 )
    call CreateTextTagUnitBJ( "TRIGSTR_3601", GetTriggerUnit(), -30.00, 18.00, 100, 0.00, 0.00, 40.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 0.50 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 0.50 )
endfunction

// --- InitTrig_Fire_NOVA (family, line 29926) ---
function InitTrig_Fire_NOVA takes nothing returns nothing
    set gg_trg_Fire_NOVA = CreateTrigger(  )
    call DisableTrigger( gg_trg_Fire_NOVA )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Fire_NOVA, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Fire_NOVA, Condition( function Trig_Fire_NOVA_Conditions ) )
    call TriggerAddAction( gg_trg_Fire_NOVA, function Trig_Fire_NOVA_Actions )
endfunction

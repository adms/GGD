// rawcode: A0LB
// nameZh: 81-02 Acxel Shooter
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0}
// mana: {"1": 180, "2": 220, "3": 260, "4": 405}
// area: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 350.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AcxelShooter

// === family AcxelShooter (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AcxelShooter_Conditions (family, line 35801) ---
function Trig_AcxelShooter_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0LB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AcxelShooter_Func006C (family, line 35808) ---
function Trig_AcxelShooter_Func006C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O02V' ) ) then
        return false
    endif
    if ( not ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) >= 150.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AcxelShooter_Func014A (family, line 35818) ---
function Trig_AcxelShooter_Func014A takes nothing returns nothing
    call SetUnitPositionLoc( GetEnumUnit(), GetRandomLocInRect(RectFromCenterSizeBJ(udg_Nanoha_AS_Point, 300.00, 300.00)) )
endfunction

// --- Trig_AcxelShooter_Func016A (family, line 35822) ---
function Trig_AcxelShooter_Func016A takes nothing returns nothing
    call SetUnitPositionLoc( GetEnumUnit(), GetRandomLocInRect(RectFromCenterSizeBJ(udg_Nanoha_AS_Target, 150.00, 150.00)) )
endfunction

// --- Trig_AcxelShooter_Func019Func001Func001C (family, line 35826) ---
function Trig_AcxelShooter_Func019Func001Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Nanoha_Hero)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AcxelShooter_Func019Func001C (family, line 35836) ---
function Trig_AcxelShooter_Func019Func001C takes nothing returns boolean
    if ( not Trig_AcxelShooter_Func019Func001Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_AcxelShooter_Func019A (family, line 35843) ---
function Trig_AcxelShooter_Func019A takes nothing returns nothing
    if ( Trig_AcxelShooter_Func019Func001C() ) then
        call UnitDamageTargetBJ( udg_Nanoha_Hero, GetEnumUnit(), udg_Nanoha_AS_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Human\\FlakCannons\\FlakTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_AcxelShooter_Func022A (family, line 35853) ---
function Trig_AcxelShooter_Func022A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AcxelShooter_Func023A (family, line 35858) ---
function Trig_AcxelShooter_Func023A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AcxelShooter_Actions (family, line 35863) ---
function Trig_AcxelShooter_Actions takes nothing returns nothing
    set udg_Nanoha_AS_Skill = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_Nanoha_AS_Target = GetSpellTargetLoc()
    set udg_Nanoha_Hero = GetTriggerUnit()
    set udg_Nanoha_AS_Point = GetUnitLoc(GetTriggerUnit())
    set udg_Nanoha_AS_Damage = ( 125.00 + ( ( I2R(udg_Nanoha_AS_Skill) * 125.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_Nanoha_Hero, true)) * 3.00 ) ) )
    if ( Trig_AcxelShooter_Func006C() ) then
        call SetUnitManaBJ( GetTriggerUnit(), ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) - 150.00 ) )
        set udg_Nanoha_AS_Damage = ( udg_Nanoha_AS_Damage + ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * 4.00 ) )
    else
    endif
    set udg_Nanoha_AS_Counter = 1
    loop
        exitwhen udg_Nanoha_AS_Counter > ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 3 )
        call CreateNUnitsAtLoc( 1, 'o023', GetOwningPlayer(GetTriggerUnit()), udg_Nanoha_AS_Point, GetUnitFacing(GetTriggerUnit()) )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_Nanoha_AS_Group )
        set udg_Nanoha_AS_Counter = udg_Nanoha_AS_Counter + 1
    endloop
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "MidchilderNanohaAura.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Human\\MarkOfChaos\\MarkOfChaosTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PlaySoundOnUnitBJ( gg_snd_DefendCaster, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( 0.05 )
    call ForGroupBJ( udg_Nanoha_AS_Group, function Trig_AcxelShooter_Func014A )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_Nanoha_AS_Group, function Trig_AcxelShooter_Func016A )
    call AddSpecialEffectLocBJ( udg_Nanoha_AS_Target, "Abilities\\Spells\\Other\\Incinerate\\FireLordDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_Nanoha_AS_Target, 400.00, 400.00)), function Trig_AcxelShooter_Func019A )
    call PlaySoundOnUnitBJ( gg_snd_FlareTarget3, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_Nanoha_AS_Group, function Trig_AcxelShooter_Func022A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Nanoha_Hero), 'o023'), function Trig_AcxelShooter_Func023A )
    call GroupClear( udg_Nanoha_AS_Group )
endfunction

// --- InitTrig_AcxelShooter (family, line 35901) ---
function InitTrig_AcxelShooter takes nothing returns nothing
    set gg_trg_AcxelShooter = CreateTrigger(  )
    call DisableTrigger( gg_trg_AcxelShooter )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AcxelShooter, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_AcxelShooter, Condition( function Trig_AcxelShooter_Conditions ) )
    call TriggerAddAction( gg_trg_AcxelShooter, function Trig_AcxelShooter_Actions )
endfunction

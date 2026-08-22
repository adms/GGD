// rawcode: A0XO
// nameZh: 81-04 Starlight Breaker Plus
// w3a base: ANin  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 250, "2": 400, "3": 550}
// range: {"1": 400.0, "2": 400.0, "3": 400.0}
// area: {"1": 500.0, "2": 500.0, "3": 500.0}
// duration: {"1": 1.0, "2": 1.5, "3": 2.0}
// hero_duration: {"1": 1.0, "2": 1.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: StarlightBreakerPlus

// === family StarlightBreakerPlus (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_StarlightBreakerPlus_Conditions (family, line 36095) ---
function Trig_StarlightBreakerPlus_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0XO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StarlightBreakerPlus_Func004C (family, line 36102) ---
function Trig_StarlightBreakerPlus_Func004C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O02V' ) ) then
        return false
    endif
    if ( not ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) >= 150.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StarlightBreakerPlus_Func013A (family, line 36112) ---
function Trig_StarlightBreakerPlus_Func013A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 25.00 )
endfunction

// --- Trig_StarlightBreakerPlus_Func015Func001C (family, line 36116) ---
function Trig_StarlightBreakerPlus_Func015Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Nanoha_Hero)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StarlightBreakerPlus_Func015A (family, line 36126) ---
function Trig_StarlightBreakerPlus_Func015A takes nothing returns nothing
    if ( Trig_StarlightBreakerPlus_Func015Func001C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( udg_Nanoha_Hero, GetEnumUnit(), udg_Nanoha_SLB_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_StarlightBreakerPlus_Actions (family, line 36136) ---
function Trig_StarlightBreakerPlus_Actions takes nothing returns nothing
    set udg_Nanoha_Hero = GetTriggerUnit()
    set udg_Nanoha_SLB_TargetP = GetSpellTargetLoc()
    set udg_Nanoha_SLB_Damage = ( ( 100.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 300 )) ) + 0.00 )
    if ( Trig_StarlightBreakerPlus_Func004C() ) then
        call SetUnitManaBJ( GetTriggerUnit(), ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) - 150.00 ) )
        set udg_Nanoha_SLB_Damage = ( udg_Nanoha_SLB_Damage + ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * 4.00 ) )
    else
    endif
    call CreateNUnitsAtLoc( 1, 'h01Y', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 150.00, GetUnitFacing(GetTriggerUnit())), GetUnitFacing(GetTriggerUnit()) )
    set udg_Nanoha_DBE_Unit = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'h01Z', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), GetUnitFacing(GetTriggerUnit()) )
    set udg_Nanoha_DBE_Unit2 = GetLastCreatedUnit()
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PlaySoundOnUnitBJ( gg_snd_SnapDragonMissileLaunch1, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_SoulGem, 100.00, GetTriggerUnit() )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_Nanoha_DBE_Position, 1600.00, 1600.00)), function Trig_StarlightBreakerPlus_Func013A )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(530.00, udg_Nanoha_SLB_TargetP), function Trig_StarlightBreakerPlus_Func015A )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 1.60 )
    call KillUnit( udg_Nanoha_DBE_Unit )
    call RemoveUnit( udg_Nanoha_DBE_Unit )
    call KillUnit( udg_Nanoha_DBE_Unit2 )
    call RemoveUnit( udg_Nanoha_DBE_Unit2 )
endfunction

// --- InitTrig_StarlightBreakerPlus (family, line 36171) ---
function InitTrig_StarlightBreakerPlus takes nothing returns nothing
    set gg_trg_StarlightBreakerPlus = CreateTrigger(  )
    call DisableTrigger( gg_trg_StarlightBreakerPlus )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_StarlightBreakerPlus, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_StarlightBreakerPlus, Condition( function Trig_StarlightBreakerPlus_Conditions ) )
    call TriggerAddAction( gg_trg_StarlightBreakerPlus, function Trig_StarlightBreakerPlus_Actions )
endfunction

// rawcode: A0UE
// nameZh: 53-04 暴爆咒
// w3a base: APsa  levels: 3
// cooldown: {"2": 60.0, "3": 60.0}
// mana: {"1": 300, "2": 420, "3": 540}
// area: {"1": 10.0, "2": 10.0, "3": 10.0}
// duration: {"1": 5.0, "2": 5.0, "3": 5.0}
// hero_duration: {"1": 5.0, "2": 5.0, "3": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AnKiMagic, AnKiMagic_Effect

// === family AnKiMagic (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AnKiMagic_Conditions (family, line 39954) ---
function Trig_AnKiMagic_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0UE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Func004Func004Func001C (family, line 39961) ---
function Trig_AnKiMagic_Func004Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_KaoUnit)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Func004Func004A (family, line 39968) ---
function Trig_AnKiMagic_Func004Func004A takes nothing returns nothing
    if ( Trig_AnKiMagic_Func004Func004Func001C() ) then
        set udg_SumOfSinMagic = ( udg_SumOfSinMagic + GetUnitStateSwap(UNIT_STATE_MANA, GetEnumUnit()) )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Undead\\Darksummoning\\DarkSummonTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_AnKiMagic_Func004C (family, line 39977) ---
function Trig_AnKiMagic_Func004C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_KaoUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Actions (family, line 39984) ---
function Trig_AnKiMagic_Actions takes nothing returns nothing
    set udg_KaoUnit = GetTriggerUnit()
    set udg_KaoIndex = 0.00
    set udg_KaoAngle = GetUnitFacing(GetTriggerUnit())
    if ( Trig_AnKiMagic_Func004C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", udg_KaoUnit, "Abilities\\Spells\\Undead\\DeathCoil\\DeathCoilMissile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SumOfSinMagic = 0.00
        call ForGroupBJ( GetUnitsInRangeOfLocAll(1200.00, GetUnitLoc(udg_KaoUnit)), function Trig_AnKiMagic_Func004Func004A )
        set udg_SumOfSinMagic = ( udg_SumOfSinMagic * 0.03 )
    else
    endif
    call EnableTrigger( gg_trg_AnKiMagic_Effect )
endfunction

// --- InitTrig_AnKiMagic (family, line 40000) ---
function InitTrig_AnKiMagic takes nothing returns nothing
    set gg_trg_AnKiMagic = CreateTrigger(  )
    call DisableTrigger( gg_trg_AnKiMagic )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AnKiMagic, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_AnKiMagic, Condition( function Trig_AnKiMagic_Conditions ) )
    call TriggerAddAction( gg_trg_AnKiMagic, function Trig_AnKiMagic_Actions )
endfunction

// === family AnKiMagic_Effect (passive) events=none ===

// --- Trig_AnKiMagic_Effect_Func006Func001Func007C (family, line 40011) ---
function Trig_AnKiMagic_Effect_Func006Func001Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_KaoUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Effect_Func006Func001C (family, line 40018) ---
function Trig_AnKiMagic_Effect_Func006Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_KaoUnit)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Effect_Func006A (family, line 40031) ---
function Trig_AnKiMagic_Effect_Func006A takes nothing returns nothing
    if ( Trig_AnKiMagic_Effect_Func006Func001C() ) then
        set udg_AnKiMagixDamage = ( 200.00 + ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_KaoUnit, true)) * ( 0.00 + ( 1 * I2R(GetUnitAbilityLevelSwapped('A0UE', udg_KaoUnit)) ) ) ) )
        set udg_AnKiMagixDamage = ( udg_AnKiMagixDamage * ( 0.50 + ( 0.10 * udg_KaoIndex ) ) )
        call UnitDamageTargetBJ( udg_KaoUnit, GetEnumUnit(), udg_AnKiMagixDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Other\\Doom\\DoomDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        if ( Trig_AnKiMagic_Effect_Func006Func001Func007C() ) then
            call UnitDamageTargetBJ( udg_KaoUnit, GetEnumUnit(), udg_SumOfSinMagic, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call PlaySoundOnUnitBJ( gg_snd_Taunt, 100, GetEnumUnit() )
            call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call CreateTextTagUnitBJ( ( I2S(R2I(udg_SumOfSinMagic)) + "!" ), GetEnumUnit(), -30.00, 10.00, 80.00, 10.00, 10.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        else
        endif
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_AnKiMagic_Effect_Func009Func004A (family, line 40057) ---
function Trig_AnKiMagic_Effect_Func009Func004A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AnKiMagic_Effect_Func009C (family, line 40062) ---
function Trig_AnKiMagic_Effect_Func009C takes nothing returns boolean
    if ( not ( udg_KaoIndex >= 10 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Effect_Actions (family, line 40069) ---
function Trig_AnKiMagic_Effect_Actions takes nothing returns nothing
    set udg_P1 = PolarProjectionBJ(GetUnitLoc(udg_KaoUnit), 300.00, ( udg_KaoAngle + ( 36.00 * udg_KaoIndex ) ))
    call CreateNUnitsAtLoc( 1, 'o00M', GetOwningPlayer(udg_KaoUnit), udg_P1, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(275.00, GetUnitLoc(GetLastCreatedUnit())), function Trig_AnKiMagic_Effect_Func006A )
    call RemoveLocation( udg_P1 )
    set udg_KaoIndex = ( udg_KaoIndex + 1 )
    if ( Trig_AnKiMagic_Effect_Func009C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call TriggerSleepAction( 2.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_KaoUnit), 'o00M'), function Trig_AnKiMagic_Effect_Func009Func004A )
    else
    endif
endfunction

// --- InitTrig_AnKiMagic_Effect (family, line 40087) ---
function InitTrig_AnKiMagic_Effect takes nothing returns nothing
    set gg_trg_AnKiMagic_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_AnKiMagic_Effect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_AnKiMagic_Effect, 0.35 )
    call TriggerAddAction( gg_trg_AnKiMagic_Effect, function Trig_AnKiMagic_Effect_Actions )
endfunction

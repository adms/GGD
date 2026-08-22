// unit rawcode: U034
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: XHunter, XHunterStone_Effect

// === family XHunter (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_XHunter_Conditions (family, line 27154) ---
function Trig_XHunter_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U034' ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttackedUnitBJ()), GetOwningPlayer(GetAttacker())) == false ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 5) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func016C (family, line 27170) ---
function Trig_XHunter_Func005Func016C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetAttackedUnitBJ(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func018Func005Func001C (family, line 27177) ---
function Trig_XHunter_Func005Func018Func005Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_JayUnit)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func018Func005A (family, line 27190) ---
function Trig_XHunter_Func005Func018Func005A takes nothing returns nothing
    if ( Trig_XHunter_Func005Func018Func005Func001C() ) then
        call UnitDamageTargetBJ( udg_JayUnit, GetEnumUnit(), udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- Trig_XHunter_Func005Func018Func011C (family, line 27197) ---
function Trig_XHunter_Func005Func018Func011C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_JayUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func018Func022C (family, line 27204) ---
function Trig_XHunter_Func005Func018Func022C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_JayUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005Func018C (family, line 27211) ---
function Trig_XHunter_Func005Func018C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 2) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func005C (family, line 27218) ---
function Trig_XHunter_Func005C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= ( 5 + R2I(( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetAttacker(), true)) / 10.00 )) ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunter_Func009A (family, line 27225) ---
function Trig_XHunter_Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_XHunter_Actions (family, line 27230) ---
function Trig_XHunter_Actions takes nothing returns nothing
    set udg_JayUnit = GetAttacker()
    set udg_JayCastedUnit = GetAttackedUnitBJ()
    set udg_Gon_P1 = GetUnitLoc(udg_JayUnit)
    set udg_Gon_P2 = GetUnitLoc(udg_JayCastedUnit)
    if ( Trig_XHunter_Func005C() ) then
        // 石頭
        set udg_Gon_Stone_Damage = ( 350.00 + ( 150.00 * I2R(GetUnitAbilityLevelSwapped('A020', udg_JayUnit)) ) )
        set udg_KnockBack_Index = 0
        set udg_KnockBack_Target = udg_JayCastedUnit
        set udg_P1 = GetUnitLoc(udg_JayUnit)
        set udg_P2 = GetUnitLoc(udg_JayCastedUnit)
        set udg_KnockBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
        call RemoveLocation( udg_P1 )
        call RemoveLocation( udg_P2 )
        call UnitDamageTargetBJ( udg_JayUnit, udg_JayCastedUnit, udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call CreateTextTagUnitBJ( ( ( "石頭 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), udg_JayUnit, -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        if ( Trig_XHunter_Func005Func016C() ) then
            call EnableTrigger( gg_trg_XHunterStone_Effect )
        else
        endif
        call PlaySoundOnUnitBJ( gg_snd_MortarTeamPissed9, 100.00, udg_JayUnit )
    else
        if ( Trig_XHunter_Func005Func018C() ) then
            // 剪刀
            set udg_Gon_Stone_Damage = ( 250.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A08W', udg_JayUnit)) ) )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_JayCastedUnit, "HeroCloudCyd.mdx" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call UnitDamageTargetBJ( udg_JayUnit, udg_JayCastedUnit, udg_Gon_Stone_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call CreateTextTagUnitBJ( ( ( "剪刀 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), udg_JayUnit, -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            if ( Trig_XHunter_Func005Func018Func022C() ) then
                call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_JayUnit), udg_Gon_P1, udg_Gon_P2 )
                call ShowUnitHide( GetLastCreatedUnit() )
                call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                call UnitAddAbilityBJ( 'A0NP', GetLastCreatedUnit() )
                call IssueTargetOrderBJ( GetLastCreatedUnit(), "acidbomb", udg_JayCastedUnit )
            else
            endif
        else
            // 布
            set udg_Gon_Stone_Damage = ( 225.00 + ( 75.00 * I2R(GetUnitAbilityLevelSwapped('A08X', udg_JayUnit)) ) )
            call AddSpecialEffectLocBJ( udg_Gon_P2, "Units\\NightElf\\Wisp\\WispExplode.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call ForGroupBJ( GetUnitsInRangeOfLocAll(270.00, udg_Gon_P2), function Trig_XHunter_Func005Func018Func005A )
            call CreateTextTagUnitBJ( ( ( "布 " + I2S(R2I(udg_Gon_Stone_Damage)) ) + "!!" ), GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            if ( Trig_XHunter_Func005Func018Func011C() ) then
                call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_JayUnit), udg_Gon_P2, udg_Gon_P1 )
                call ShowUnitHide( GetLastCreatedUnit() )
                call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                call UnitAddAbilityBJ( 'A04W', GetLastCreatedUnit() )
                call IssueImmediateOrderBJ( GetLastCreatedUnit(), "thunderclap" )
            else
            endif
        endif
    endif
    call RemoveLocation(udg_Gon_P1)
    call RemoveLocation(udg_Gon_P2)
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_JayUnit), 'hfoo'), function Trig_XHunter_Func009A )
endfunction

// --- InitTrig_XHunter (family, line 27304) ---
function InitTrig_XHunter takes nothing returns nothing
    set gg_trg_XHunter = CreateTrigger(  )
    call DisableTrigger( gg_trg_XHunter )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_XHunter, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_XHunter, Condition( function Trig_XHunter_Conditions ) )
    call TriggerAddAction( gg_trg_XHunter, function Trig_XHunter_Actions )
endfunction

// === family XHunterStone_Effect (armed) events=none ===

// --- Trig_XHunterStone_Effect_Func008A (family, line 27062) ---
function Trig_XHunterStone_Effect_Func008A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_XHunterStone_Effect_Func009Func007C (family, line 27066) ---
function Trig_XHunterStone_Effect_Func009Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_JayUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Effect_Func009C (family, line 27073) ---
function Trig_XHunterStone_Effect_Func009C takes nothing returns boolean
    if ( not ( DistanceBetweenPoints(udg_P2, udg_P3) > 8.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Effect_Func010Func002C (family, line 27080) ---
function Trig_XHunterStone_Effect_Func010Func002C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_JayUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Effect_Func010C (family, line 27087) ---
function Trig_XHunterStone_Effect_Func010C takes nothing returns boolean
    if ( not ( udg_KnockBack_Index >= 20 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_XHunterStone_Effect_Actions (family, line 27094) ---
function Trig_XHunterStone_Effect_Actions takes nothing returns nothing
    set udg_KnockBack_Index = ( udg_KnockBack_Index + 1 )
    set udg_P1 = GetUnitLoc(udg_KnockBack_Target)
    call AddSpecialEffectLocBJ( udg_P1, "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_P2 = PolarProjectionBJ(udg_P1, 40.00, udg_KnockBack_Angle)
    call SetUnitPositionLoc( udg_KnockBack_Target, udg_P2 )
    set udg_P3 = GetUnitLoc(udg_KnockBack_Target)
    call EnumDestructablesInCircleBJ( 300.00, udg_P3, function Trig_XHunterStone_Effect_Func008A )
    if ( Trig_XHunterStone_Effect_Func009C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call SetUnitPositionLoc( udg_KnockBack_Target, udg_P1 )
        call AddSpecialEffectLocBJ( udg_P1, "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectLocBJ( udg_P2, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        if ( Trig_XHunterStone_Effect_Func009Func007C() ) then
            call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_JayUnit), udg_P1, bj_UNIT_FACING )
            call ShowUnitHide( GetLastCreatedUnit() )
            call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A0SN', GetLastCreatedUnit() )
            call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_JayUnit, "Abilities\\Spells\\Other\\Charm\\CharmTarget.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLoc( udg_JayUnit, udg_P1 )
        else
        endif
    else
    endif
    if ( Trig_XHunterStone_Effect_Func010C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        if ( Trig_XHunterStone_Effect_Func010Func002C() ) then
            call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_JayUnit), udg_P2, bj_UNIT_FACING )
            call ShowUnitHide( GetLastCreatedUnit() )
            call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A0SN', GetLastCreatedUnit() )
            call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_JayUnit, "Abilities\\Spells\\Other\\Charm\\CharmTarget.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLoc( udg_JayUnit, udg_P1 )
        else
        endif
    else
    endif
    call RemoveLocation( udg_P1 )
    call RemoveLocation( udg_P2 )
    call RemoveLocation( udg_P3 )
endfunction

// --- InitTrig_XHunterStone_Effect (family, line 27144) ---
function InitTrig_XHunterStone_Effect takes nothing returns nothing
    set gg_trg_XHunterStone_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_XHunterStone_Effect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_XHunterStone_Effect, 0.04 )
    call TriggerAddAction( gg_trg_XHunterStone_Effect, function Trig_XHunterStone_Effect_Actions )
endfunction

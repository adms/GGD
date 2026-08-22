// unit rawcode: H02K
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Panda, Saber_in_pandaChrysanthemum, Saber_in_pandaDecrease, Saber_in_pandaDie, Saber_in_pandaEX, Saber_in_pandaJizz, Saber_in_pandaLVUp, Saber_in_pandaTree

// === family Open_Skill_of_Panda (armed) events=none ===

// --- Trig_Open_Skill_of_Panda_Conditions (family, line 52310) ---
function Trig_Open_Skill_of_Panda_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H02K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Panda_Actions (family, line 52317) ---
function Trig_Open_Skill_of_Panda_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_Saber_in_pandaLVUp )
    call EnableTrigger( gg_trg_Saber_in_pandaDie )
    call EnableTrigger( gg_trg_Saber_in_pandaJizz )
    call EnableTrigger( gg_trg_Saber_in_pandaEX )
    call EnableTrigger( gg_trg_Saber_in_pandaChrysanthemum )
    call EnableTrigger( gg_trg_Saber_in_pandaDecrease )
    call EnableTrigger( gg_trg_Saber_in_pandaTree )
    set udg_PandaUnit = GetTriggerUnit()
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "熊貓: 喔!喔! 有誰要買菊花?" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Panda (family, line 52332) ---
function InitTrig_Open_Skill_of_Panda takes nothing returns nothing
    set gg_trg_Open_Skill_of_Panda = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Panda, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Panda, Condition( function Trig_Open_Skill_of_Panda_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Panda, function Trig_Open_Skill_of_Panda_Actions )
endfunction

// === family Saber_in_pandaChrysanthemum (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_Saber_in_pandaChrysanthemum_Conditions (family, line 52680) ---
function Trig_Saber_in_pandaChrysanthemum_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttackedUnitBJ()) == 'H02K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func005A (family, line 52687) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func005A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", GetEnumUnit() )
    call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_9436", GetEnumUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call SetUnitManaPercentBJ( GetEnumUnit(), ( GetUnitManaPercent(GetEnumUnit()) * 0.50 ) )
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func018A (family, line 52700) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func019A (family, line 52705) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func020A (family, line 52710) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func022C (family, line 52715) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func022C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= ( GetUnitAbilityLevelSwapped('A0TK', GetAttackedUnitBJ()) * 3 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004C (family, line 52722) ---
function Trig_Saber_in_pandaChrysanthemum_Func004C takes nothing returns boolean
    if ( not ( udg_Panda_AttackedTimes < 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Actions (family, line 52729) ---
function Trig_Saber_in_pandaChrysanthemum_Actions takes nothing returns nothing
    set udg_PandaUnit = GetAttackedUnitBJ()
    set udg_Panda_AttackedTimes = ( udg_Panda_AttackedTimes + 1 )
    call SetUnitVertexColorBJ( GetAttackedUnitBJ(), ( 100.00 - I2R(( udg_Panda_AttackedTimes * 2 )) ), 100, ( 100.00 - I2R(( udg_Panda_AttackedTimes * 5 )) ), 0 )
    if ( Trig_Saber_in_pandaChrysanthemum_Func004C() ) then
        if ( Trig_Saber_in_pandaChrysanthemum_Func004Func022C() ) then
            set udg_P_fire = GetUnitLoc(GetAttacker())
            call CreateNUnitsAtLoc( 1, 'e00F', GetOwningPlayer(GetAttackedUnitBJ()), udg_P_fire, bj_UNIT_FACING )
            call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
            call RemoveUnitSP( GetLastCreatedUnit() , 0.50 , 1.00)
            call RemoveLocation( udg_P_fire )
            call UnitAddAbilityBJ( 'S006', GetLastCreatedUnit() )
            call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetAttacker(), 0 )
            call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", GetAttacker() )
            call PlaySoundOnUnitBJ( gg_snd_PandarenBrewmasterPissed8, 100, GetTriggerUnit() )
            call AddSpecialEffectTargetUnitBJ( "chest", GetAttacker(), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
        endif
    else
        set udg_P_fire = GetUnitLoc(GetAttackedUnitBJ())
        call CreateNUnitsAtLoc( 1, 'e00F', GetOwningPlayer(GetAttackedUnitBJ()), udg_P_fire, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'S006', GetLastCreatedUnit() )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(800.00, udg_P_fire), function Trig_Saber_in_pandaChrysanthemum_Func004Func005A )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_PandaUnit, "Abilities\\Weapons\\GlaiveMissile\\GlaiveMissileTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_PandaUnit, "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_PandaUnit, "Objects\\Spawnmodels\\Demon\\DemonSmallDeathExplode\\DemonSmallDeathExplode.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_PandaUnit, "Objects\\Spawnmodels\\Naga\\NagaBlood\\NagaBloodWindserpent.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call PlaySoundOnUnitBJ( gg_snd_PandarenBrewmasterPissed8, 100, GetTriggerUnit() )
        set udg_Panda_AttackedTimes = 0
        call SetUnitVertexColorBJ( GetDyingUnit(), 100.00, 100, 100.00, 0 )
        call TriggerSleepAction( 3.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PandaUnit), 'e00F'), function Trig_Saber_in_pandaChrysanthemum_Func004Func018A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PandaUnit), 'e00F'), function Trig_Saber_in_pandaChrysanthemum_Func004Func019A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PandaUnit), 'e00F'), function Trig_Saber_in_pandaChrysanthemum_Func004Func020A )
    endif
endfunction

// --- InitTrig_Saber_in_pandaChrysanthemum (family, line 52773) ---
function InitTrig_Saber_in_pandaChrysanthemum takes nothing returns nothing
    set gg_trg_Saber_in_pandaChrysanthemum = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaChrysanthemum )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Saber_in_pandaChrysanthemum, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Saber_in_pandaChrysanthemum, Condition( function Trig_Saber_in_pandaChrysanthemum_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaChrysanthemum, function Trig_Saber_in_pandaChrysanthemum_Actions )
endfunction

// --- RemoveUnitSP (helper, line 4847) ---
function RemoveUnitSP takes unit R_unit , real Life_Time , real Die_Time returns nothing
    local unit Last = bj_lastCreatedUnit
    local real Bj_Timer = bj_enumDestructableRadius
    local real Bj_Rand = bj_randomSubGroupChance
    set bj_lastCreatedUnit = R_unit
    set bj_enumDestructableRadius = Life_Time
    set bj_randomSubGroupChance = Die_Time
    call ExecuteFunc("RemoveUnitSP_Action")
    set bj_lastCreatedUnit = Last
    set bj_enumDestructableRadius = Bj_Timer
    set bj_randomSubGroupChance = Bj_Rand
endfunction

// === family Saber_in_pandaDecrease (armed) events=none ===

// --- Trig_Saber_in_pandaDecrease_Conditions (family, line 52831) ---
function Trig_Saber_in_pandaDecrease_Conditions takes nothing returns boolean
    if ( not ( udg_Panda_AttackedTimes >= 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaDecrease_Actions (family, line 52838) ---
function Trig_Saber_in_pandaDecrease_Actions takes nothing returns nothing
    set udg_Panda_AttackedTimes = ( udg_Panda_AttackedTimes - 1 )
    call SetUnitVertexColorBJ( udg_PandaUnit, ( 100.00 - I2R(( udg_Panda_AttackedTimes * 2 )) ), 100, ( 100.00 - I2R(( udg_Panda_AttackedTimes * 5 )) ), 0 )
endfunction

// --- InitTrig_Saber_in_pandaDecrease (family, line 52844) ---
function InitTrig_Saber_in_pandaDecrease takes nothing returns nothing
    set gg_trg_Saber_in_pandaDecrease = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaDecrease )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Saber_in_pandaDecrease, 1.00 )
    call TriggerAddCondition( gg_trg_Saber_in_pandaDecrease, Condition( function Trig_Saber_in_pandaDecrease_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaDecrease, function Trig_Saber_in_pandaDecrease_Actions )
endfunction

// === family Saber_in_pandaDie (passive) events=EVENT_PLAYER_UNIT_DEATH ===

// --- Trig_Saber_in_pandaDie_Conditions (family, line 52608) ---
function Trig_Saber_in_pandaDie_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H02K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaDie_Func001Func014Func001C (family, line 52615) ---
function Trig_Saber_in_pandaDie_Func001Func014Func001C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 3) == 2 ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaDie_Func001Func014A (family, line 52628) ---
function Trig_Saber_in_pandaDie_Func001Func014A takes nothing returns nothing
    if ( Trig_Saber_in_pandaDie_Func001Func014Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( 1000.00 * I2R(GetUnitAbilityLevelSwapped('A0TN', GetTriggerUnit())) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Units\\Undead\\Abomination\\AbominationExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_Saber_in_pandaDie_Func001C (family, line 52639) ---
function Trig_Saber_in_pandaDie_Func001C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= ( GetUnitAbilityLevelSwapped('A0TN', GetTriggerUnit()) * 4 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaDie_Actions (family, line 52646) ---
function Trig_Saber_in_pandaDie_Actions takes nothing returns nothing
    if ( Trig_Saber_in_pandaDie_Func001C() ) then
        call ReviveHeroLoc( GetTriggerUnit(), GetUnitLoc(GetTriggerUnit()), true )
        call SetUnitLifePercentBJ( GetTriggerUnit(), 100 )
        call PlaySoundOnUnitBJ( gg_snd_PandarenBrewmasterWarcry1, 100, GetTriggerUnit() )
        set udg_Immediately_P1 = GetUnitLoc(GetTriggerUnit())
        call CreateNUnitsAtLoc( 1, 'oshm', GetOwningPlayer(GetTriggerUnit()), udg_Immediately_P1, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "bloodlust", GetTriggerUnit() )
        call UnitAddAbilityBJ( 'A0SR', GetLastCreatedUnit() )
        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
        call ModifyHeroStat( bj_HEROSTAT_INT, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, GetRandomInt(0, 1) )
        call ModifyHeroStat( bj_HEROSTAT_AGI, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, GetRandomInt(0, 1) )
        call ModifyHeroStat( bj_HEROSTAT_STR, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, GetRandomInt(0, 1) )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, GetUnitLoc(GetTriggerUnit())), function Trig_Saber_in_pandaDie_Func001Func014A )
    else
    endif
    set udg_Panda_AttackedTimes = 0
    call SetUnitVertexColorBJ( GetDyingUnit(), 100.00, 100, 100.00, 0 )
endfunction

// --- InitTrig_Saber_in_pandaDie (family, line 52669) ---
function InitTrig_Saber_in_pandaDie takes nothing returns nothing
    set gg_trg_Saber_in_pandaDie = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaDie )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Saber_in_pandaDie, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_Saber_in_pandaDie, Condition( function Trig_Saber_in_pandaDie_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaDie, function Trig_Saber_in_pandaDie_Actions )
endfunction

// === family Saber_in_pandaEX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Saber_in_pandaEX_Conditions (family, line 52855) ---
function Trig_Saber_in_pandaEX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0TU' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Func003Func001Func009C (family, line 52862) ---
function Trig_Saber_in_pandaEX_Func003Func001Func009C takes nothing returns boolean
    if ( not ( GetRandomInt(0, 1) == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Func003Func001C (family, line 52869) ---
function Trig_Saber_in_pandaEX_Func003Func001C takes nothing returns boolean
    if ( not ( udg_PandaRandom == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Func003Func005C (family, line 52876) ---
function Trig_Saber_in_pandaEX_Func003Func005C takes nothing returns boolean
    if ( not ( GetRandomInt(0, 1) == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Func003C (family, line 52883) ---
function Trig_Saber_in_pandaEX_Func003C takes nothing returns boolean
    if ( not ( udg_PandaRandom == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Actions (family, line 52890) ---
function Trig_Saber_in_pandaEX_Actions takes nothing returns nothing
    set udg_PandaRandom = GetRandomInt(1, 6)
    if ( Trig_Saber_in_pandaEX_Func003C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetTriggerUnit(), 99999.00, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
        call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Units\\Undead\\Abomination\\AbominationExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        if ( Trig_Saber_in_pandaEX_Func003Func005C() ) then
            call CreateTextTagUnitBJ( "TRIGSTR_4993", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
        else
            call CreateTextTagUnitBJ( "TRIGSTR_5313", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
        endif
    else
        if ( Trig_Saber_in_pandaEX_Func003Func001C() ) then
            call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), 99999.00, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
            call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Units\\Undead\\Abomination\\AbominationExplosion.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            if ( Trig_Saber_in_pandaEX_Func003Func001Func009C() ) then
                call CreateTextTagUnitBJ( "TRIGSTR_6575", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
                call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
                call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
                call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
                call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            else
                call CreateTextTagUnitBJ( "TRIGSTR_6574", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
                call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
                call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
                call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
                call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            endif
        else
            call CreateTextTagUnitBJ( "TRIGSTR_6576", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        endif
    endif
endfunction

// --- InitTrig_Saber_in_pandaEX (family, line 52952) ---
function InitTrig_Saber_in_pandaEX takes nothing returns nothing
    set gg_trg_Saber_in_pandaEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Saber_in_pandaEX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Saber_in_pandaEX, Condition( function Trig_Saber_in_pandaEX_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaEX, function Trig_Saber_in_pandaEX_Actions )
endfunction

// === family Saber_in_pandaJizz (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_Saber_in_pandaJizz_Conditions (family, line 52784) ---
function Trig_Saber_in_pandaJizz_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'H02K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaJizz_Func002Func001A (family, line 52791) ---
function Trig_Saber_in_pandaJizz_Func002Func001A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Saber_in_pandaJizz_Func002C (family, line 52796) ---
function Trig_Saber_in_pandaJizz_Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= GetUnitAbilityLevelSwapped('A0TO', GetAttacker()) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaJizz_Actions (family, line 52803) ---
function Trig_Saber_in_pandaJizz_Actions takes nothing returns nothing
    if ( Trig_Saber_in_pandaJizz_Func002C() ) then
        set udg_Immediately_P1 = GetUnitLoc(GetAttacker())
        call CreateNUnitsAtLoc( 1, 'oshm', GetOwningPlayer(GetAttacker()), udg_Immediately_P1, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "bloodlust", GetAttacker() )
        call UnitAddAbilityBJ( 'A0SR', GetLastCreatedUnit() )
        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
        call RemoveLocation( udg_Immediately_P1 )
        call PlaySoundOnUnitBJ( gg_snd_PandarenBrewmasterYes1, 100, GetAttacker() )
    else
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetAttacker()), 'oshm'), function Trig_Saber_in_pandaJizz_Func002Func001A )
    endif
endfunction

// --- InitTrig_Saber_in_pandaJizz (family, line 52820) ---
function InitTrig_Saber_in_pandaJizz takes nothing returns nothing
    set gg_trg_Saber_in_pandaJizz = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaJizz )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Saber_in_pandaJizz, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Saber_in_pandaJizz, Condition( function Trig_Saber_in_pandaJizz_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaJizz, function Trig_Saber_in_pandaJizz_Actions )
endfunction

// === family Saber_in_pandaLVUp (armed) events=none ===

// --- Trig_Saber_in_pandaLVUp_Conditions (family, line 52582) ---
function Trig_Saber_in_pandaLVUp_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H02K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaLVUp_Actions (family, line 52589) ---
function Trig_Saber_in_pandaLVUp_Actions takes nothing returns nothing
    call ModifyHeroStat( bj_HEROSTAT_STR, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, GetRandomInt(1, 4) )
    call ModifyHeroStat( bj_HEROSTAT_AGI, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, GetRandomInt(1, 2) )
    call ModifyHeroStat( bj_HEROSTAT_INT, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, GetRandomInt(0, 1) )
    call PlaySoundBJ( gg_snd_up )
endfunction

// --- InitTrig_Saber_in_pandaLVUp (family, line 52597) ---
function InitTrig_Saber_in_pandaLVUp takes nothing returns nothing
    set gg_trg_Saber_in_pandaLVUp = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaLVUp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Saber_in_pandaLVUp, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_Saber_in_pandaLVUp, Condition( function Trig_Saber_in_pandaLVUp_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaLVUp, function Trig_Saber_in_pandaLVUp_Actions )
endfunction

// === family Saber_in_pandaTree (armed) events=none ===

// --- Trig_Saber_in_pandaTree_Conditions (family, line 52963) ---
function Trig_Saber_in_pandaTree_Conditions takes nothing returns boolean
    if ( not ( GetUnitLevel(udg_PandaUnit) >= 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaTree_Func002A (family, line 52970) ---
function Trig_Saber_in_pandaTree_Func002A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_Saber_in_pandaTree_Actions (family, line 52974) ---
function Trig_Saber_in_pandaTree_Actions takes nothing returns nothing
    set udg_Immediately_P3 = GetUnitLoc(udg_PandaUnit)
    call EnumDestructablesInCircleBJ( 350.00, udg_Immediately_P3, function Trig_Saber_in_pandaTree_Func002A )
    call RemoveLocation( udg_Immediately_P3)
endfunction

// --- InitTrig_Saber_in_pandaTree (family, line 52981) ---
function InitTrig_Saber_in_pandaTree takes nothing returns nothing
    set gg_trg_Saber_in_pandaTree = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaTree )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Saber_in_pandaTree, 1.00 )
    call TriggerAddCondition( gg_trg_Saber_in_pandaTree, Condition( function Trig_Saber_in_pandaTree_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaTree, function Trig_Saber_in_pandaTree_Actions )
endfunction

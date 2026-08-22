// unit rawcode: H02S
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_DarkKnight, ArmyOfTheDead, CrusadeRune, DeathGrip, HeartStrike, PlagueLV

// === family Open_Skill_of_DarkKnight (armed) events=none ===

// --- Trig_Open_Skill_of_DarkKnight_Conditions (family, line 52992) ---
function Trig_Open_Skill_of_DarkKnight_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H02S' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_DarkKnight_Actions (family, line 52999) ---
function Trig_Open_Skill_of_DarkKnight_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    set udg_DK_DarkKnight = GetTriggerUnit()
    call SetPlayerAbilityAvailableBJ( false, 'A0VX', GetOwningPlayer(GetTriggerUnit()) )
    call EnableTrigger( gg_trg_CrusadeRune )
    call EnableTrigger( gg_trg_DeathGrip )
    call EnableTrigger( gg_trg_PlagueLV )
    call EnableTrigger( gg_trg_HeartStrike )
    call EnableTrigger( gg_trg_ArmyOfTheDead )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "阿薩斯: 幹！寒冰王座好冰，害我一坐下去就jizz四年起不來" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_DarkKnight (family, line 53013) ---
function InitTrig_Open_Skill_of_DarkKnight takes nothing returns nothing
    set gg_trg_Open_Skill_of_DarkKnight = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_DarkKnight, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_DarkKnight, Condition( function Trig_Open_Skill_of_DarkKnight_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_DarkKnight, function Trig_Open_Skill_of_DarkKnight_Actions )
endfunction

// === family ArmyOfTheDead (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ArmyOfTheDead_Conditions (family, line 53377) ---
function Trig_ArmyOfTheDead_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ArmyOfTheDead_Func010Func006C (family, line 53384) ---
function Trig_ArmyOfTheDead_Func010Func006C takes nothing returns boolean
    if ( not ( ModuloInteger(udg_DK_AD_Index, 2) == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ArmyOfTheDead_Actions (family, line 53391) ---
function Trig_ArmyOfTheDead_Actions takes nothing returns nothing
    set udg_DK_P1 = GetSpellTargetLoc()
    // 暈眩
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_DK_P1, bj_UNIT_FACING )
    call UnitAddAbilityBJ( 'A0VT', GetLastCreatedUnit() )
    call ShowUnitHide( GetLastCreatedUnit() )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    // 召喚食屍鬼
    set udg_DK_AD_Index = 1
    loop
        exitwhen udg_DK_AD_Index > 8
        set udg_DK_P2 = PolarProjectionBJ(udg_DK_P1, 450.00, ( 45.00 * I2R(udg_DK_AD_Index) ))
        call AddSpecialEffectLocBJ( udg_DK_P2, "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateNUnitsAtLocFacingLocBJ( 1, 'u031', GetOwningPlayer(GetTriggerUnit()), udg_DK_P2, udg_DK_P1 )
        call UnitApplyTimedLifeBJ( 20.00, 'BTLF', GetLastCreatedUnit() )
        if ( Trig_ArmyOfTheDead_Func010Func006C() ) then
            call IssueImmediateOrderBJ( GetLastCreatedUnit(), "taunt" )
        else
        endif
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "attack", udg_DK_P1 )
        call RemoveLocation( udg_DK_P2 )
        set udg_DK_AD_Index = udg_DK_AD_Index + 1
    endloop
    call RemoveLocation( udg_DK_P1 )
endfunction

// --- InitTrig_ArmyOfTheDead (family, line 53421) ---
function InitTrig_ArmyOfTheDead takes nothing returns nothing
    set gg_trg_ArmyOfTheDead = CreateTrigger(  )
    call DisableTrigger( gg_trg_ArmyOfTheDead )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ArmyOfTheDead, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ArmyOfTheDead, Condition( function Trig_ArmyOfTheDead_Conditions ) )
    call TriggerAddAction( gg_trg_ArmyOfTheDead, function Trig_ArmyOfTheDead_Actions )
endfunction

// === family CrusadeRune (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CrusadeRune_Conditions (family, line 53023) ---
function Trig_CrusadeRune_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CrusadeRune_Actions (family, line 53030) ---
function Trig_CrusadeRune_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0VU', GetTriggerUnit(), 2 )
    call EnableTrigger( gg_trg_CrusadeRune_close )
endfunction

// --- InitTrig_CrusadeRune (family, line 53036) ---
function InitTrig_CrusadeRune takes nothing returns nothing
    set gg_trg_CrusadeRune = CreateTrigger(  )
    call DisableTrigger( gg_trg_CrusadeRune )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CrusadeRune, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CrusadeRune, Condition( function Trig_CrusadeRune_Conditions ) )
    call TriggerAddAction( gg_trg_CrusadeRune, function Trig_CrusadeRune_Actions )
endfunction

// === family DeathGrip (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DeathGrip_Conditions (family, line 53073) ---
function Trig_DeathGrip_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0W3' ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathGrip_Actions (family, line 53083) ---
function Trig_DeathGrip_Actions takes nothing returns nothing
    set udg_DK_DG_Index = ( 8 + ( 8 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) )
    set udg_DK_DG_target = GetSpellTargetUnit()
    call TriggerSleepAction( 0.00 )
    call EnableTrigger( gg_trg_DeathGrip_effect )
endfunction

// --- InitTrig_DeathGrip (family, line 53091) ---
function InitTrig_DeathGrip takes nothing returns nothing
    set gg_trg_DeathGrip = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathGrip )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathGrip, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DeathGrip, Condition( function Trig_DeathGrip_Conditions ) )
    call TriggerAddAction( gg_trg_DeathGrip, function Trig_DeathGrip_Actions )
endfunction

// === family HeartStrike (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HeartStrike_Conditions (family, line 53329) ---
function Trig_HeartStrike_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0W1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeartStrike_Func001C (family, line 53336) ---
function Trig_HeartStrike_Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetSpellTargetUnit(), 'Bapl') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeartStrike_Func002C (family, line 53343) ---
function Trig_HeartStrike_Func002C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetAttackedUnitBJ(), 'B047') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeartStrike_Actions (family, line 53350) ---
function Trig_HeartStrike_Actions takes nothing returns nothing
    if ( Trig_HeartStrike_Func001C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellAbilityUnit(), ( 50.00 + ( 25.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
    if ( Trig_HeartStrike_Func002C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellAbilityUnit(), ( 50.00 + ( 25.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- InitTrig_HeartStrike (family, line 53366) ---
function InitTrig_HeartStrike takes nothing returns nothing
    set gg_trg_HeartStrike = CreateTrigger(  )
    call DisableTrigger( gg_trg_HeartStrike )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HeartStrike, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HeartStrike, Condition( function Trig_HeartStrike_Conditions ) )
    call TriggerAddAction( gg_trg_HeartStrike, function Trig_HeartStrike_Actions )
endfunction

// === family PlagueLV (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_PlagueLV_Conditions (family, line 53129) ---
function Trig_PlagueLV_Conditions takes nothing returns boolean
    if ( not ( GetTriggerUnit() == udg_DK_DarkKnight ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueLV_Func001Func001Func002C (family, line 53136) ---
function Trig_PlagueLV_Func001Func001Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0W4', udg_DK_DarkKnight) >= 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueLV_Func001Func001C (family, line 53143) ---
function Trig_PlagueLV_Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0W4', udg_DK_DarkKnight) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueLV_Func001C (family, line 53150) ---
function Trig_PlagueLV_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0W4', udg_DK_DarkKnight) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueLV_Actions (family, line 53157) ---
function Trig_PlagueLV_Actions takes nothing returns nothing
    if ( Trig_PlagueLV_Func001C() ) then
        call EnableTrigger( gg_trg_PlagueStrike )
    else
        if ( Trig_PlagueLV_Func001Func001C() ) then
            call EnableTrigger( gg_trg_IcyTouch )
        else
            if ( Trig_PlagueLV_Func001Func001Func002C() ) then
                call EnableTrigger( gg_trg_DeathStrike )
                call DisableTrigger( GetTriggeringTrigger() )
            else
            endif
        endif
    endif
endfunction

// --- InitTrig_PlagueLV (family, line 53174) ---
function InitTrig_PlagueLV takes nothing returns nothing
    set gg_trg_PlagueLV = CreateTrigger(  )
    call DisableTrigger( gg_trg_PlagueLV )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PlagueLV, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PlagueLV, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_PlagueLV, Condition( function Trig_PlagueLV_Conditions ) )
    call TriggerAddAction( gg_trg_PlagueLV, function Trig_PlagueLV_Actions )
endfunction

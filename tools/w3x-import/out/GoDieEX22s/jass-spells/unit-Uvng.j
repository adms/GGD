// unit rawcode: Uvng
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Hehi, DarkDragonEX, EatDragon, FireSword, FireSwordAdded, HehiSword

// === family Open_Skill_of_Hehi (armed) events=none ===

// --- Trig_Open_Skill_of_Hehi_Conditions (family, line 43586) ---
function Trig_Open_Skill_of_Hehi_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Uvng' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Hehi_Func013A (family, line 43593) ---
function Trig_Open_Skill_of_Hehi_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Open_Skill_of_Hehi_Func014A (family, line 43598) ---
function Trig_Open_Skill_of_Hehi_Func014A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Open_Skill_of_Hehi_Func015A (family, line 43603) ---
function Trig_Open_Skill_of_Hehi_Func015A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Open_Skill_of_Hehi_Actions (family, line 43608) ---
function Trig_Open_Skill_of_Hehi_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_FireSword )
    call EnableTrigger( gg_trg_FireSwordAdded )
    call EnableTrigger( gg_trg_HehiSword )
    call EnableTrigger( gg_trg_EatDragon )
    call EnableTrigger( gg_trg_DarkDragonEX )
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_Hehi = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o01V', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_SpecialUnitCreateArea), bj_UNIT_FACING )
    call CreateNUnitsAtLoc( 1, 'o010', GetOwningPlayer(udg_Hehi), GetRectCenter(gg_rct_SpecialUnitCreateArea), GetUnitFacing(GetTriggerUnit()) )
    call CreateNUnitsAtLoc( 1, 'o00Z', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_SpecialUnitCreateArea), bj_UNIT_FACING )
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Hehi), 'o01V'), function Trig_Open_Skill_of_Hehi_Func013A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Hehi), 'o00Z'), function Trig_Open_Skill_of_Hehi_Func014A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Hehi), 'o010'), function Trig_Open_Skill_of_Hehi_Func015A )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "飛影: 你跟桑原一樣囉嗦" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Hehi (family, line 43628) ---
function InitTrig_Open_Skill_of_Hehi takes nothing returns nothing
    set gg_trg_Open_Skill_of_Hehi = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Hehi, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Hehi, Condition( function Trig_Open_Skill_of_Hehi_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Hehi, function Trig_Open_Skill_of_Hehi_Actions )
endfunction

// === family DarkDragonEX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DarkDragonEX_Conditions (family, line 44031) ---
function Trig_DarkDragonEX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09I' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEX_Func008Func001C (family, line 44038) ---
function Trig_DarkDragonEX_Func008Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEX_Func008C (family, line 44048) ---
function Trig_DarkDragonEX_Func008C takes nothing returns boolean
    if ( not Trig_DarkDragonEX_Func008Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkDragonEX_Func018A (family, line 44055) ---
function Trig_DarkDragonEX_Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DarkDragonEX_Actions (family, line 44060) ---
function Trig_DarkDragonEX_Actions takes nothing returns nothing
    set udg_DarkDragonCastUnit = GetTriggerUnit()
    set udg_DarkDragonPoint = PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 160.00, GetUnitFacing(GetTriggerUnit()))
    call CreateNUnitsAtLoc( 1, 'h02F', GetOwningPlayer(GetTriggerUnit()), udg_DarkDragonPoint, GetUnitFacing(GetTriggerUnit()) )
    set udg_DarkDragonUnit = GetLastCreatedUnit()
    set udg_DarkDragonMoveSpeed = 130.00
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 10.00 )
    if ( Trig_DarkDragonEX_Func008C() ) then
        set udg_DarkDragonPoint2 = PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 200.00, ( 45.00 + GetUnitFacing(GetTriggerUnit()) ))
        set udg_DarkDragonPoint3 = PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 200.00, ( -45.00 + GetUnitFacing(GetTriggerUnit()) ))
        call CreateNUnitsAtLoc( 1, 'h02F', GetOwningPlayer(GetTriggerUnit()), udg_DarkDragonPoint2, GetUnitFacing(GetTriggerUnit()) )
        set udg_DarkDragonUnit2 = GetLastCreatedUnit()
        call SetUnitTimeScalePercent( GetLastCreatedUnit(), 30.00 )
        call CreateNUnitsAtLoc( 1, 'h02F', GetOwningPlayer(GetTriggerUnit()), udg_DarkDragonPoint3, GetUnitFacing(GetTriggerUnit()) )
        set udg_DarkDragonUnit3 = GetLastCreatedUnit()
        call SetUnitTimeScalePercent( GetLastCreatedUnit(), 30.00 )
    else
    endif
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call GroupClear( udg_DarkDragonGroup )
    set udg_DarkDragonCount = 0
    call EnableTrigger( gg_trg_DarkDragonEXMove )
    set udg_BlackDGP = GetUnitLoc(GetTriggerUnit())
    set udg_Hehi = GetTriggerUnit()
    set udg_BlackDargon = 1
    loop
        exitwhen udg_BlackDargon > 12
        call CreateNUnitsAtLoc( 1, 'o00Z', Player(bj_PLAYER_NEUTRAL_VICTIM), PolarProjectionBJ(udg_BlackDGP, 350.00, ( I2R(udg_BlackDargon) * 30.00 )), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A09M', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A09M', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "clusterrockets", GetUnitLoc(GetLastCreatedUnit()) )
        call EnableTrigger( gg_trg_Closeaeff )
        call PlaySoundOnUnitBJ( gg_snd_ShimmeringPortalDeath, 100, GetTriggerUnit() )
        set udg_BlackDargon = udg_BlackDargon + 1
    endloop
    call PlaySoundOnUnitBJ( gg_snd_DragonYes2, 100.00, udg_AFuUnit )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(Player(bj_PLAYER_NEUTRAL_VICTIM), 'o00Z'), function Trig_DarkDragonEX_Func018A )
endfunction

// --- InitTrig_DarkDragonEX (family, line 44102) ---
function InitTrig_DarkDragonEX takes nothing returns nothing
    set gg_trg_DarkDragonEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_DarkDragonEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DarkDragonEX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DarkDragonEX, Condition( function Trig_DarkDragonEX_Conditions ) )
    call TriggerAddAction( gg_trg_DarkDragonEX, function Trig_DarkDragonEX_Actions )
endfunction

// === family EatDragon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EatDragon_Conditions (family, line 43940) ---
function Trig_EatDragon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EatDragon_Func011C (family, line 43947) ---
function Trig_EatDragon_Func011C takes nothing returns boolean
    if ( not ( GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), false) <= 160 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EatDragon_Func015A (family, line 43954) ---
function Trig_EatDragon_Func015A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_EatDragon_Func018A (family, line 43958) ---
function Trig_EatDragon_Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EatDragon_Func020A (family, line 43963) ---
function Trig_EatDragon_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EatDragon_Actions (family, line 43968) ---
function Trig_EatDragon_Actions takes nothing returns nothing
    set udg_Hehi = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o01V', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call SetUnitVertexColorBJ( GetLastCreatedUnit(), 0.00, 0.00, 0.00, 20.00 )
    set udg_BlackDragonEatUnit = GetLastCreatedUnit()
    call SetUnitFlyHeightBJ( udg_BlackDragonEatUnit, -2000.00, 1800.00 )
    call SetUnitTimeScalePercent( udg_BlackDragonEatUnit, 1000.00 )
    call AddSpecialEffectTargetUnitBJ( "chest", GetLastCreatedUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    if ( Trig_EatDragon_Func011C() ) then
        call ModifyHeroStat( bj_HEROSTAT_AGI, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, ( GetUnitAbilityLevelSwapped('A09K', GetTriggerUnit()) + 0 ) )
    else
        call CreateTextTagUnitBJ( "TRIGSTR_1827", GetTriggerUnit(), 0, 10.00, 100, 0.00, 0.00, 0 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    endif
    call PlaySoundOnUnitBJ( gg_snd_FlashBack1Second, 100, GetTriggerUnit() )
    set udg_BDragonCount = 1
    loop
        exitwhen udg_BDragonCount > 12
        call CreateNUnitsAtLoc( 1, 'o00Z', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 350.00, ( I2R(udg_BDragonCount) * 30.00 )), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 5.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A09M', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A09M', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetAttacker(), 0 )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "clusterrockets", GetUnitLoc(GetLastCreatedUnit()) )
        call EnableTrigger( gg_trg_Closeaeff )
        call AddSpecialEffectLocBJ( GetRandomLocInRect(RectFromCenterSizeBJ(GetUnitLoc(GetTriggerUnit()), 350.00, 350.00)), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_BDragonCount = udg_BDragonCount + 1
    endloop
    call PlaySoundOnUnitBJ( gg_snd_DragonRoostWhat1, 100.00, GetTriggerUnit() )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetUnitLoc(udg_Hehi), 1600.00, 1600.00)), function Trig_EatDragon_Func015A )
    call TriggerSleepAction( 1.00 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Hehi), 'o01V'), function Trig_EatDragon_Func018A )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Hehi), 'o00Z'), function Trig_EatDragon_Func020A )
endfunction

// --- InitTrig_EatDragon (family, line 44020) ---
function InitTrig_EatDragon takes nothing returns nothing
    set gg_trg_EatDragon = CreateTrigger(  )
    call DisableTrigger( gg_trg_EatDragon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EatDragon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EatDragon, Condition( function Trig_EatDragon_Conditions ) )
    call TriggerAddAction( gg_trg_EatDragon, function Trig_EatDragon_Actions )
endfunction

// === family FireSword (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FireSword_Conditions (family, line 43640) ---
function Trig_FireSword_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09H' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSword_Func002C (family, line 43647) ---
function Trig_FireSword_Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSword_Func004Func001C (family, line 43654) ---
function Trig_FireSword_Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSword_Func004A (family, line 43661) ---
function Trig_FireSword_Func004A takes nothing returns nothing
    if ( Trig_FireSword_Func004Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), udg_HehiFlameDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Environment\\NightElfBuildingFire\\ElfLargeBuildingFire2.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_FireSword_Actions (family, line 43670) ---
function Trig_FireSword_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_HCancelBuilding, 100, GetTriggerUnit() )
    if ( Trig_FireSword_Func002C() ) then
        set udg_HehiFlameDamage = ( ( I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true) * 2 )) + 100.00 ) + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 150.00 ) )
    else
        set udg_HehiFlameDamage = ( 100.00 + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 150.00 ) )
    endif
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(380.00, GetSpellTargetLoc()), function Trig_FireSword_Func004A )
endfunction

// --- InitTrig_FireSword (family, line 43682) ---
function InitTrig_FireSword takes nothing returns nothing
    set gg_trg_FireSword = CreateTrigger(  )
    call DisableTrigger( gg_trg_FireSword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireSword, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FireSword, Condition( function Trig_FireSword_Conditions ) )
    call TriggerAddAction( gg_trg_FireSword, function Trig_FireSword_Actions )
endfunction

// === family FireSwordAdded (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_FireSwordAdded_Conditions (family, line 43693) ---
function Trig_FireSwordAdded_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Uvng' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSwordAdded_Func001C (family, line 43700) ---
function Trig_FireSwordAdded_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A06O', GetTriggerUnit()) <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSwordAdded_Func003C (family, line 43707) ---
function Trig_FireSwordAdded_Func003C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A08P', GetTriggerUnit()) <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSwordAdded_Actions (family, line 43714) ---
function Trig_FireSwordAdded_Actions takes nothing returns nothing
    if ( Trig_FireSwordAdded_Func001C() ) then
        call UnitAddAbilityBJ( 'A06O', GetTriggerUnit() )
    else
        call DoNothing(  )
    endif
    call SetUnitAbilityLevelSwapped( 'A06O', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A08P', GetTriggerUnit()) )
    if ( Trig_FireSwordAdded_Func003C() ) then
        call UnitRemoveAbilityBJ( 'A06O', GetTriggerUnit() )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_FireSwordAdded (family, line 43729) ---
function InitTrig_FireSwordAdded takes nothing returns nothing
    set gg_trg_FireSwordAdded = CreateTrigger(  )
    call DisableTrigger( gg_trg_FireSwordAdded )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireSwordAdded, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireSwordAdded, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_FireSwordAdded, Condition( function Trig_FireSwordAdded_Conditions ) )
    call TriggerAddAction( gg_trg_FireSwordAdded, function Trig_FireSwordAdded_Actions )
endfunction

// === family HehiSword (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HehiSword_Conditions (family, line 43741) ---
function Trig_HehiSword_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSword_Func007C (family, line 43748) ---
function Trig_HehiSword_Func007C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSword_Actions (family, line 43755) ---
function Trig_HehiSword_Actions takes nothing returns nothing
    // 變數設定
    set udg_HehiRush_IndexMoon = 0
    set udg_HehiRush_Target = GetTriggerUnit()
    set udg_HehiRush_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_HehiRush_P2 = GetUnitLoc(GetTriggerUnit())
    set udg_HehiRush_Angle = GetUnitFacing(GetTriggerUnit())
    if ( Trig_HehiSword_Func007C() ) then
        set udg_HehiRush_Damage = I2R(( ( 100 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) + ( 150 + R2I(I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true) * 3 ))) ) ))
    else
        set udg_HehiRush_Damage = I2R(( ( 100 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) + ( 150 + R2I(I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true))) ) ))
    endif
    call UnitAddAbilityBJ( 'A0J6', GetTriggerUnit() )
    call GroupClear( udg_HehiRush_Group )
    call UnitAddAbilityBJ( 'Avul', GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_DarkSummoningLaunch1, 100, GetTriggerUnit() )
    call EnableTrigger( gg_trg_HehiSwordEffect )
endfunction

// --- InitTrig_HehiSword (family, line 43775) ---
function InitTrig_HehiSword takes nothing returns nothing
    set gg_trg_HehiSword = CreateTrigger(  )
    call DisableTrigger( gg_trg_HehiSword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HehiSword, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HehiSword, Condition( function Trig_HehiSword_Conditions ) )
    call TriggerAddAction( gg_trg_HehiSword, function Trig_HehiSword_Actions )
endfunction

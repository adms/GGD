// unit rawcode: Ofar
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Pikachu, LightningSpread, Sadosi, WildPika, Wohoo, JumpsDamage

// === family Open_Skill_of_Pikachu (armed) events=none ===

// --- Trig_Open_Skill_of_Pikachu_Conditions (family, line 40205) ---
function Trig_Open_Skill_of_Pikachu_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Ofar' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Pikachu_Func010A (family, line 40212) ---
function Trig_Open_Skill_of_Pikachu_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Open_Skill_of_Pikachu_Actions (family, line 40217) ---
function Trig_Open_Skill_of_Pikachu_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_Sadosi )
    call EnableTrigger( gg_trg_WildPika )
    call EnableTrigger( gg_trg_LightningSpread )
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_PikaUnit = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_SpecialUnitCreateArea), bj_UNIT_FACING )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "皮卡丘: 皮皮皮皮皮皮皮? (譯: 我的游泳池勒?)" + "|r" ) ) )
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'o00E'), function Trig_Open_Skill_of_Pikachu_Func010A )
endfunction

// --- InitTrig_Open_Skill_of_Pikachu (family, line 40231) ---
function InitTrig_Open_Skill_of_Pikachu takes nothing returns nothing
    set gg_trg_Open_Skill_of_Pikachu = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Pikachu, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Pikachu, Condition( function Trig_Open_Skill_of_Pikachu_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Pikachu, function Trig_Open_Skill_of_Pikachu_Actions )
endfunction

// === family LightningSpread (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightningSpread_Conditions (family, line 40264) ---
function Trig_LightningSpread_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0SL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightningSpread_Func006A (family, line 40271) ---
function Trig_LightningSpread_Func006A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), 3 )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_LightningSpread_Func010A (family, line 40281) ---
function Trig_LightningSpread_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightningSpread_Func012A (family, line 40286) ---
function Trig_LightningSpread_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightningSpread_Actions (family, line 40291) ---
function Trig_LightningSpread_Actions takes nothing returns nothing
    set udg_PikaUnit = GetTriggerUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(1800.00, udg_P1), function Trig_LightningSpread_Func006A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 4.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'o00E'), function Trig_LightningSpread_Func010A )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'hfoo'), function Trig_LightningSpread_Func012A )
endfunction

// --- InitTrig_LightningSpread (family, line 40306) ---
function InitTrig_LightningSpread takes nothing returns nothing
    set gg_trg_LightningSpread = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightningSpread )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightningSpread, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightningSpread, Condition( function Trig_LightningSpread_Conditions ) )
    call TriggerAddAction( gg_trg_LightningSpread, function Trig_LightningSpread_Actions )
endfunction

// === family Sadosi (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Sadosi_Conditions (family, line 40241) ---
function Trig_Sadosi_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0C3' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Sadosi_Actions (family, line 40248) ---
function Trig_Sadosi_Actions takes nothing returns nothing
    call PlaySoundBJ( gg_snd_sawch )
endfunction

// --- InitTrig_Sadosi (family, line 40253) ---
function InitTrig_Sadosi takes nothing returns nothing
    set gg_trg_Sadosi = CreateTrigger(  )
    call DisableTrigger( gg_trg_Sadosi )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Sadosi, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Sadosi, Condition( function Trig_Sadosi_Conditions ) )
    call TriggerAddAction( gg_trg_Sadosi, function Trig_Sadosi_Actions )
endfunction

// === family WildPika (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WildPika_Conditions (family, line 40317) ---
function Trig_WildPika_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A040' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WildPika_Actions (family, line 40324) ---
function Trig_WildPika_Actions takes nothing returns nothing
    set udg_PikaUnit = GetTriggerUnit()
    call EnableTrigger( gg_trg_WildPikaAttacked )
    call TriggerSleepAction( ( I2R(GetUnitAbilityLevelSwapped('A040', GetTriggerUnit())) * 6.00 ) )
    call DisableTrigger( gg_trg_WildPikaAttacked )
    call SetUnitVertexColorBJ( udg_PikaUnit, 100, 100, 100, 0 )
endfunction

// --- InitTrig_WildPika (family, line 40333) ---
function InitTrig_WildPika takes nothing returns nothing
    set gg_trg_WildPika = CreateTrigger(  )
    call DisableTrigger( gg_trg_WildPika )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WildPika, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WildPika, Condition( function Trig_WildPika_Conditions ) )
    call TriggerAddAction( gg_trg_WildPika, function Trig_WildPika_Actions )
endfunction

// === family Wohoo (armed) events=none ===

// --- Trig_Wohoo_Func002C (family, line 45626) ---
function Trig_Wohoo_Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttackedUnitBJ()) == 'N00B' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetAttacker()) == 'Ofar' ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 100) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wohoo_Conditions (family, line 45639) ---
function Trig_Wohoo_Conditions takes nothing returns boolean
    if ( not Trig_Wohoo_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wohoo_Actions (family, line 45646) ---
function Trig_Wohoo_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_Wohoo_Caster = GetTriggerUnit()
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Doodads\\Cinematic\\FireRockSmall\\FireRockSmall.mdl" )
    set udg_Wohoo_efx = GetLastCreatedEffectBJ()
    call TriggerSleepAction( 1.00 )
    call MoveRectToLoc( gg_rct_WOO, GetUnitLoc(GetTriggerUnit()) )
    call UnitAddAbilityBJ( 'Amrf', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'Amrf', GetTriggerUnit() )
    call EnableTrigger( gg_trg_JumpsDamage )
    call TriggerSleepAction( 3.00 )
    call DisableTrigger( gg_trg_JumpsDamage )
    call DestroyEffectBJ( udg_Wohoo_efx )
    call SelectUnitAddForPlayer( GetTriggerUnit(), GetOwningPlayer(GetTriggerUnit()) )
    call EnableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_Wohoo (family, line 45664) ---
function InitTrig_Wohoo takes nothing returns nothing
    set gg_trg_Wohoo = CreateTrigger(  )
    call DisableTrigger( gg_trg_Wohoo )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Wohoo, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Wohoo, Condition( function Trig_Wohoo_Conditions ) )
    call TriggerAddAction( gg_trg_Wohoo, function Trig_Wohoo_Actions )
endfunction

// === family JumpsDamage (armed) events=none ===

// --- Trig_JumpsDamage_Func008001003 (family, line 45675) ---
function Trig_JumpsDamage_Func008001003 takes nothing returns boolean
    return ( IsUnitAlly(GetFilterUnit(), GetOwningPlayer(udg_Wohoo_Caster)) == false )
endfunction

// --- Trig_JumpsDamage_Func008002 (family, line 45679) ---
function Trig_JumpsDamage_Func008002 takes nothing returns nothing
    call SetUnitLifeBJ( GetEnumUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetEnumUnit()) - 138.00 ) )
endfunction

// --- Trig_JumpsDamage_Actions (family, line 45683) ---
function Trig_JumpsDamage_Actions takes nothing returns nothing
    call CreateTextTagUnitBJ( "TRIGSTR_400", udg_Wohoo_Caster, 0, 12.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call SelectUnitRemoveForPlayer( udg_Wohoo_Caster, GetOwningPlayer(udg_Wohoo_Caster) )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_Wohoo_Caster), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call ForGroupBJ( GetUnitsInRangeOfLocMatching(250.00, GetUnitLoc(udg_Wohoo_Caster), Condition(function Trig_JumpsDamage_Func008001003)), function Trig_JumpsDamage_Func008002 )
    call SetUnitFlyHeightBJ( udg_Wohoo_Caster, 200.00, 2000.00 )
    call IssuePointOrderLocBJ( udg_Wohoo_Caster, "move", GetRandomLocInRect(gg_rct_WOO) )
    call TriggerSleepAction( 0.05 )
    call SetUnitFlyHeightBJ( udg_Wohoo_Caster, 0.00, 2000.00 )
endfunction

// --- InitTrig_JumpsDamage (family, line 45699) ---
function InitTrig_JumpsDamage takes nothing returns nothing
    set gg_trg_JumpsDamage = CreateTrigger(  )
    call DisableTrigger( gg_trg_JumpsDamage )
    call TriggerRegisterTimerEventPeriodic( gg_trg_JumpsDamage, 0.40 )
    call TriggerAddAction( gg_trg_JumpsDamage, function Trig_JumpsDamage_Actions )
endfunction

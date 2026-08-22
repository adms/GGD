// rawcode: A0UJ
// nameZh: 70-01 伸卡球
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0}
// mana: {"1": 150, "2": 210, "3": 270}
// area: {"1": 300.0, "2": 350.0, "3": 400.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: WoodStone

// === family WoodStone (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WoodStone_Conditions (family, line 47880) ---
function Trig_WoodStone_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0UJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WoodStone_Func017A (family, line 47887) ---
function Trig_WoodStone_Func017A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_WoodStone_Func018Func001Func005Func003A (family, line 47891) ---
function Trig_WoodStone_Func018Func001Func005Func003A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_WoodStone_Func018Func001Func005C (family, line 47895) ---
function Trig_WoodStone_Func018Func001Func005C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WoodStone_Func018Func001C (family, line 47902) ---
function Trig_WoodStone_Func018Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_WoodMan)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WoodStone_Func018A (family, line 47912) ---
function Trig_WoodStone_Func018A takes nothing returns nothing
    if ( Trig_WoodStone_Func018Func001C() ) then
        call UnitDamageTargetBJ( udg_WoodMan, GetEnumUnit(), udg_WoodDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "origin", GetEnumUnit(), "abilities\\weapons\\catapult\\catapultmissile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        if ( Trig_WoodStone_Func018Func001Func005C() ) then
            call SetUnitAnimation( GetEnumUnit(), "death" )
            call EnumDestructablesInCircleBJ( 150.00, GetUnitLoc(GetEnumUnit()), function Trig_WoodStone_Func018Func001Func005Func003A )
        else
            call DoNothing(  )
        endif
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_WoodStone_Func020A (family, line 47928) ---
function Trig_WoodStone_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_WoodStone_Actions (family, line 47933) ---
function Trig_WoodStone_Actions takes nothing returns nothing
    set udg_WoodMan = GetTriggerUnit()
    set udg_WoodPoint = GetSpellTargetLoc()
    set udg_WoodLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_WoodDamage = ( I2R(( ( udg_WoodLevel * 150 ) + ( GetHeroStatBJ(bj_HEROSTAT_STR, udg_WoodMan, true) * 3 ) )) * 1 )
    call PlaySoundOnUnitBJ( gg_snd_TreantReady1, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( 0.50 )
    call CreateNUnitsAtLoc( 1, 'h01X', GetOwningPlayer(udg_WoodMan), GetUnitLoc(udg_WoodMan), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call SetUnitScalePercent( GetLastCreatedUnit(), ( I2R(( udg_WoodLevel * 150 )) + 200.00 ), 300.00, 300.00 )
    call UnitAddAbilityBJ( 'ANhs', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'ANhs', GetLastCreatedUnit(), 1 )
    call SetUnitFacingToFaceLocTimed( GetLastCreatedUnit(), udg_WoodPoint, 0 )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "healingspray", udg_WoodPoint )
    call AddSpecialEffectLocBJ( GetSpellTargetLoc(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set bj_wantDestroyGroup = true
    call EnumDestructablesInCircleBJ( ( ( I2R(udg_WoodLevel) * 50.00 ) + 300.00 ), udg_WoodPoint, function Trig_WoodStone_Func017A )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(( ( I2R(udg_WoodLevel) * 50.00 ) + 280.00 ), udg_WoodPoint), function Trig_WoodStone_Func018A )
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_WoodMan), 'h01X'), function Trig_WoodStone_Func020A )
endfunction

// --- InitTrig_WoodStone (family, line 47957) ---
function InitTrig_WoodStone takes nothing returns nothing
    set gg_trg_WoodStone = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WoodStone, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WoodStone, Condition( function Trig_WoodStone_Conditions ) )
    call TriggerAddAction( gg_trg_WoodStone, function Trig_WoodStone_Actions )
endfunction

// rawcode: A0XN
// nameZh: 81-03 Divine Buster Extention
// w3a base: AUcs  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 150, "2": 220, "3": 290, "4": 360}
// area: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DivineBusterEx

// === family DivineBusterEx (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DivineBusterEx_Conditions (family, line 35986) ---
function Trig_DivineBusterEx_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0XN' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DivineBusterEx_Func005C (family, line 35993) ---
function Trig_DivineBusterEx_Func005C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O02V' ) ) then
        return false
    endif
    if ( not ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) >= 150.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DivineBusterEx_Func021A (family, line 36003) ---
function Trig_DivineBusterEx_Func021A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 25.00 )
endfunction

// --- Trig_DivineBusterEx_Func022Func001Func001C (family, line 36007) ---
function Trig_DivineBusterEx_Func022Func001Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_Nanoha_DBE_Group) == false ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Nanoha_Hero)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DivineBusterEx_Func022Func001A (family, line 36020) ---
function Trig_DivineBusterEx_Func022Func001A takes nothing returns nothing
    if ( Trig_DivineBusterEx_Func022Func001Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_Nanoha_DBE_Group )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_DivineBusterEx_Func023A (family, line 36028) ---
function Trig_DivineBusterEx_Func023A takes nothing returns nothing
    call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitDamageTargetBJ( udg_Nanoha_Hero, GetEnumUnit(), udg_Nanoha_DBE_Damge, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
endfunction

// --- Trig_DivineBusterEx_Actions (family, line 36034) ---
function Trig_DivineBusterEx_Actions takes nothing returns nothing
    set udg_Nanoha_Hero = GetTriggerUnit()
    set udg_Nanoha_DBE_Position = GetUnitLoc(GetTriggerUnit())
    set udg_Nanoha_DBE_Angle = GetUnitFacing(GetTriggerUnit())
    set udg_Nanoha_DBE_Damge = ( ( 200.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 200 )) ) + 0.00 )
    if ( Trig_DivineBusterEx_Func005C() ) then
        call SetUnitManaBJ( GetTriggerUnit(), ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) - 150.00 ) )
        set udg_Nanoha_DBE_Damge = ( udg_Nanoha_DBE_Damge + ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * 4.00 ) )
    else
    endif
    call CreateNUnitsAtLoc( 1, 'h01Y', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 150.00, GetUnitFacing(GetTriggerUnit())), GetUnitFacing(GetTriggerUnit()) )
    set udg_Nanoha_DBE_Unit = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'h01Z', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), GetUnitFacing(GetTriggerUnit()) )
    set udg_Nanoha_DBE_Unit2 = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'h01V', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 150.00, GetUnitFacing(GetTriggerUnit())), GetUnitFacing(GetTriggerUnit()) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 180.00, 180.00, 300.00 )
    set udg_Nanoha_DBE_Unit3 = GetLastCreatedUnit()
    call SetUnitScalePercent( udg_Nanoha_DBE_Unit3, ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 50.00 ) + 100.00 ), 100, 100 )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PlaySoundOnUnitBJ( gg_snd_SnapDragonMissileLaunch1, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_SoulGem, 100.00, GetTriggerUnit() )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_Nanoha_DBE_Position, 1600.00, 1600.00)), function Trig_DivineBusterEx_Func021A )
    set udg_Nanoha_DBE_Index = 1
    loop
        exitwhen udg_Nanoha_DBE_Index > 6
        call ForGroupBJ( GetUnitsInRangeOfLocAll(280.00, PolarProjectionBJ(udg_Nanoha_DBE_Position, ( 150.00 * I2R(udg_Nanoha_DBE_Index) ), udg_Nanoha_DBE_Angle)), function Trig_DivineBusterEx_Func022Func001A )
        set udg_Nanoha_DBE_Index = udg_Nanoha_DBE_Index + 1
    endloop
    call ForGroupBJ( udg_Nanoha_DBE_Group, function Trig_DivineBusterEx_Func023A )
    call PlaySoundOnUnitBJ( gg_snd_MarkOfChaos, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 1.60 )
    call GroupClear( udg_Nanoha_DBE_Group )
    call KillUnit( udg_Nanoha_DBE_Unit )
    call RemoveUnit( udg_Nanoha_DBE_Unit )
    call KillUnit( udg_Nanoha_DBE_Unit2 )
    call RemoveUnit( udg_Nanoha_DBE_Unit2 )
    call KillUnit( udg_Nanoha_DBE_Unit3 )
    call RemoveUnit( udg_Nanoha_DBE_Unit3 )
endfunction

// --- InitTrig_DivineBusterEx (family, line 36084) ---
function InitTrig_DivineBusterEx takes nothing returns nothing
    set gg_trg_DivineBusterEx = CreateTrigger(  )
    call DisableTrigger( gg_trg_DivineBusterEx )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DivineBusterEx, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DivineBusterEx, Condition( function Trig_DivineBusterEx_Conditions ) )
    call TriggerAddAction( gg_trg_DivineBusterEx, function Trig_DivineBusterEx_Actions )
endfunction

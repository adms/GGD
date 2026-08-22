// rawcode: A0TN
// nameZh: 89-03 憤怒的胸毛
// w3a base: AUau  levels: 4
// area: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Saber_in_pandaDie

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

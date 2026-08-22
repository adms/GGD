// rawcode: A0U6
// nameZh: 35-04 光牙
// cooldown: {"1": 55.0, "2": 55.0, "3": 55.0}
// mana: {"1": 100, "2": 160, "3": 220}
// area: {"1": 200.0, "2": 200.0, "3": 200.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: EightCloud, Light

// === family EightCloud (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EightCloud_Func004C (family, line 42956) ---
function Trig_EightCloud_Func004C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A0U6' ) ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A06G' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_EightCloud_Conditions (family, line 42966) ---
function Trig_EightCloud_Conditions takes nothing returns boolean
    if ( not Trig_EightCloud_Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_EightCloud_Actions (family, line 42973) ---
function Trig_EightCloud_Actions takes nothing returns nothing
    call UnitDamageTargetBJ( GetTriggerUnit(), GetTriggerUnit(), RMinBJ(925.00, ( 0.44 * GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    set udg_EyesMaster = GetTriggerUnit()
endfunction

// --- InitTrig_EightCloud (family, line 42979) ---
function InitTrig_EightCloud takes nothing returns nothing
    set gg_trg_EightCloud = CreateTrigger(  )
    call DisableTrigger( gg_trg_EightCloud )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EightCloud, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EightCloud, Condition( function Trig_EightCloud_Conditions ) )
    call TriggerAddAction( gg_trg_EightCloud, function Trig_EightCloud_Actions )
endfunction

// === family Light (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Light_Conditions (family, line 42990) ---
function Trig_Light_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0U6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Func004C (family, line 42997) ---
function Trig_Light_Func004C takes nothing returns boolean
    if ( not ( udg_EyesPay != null ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_EyesPay) == true ) ) then
        return false
    endif
    if ( not ( DistanceBetweenPoints(GetUnitLoc(udg_EyesMaster), GetUnitLoc(udg_EyesPay)) <= 350.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Func008Func001C (family, line 43010) ---
function Trig_Light_Func008Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    if ( not ( udg_Angry3x3 == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Func008C (family, line 43020) ---
function Trig_Light_Func008C takes nothing returns boolean
    if ( not Trig_Light_Func008Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Actions (family, line 43027) ---
function Trig_Light_Actions takes nothing returns nothing
    set udg_P1 = GetSpellTargetLoc()
    set udg_P2 = GetUnitLoc(GetTriggerUnit())
    set udg_EyesLightAngle = AngleBetweenPoints(udg_P2, udg_P1)
    if ( Trig_Light_Func004C() ) then
        set udg_PayDam = ( 1.50 * ( 800.00 - GetUnitStateSwap(UNIT_STATE_LIFE, udg_EyesPay) ) )
        set udg_Eyes_Light_Damage = ( ( udg_PayDam + 200.00 ) + ( 400.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    else
        set udg_Eyes_Light_Damage = ( 200.00 + ( 400.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    endif
    set udg_LightTeethIndex = 0
    call RemoveLocation( udg_P1 )
    call EnableTrigger( gg_trg_LightMove )
    if ( Trig_Light_Func008C() ) then
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V3', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V1', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V2', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0UZ', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V4', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V5', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V0', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V6', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call TerrainDeformationRippleBJ( 2.00, false, GetUnitLoc(GetTriggerUnit()), 600.00, 600.00, 64.00, 1.00, 300.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    else
    endif
endfunction

// --- InitTrig_Light (family, line 43088) ---
function InitTrig_Light takes nothing returns nothing
    set gg_trg_Light = CreateTrigger(  )
    call DisableTrigger( gg_trg_Light )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Light, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Light, Condition( function Trig_Light_Conditions ) )
    call TriggerAddAction( gg_trg_Light, function Trig_Light_Actions )
endfunction

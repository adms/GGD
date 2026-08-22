// unit rawcode: E00W
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Setsuna, AngleRdDam, Cloud_ready, Cloud_reset, Control_Light, InshouATK, InshouJugATK, LightATK

// === family Open_Skill_of_Setsuna (armed) events=none ===

// --- Trig_Open_Skill_of_Setsuna_Conditions (family, line 49029) ---
function Trig_Open_Skill_of_Setsuna_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00W' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Setsuna_Actions (family, line 49036) ---
function Trig_Open_Skill_of_Setsuna_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call TriggerRegisterUnitEvent( gg_trg_Cloud_ready, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
    call TriggerRegisterUnitEvent( gg_trg_AngleRdDam, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
    set udg_Inshou = GetTriggerUnit()
    set udg_Light_Sword_Num = 10
    set udg_InshouAtkUnit = null
    call EnableTrigger( gg_trg_Cloud_reset )
    call EnableTrigger( gg_trg_InshouATK )
    call EnableTrigger( gg_trg_InshouJugATK )
    call EnableTrigger( gg_trg_LightATK )
    call EnableTrigger( gg_trg_Control_Light )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "剎那: 只要能在暗處默默的保護木乃香大小姐您就夠了..." + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Setsuna (family, line 49053) ---
function InitTrig_Open_Skill_of_Setsuna takes nothing returns nothing
    set gg_trg_Open_Skill_of_Setsuna = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Setsuna, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Setsuna, Condition( function Trig_Open_Skill_of_Setsuna_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Setsuna, function Trig_Open_Skill_of_Setsuna_Actions )
endfunction

// === family AngleRdDam (armed) events=none ===

// --- Trig_AngleRdDam_Conditions (family, line 49063) ---
function Trig_AngleRdDam_Conditions takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetTriggerUnit(), 'B05F') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AngleRdDam_Actions (family, line 49070) ---
function Trig_AngleRdDam_Actions takes nothing returns nothing
    call DamageModify( GetEventDamage()*0.66 )
endfunction

// --- InitTrig_AngleRdDam (family, line 49075) ---
function InitTrig_AngleRdDam takes nothing returns nothing
    set gg_trg_AngleRdDam = CreateTrigger(  )
    call TriggerAddCondition( gg_trg_AngleRdDam, Condition( function Trig_AngleRdDam_Conditions ) )
    call TriggerAddAction( gg_trg_AngleRdDam, function Trig_AngleRdDam_Actions )
endfunction

// === family Cloud_ready (armed) events=none ===

// --- Trig_Cloud_ready_Conditions (family, line 49250) ---
function Trig_Cloud_ready_Conditions takes nothing returns boolean
    if ( not ( udg_InshouJudg == 1 ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEventDamageSource(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( IsUnitPausedBJ(GetEventDamageSource()) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Cloud_ready_Func005C (family, line 49263) ---
function Trig_Cloud_ready_Func005C takes nothing returns boolean
    if ( not ( DistanceBetweenPoints(GetUnitLoc(udg_Inshou), GetUnitLoc(udg_InshouAttackingUnit)) <= 200.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Cloud_ready_Actions (family, line 49270) ---
function Trig_Cloud_ready_Actions takes nothing returns nothing
    set udg_InshouAttackingUnit = GetEventDamageSource()
    if ( Trig_Cloud_ready_Func005C() ) then
        set udg_InshouAngle = AngleBetweenPoints(GetUnitLoc(udg_Inshou), GetUnitLoc(udg_InshouAttackingUnit))
        set udg_InshouIndex = 1
        set udg_InshouJudg = 0
        call TriggerSleepAction( 0.20 )
        call CreateNUnitsAtLoc( 1, 'o013', GetOwningPlayer(udg_Inshou), PolarProjectionBJ(GetUnitLoc(udg_Inshou), 100.00, ( GetUnitFacing(udg_Inshou) - 90.00 )), udg_InshouAngle )
        set udg_InshouCreateUnit[1] = GetLastCreatedUnit()
        call SetUnitTimeScalePercent( udg_InshouCreateUnit[1], 200.00 )
        call ShowUnitHide( udg_Inshou )
        call SetUnitAnimation( udg_InshouCreateUnit[1], "attack slam" )
        call SetUnitAnimation( udg_InshouAttackingUnit, "death" )
        call UnitAddAbilityBJ( 'A0FZ', udg_InshouAttackingUnit )
        call EnableTrigger( gg_trg_Cloud_move )
    else
    endif
endfunction

// --- InitTrig_Cloud_ready (family, line 49290) ---
function InitTrig_Cloud_ready takes nothing returns nothing
    set gg_trg_Cloud_ready = CreateTrigger(  )
    call DisableTrigger( gg_trg_Cloud_ready )
    call TriggerAddCondition( gg_trg_Cloud_ready, Condition( function Trig_Cloud_ready_Conditions ) )
    call TriggerAddAction( gg_trg_Cloud_ready, function Trig_Cloud_ready_Actions )
endfunction

// === family Cloud_reset (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Cloud_reset_Conditions (family, line 49352) ---
function Trig_Cloud_reset_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JD' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Cloud_reset_Actions (family, line 49359) ---
function Trig_Cloud_reset_Actions takes nothing returns nothing
    set udg_Inshou = GetTriggerUnit()
    call EnableTrigger( gg_trg_Cloud_ready )
    set udg_InshouJudg = 1
    call TriggerSleepAction( 0.50 )
    call DisableTrigger( gg_trg_Cloud_ready )
endfunction

// --- InitTrig_Cloud_reset (family, line 49368) ---
function InitTrig_Cloud_reset takes nothing returns nothing
    set gg_trg_Cloud_reset = CreateTrigger(  )
    call DisableTrigger( gg_trg_Cloud_reset )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Cloud_reset, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Cloud_reset, Condition( function Trig_Cloud_reset_Conditions ) )
    call TriggerAddAction( gg_trg_Cloud_reset, function Trig_Cloud_reset_Actions )
endfunction

// === family Control_Light (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Control_Light_Conditions (family, line 49180) ---
function Trig_Control_Light_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A10G' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Control_Light_Actions (family, line 49187) ---
function Trig_Control_Light_Actions takes nothing returns nothing
    set udg_Light_Sword_Num = 2
    call TriggerSleepAction( 14.00 )
    set udg_Light_Sword_Num = 10
endfunction

// --- InitTrig_Control_Light (family, line 49194) ---
function InitTrig_Control_Light takes nothing returns nothing
    set gg_trg_Control_Light = CreateTrigger(  )
    call DisableTrigger( gg_trg_Control_Light )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Control_Light, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Control_Light, Condition( function Trig_Control_Light_Conditions ) )
    call TriggerAddAction( gg_trg_Control_Light, function Trig_Control_Light_Actions )
endfunction

// === family InshouATK (armed) events=none ===

// --- Trig_InshouATK_Conditions (family, line 49668) ---
function Trig_InshouATK_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'E00X' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_InshouATK_Func002C (family, line 49675) ---
function Trig_InshouATK_Func002C takes nothing returns boolean
    if ( not ( IsUnitIllusionBJ(GetAttackedUnitBJ()) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitInGroup(GetAttackedUnitBJ(), udg_Des_Group) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_InshouATK_Actions (family, line 49688) ---
function Trig_InshouATK_Actions takes nothing returns nothing
    set udg_InshouAtkUnit = GetAttackedUnitBJ()
    if ( Trig_InshouATK_Func002C() ) then
        call GroupAddUnitSimple( GetTriggerUnit(), udg_Des_Group )
        call InitSetup( GetTriggerUnit() )
    else
    endif
endfunction

// --- InitTrig_InshouATK (family, line 49698) ---
function InitTrig_InshouATK takes nothing returns nothing
    set gg_trg_InshouATK = CreateTrigger(  )
    call DisableTrigger( gg_trg_InshouATK )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_InshouATK, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_InshouATK, Condition( function Trig_InshouATK_Conditions ) )
    call TriggerAddAction( gg_trg_InshouATK, function Trig_InshouATK_Actions )
endfunction

// === family InshouJugATK (armed) events=none ===

// --- Trig_InshouJugATK_Conditions (family, line 49709) ---
function Trig_InshouJugATK_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00X' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_InshouJugATK_Actions (family, line 49716) ---
function Trig_InshouJugATK_Actions takes nothing returns nothing
    set udg_InshouAtkUnit = null
endfunction

// --- InitTrig_InshouJugATK (family, line 49721) ---
function InitTrig_InshouJugATK takes nothing returns nothing
    set gg_trg_InshouJugATK = CreateTrigger(  )
    call DisableTrigger( gg_trg_InshouJugATK )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_InshouJugATK, EVENT_PLAYER_UNIT_USE_ITEM )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_InshouJugATK, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_InshouJugATK, Condition( function Trig_InshouJugATK_Conditions ) )
    call TriggerAddAction( gg_trg_InshouJugATK, function Trig_InshouJugATK_Actions )
endfunction

// === family LightATK (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_LightATK_Conditions (family, line 49205) ---
function Trig_LightATK_Conditions takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0TX', GetAttacker()) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightATK_Func001Func008A (family, line 49212) ---
function Trig_LightATK_Func001Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightATK_Actions (family, line 49217) ---
function Trig_LightATK_Actions takes nothing returns nothing
    local location UnitPoint
    local location OrderPoint
 
    set UnitPoint = GetUnitLoc(GetAttacker())

    if ( GetRandomInt(1, udg_Light_Sword_Num) == 2 ) then
        call CreateNUnitsAtLoc( 1, 'h02L', GetOwningPlayer(GetAttacker()), UnitPoint, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0TY', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0TX', GetAttacker()) )
        set OrderPoint = PolarProjectionBJ(UnitPoint, 150.00, GetUnitFacing(GetAttacker()))
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", OrderPoint )
        call RemoveLocation(UnitPoint)
        call RemoveLocation(OrderPoint)
        call TriggerSleepAction( 2 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h02L'), function Trig_LightATK_Func001Func008A )
    else
    endif
endfunction

// --- InitTrig_LightATK (family, line 49239) ---
function InitTrig_LightATK takes nothing returns nothing
    set gg_trg_LightATK = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightATK )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightATK, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_LightATK, Condition( function Trig_LightATK_Conditions ) )
    call TriggerAddAction( gg_trg_LightATK, function Trig_LightATK_Actions )
endfunction

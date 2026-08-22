// unit rawcode: H022
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Negi, DarkMagic, KillUnit, LightArrow, MoveLightPoint, MoveStart, NegiAccJudg, NegiAttJudg, NegiAttack, ThunderLance, absorp, absorpStart

// === family Open_Skill_of_Negi (armed) events=none ===

// --- Trig_Open_Skill_of_Negi_Conditions (family, line 34846) ---
function Trig_Open_Skill_of_Negi_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H022' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Negi_Func011A (family, line 34853) ---
function Trig_Open_Skill_of_Negi_Func011A takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( false, 'A0PV', GetEnumPlayer() )
    call SetPlayerAbilityAvailableBJ( false, 'A0PY', GetEnumPlayer() )
    call SetPlayerAbilityAvailableBJ( false, 'A0Q8', GetEnumPlayer() )
endfunction

// --- Trig_Open_Skill_of_Negi_Actions (family, line 34859) ---
function Trig_Open_Skill_of_Negi_Actions takes nothing returns nothing
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "涅吉: 爸爸...你在哪?" + "|r" ) ) )
    set udg_NegiUnit = GetTriggerUnit()
    set udg_LightArrowAccount = 0
    set udg_ThunderLanceAccount = 0
    set udg_NegiJudgeThunder = false
    set udg_NegiAbsorpDam = 0.00
    set udg_NegiAbsorpFinDam = 0.00
    call TriggerRegisterUnitEvent( gg_trg_absorp, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
    call ForForce( GetPlayersAll(), function Trig_Open_Skill_of_Negi_Func011A )
    call EnableTrigger( gg_trg_NegiAttJudg )
    call EnableTrigger( gg_trg_NegiAccJudg )
    call EnableTrigger( gg_trg_NegiAttack )
    call EnableTrigger( gg_trg_LightArrow )
    call EnableTrigger( gg_trg_MoveStart )
    call EnableTrigger( gg_trg_ThunderLance )
    call EnableTrigger( gg_trg_DarkMagic )
    call EnableTrigger( gg_trg_MoveLightPoint )
    call EnableTrigger( gg_trg_KillUnit )
    call EnableTrigger( gg_trg_absorpStart )
    call DisableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_Open_Skill_of_Negi (family, line 34883) ---
function InitTrig_Open_Skill_of_Negi takes nothing returns nothing
    set gg_trg_Open_Skill_of_Negi = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Negi, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Negi, Condition( function Trig_Open_Skill_of_Negi_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Negi, function Trig_Open_Skill_of_Negi_Actions )
endfunction

// === family DarkMagic (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DarkMagic_Conditions (family, line 35603) ---
function Trig_DarkMagic_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Q6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkMagic_Actions (family, line 35610) ---
function Trig_DarkMagic_Actions takes nothing returns nothing
    set udg_NegiJudgeThunder = true
    call SetUnitVertexColorBJ( GetTriggerUnit(), 20.00, 20.00, 20.00, 0 )
    call SetUnitAbilityLevelSwapped( 'A0Q0', GetTriggerUnit(), ( GetUnitAbilityLevelSwapped('A0Q6', GetTriggerUnit()) + 1 ) )
    call EnableTrigger( gg_trg_WindThunder )
    call EnableTrigger( gg_trg_HellFire )
    call TriggerSleepAction( 15.00 )
    set udg_NegiJudgeThunder = false
    call UnitRemoveAbilityBJ( 'A0PV', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0PY', GetTriggerUnit() )
    call SetUnitVertexColorBJ( GetTriggerUnit(), 100.00, 100.00, 100.00, 0 )
    call SetUnitAbilityLevelSwapped( 'A0Q0', GetTriggerUnit(), 1 )
    call DisableTrigger( gg_trg_WindThunder )
    call DisableTrigger( gg_trg_HellFire )
endfunction

// --- InitTrig_DarkMagic (family, line 35627) ---
function InitTrig_DarkMagic takes nothing returns nothing
    set gg_trg_DarkMagic = CreateTrigger(  )
    call DisableTrigger( gg_trg_DarkMagic )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DarkMagic, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DarkMagic, Condition( function Trig_DarkMagic_Conditions ) )
    call TriggerAddAction( gg_trg_DarkMagic, function Trig_DarkMagic_Actions )
endfunction

// === family KillUnit (armed) events=none ===

// --- Trig_KillUnit_Func001A (family, line 34924) ---
function Trig_KillUnit_Func001A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
    call GroupClear( udg_NegiGroup )
endfunction

// --- Trig_KillUnit_Actions (family, line 34930) ---
function Trig_KillUnit_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_NegiUnit), 'o02I'), function Trig_KillUnit_Func001A )
endfunction

// --- InitTrig_KillUnit (family, line 34935) ---
function InitTrig_KillUnit takes nothing returns nothing
    set gg_trg_KillUnit = CreateTrigger(  )
    call DisableTrigger( gg_trg_KillUnit )
    call TriggerRegisterTimerEventPeriodic( gg_trg_KillUnit, 60.00 )
    call TriggerAddAction( gg_trg_KillUnit, function Trig_KillUnit_Actions )
endfunction

// === family LightArrow (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightArrow_Conditions (family, line 35141) ---
function Trig_LightArrow_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0PI' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightArrow_Func002Func004C (family, line 35148) ---
function Trig_LightArrow_Func002Func004C takes nothing returns boolean
    if ( not ( IsUnitIllusionBJ(udg_NegiCastUnit) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(udg_NegiCastUnit, UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitInGroup(udg_NegiCastUnit, udg_Des_Group) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightArrow_Func002Func006C (family, line 35161) ---
function Trig_LightArrow_Func002Func006C takes nothing returns boolean
    if ( not ( udg_LightArrowAccount < ( ( GetHeroLevel(udg_NegiUnit) / 3 ) + 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightArrow_Func002C (family, line 35168) ---
function Trig_LightArrow_Func002C takes nothing returns boolean
    if ( not ( GetTriggerUnit() == GetSpellTargetUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightArrow_Actions (family, line 35175) ---
function Trig_LightArrow_Actions takes nothing returns nothing
    set udg_NegiUnit = GetTriggerUnit()
    if ( Trig_LightArrow_Func002C() ) then
        if ( Trig_LightArrow_Func002Func006C() ) then
            set udg_LightArrowAccount = ( udg_LightArrowAccount + 1 )
            call CreateNUnitsAtLoc( 1, 'u014', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        else
        endif
    else
        set udg_NegiMasterPoint = GetUnitLoc(GetTriggerUnit())
        set udg_LightArrowAccount = ( udg_LightArrowAccount + 1 )
        set udg_NegiCastUnit = GetSpellTargetUnit()
        if ( Trig_LightArrow_Func002Func004C() ) then
            call GroupAddUnitSimple( udg_NegiCastUnit, udg_Des_Group )
            call InitSetup( udg_NegiCastUnit )
        else
        endif
        call EnableTrigger( gg_trg_LightFire )
    endif
endfunction

// --- InitTrig_LightArrow (family, line 35197) ---
function InitTrig_LightArrow takes nothing returns nothing
    set gg_trg_LightArrow = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightArrow )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightArrow, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightArrow, Condition( function Trig_LightArrow_Conditions ) )
    call TriggerAddAction( gg_trg_LightArrow, function Trig_LightArrow_Actions )
endfunction

// --- InitSetup (helper, line 4958) ---
function InitSetup takes unit DesUnit returns nothing
    local trigger Tri
    local triggeraction TriAct 
    
    set Tri = CreateTrigger()
    set TriAct = TriggerAddAction( Tri , function DamageLink )

    call TriggerRegisterUnitEvent( Tri , DesUnit , EVENT_UNIT_DAMAGED )

    call SetHandleTrigger(  DesUnit , "DTri" , Tri    )
    // 傷害的觸發
    call SetHandleTriggerAction(  DesUnit , "DAct" , TriAct )
    // 傷害的動作

    set Tri = null
    set TriAct = null
    set DesUnit = null
endfunction

// === family MoveLightPoint (armed) events=none ===

// --- Trig_MoveLightPoint_Func001A (family, line 35263) ---
function Trig_MoveLightPoint_Func001A takes nothing returns nothing
    call IssuePointOrderLocBJ( GetEnumUnit(), "move", GetUnitLoc(udg_NegiUnit) )
endfunction

// --- Trig_MoveLightPoint_Actions (family, line 35267) ---
function Trig_MoveLightPoint_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_NegiUnit), 'u014'), function Trig_MoveLightPoint_Func001A )
endfunction

// --- InitTrig_MoveLightPoint (family, line 35272) ---
function InitTrig_MoveLightPoint takes nothing returns nothing
    set gg_trg_MoveLightPoint = CreateTrigger(  )
    call DisableTrigger( gg_trg_MoveLightPoint )
    call TriggerRegisterTimerEventPeriodic( gg_trg_MoveLightPoint, 2.00 )
    call TriggerAddAction( gg_trg_MoveLightPoint, function Trig_MoveLightPoint_Actions )
endfunction

// === family MoveStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MoveStart_Conditions (family, line 35295) ---
function Trig_MoveStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0PM' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveStart_Actions (family, line 35302) ---
function Trig_MoveStart_Actions takes nothing returns nothing
    set udg_NegiUnit = GetTriggerUnit()
    call EnableTrigger( gg_trg_MoveInst )
    call TriggerSleepAction( ( 0.50 * I2R(GetUnitAbilityLevelSwapped('A0PM', GetTriggerUnit())) ) )
    call DisableTrigger( gg_trg_MoveInst )
endfunction

// --- InitTrig_MoveStart (family, line 35310) ---
function InitTrig_MoveStart takes nothing returns nothing
    set gg_trg_MoveStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_MoveStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MoveStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MoveStart, Condition( function Trig_MoveStart_Conditions ) )
    call TriggerAddAction( gg_trg_MoveStart, function Trig_MoveStart_Actions )
endfunction

// === family NegiAccJudg (armed) events=none ===

// --- Trig_NegiAccJudg_Conditions (family, line 34893) ---
function Trig_NegiAccJudg_Conditions takes nothing returns boolean
    if ( not ( GetDyingUnit() == udg_NegiUnit ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NegiAccJudg_Func004A (family, line 34900) ---
function Trig_NegiAccJudg_Func004A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_NegiAccJudg_Actions (family, line 34905) ---
function Trig_NegiAccJudg_Actions takes nothing returns nothing
    set udg_LightArrowAccount = 0
    set udg_ThunderLanceAccount = 0
    set udg_NegiAbsorpDam = 0.00
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_NegiUnit), 'u014'), function Trig_NegiAccJudg_Func004A )
endfunction

// --- InitTrig_NegiAccJudg (family, line 34913) ---
function InitTrig_NegiAccJudg takes nothing returns nothing
    set gg_trg_NegiAccJudg = CreateTrigger(  )
    call DisableTrigger( gg_trg_NegiAccJudg )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NegiAccJudg, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_NegiAccJudg, Condition( function Trig_NegiAccJudg_Conditions ) )
    call TriggerAddAction( gg_trg_NegiAccJudg, function Trig_NegiAccJudg_Actions )
endfunction

// === family NegiAttJudg (armed) events=none ===

// --- Trig_NegiAttJudg_Conditions (family, line 35005) ---
function Trig_NegiAttJudg_Conditions takes nothing returns boolean
    if ( not ( GetTriggerUnit() == udg_NegiUnit ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NegiAttJudg_Actions (family, line 35012) ---
function Trig_NegiAttJudg_Actions takes nothing returns nothing
    set udg_NegiAttackUnit = null
endfunction

// --- InitTrig_NegiAttJudg (family, line 35017) ---
function InitTrig_NegiAttJudg takes nothing returns nothing
    set gg_trg_NegiAttJudg = CreateTrigger(  )
    call DisableTrigger( gg_trg_NegiAttJudg )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NegiAttJudg, EVENT_PLAYER_UNIT_USE_ITEM )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NegiAttJudg, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_NegiAttJudg, Condition( function Trig_NegiAttJudg_Conditions ) )
    call TriggerAddAction( gg_trg_NegiAttJudg, function Trig_NegiAttJudg_Actions )
endfunction

// === family NegiAttack (armed) events=none ===

// --- Trig_NegiAttack_Conditions (family, line 34945) ---
function Trig_NegiAttack_Conditions takes nothing returns boolean
    if ( not ( GetAttacker() == udg_NegiUnit ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NegiAttack_Func002Func003C (family, line 34952) ---
function Trig_NegiAttack_Func002Func003C takes nothing returns boolean
    if ( ( udg_LightArrowAccount > 0 ) ) then
        return true
    endif
    if ( ( udg_ThunderLanceAccount > 0 ) ) then
        return true
    endif
    if ( ( udg_NegiAbsorpFinDam > 0.00 ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_NegiAttack_Func002C (family, line 34965) ---
function Trig_NegiAttack_Func002C takes nothing returns boolean
    if ( not Trig_NegiAttack_Func002Func003C() ) then
        return false
    endif
    if ( not ( IsUnitInGroup(GetAttackedUnitBJ(), udg_Des_Group) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitIllusionBJ(GetAttackedUnitBJ()) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetAttackedUnitBJ(), GetOwningPlayer(udg_NegiUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NegiAttack_Actions (family, line 34984) ---
function Trig_NegiAttack_Actions takes nothing returns nothing
    set udg_NegiAttackUnit = GetAttackedUnitBJ()
    if ( Trig_NegiAttack_Func002C() ) then
        call GroupAddUnitSimple( GetTriggerUnit(), udg_Des_Group )
        call InitSetup( GetTriggerUnit() )
    else
    endif
endfunction

// --- InitTrig_NegiAttack (family, line 34994) ---
function InitTrig_NegiAttack takes nothing returns nothing
    set gg_trg_NegiAttack = CreateTrigger(  )
    call DisableTrigger( gg_trg_NegiAttack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NegiAttack, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_NegiAttack, Condition( function Trig_NegiAttack_Conditions ) )
    call TriggerAddAction( gg_trg_NegiAttack, function Trig_NegiAttack_Actions )
endfunction

// === family ThunderLance (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ThunderLance_Conditions (family, line 35355) ---
function Trig_ThunderLance_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Q5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThunderLance_Func002Func012C (family, line 35362) ---
function Trig_ThunderLance_Func002Func012C takes nothing returns boolean
    if ( not ( udg_ThunderLanceAccount < 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThunderLance_Func002C (family, line 35369) ---
function Trig_ThunderLance_Func002C takes nothing returns boolean
    if ( not ( GetTriggerUnit() == GetSpellTargetUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThunderLance_Actions (family, line 35376) ---
function Trig_ThunderLance_Actions takes nothing returns nothing
    set udg_NegiUnit = GetTriggerUnit()
    if ( Trig_ThunderLance_Func002C() ) then
        if ( Trig_ThunderLance_Func002Func012C() ) then
            set udg_ThunderLanceAccount = ( udg_ThunderLanceAccount + 1 )
        else
        endif
    else
        set udg_ThunderLanceAccount = ( udg_ThunderLanceAccount + 1 )
        set udg_NegiMasterPoint = GetUnitLoc(GetTriggerUnit())
        set udg_NegiPoint = GetSpellTargetLoc()
        set udg_NegiDistan = DistanceBetweenPoints(udg_NegiMasterPoint, udg_NegiPoint)
        set udg_NegiAngle = AngleBetweenPoints(udg_NegiMasterPoint, udg_NegiPoint)
        set udg_NegiAnimatIndex = 21
        set udg_NegiDistan = ( udg_NegiDistan / I2R(udg_NegiAnimatIndex) )
        set udg_NegiHight = 410.00
        call RemoveLocation( udg_NegiPoint )
        set udg_NegiInt = 1
        loop
            exitwhen udg_NegiInt > 9
            set udg_NegiPoint = PolarProjectionBJ(udg_NegiMasterPoint, 75.00, ( 40.00 * I2R(udg_NegiInt) ))
            call AddSpecialEffectLocBJ( udg_NegiPoint, "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call RemoveLocation( udg_NegiPoint )
            set udg_NegiInt = udg_NegiInt + 1
        endloop
        call EnableTrigger( gg_trg_ThunderCreate )
    endif
endfunction

// --- InitTrig_ThunderLance (family, line 35407) ---
function InitTrig_ThunderLance takes nothing returns nothing
    set gg_trg_ThunderLance = CreateTrigger(  )
    call DisableTrigger( gg_trg_ThunderLance )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ThunderLance, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ThunderLance, Condition( function Trig_ThunderLance_Conditions ) )
    call TriggerAddAction( gg_trg_ThunderLance, function Trig_ThunderLance_Actions )
endfunction

// === family absorp (armed) events=none ===

// --- Trig_absorp_Conditions (family, line 35711) ---
function Trig_absorp_Conditions takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetTriggerUnit(), 'B059') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_absorp_Actions (family, line 35718) ---
function Trig_absorp_Actions takes nothing returns nothing
    set udg_NegiAbsorpDam = ( udg_NegiAbsorpDam + GetEventDamage() )
    call DamageModify(0)
endfunction

// --- InitTrig_absorp (family, line 35724) ---
function InitTrig_absorp takes nothing returns nothing
    set gg_trg_absorp = CreateTrigger(  )
    call TriggerAddCondition( gg_trg_absorp, Condition( function Trig_absorp_Conditions ) )
    call TriggerAddAction( gg_trg_absorp, function Trig_absorp_Actions )
endfunction

// === family absorpStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_absorpStart_Conditions (family, line 35686) ---
function Trig_absorpStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Z8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_absorpStart_Actions (family, line 35693) ---
function Trig_absorpStart_Actions takes nothing returns nothing
    call TriggerSleepAction( 7.00 )
    set udg_NegiAbsorpFinDam = udg_NegiAbsorpDam
    set udg_NegiAbsorpDam = 0.00
endfunction

// --- InitTrig_absorpStart (family, line 35700) ---
function InitTrig_absorpStart takes nothing returns nothing
    set gg_trg_absorpStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_absorpStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_absorpStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_absorpStart, Condition( function Trig_absorpStart_Conditions ) )
    call TriggerAddAction( gg_trg_absorpStart, function Trig_absorpStart_Actions )
endfunction

// unit rawcode: H02V
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Horse, MLGBTemp, NewTrdHorse, UnhappyEyes

// === family Open_Skill_of_Horse (armed) events=none ===

// --- Trig_Open_Skill_of_Horse_Conditions (family, line 45132) ---
function Trig_Open_Skill_of_Horse_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H02V' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Horse_Actions (family, line 45139) ---
function Trig_Open_Skill_of_Horse_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_Horse = GetTriggerUnit()
    set udg_MLGBarea = gg_rct_MLGBDes
    call TriggerRegisterUnitEvent( gg_trg_UnhappyEyes, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
    call EnableTrigger( gg_trg_NewTrdHorse )
    call EnableTrigger( gg_trg_MLGBTemp )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "瀟灑: = =+" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Horse (family, line 45151) ---
function InitTrig_Open_Skill_of_Horse takes nothing returns nothing
    set gg_trg_Open_Skill_of_Horse = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Horse, GetEntireMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Horse, Condition( function Trig_Open_Skill_of_Horse_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Horse, function Trig_Open_Skill_of_Horse_Actions )
endfunction

// === family MLGBTemp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MLGBTemp_Conditions (family, line 45412) ---
function Trig_MLGBTemp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A06Y' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MLGBTemp_Actions (family, line 45419) ---
function Trig_MLGBTemp_Actions takes nothing returns nothing
    call EnableTrigger( gg_trg_MLGBTempSteal )
    call TriggerSleepAction( 6.00 )
    call DisableTrigger( gg_trg_MLGBTempSteal )
endfunction

// --- InitTrig_MLGBTemp (family, line 45426) ---
function InitTrig_MLGBTemp takes nothing returns nothing
    set gg_trg_MLGBTemp = CreateTrigger(  )
    call DisableTrigger( gg_trg_MLGBTemp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MLGBTemp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MLGBTemp, Condition( function Trig_MLGBTemp_Conditions ) )
    call TriggerAddAction( gg_trg_MLGBTemp, function Trig_MLGBTemp_Actions )
endfunction

// === family NewTrdHorse (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NewTrdHorse_Conditions (family, line 45350) ---
function Trig_NewTrdHorse_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0WB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NewTrdHorse_Func003C (family, line 45357) ---
function Trig_NewTrdHorse_Func003C takes nothing returns boolean
    if ( not ( udg_Horse_Dam > ( 400.00 * I2R(GetUnitAbilityLevelSwapped('A0WB', GetTriggerUnit())) ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NewTrdHorse_Func004Func001C (family, line 45364) ---
function Trig_NewTrdHorse_Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NewTrdHorse_Func004A (family, line 45371) ---
function Trig_NewTrdHorse_Func004A takes nothing returns nothing
    if ( Trig_NewTrdHorse_Func004Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), udg_Horse_Dam, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call TextUse(R2S(udg_Horse_Dam), GetEnumUnit() , 10 , 4 , 80,10,10)
    else
    endif
endfunction

// --- Trig_NewTrdHorse_Func012A (family, line 45379) ---
function Trig_NewTrdHorse_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_NewTrdHorse_Actions (family, line 45384) ---
function Trig_NewTrdHorse_Actions takes nothing returns nothing
    set udg_Horse_Point = GetUnitLoc(GetTriggerUnit())
    set udg_Horse_Dam = ( I2R(GetPlayerState(GetOwningPlayer(GetTriggerUnit()), PLAYER_STATE_RESOURCE_GOLD)) * ( 0.10 * I2R(GetUnitAbilityLevelSwapped('A0WB', GetTriggerUnit())) ) )
    if ( Trig_NewTrdHorse_Func003C() ) then
        set udg_Horse_Dam = ( 400.00 * I2R(GetUnitAbilityLevelSwapped('A0WB', GetTriggerUnit())) )
    else
    endif
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, udg_Horse_Point), function Trig_NewTrdHorse_Func004A )
    call CreateNUnitsAtLoc( 1, 'o00Q', GetOwningPlayer(udg_Horse), udg_Horse_Point, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
    call PlaySoundOnUnitBJ( gg_snd_Taunt, 100, udg_Horse )
    call RemoveLocation( udg_Horse_Point )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Horse), 'o00Q'), function Trig_NewTrdHorse_Func012A )
endfunction

// --- InitTrig_NewTrdHorse (family, line 45401) ---
function InitTrig_NewTrdHorse takes nothing returns nothing
    set gg_trg_NewTrdHorse = CreateTrigger(  )
    call DisableTrigger( gg_trg_NewTrdHorse )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NewTrdHorse, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_NewTrdHorse, Condition( function Trig_NewTrdHorse_Conditions ) )
    call TriggerAddAction( gg_trg_NewTrdHorse, function Trig_NewTrdHorse_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

// === family UnhappyEyes (armed) events=none ===

// --- Trig_UnhappyEyes_Actions (family, line 45171) ---
function Trig_UnhappyEyes_Actions takes nothing returns nothing
    local real attack_angle = GetUnitFacing(GetEventDamageSource())
    local real horse_angle = GetUnitFacing(GetTriggerUnit())
    local real face_angle
    local location UnitPoint 

    set face_angle = ModuloReal(( attack_angle - horse_angle ), 360.00)
    if ( UnhappyEyesJudge(face_angle) ) then
       set UnitPoint = GetUnitLoc(GetTriggerUnit())
       call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), UnitPoint, bj_UNIT_FACING )
       call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
       call RemoveUnitSP( GetLastCreatedUnit() , 2.00 , 1.00)
       call ShowUnitHide( GetLastCreatedUnit() )
       call UnitAddAbilityBJ( 'A0W7', GetLastCreatedUnit() )
       call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", GetEventDamageSource() )
    endif
    call RemoveLocation(UnitPoint)
endfunction

// --- InitTrig_UnhappyEyes (family, line 45191) ---
function InitTrig_UnhappyEyes takes nothing returns nothing
    set gg_trg_UnhappyEyes = CreateTrigger(  )
    call TriggerAddAction( gg_trg_UnhappyEyes, function Trig_UnhappyEyes_Actions )
endfunction

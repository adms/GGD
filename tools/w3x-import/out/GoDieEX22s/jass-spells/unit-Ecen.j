// unit rawcode: Ecen
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_John, Initiate_Mark, Marking, Whisky, Wine_Extract_Initiate, Wine_Timer

// === family Open_Skill_of_John (armed) events=none ===

// --- Trig_Open_Skill_of_John_Conditions (family, line 46456) ---
function Trig_Open_Skill_of_John_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Ecen' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_John_Actions (family, line 46463) ---
function Trig_Open_Skill_of_John_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_Whisky )
    call EnableTrigger( gg_trg_Wine_Extract_Initiate )
    call EnableTrigger( gg_trg_Wine_Timer )
    call EnableTrigger( gg_trg_Initiate_Mark )
    call EnableTrigger( gg_trg_Marking )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "約翰走路: 誰會想去喝牛分泌出來的白色液體呀" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_John (family, line 46475) ---
function InitTrig_Open_Skill_of_John takes nothing returns nothing
    set gg_trg_Open_Skill_of_John = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_John, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_John, Condition( function Trig_Open_Skill_of_John_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_John, function Trig_Open_Skill_of_John_Actions )
endfunction

// === family Initiate_Mark (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Initiate_Mark_Conditions (family, line 46651) ---
function Trig_Initiate_Mark_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0A3' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initiate_Mark_Actions (family, line 46658) ---
function Trig_Initiate_Mark_Actions takes nothing returns nothing
    set udg_Mark = GetTriggerUnit()
endfunction

// --- InitTrig_Initiate_Mark (family, line 46663) ---
function InitTrig_Initiate_Mark takes nothing returns nothing
    set gg_trg_Initiate_Mark = CreateTrigger(  )
    call DisableTrigger( gg_trg_Initiate_Mark )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Initiate_Mark, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Initiate_Mark, Condition( function Trig_Initiate_Mark_Conditions ) )
    call TriggerAddAction( gg_trg_Initiate_Mark, function Trig_Initiate_Mark_Actions )
endfunction

// === family Marking (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_Marking_Func001C (family, line 46674) ---
function Trig_Marking_Func001C takes nothing returns boolean
    if ( ( UnitHasBuffBJ(GetAttackedUnitBJ(), 'B00I') == true ) ) then
        return true
    endif
    if ( ( UnitHasBuffBJ(GetAttackedUnitBJ(), 'B05A') == true ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Marking_Conditions (family, line 46684) ---
function Trig_Marking_Conditions takes nothing returns boolean
    if ( not Trig_Marking_Func001C() ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttacker()), GetOwningPlayer(GetAttackedUnitBJ())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Marking_Func002C (family, line 46694) ---
function Trig_Marking_Func002C takes nothing returns boolean
    if ( not ( IsUnitType(GetAttacker(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Marking_Actions (family, line 46701) ---
function Trig_Marking_Actions takes nothing returns nothing
    if ( Trig_Marking_Func002C() ) then
        call UnitDamageTargetBJ( udg_Mark, GetAttacker(), ( GetRandomReal(20.00, 60.00) + ( I2R(GetUnitAbilityLevelSwapped('A0A3', udg_Mark)) * 40.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( udg_Mark, GetAttacker(), ( GetRandomReal(10.00, 50.00) + ( I2R(GetUnitAbilityLevelSwapped('A0A3', udg_Mark)) * 10.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
endfunction

// --- InitTrig_Marking (family, line 46710) ---
function InitTrig_Marking takes nothing returns nothing
    set gg_trg_Marking = CreateTrigger(  )
    call DisableTrigger( gg_trg_Marking )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Marking, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Marking, Condition( function Trig_Marking_Conditions ) )
    call TriggerAddAction( gg_trg_Marking, function Trig_Marking_Actions )
endfunction

// === family Whisky (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Whisky_Conditions (family, line 46485) ---
function Trig_Whisky_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0A2' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Whisky_Actions (family, line 46492) ---
function Trig_Whisky_Actions takes nothing returns nothing
    call UnitDamageTargetBJ( GetSpellAbilityUnit(), GetSpellTargetUnit(), ( 0.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0A2', GetSpellAbilityUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MIND )
endfunction

// --- InitTrig_Whisky (family, line 46497) ---
function InitTrig_Whisky takes nothing returns nothing
    set gg_trg_Whisky = CreateTrigger(  )
    call DisableTrigger( gg_trg_Whisky )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Whisky, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Whisky, Condition( function Trig_Whisky_Conditions ) )
    call TriggerAddAction( gg_trg_Whisky, function Trig_Whisky_Actions )
endfunction

// === family Wine_Extract_Initiate (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Wine_Extract_Initiate_Conditions (family, line 46508) ---
function Trig_Wine_Extract_Initiate_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0A7' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Func004Func001C (family, line 46515) ---
function Trig_Wine_Extract_Initiate_Func004Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_ArcaneUnit, 'B00I') == false ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(udg_ArcaneUnit, 'B05A') == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Func004Func002C (family, line 46525) ---
function Trig_Wine_Extract_Initiate_Func004Func002C takes nothing returns boolean
    if ( not ( IsUnitAlly(udg_ArcaneUnit2, GetOwningPlayer(udg_ArcaneUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Func004Func003C (family, line 46532) ---
function Trig_Wine_Extract_Initiate_Func004Func003C takes nothing returns boolean
    if ( not ( IsUnitAlly(udg_ArcaneUnit2, GetOwningPlayer(udg_ArcaneUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Func004C (family, line 46539) ---
function Trig_Wine_Extract_Initiate_Func004C takes nothing returns boolean
    if ( not Trig_Wine_Extract_Initiate_Func004Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Actions (family, line 46546) ---
function Trig_Wine_Extract_Initiate_Actions takes nothing returns nothing
    set udg_ArcaneUnit = GetTriggerUnit()
    set udg_ArcaneUnit2 = GetSpellTargetUnit()
    set udg_ArcaneInt = GetUnitAbilityLevelSwapped('A0A7', udg_ArcaneUnit)
    if ( Trig_Wine_Extract_Initiate_Func004C() ) then
        if ( Trig_Wine_Extract_Initiate_Func004Func003C() ) then
            call UnitDamageTargetBJ( udg_ArcaneUnit, udg_ArcaneUnit2, ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call SetUnitLifeBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ) ) )
            call SetUnitManaBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ) ) )
        endif
    else
        if ( Trig_Wine_Extract_Initiate_Func004Func002C() ) then
            call UnitDamageTargetBJ( udg_ArcaneUnit, udg_ArcaneUnit2, ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call SetUnitLifeBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ) ) )
            call SetUnitManaBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ) ) )
        endif
    endif
    call StartTimerBJ( udg_ArcaneTimer, true, 1.00 )
endfunction

// --- InitTrig_Wine_Extract_Initiate (family, line 46569) ---
function InitTrig_Wine_Extract_Initiate takes nothing returns nothing
    set gg_trg_Wine_Extract_Initiate = CreateTrigger(  )
    call DisableTrigger( gg_trg_Wine_Extract_Initiate )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Wine_Extract_Initiate, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Wine_Extract_Initiate, Condition( function Trig_Wine_Extract_Initiate_Conditions ) )
    call TriggerAddAction( gg_trg_Wine_Extract_Initiate, function Trig_Wine_Extract_Initiate_Actions )
endfunction

// === family Wine_Timer (armed) events=none ===

// --- Trig_Wine_Timer_Func001Func001Func001C (family, line 46580) ---
function Trig_Wine_Timer_Func001Func001Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_ArcaneUnit, 'B00I') == false ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(udg_ArcaneUnit, 'B05A') == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Timer_Func001Func001Func002C (family, line 46590) ---
function Trig_Wine_Timer_Func001Func001Func002C takes nothing returns boolean
    if ( not ( IsUnitAlly(udg_ArcaneUnit2, GetOwningPlayer(udg_ArcaneUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Timer_Func001Func001Func003C (family, line 46597) ---
function Trig_Wine_Timer_Func001Func001Func003C takes nothing returns boolean
    if ( not ( IsUnitAlly(udg_ArcaneUnit2, GetOwningPlayer(udg_ArcaneUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Timer_Func001Func001C (family, line 46604) ---
function Trig_Wine_Timer_Func001Func001C takes nothing returns boolean
    if ( not Trig_Wine_Timer_Func001Func001Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Timer_Func001C (family, line 46611) ---
function Trig_Wine_Timer_Func001C takes nothing returns boolean
    if ( not ( OrderId2StringBJ(GetUnitCurrentOrder(udg_ArcaneUnit)) == "channel" ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Timer_Actions (family, line 46618) ---
function Trig_Wine_Timer_Actions takes nothing returns nothing
    if ( Trig_Wine_Timer_Func001C() ) then
        if ( Trig_Wine_Timer_Func001Func001C() ) then
            if ( Trig_Wine_Timer_Func001Func001Func003C() ) then
                call UnitDamageTargetBJ( udg_ArcaneUnit, udg_ArcaneUnit2, ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            else
                call SetUnitLifeBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ) ) )
                call SetUnitManaBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ) ) )
            endif
        else
            if ( Trig_Wine_Timer_Func001Func001Func002C() ) then
                call UnitDamageTargetBJ( udg_ArcaneUnit, udg_ArcaneUnit2, ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            else
                call SetUnitLifeBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ) ) )
                call SetUnitManaBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ) ) )
            endif
        endif
    else
        call PauseTimerBJ( true, udg_ArcaneTimer )
    endif
endfunction

// --- InitTrig_Wine_Timer (family, line 46641) ---
function InitTrig_Wine_Timer takes nothing returns nothing
    set gg_trg_Wine_Timer = CreateTrigger(  )
    call DisableTrigger( gg_trg_Wine_Timer )
    call TriggerRegisterTimerExpireEventBJ( gg_trg_Wine_Timer, udg_ArcaneTimer )
    call TriggerAddAction( gg_trg_Wine_Timer, function Trig_Wine_Timer_Actions )
endfunction

// unit rawcode: N00B
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Dora, Copy, CutUHead, PacketItem, TimeMachine, TimeMachineRev, Wohoo, JumpsDamage

// === family Open_Skill_of_Dora (armed) events=none ===

// --- Trig_Open_Skill_of_Dora_Conditions (family, line 45531) ---
function Trig_Open_Skill_of_Dora_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'N00B' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Dora_Actions (family, line 45538) ---
function Trig_Open_Skill_of_Dora_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_PacketItem )
    call EnableTrigger( gg_trg_Wohoo )
    call EnableTrigger( gg_trg_CutUHead )
    call EnableTrigger( gg_trg_Copy )
    call EnableTrigger( gg_trg_TimeMachine )
    call EnableTrigger( gg_trg_TimeMachineRev )
    call DisableTrigger( GetTriggeringTrigger() )
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        set udg_Dora_TM_HP[GetForLoopIndexA()] = 9999.00
        set udg_Dora_TM_MP[GetForLoopIndexA()] = 9999.00
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "小叮噹: 你是我的大雄嗎?" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Dora (family, line 45559) ---
function InitTrig_Open_Skill_of_Dora takes nothing returns nothing
    set gg_trg_Open_Skill_of_Dora = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Dora, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Dora, Condition( function Trig_Open_Skill_of_Dora_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Dora, function Trig_Open_Skill_of_Dora_Actions )
endfunction

// === family Copy (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Copy_Conditions (family, line 45777) ---
function Trig_Copy_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0NE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Copy_Func001C (family, line 45784) ---
function Trig_Copy_Func001C takes nothing returns boolean
    if ( not ( GetSpellTargetUnit() == gg_unit_Utic_0117 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Copy_Actions (family, line 45791) ---
function Trig_Copy_Actions takes nothing returns nothing
    if ( Trig_Copy_Func001C() ) then
        call IssueImmediateOrderBJ( GetTriggerUnit(), "stop" )
    else
    endif
    call PlaySoundOnUnitBJ( gg_snd_SpellbreakerPissed4, 100.00, GetTriggerUnit() )
endfunction

// --- InitTrig_Copy (family, line 45800) ---
function InitTrig_Copy takes nothing returns nothing
    set gg_trg_Copy = CreateTrigger(  )
    call DisableTrigger( gg_trg_Copy )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Copy, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Copy, Condition( function Trig_Copy_Conditions ) )
    call TriggerAddAction( gg_trg_Copy, function Trig_Copy_Actions )
endfunction

// === family CutUHead (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CutUHead_Conditions (family, line 45709) ---
function Trig_CutUHead_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JN' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CutUHead_Actions (family, line 45716) ---
function Trig_CutUHead_Actions takes nothing returns nothing
    set udg_DoraFlyCaster = GetTriggerUnit()
    set udg_DoraFlyPoint = GetUnitLoc(GetSpellTargetUnit())
    set udg_DoraFlyLV = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_DoraFlyIndex = 0
    set udg_DoraFly_Angle = GetUnitFacing(GetTriggerUnit())
    call EnableTrigger( gg_trg_CutUHead_effect )
endfunction

// --- InitTrig_CutUHead (family, line 45726) ---
function InitTrig_CutUHead takes nothing returns nothing
    set gg_trg_CutUHead = CreateTrigger(  )
    call DisableTrigger( gg_trg_CutUHead )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CutUHead, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CutUHead, Condition( function Trig_CutUHead_Conditions ) )
    call TriggerAddAction( gg_trg_CutUHead, function Trig_CutUHead_Actions )
endfunction

// === family PacketItem (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_PacketItem_Conditions (family, line 45569) ---
function Trig_PacketItem_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CY' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PacketItem_Func002Func001Func001C (family, line 45576) ---
function Trig_PacketItem_Func002Func001Func001C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 6) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PacketItem_Func002Func001C (family, line 45583) ---
function Trig_PacketItem_Func002Func001C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 5) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PacketItem_Func002C (family, line 45590) ---
function Trig_PacketItem_Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 4) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PacketItem_Actions (family, line 45597) ---
function Trig_PacketItem_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.50 )
    if ( Trig_PacketItem_Func002C() ) then
        if ( Trig_PacketItem_Func002Func001C() ) then
            if ( Trig_PacketItem_Func002Func001Func001C() ) then
                call CreateItemLoc( 'whwd', GetUnitLoc(GetTriggerUnit()) )
            else
                call CreateItemLoc( 'pres', GetUnitLoc(GetTriggerUnit()) )
            endif
        else
            call CreateItemLoc( 'pghe', GetUnitLoc(GetTriggerUnit()) )
        endif
    else
        call CreateItemLoc( 'phea', GetUnitLoc(GetTriggerUnit()) )
    endif
endfunction

// --- InitTrig_PacketItem (family, line 45615) ---
function InitTrig_PacketItem takes nothing returns nothing
    set gg_trg_PacketItem = CreateTrigger(  )
    call DisableTrigger( gg_trg_PacketItem )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PacketItem, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_PacketItem, Condition( function Trig_PacketItem_Conditions ) )
    call TriggerAddAction( gg_trg_PacketItem, function Trig_PacketItem_Actions )
endfunction

// === family TimeMachine (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_TimeMachine_Conditions (family, line 45811) ---
function Trig_TimeMachine_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TimeMachine_Func001Func001C (family, line 45818) ---
function Trig_TimeMachine_Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_PlayerHeroUnit[GetForLoopIndexA()]) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TimeMachine_Actions (family, line 45828) ---
function Trig_TimeMachine_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_TimeMachine_Func001Func001C() ) then
            set udg_Dora_TM_HP[GetForLoopIndexA()] = GetUnitStateSwap(UNIT_STATE_LIFE, udg_PlayerHeroUnit[GetForLoopIndexA()])
            set udg_Dora_TM_MP[GetForLoopIndexA()] = GetUnitStateSwap(UNIT_STATE_MANA, udg_PlayerHeroUnit[GetForLoopIndexA()])
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
endfunction

// --- InitTrig_TimeMachine (family, line 45843) ---
function InitTrig_TimeMachine takes nothing returns nothing
    set gg_trg_TimeMachine = CreateTrigger(  )
    call DisableTrigger( gg_trg_TimeMachine )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TimeMachine, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_TimeMachine, Condition( function Trig_TimeMachine_Conditions ) )
    call TriggerAddAction( gg_trg_TimeMachine, function Trig_TimeMachine_Actions )
endfunction

// === family TimeMachineRev (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_TimeMachineRev_Conditions (family, line 45854) ---
function Trig_TimeMachineRev_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MT' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TimeMachineRev_Func001Func001C (family, line 45861) ---
function Trig_TimeMachineRev_Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_PlayerHeroUnit[GetForLoopIndexA()]) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TimeMachineRev_Actions (family, line 45871) ---
function Trig_TimeMachineRev_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_TimeMachineRev_Func001Func001C() ) then
            call SetUnitLifeBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], udg_Dora_TM_HP[GetForLoopIndexA()] )
            call SetUnitManaBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], udg_Dora_TM_MP[GetForLoopIndexA()] )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_PlayerHeroUnit[GetForLoopIndexA()], "Abilities\\Spells\\Items\\TomeOfRetraining\\TomeOfRetrainingCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        set udg_Dora_TM_HP[GetForLoopIndexA()] = 9999.00
        set udg_Dora_TM_MP[GetForLoopIndexA()] = 9999.00
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
endfunction

// --- InitTrig_TimeMachineRev (family, line 45896) ---
function InitTrig_TimeMachineRev takes nothing returns nothing
    set gg_trg_TimeMachineRev = CreateTrigger(  )
    call DisableTrigger( gg_trg_TimeMachineRev )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TimeMachineRev, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_TimeMachineRev, Condition( function Trig_TimeMachineRev_Conditions ) )
    call TriggerAddAction( gg_trg_TimeMachineRev, function Trig_TimeMachineRev_Actions )
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

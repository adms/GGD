// unit rawcode: Efur
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_AFu, BeDragon_Target, fastStep

// === family Open_Skill_of_AFu (armed) events=none ===

// --- Trig_Open_Skill_of_AFu_Conditions (family, line 44980) ---
function Trig_Open_Skill_of_AFu_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Efur' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_AFu_Actions (family, line 44987) ---
function Trig_Open_Skill_of_AFu_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_AFuUnit = GetTriggerUnit()
    call EnableTrigger( gg_trg_fastStep )
    call EnableTrigger( gg_trg_BeDragon_Target )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "傑落: 今天晚餐要吃什麼勒~" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_AFu (family, line 44997) ---
function InitTrig_Open_Skill_of_AFu takes nothing returns nothing
    set gg_trg_Open_Skill_of_AFu = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_AFu, GetEntireMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_AFu, Condition( function Trig_Open_Skill_of_AFu_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_AFu, function Trig_Open_Skill_of_AFu_Actions )
endfunction

// === family BeDragon_Target (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BeDragon_Target_Conditions (family, line 45095) ---
function Trig_BeDragon_Target_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A10H' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BeDragon_Target_Actions (family, line 45102) ---
function Trig_BeDragon_Target_Actions takes nothing returns nothing
    call InitSetup( GetSpellTargetUnit() )
endfunction

// --- InitTrig_BeDragon_Target (family, line 45107) ---
function InitTrig_BeDragon_Target takes nothing returns nothing
    set gg_trg_BeDragon_Target = CreateTrigger(  )
    call DisableTrigger( gg_trg_BeDragon_Target )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BeDragon_Target, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BeDragon_Target, Condition( function Trig_BeDragon_Target_Conditions ) )
    call TriggerAddAction( gg_trg_BeDragon_Target, function Trig_BeDragon_Target_Actions )
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

// === family fastStep (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_fastStep_Conditions (family, line 45007) ---
function Trig_fastStep_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'AEtq' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_fastStep_Func007A (family, line 45014) ---
function Trig_fastStep_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_fastStep_Actions (family, line 45019) ---
function Trig_fastStep_Actions takes nothing returns nothing
    set udg_AFuUnit = GetTriggerUnit()
    call UnitAddAbilityBJ( 'A050', udg_AFuUnit )
    call EnableTrigger( gg_trg_fastStepGo )
    call TriggerSleepAction( ( 1 + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), udg_AFuUnit)) * 2.00 ) ) )
    call DisableTrigger( gg_trg_fastStepGo )
    call UnitRemoveAbilityBJ( 'A050', udg_AFuUnit )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_AFuUnit), 'o011'), function Trig_fastStep_Func007A )
endfunction

// --- InitTrig_fastStep (family, line 45030) ---
function InitTrig_fastStep takes nothing returns nothing
    set gg_trg_fastStep = CreateTrigger(  )
    call DisableTrigger( gg_trg_fastStep )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_fastStep, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_fastStep, Condition( function Trig_fastStep_Conditions ) )
    call TriggerAddAction( gg_trg_fastStep, function Trig_fastStep_Actions )
endfunction

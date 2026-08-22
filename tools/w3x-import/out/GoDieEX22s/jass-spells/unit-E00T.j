// unit rawcode: E00T
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_ButtyGhost, ButtyAfraid, ButtyGhost_Scare, ButtyGhost_SoulDash_Cast, ButtyGhost_SoulDash_Level, ButtyGhost_SoulDash_Stop

// === family Open_Skill_of_ButtyGhost (armed) events=none ===

// --- Trig_Open_Skill_of_ButtyGhost_Conditions (family, line 48769) ---
function Trig_Open_Skill_of_ButtyGhost_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00T' ) ) then
        return false
    endif
    if ( not ( IsUnitIllusionBJ(GetTriggerUnit()) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_ButtyGhost_Actions (family, line 48779) ---
function Trig_Open_Skill_of_ButtyGhost_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call PlaySoundOnUnitBJ( gg_snd_SpiritLodgeWhat1, 100.00, GetTriggerUnit() )
    call EnableTrigger( gg_trg_ButtyAfraid )
    call TriggerRegisterUnitEvent( gg_trg_ButtyAfraid, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
    call EnableTrigger( gg_trg_ButtyGhost_Scare )
    // 靈壓震撼
    set udg_ButtyGhost_SD = GetTriggerUnit()
    call SetPlayerAbilityAvailableBJ( false, 'A0ID', GetOwningPlayer(GetTriggerUnit()) )
    call EnableTrigger( gg_trg_ButtyGhost_SoulDash_Cast )
    call TriggerRegisterUnitEvent( gg_trg_ButtyGhost_SoulDash_Cast, GetTriggerUnit(), EVENT_UNIT_ISSUED_ORDER )
    call EnableTrigger( gg_trg_ButtyGhost_SoulDash_Level )
    call TriggerRegisterUnitEvent( gg_trg_ButtyGhost_SoulDash_Level, GetTriggerUnit(), EVENT_UNIT_HERO_LEVEL )
    call TriggerRegisterUnitEvent( gg_trg_ButtyGhost_SoulDash_Level, GetTriggerUnit(), EVENT_UNIT_HERO_SKILL )
    call EnableTrigger( gg_trg_ButtyGhost_SoulDash_Stop )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "貞子: 你再不還錄影帶...會罰款唷..." + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_ButtyGhost (family, line 48798) ---
function InitTrig_Open_Skill_of_ButtyGhost takes nothing returns nothing
    set gg_trg_Open_Skill_of_ButtyGhost = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_ButtyGhost, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_ButtyGhost, Condition( function Trig_Open_Skill_of_ButtyGhost_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_ButtyGhost, function Trig_Open_Skill_of_ButtyGhost_Actions )
endfunction

// === family ButtyAfraid (armed) events=none ===

// --- Trig_ButtyAfraid_Conditions (family, line 48808) ---
function Trig_ButtyAfraid_Conditions takes nothing returns boolean
    if ( not ( IsUnitType(GetEventDamageSource(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ButtyAfraid_Actions (family, line 48815) ---
function Trig_ButtyAfraid_Actions takes nothing returns nothing
    set udg_ButtyAfraidPoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'h01C', GetOwningPlayer(GetEventDamageSource()), udg_ButtyAfraidPoint, bj_UNIT_FACING )
    set udg_ButtyCreateUnit = GetLastCreatedUnit()
    call UnitAddAbilityBJ( 'ACcs', udg_ButtyCreateUnit )
    call ShowUnitHide( udg_ButtyCreateUnit )
    call IssueTargetOrderBJ( udg_ButtyCreateUnit, "curse", GetEventDamageSource() )
    call KillUnit( udg_ButtyCreateUnit )
    call RemoveUnit( udg_ButtyCreateUnit )
    call RemoveLocation( udg_ButtyAfraidPoint )
endfunction

// --- InitTrig_ButtyAfraid (family, line 48828) ---
function InitTrig_ButtyAfraid takes nothing returns nothing
    set gg_trg_ButtyAfraid = CreateTrigger(  )
    call DisableTrigger( gg_trg_ButtyAfraid )
    call TriggerAddCondition( gg_trg_ButtyAfraid, Condition( function Trig_ButtyAfraid_Conditions ) )
    call TriggerAddAction( gg_trg_ButtyAfraid, function Trig_ButtyAfraid_Actions )
endfunction

// === family ButtyGhost_Scare (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ButtyGhost_Scare_Conditions (family, line 48865) ---
function Trig_ButtyGhost_Scare_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0I8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ButtyGhost_Scare_Actions (family, line 48872) ---
function Trig_ButtyGhost_Scare_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.00 )
    set udg_P0 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_P0, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0I9', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0I9', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0I8', GetTriggerUnit()) )
    call SetUnitFacingToFaceLocTimed( GetLastCreatedUnit(), udg_P0, 0 )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "silence", udg_P0 )
    call RemoveLocation( udg_P0 )
    call PlaySoundOnUnitBJ( gg_snd_NecropolisUpgrade2, 100.00, GetTriggerUnit() )
endfunction

// --- InitTrig_ButtyGhost_Scare (family, line 48886) ---
function InitTrig_ButtyGhost_Scare takes nothing returns nothing
    set gg_trg_ButtyGhost_Scare = CreateTrigger(  )
    call DisableTrigger( gg_trg_ButtyGhost_Scare )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ButtyGhost_Scare, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ButtyGhost_Scare, Condition( function Trig_ButtyGhost_Scare_Conditions ) )
    call TriggerAddAction( gg_trg_ButtyGhost_Scare, function Trig_ButtyGhost_Scare_Actions )
endfunction

// === family ButtyGhost_SoulDash_Cast (armed) events=none ===

// --- Trig_ButtyGhost_SoulDash_Cast_Conditions (family, line 48911) ---
function Trig_ButtyGhost_SoulDash_Cast_Conditions takes nothing returns boolean
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("immolation") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ButtyGhost_SoulDash_Cast_Actions (family, line 48918) ---
function Trig_ButtyGhost_SoulDash_Cast_Actions takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( true, 'A0ID', GetOwningPlayer(GetTriggerUnit()) )
    call EnableTrigger( gg_trg_DeathSpread )
endfunction

// --- InitTrig_ButtyGhost_SoulDash_Cast (family, line 48924) ---
function InitTrig_ButtyGhost_SoulDash_Cast takes nothing returns nothing
    set gg_trg_ButtyGhost_SoulDash_Cast = CreateTrigger(  )
    call DisableTrigger( gg_trg_ButtyGhost_SoulDash_Cast )
    call TriggerAddCondition( gg_trg_ButtyGhost_SoulDash_Cast, Condition( function Trig_ButtyGhost_SoulDash_Cast_Conditions ) )
    call TriggerAddAction( gg_trg_ButtyGhost_SoulDash_Cast, function Trig_ButtyGhost_SoulDash_Cast_Actions )
endfunction

// === family ButtyGhost_SoulDash_Level (passive) events=none ===

// --- Trig_ButtyGhost_SoulDash_Level_Actions (family, line 48897) ---
function Trig_ButtyGhost_SoulDash_Level_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0ID', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0IC', GetTriggerUnit()) )
endfunction

// --- InitTrig_ButtyGhost_SoulDash_Level (family, line 48902) ---
function InitTrig_ButtyGhost_SoulDash_Level takes nothing returns nothing
    set gg_trg_ButtyGhost_SoulDash_Level = CreateTrigger(  )
    call DisableTrigger( gg_trg_ButtyGhost_SoulDash_Level )
    call TriggerAddAction( gg_trg_ButtyGhost_SoulDash_Level, function Trig_ButtyGhost_SoulDash_Level_Actions )
endfunction

// === family ButtyGhost_SoulDash_Stop (armed) events=none ===

// --- Trig_ButtyGhost_SoulDash_Stop_Conditions (family, line 48934) ---
function Trig_ButtyGhost_SoulDash_Stop_Conditions takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_ButtyGhost_SD, 'B025') == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ButtyGhost_SoulDash_Stop_Actions (family, line 48941) ---
function Trig_ButtyGhost_SoulDash_Stop_Actions takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( false, 'A0ID', GetOwningPlayer(udg_ButtyGhost_SD) )
    call DisableTrigger( gg_trg_DeathSpread )
endfunction

// --- InitTrig_ButtyGhost_SoulDash_Stop (family, line 48947) ---
function InitTrig_ButtyGhost_SoulDash_Stop takes nothing returns nothing
    set gg_trg_ButtyGhost_SoulDash_Stop = CreateTrigger(  )
    call DisableTrigger( gg_trg_ButtyGhost_SoulDash_Stop )
    call TriggerRegisterTimerEventPeriodic( gg_trg_ButtyGhost_SoulDash_Stop, 0.20 )
    call TriggerAddCondition( gg_trg_ButtyGhost_SoulDash_Stop, Condition( function Trig_ButtyGhost_SoulDash_Stop_Conditions ) )
    call TriggerAddAction( gg_trg_ButtyGhost_SoulDash_Stop, function Trig_ButtyGhost_SoulDash_Stop_Actions )
endfunction

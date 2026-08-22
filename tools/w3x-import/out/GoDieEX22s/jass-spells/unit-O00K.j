// unit rawcode: O00K
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Pikachu_Copy, NoCute, PIKACHU

// === family Open_Skill_of_Pikachu_Copy (armed) events=none ===

// --- Trig_Open_Skill_of_Pikachu_Copy_Conditions (family, line 40388) ---
function Trig_Open_Skill_of_Pikachu_Copy_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O00K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Pikachu_Copy_Func008A (family, line 40395) ---
function Trig_Open_Skill_of_Pikachu_Copy_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Open_Skill_of_Pikachu_Copy_Actions (family, line 40400) ---
function Trig_Open_Skill_of_Pikachu_Copy_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_NoCute )
    call EnableTrigger( gg_trg_PIKACHU )
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_SpecialUnitCreateArea), bj_UNIT_FACING )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "皮卡娘: 人..人家才不是為了幫你才來的，你可別誤會了喔" + "|r" ) ) )
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'o00E'), function Trig_Open_Skill_of_Pikachu_Copy_Func008A )
endfunction

// --- InitTrig_Open_Skill_of_Pikachu_Copy (family, line 40412) ---
function InitTrig_Open_Skill_of_Pikachu_Copy takes nothing returns nothing
    set gg_trg_Open_Skill_of_Pikachu_Copy = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Pikachu_Copy, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Pikachu_Copy, Condition( function Trig_Open_Skill_of_Pikachu_Copy_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Pikachu_Copy, function Trig_Open_Skill_of_Pikachu_Copy_Actions )
endfunction

// === family NoCute (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NoCute_Conditions (family, line 40422) ---
function Trig_NoCute_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0BX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NoCute_Actions (family, line 40429) ---
function Trig_NoCute_Actions takes nothing returns nothing
    call PlaySoundBJ( gg_snd_nocute )
endfunction

// --- InitTrig_NoCute (family, line 40434) ---
function InitTrig_NoCute takes nothing returns nothing
    set gg_trg_NoCute = CreateTrigger(  )
    call DisableTrigger( gg_trg_NoCute )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NoCute, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_NoCute, Condition( function Trig_NoCute_Conditions ) )
    call TriggerAddAction( gg_trg_NoCute, function Trig_NoCute_Actions )
endfunction

// === family PIKACHU (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_PIKACHU_Conditions (family, line 40445) ---
function Trig_PIKACHU_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0C0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PIKACHU_Func005A (family, line 40452) ---
function Trig_PIKACHU_Func005A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_PIKACHU_Func006Func001A (family, line 40462) ---
function Trig_PIKACHU_Func006Func001A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_PIKACHU_Func006C (family, line 40472) ---
function Trig_PIKACHU_Func006C takes nothing returns boolean
    if ( not ( GetHeroLevel(udg_PikaUnit) >= 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PIKACHU_Func011A (family, line 40479) ---
function Trig_PIKACHU_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_PIKACHU_Func013A (family, line 40484) ---
function Trig_PIKACHU_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_PIKACHU_Actions (family, line 40489) ---
function Trig_PIKACHU_Actions takes nothing returns nothing
    set udg_PikaUnit = GetTriggerUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(( 100.00 + ( 200.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) ), GetUnitLoc(GetTriggerUnit())), function Trig_PIKACHU_Func005A )
    if ( Trig_PIKACHU_Func006C() ) then
        call ForGroupBJ( GetUnitsInRangeOfLocAll(( 600.00 + ( 200.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) ), GetUnitLoc(GetTriggerUnit())), function Trig_PIKACHU_Func006Func001A )
    else
    endif
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 4.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'o00E'), function Trig_PIKACHU_Func011A )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'hfoo'), function Trig_PIKACHU_Func013A )
endfunction

// --- InitTrig_PIKACHU (family, line 40508) ---
function InitTrig_PIKACHU takes nothing returns nothing
    set gg_trg_PIKACHU = CreateTrigger(  )
    call DisableTrigger( gg_trg_PIKACHU )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PIKACHU, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_PIKACHU, Condition( function Trig_PIKACHU_Conditions ) )
    call TriggerAddAction( gg_trg_PIKACHU, function Trig_PIKACHU_Actions )
endfunction

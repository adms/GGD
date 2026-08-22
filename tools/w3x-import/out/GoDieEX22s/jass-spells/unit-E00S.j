// unit rawcode: E00S
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_WhiteTree, TreeSea, whiterOldTree

// === family Open_Skill_of_WhiteTree (armed) events=none ===

// --- Trig_Open_Skill_of_WhiteTree_Conditions (family, line 47780) ---
function Trig_Open_Skill_of_WhiteTree_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00S' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_WhiteTree_Actions (family, line 47787) ---
function Trig_Open_Skill_of_WhiteTree_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call SetPlayerAbilityAvailableBJ( false, 'A0ZM', GetOwningPlayer(GetTriggerUnit()) )
    call EnableTrigger( gg_trg_whiterOldTree )
    call EnableTrigger( gg_trg_TreeSea )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "卡迪那: 我受到飛鼠社長的祝福降臨到這個世界了!" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_WhiteTree (family, line 47797) ---
function InitTrig_Open_Skill_of_WhiteTree takes nothing returns nothing
    set gg_trg_Open_Skill_of_WhiteTree = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_WhiteTree, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_WhiteTree, Condition( function Trig_Open_Skill_of_WhiteTree_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_WhiteTree, function Trig_Open_Skill_of_WhiteTree_Actions )
endfunction

// === family TreeSea (armed) events=none ===

// --- Trig_TreeSea_Conditions (family, line 47807) ---
function Trig_TreeSea_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00S' ) ) then
        return false
    endif
    if ( not ( GetUnitLevel(GetTriggerUnit()) >= 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TreeSea_Actions (family, line 47817) ---
function Trig_TreeSea_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0ZM', GetTriggerUnit(), 2 )
    call SetUnitAbilityLevelSwapped( 'A0ZO', GetTriggerUnit(), 2 )
    call SetUnitAbilityLevelSwapped( 'A0ZO', GetTriggerUnit(), 3 )
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_TreeSea (family, line 47826) ---
function InitTrig_TreeSea takes nothing returns nothing
    set gg_trg_TreeSea = CreateTrigger(  )
    call DisableTrigger( gg_trg_TreeSea )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TreeSea, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_TreeSea, Condition( function Trig_TreeSea_Conditions ) )
    call TriggerAddAction( gg_trg_TreeSea, function Trig_TreeSea_Actions )
endfunction

// === family whiterOldTree (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_whiterOldTree_Conditions (family, line 47837) ---
function Trig_whiterOldTree_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0GR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_whiterOldTree_Func008A (family, line 47844) ---
function Trig_whiterOldTree_Func008A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "entanglingroots", GetEnumUnit() )
endfunction

// --- Trig_whiterOldTree_Func011A (family, line 47849) ---
function Trig_whiterOldTree_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_whiterOldTree_Actions (family, line 47854) ---
function Trig_whiterOldTree_Actions takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o00Y', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    set udg_whiteUnit = GetLastCreatedUnit()
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0GS', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0GS', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(950.00, udg_P1), function Trig_whiterOldTree_Func008A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o00Y'), function Trig_whiterOldTree_Func011A )
endfunction

// --- InitTrig_whiterOldTree (family, line 47869) ---
function InitTrig_whiterOldTree takes nothing returns nothing
    set gg_trg_whiterOldTree = CreateTrigger(  )
    call DisableTrigger( gg_trg_whiterOldTree )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_whiterOldTree, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_whiterOldTree, Condition( function Trig_whiterOldTree_Conditions ) )
    call TriggerAddAction( gg_trg_whiterOldTree, function Trig_whiterOldTree_Actions )
endfunction

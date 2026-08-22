// rawcode: A0D6
// nameZh: 84-03 蜜汁
// w3a base: ANmr  levels: 4
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// mana: {"1": 125, "2": 175, "3": 225, "4": 275}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 3.0, "2": 4.0, "3": 5.0, "4": 6.0}
// hero_duration: {"1": 3.0, "2": 4.0, "3": 5.0, "4": 6.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Sugoi

// === family Sugoi (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Sugoi_Conditions (family, line 51260) ---
function Trig_Sugoi_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0D6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Sugoi_Actions (family, line 51267) ---
function Trig_Sugoi_Actions takes nothing returns nothing
    set udg_Bear_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Bear_P2 = GetUnitLoc(GetSpellTargetUnit())
    call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_Bear_P1, udg_Bear_P2 )
    set udg_BearUnit = GetLastCreatedUnit()
    set udg_Bear_target = GetSpellTargetUnit()
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', udg_BearUnit )
    call ShowUnitHide( udg_BearUnit )
    call UnitAddAbilityBJ( 'A0D8', udg_BearUnit )
    call SetUnitAbilityLevelSwapped( 'A0D8', udg_BearUnit, GetUnitAbilityLevelSwapped('A0D6', GetTriggerUnit()) )
    call IssueTargetOrderBJ( udg_BearUnit, "soulburn", udg_Bear_target )
    call UnitAddAbilityBJ( 'S005', udg_BearUnit )
    call SetUnitAbilityLevelSwapped( 'S005', udg_BearUnit, GetUnitAbilityLevelSwapped('A0D6', GetTriggerUnit()) )
    call IssueTargetOrderBJ( udg_BearUnit, "cripple", udg_Bear_target )
    call KillUnit( udg_BearUnit )
    call RemoveUnit( udg_BearUnit )
    call CreateTextTagUnitBJ( "TRIGSTR_6477", GetTriggerUnit(), 50.00, 12.00, 100.00, 100.00, 100.00, 0.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call RemoveLocation( udg_Bear_P1 )
    call RemoveLocation( udg_Bear_P2 )
endfunction

// --- InitTrig_Sugoi (family, line 51293) ---
function InitTrig_Sugoi takes nothing returns nothing
    set gg_trg_Sugoi = CreateTrigger(  )
    call DisableTrigger( gg_trg_Sugoi )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Sugoi, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Sugoi, Condition( function Trig_Sugoi_Conditions ) )
    call TriggerAddAction( gg_trg_Sugoi, function Trig_Sugoi_Actions )
endfunction

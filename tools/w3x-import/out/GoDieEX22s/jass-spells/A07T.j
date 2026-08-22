// rawcode: A07T
// nameZh: 53-03 破法對咒
// w3a base: AHtc  levels: 4
// cooldown: {"1": 27.0, "2": 27.0, "3": 27.0, "4": 27.0}
// mana: {"1": 120, "2": 180, "3": 240, "4": 300}
// area: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DefMagic

// === family DefMagic (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DefMagic_Conditions (family, line 39911) ---
function Trig_DefMagic_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07T' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefMagic_Func010A (family, line 39918) ---
function Trig_DefMagic_Func010A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "antimagicshell", GetEnumUnit() )
endfunction

// --- Trig_DefMagic_Func012A (family, line 39923) ---
function Trig_DefMagic_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DefMagic_Actions (family, line 39928) ---
function Trig_DefMagic_Actions takes nothing returns nothing
    set udg_KaoUnit = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_WayGateWhat1, 100.00, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DS', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DS', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(550.00, GetUnitLoc(GetTriggerUnit())), function Trig_DefMagic_Func010A )
    call TriggerSleepAction( 6.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_KaoUnit), 'hfoo'), function Trig_DefMagic_Func012A )
endfunction

// --- InitTrig_DefMagic (family, line 39943) ---
function InitTrig_DefMagic takes nothing returns nothing
    set gg_trg_DefMagic = CreateTrigger(  )
    call DisableTrigger( gg_trg_DefMagic )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DefMagic, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DefMagic, Condition( function Trig_DefMagic_Conditions ) )
    call TriggerAddAction( gg_trg_DefMagic, function Trig_DefMagic_Actions )
endfunction

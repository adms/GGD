// rawcode: A0SL
// nameZh: 58-002 打雷絕招
// w3a base: AOw2  levels: 1
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 300, "2": 250, "3": 350}
// area: {"1": 1800.0, "2": 450.0, "3": 650.0}
// duration: {"1": 0.5, "2": 0.5, "3": 0.5}
// hero_duration: {"1": 0.5, "2": 0.5, "3": 0.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LightningSpread

// === family LightningSpread (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightningSpread_Conditions (family, line 40264) ---
function Trig_LightningSpread_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0SL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightningSpread_Func006A (family, line 40271) ---
function Trig_LightningSpread_Func006A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), 3 )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_LightningSpread_Func010A (family, line 40281) ---
function Trig_LightningSpread_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightningSpread_Func012A (family, line 40286) ---
function Trig_LightningSpread_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightningSpread_Actions (family, line 40291) ---
function Trig_LightningSpread_Actions takes nothing returns nothing
    set udg_PikaUnit = GetTriggerUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(1800.00, udg_P1), function Trig_LightningSpread_Func006A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 4.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'o00E'), function Trig_LightningSpread_Func010A )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PikaUnit), 'hfoo'), function Trig_LightningSpread_Func012A )
endfunction

// --- InitTrig_LightningSpread (family, line 40306) ---
function InitTrig_LightningSpread takes nothing returns nothing
    set gg_trg_LightningSpread = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightningSpread )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightningSpread, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightningSpread, Condition( function Trig_LightningSpread_Conditions ) )
    call TriggerAddAction( gg_trg_LightningSpread, function Trig_LightningSpread_Actions )
endfunction

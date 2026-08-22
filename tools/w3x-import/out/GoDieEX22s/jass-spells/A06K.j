// rawcode: A06K
// nameZh: 42-002 魔力印章
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 999, "2": 210, "3": 300, "4": 390}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 7.0, "2": 15.0, "3": 21.0, "4": 27.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MagicStamp

// === family MagicStamp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MagicStamp_Conditions (family, line 37878) ---
function Trig_MagicStamp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A06K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicStamp_Func010A (family, line 37885) ---
function Trig_MagicStamp_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicStamp_Func011A (family, line 37890) ---
function Trig_MagicStamp_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicStamp_Func012A (family, line 37895) ---
function Trig_MagicStamp_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicStamp_Actions (family, line 37900) ---
function Trig_MagicStamp_Actions takes nothing returns nothing
    set udg_MagicStampOn = true
    set udg_EndWorldPoint = GetUnitLoc(GetTriggerUnit())
    call EnableTrigger( gg_trg_The_End_ofWorldCasting_EX )
    call EnableTrigger( gg_trg_MagicAttackPoint )
    call TriggerSleepAction( 7.00 )
    set udg_MagicStampOn = false
    call DisableTrigger( gg_trg_The_End_ofWorldCasting_EX )
    call DisableTrigger( gg_trg_MagicAttackPoint )
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_EndWorldUnit), 'u013'), function Trig_MagicStamp_Func010A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_EndWorldUnit), 'u013'), function Trig_MagicStamp_Func011A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_EndWorldUnit), 'u013'), function Trig_MagicStamp_Func012A )
endfunction

// --- InitTrig_MagicStamp (family, line 37916) ---
function InitTrig_MagicStamp takes nothing returns nothing
    set gg_trg_MagicStamp = CreateTrigger(  )
    call DisableTrigger( gg_trg_MagicStamp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MagicStamp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MagicStamp, Condition( function Trig_MagicStamp_Conditions ) )
    call TriggerAddAction( gg_trg_MagicStamp, function Trig_MagicStamp_Actions )
endfunction

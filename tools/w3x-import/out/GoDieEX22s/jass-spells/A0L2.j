// rawcode: A0L2
// nameZh: 78-03 廬山昇龍破
// w3a base: AOws  levels: 4
// cooldown: {"1": 55.0, "2": 55.0, "3": 55.0, "4": 55.0}
// mana: {"1": 150, "2": 240, "3": 330, "4": 420}
// area: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HoLuKen

// === family HoLuKen (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HoLuKen_Conditions (family, line 50043) ---
function Trig_HoLuKen_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0L2' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HoLuKen_Func007A (family, line 50050) ---
function Trig_HoLuKen_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HoLuKen_Func008A (family, line 50055) ---
function Trig_HoLuKen_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HoLuKen_Actions (family, line 50060) ---
function Trig_HoLuKen_Actions takes nothing returns nothing
    set udg_Hell = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'o01P', GetOwningPlayer(GetTriggerUnit()), udg_Hell, bj_UNIT_FACING )
    call SetUnitScalePercent( GetLastCreatedUnit(), 240.00, 240.00, 240.00 )
    call PlaySoundOnUnitBJ( gg_snd_DragonYes2, 100, GetTriggerUnit() )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_RabCastUnit), 'o01P'), function Trig_HoLuKen_Func007A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_RabCastUnit), 'oshm'), function Trig_HoLuKen_Func008A )
endfunction

// --- InitTrig_HoLuKen (family, line 50071) ---
function InitTrig_HoLuKen takes nothing returns nothing
    set gg_trg_HoLuKen = CreateTrigger(  )
    call DisableTrigger( gg_trg_HoLuKen )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HoLuKen, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HoLuKen, Condition( function Trig_HoLuKen_Conditions ) )
    call TriggerAddAction( gg_trg_HoLuKen, function Trig_HoLuKen_Actions )
endfunction

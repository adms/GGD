// rawcode: A0KC
// nameZh: 37-03 災難之牆
// w3a base: AUcs  levels: 4
// cooldown: {"1": 60.0, "2": 50.0, "3": 40.0, "4": 30.0}
// mana: {"1": 350, "2": 450, "3": 550, "4": 650}
// range: {"1": 500.0, "2": 500.0, "3": 500.0, "4": 500.0}
// area: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DestWall

// === family DestWall (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DestWall_Conditions (family, line 44551) ---
function Trig_DestWall_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KC' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DestWall_Func007A (family, line 44558) ---
function Trig_DestWall_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DestWall_Actions (family, line 44563) ---
function Trig_DestWall_Actions takes nothing returns nothing
    set udg_BaMDesWallUnit = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_TrollbatriderPissed2, 100, GetTriggerUnit() )
    set udg_DestWall_P1 = GetSpellTargetLoc()
    set udg_DestWall_Index = 0
    loop
        exitwhen udg_DestWall_Index > 8
        set udg_DestWall_P2 = PolarProjectionBJ(udg_DestWall_P1, ( 400.00 - ( 100.00 * I2R(udg_DestWall_Index) ) ), ( GetUnitFacing(GetTriggerUnit()) + 90.00 ))
        call CreateNUnitsAtLoc( 1, 'u00R', GetOwningPlayer(udg_BaMDesWallUnit), udg_DestWall_P2, GetUnitFacing(GetTriggerUnit()) )
        call RemoveLocation( udg_DestWall_P2 )
        set udg_DestWall_Index = udg_DestWall_Index + 1
    endloop
    call PlaySoundOnUnitBJ( gg_snd_HCancelBuilding, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( ( 2.00 + I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BaMDesWallUnit), 'u00R'), function Trig_DestWall_Func007A )
endfunction

// --- InitTrig_DestWall (family, line 44581) ---
function InitTrig_DestWall takes nothing returns nothing
    set gg_trg_DestWall = CreateTrigger(  )
    call DisableTrigger( gg_trg_DestWall )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DestWall, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DestWall, Condition( function Trig_DestWall_Conditions ) )
    call TriggerAddAction( gg_trg_DestWall, function Trig_DestWall_Actions )
endfunction

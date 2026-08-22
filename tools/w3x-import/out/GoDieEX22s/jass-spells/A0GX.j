// rawcode: A0GX
// nameZh: 00-死槍針刺地獄假技能
// w3a base: AOws  levels: 1
// cooldown: {"1": 45.0}
// mana: {"1": 199}
// area: {"1": 0.0}
// duration: {"1": 0.0}
// hero_duration: {"1": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Hell

// === family Hell (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Hell_Conditions (family, line 24332) ---
function Trig_Hell_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0GX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hell_Func011A (family, line 24339) ---
function Trig_Hell_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Hell_Actions (family, line 24344) ---
function Trig_Hell_Actions takes nothing returns nothing
    set udg_Hell = GetUnitLoc(GetTriggerUnit())
    set udg_HellCount = 1
    loop
        exitwhen udg_HellCount > 36
        call CreateNUnitsAtLoc( 1, 'o009', GetOwningPlayer(GetTriggerUnit()), udg_Hell, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 5.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0GU', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "impale", PolarProjectionBJ(udg_Hell, 256.00, ( I2R(udg_HellCount) * 10.00 )) )
        set udg_HellCount = udg_HellCount + 1
    endloop
    call RemoveLocation( udg_Hell )
    // xxxxxxxxx
    call TerrainDeformationRippleBJ( 5.00, true, udg_Hell, 100.00, 340.00, 64, 1, 200.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    // xxxxxxxxx
    call PlaySoundOnUnitBJ( gg_snd_BigBadVoodooSpellBirth1, 100, GetTriggerUnit() )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o009'), function Trig_Hell_Func011A )
endfunction

// --- InitTrig_Hell (family, line 24366) ---
function InitTrig_Hell takes nothing returns nothing
    set gg_trg_Hell = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Hell, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Hell, Condition( function Trig_Hell_Conditions ) )
    call TriggerAddAction( gg_trg_Hell, function Trig_Hell_Actions )
endfunction

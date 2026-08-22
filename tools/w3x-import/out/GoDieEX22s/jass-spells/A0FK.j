// rawcode: A0FK
// nameZh: 69-002 固有結界-黑洞
// cooldown: {"2": 60.0, "3": 60.0}
// mana: {"1": 700, "2": 500, "3": 700}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: InSpace

// === family InSpace (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_InSpace_Conditions (family, line 32744) ---
function Trig_InSpace_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0FK' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_InSpace_Func010A (family, line 32751) ---
function Trig_InSpace_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_InSpace_Func011A (family, line 32756) ---
function Trig_InSpace_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_InSpace_Actions (family, line 32761) ---
function Trig_InSpace_Actions takes nothing returns nothing
    set udg_BlackHole = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o00S', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0FM', GetLastCreatedUnit() )
    call PlaySoundOnUnitBJ( gg_snd_Parasite, 100, GetLastCreatedUnit() )
    call TerrainDeformationRippleBJ( 6.00, false, GetUnitLoc(GetTriggerUnit()), 600.00, 600.00, 64.00, 1.00, 600.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    set udg_BlackHoleCount = 1
    loop
        exitwhen udg_BlackHoleCount > 9
        call CreateNUnitsAtLoc( 1, 'u02S', GetOwningPlayer(GetTriggerUnit()), GetRandomLocInRect(RectFromCenterSizeBJ(GetUnitLoc(GetTriggerUnit()), 600.00, 600.00)), GetRandomDirectionDeg() )
        set udg_BlackHoleCount = udg_BlackHoleCount + 1
    endloop
    call TriggerSleepAction( 8.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BlackHole), 'o00S'), function Trig_InSpace_Func010A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BlackHole), 'u02S'), function Trig_InSpace_Func011A )
endfunction

// --- InitTrig_InSpace (family, line 32781) ---
function InitTrig_InSpace takes nothing returns nothing
    set gg_trg_InSpace = CreateTrigger(  )
    call DisableTrigger( gg_trg_InSpace )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_InSpace, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_InSpace, Condition( function Trig_InSpace_Conditions ) )
    call TriggerAddAction( gg_trg_InSpace, function Trig_InSpace_Actions )
endfunction

// rawcode: A01Z
// nameZh: 37-04 魔界之王
// w3a base: ANef  levels: 3
// cooldown: {"1": 90.0, "2": 90.0, "3": 90.0}
// mana: {"2": 300, "3": 450}
// duration: {"1": 35.0, "2": 35.0, "3": 35.0}
// hero_duration: {"1": 35.0, "2": 35.0, "3": 35.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: CombineOne

// === family CombineOne (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CombineOne_Conditions (family, line 44458) ---
function Trig_CombineOne_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A01Z' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CombineOne_Func004Func001A (family, line 44465) ---
function Trig_CombineOne_Func004Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_CombineOne_Actions (family, line 44469) ---
function Trig_CombineOne_Actions takes nothing returns nothing
    set udg_BaMDesWallUnit = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_TreantReady1, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_ShadowHunterReady1, 100.00, GetTriggerUnit() )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_CombineOne_Func004Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_CombineOne (family, line 44491) ---
function InitTrig_CombineOne takes nothing returns nothing
    set gg_trg_CombineOne = CreateTrigger(  )
    call DisableTrigger( gg_trg_CombineOne )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CombineOne, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CombineOne, Condition( function Trig_CombineOne_Conditions ) )
    call TriggerAddAction( gg_trg_CombineOne, function Trig_CombineOne_Actions )
endfunction

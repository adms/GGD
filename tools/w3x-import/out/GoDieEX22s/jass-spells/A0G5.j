// rawcode: A0G5
// nameZh: 74-04 最終殞落星
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 220, "2": 330, "3": 440, "4": 900}
// range: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 350.0}
// area: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 350.0}
// duration: {"1": 0.8999999761581421, "2": 0.8999999761581421, "3": 0.8999999761581421, "4": 1.100000023841858}
// hero_duration: {"1": 0.8999999761581421, "2": 0.8999999761581421, "3": 0.8999999761581421, "4": 1.100000023841858}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FinalBolide

// === family FinalBolide (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FinalBolide_Conditions (family, line 48533) ---
function Trig_FinalBolide_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0G5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FinalBolide_Func002Func001A (family, line 48540) ---
function Trig_FinalBolide_Func002Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_FinalBolide_Actions (family, line 48544) ---
function Trig_FinalBolide_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.30 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_FinalBolide_Func002Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 4.00 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_FinalBolide (family, line 48564) ---
function InitTrig_FinalBolide takes nothing returns nothing
    set gg_trg_FinalBolide = CreateTrigger(  )
    call DisableTrigger( gg_trg_FinalBolide )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FinalBolide, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FinalBolide, Condition( function Trig_FinalBolide_Conditions ) )
    call TriggerAddAction( gg_trg_FinalBolide, function Trig_FinalBolide_Actions )
endfunction

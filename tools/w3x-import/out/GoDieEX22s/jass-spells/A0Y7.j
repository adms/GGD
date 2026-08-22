// rawcode: A0Y7
// nameZh: 95-01 謝謝指教
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 70, "2": 110, "3": 150, "4": 190}
// range: {"1": 200.0, "2": 200.0, "3": 200.0, "4": 200.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Thankyou

// === family Thankyou (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Thankyou_Conditions (family, line 54306) ---
function Trig_Thankyou_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y7' ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Thankyou_Func012Func001A (family, line 54316) ---
function Trig_Thankyou_Func012Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_Thankyou_Actions (family, line 54320) ---
function Trig_Thankyou_Actions takes nothing returns nothing
    set udg_HE_3Q_slv = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_HE_3Q_Counter = ( 4 + ( 4 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) )
    set udg_HE_3Q_Target = GetSpellTargetUnit()
    set udg_HE_3Q_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_HE_3Q_P2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_HE_3Q_Angle = AngleBetweenPoints(udg_HE_3Q_P1, udg_HE_3Q_P2)
    call RemoveLocation( udg_HE_3Q_P1 )
    call RemoveLocation( udg_HE_3Q_P2 )
    call EnableTrigger( gg_trg_Thankyou_Effect )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_Thankyou_Func012Func001A )
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

// --- InitTrig_Thankyou (family, line 54348) ---
function InitTrig_Thankyou takes nothing returns nothing
    set gg_trg_Thankyou = CreateTrigger(  )
    call DisableTrigger( gg_trg_Thankyou )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Thankyou, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Thankyou, Condition( function Trig_Thankyou_Conditions ) )
    call TriggerAddAction( gg_trg_Thankyou, function Trig_Thankyou_Actions )
endfunction

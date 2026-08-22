// rawcode: A0MS
// nameZh: 57-002-01 時間記憶
// w3a base: ANcl  levels: 1
// cooldown: {"1": 5.0, "2": 55.0, "3": 55.0, "4": 55.0}
// mana: {"1": 100, "2": 200, "3": 250, "4": 300}
// range: {"1": 0.0, "2": 600.0, "3": 600.0, "4": 600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: TimeMachine

// === family TimeMachine (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_TimeMachine_Conditions (family, line 45811) ---
function Trig_TimeMachine_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TimeMachine_Func001Func001C (family, line 45818) ---
function Trig_TimeMachine_Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_PlayerHeroUnit[GetForLoopIndexA()]) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TimeMachine_Actions (family, line 45828) ---
function Trig_TimeMachine_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_TimeMachine_Func001Func001C() ) then
            set udg_Dora_TM_HP[GetForLoopIndexA()] = GetUnitStateSwap(UNIT_STATE_LIFE, udg_PlayerHeroUnit[GetForLoopIndexA()])
            set udg_Dora_TM_MP[GetForLoopIndexA()] = GetUnitStateSwap(UNIT_STATE_MANA, udg_PlayerHeroUnit[GetForLoopIndexA()])
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
endfunction

// --- InitTrig_TimeMachine (family, line 45843) ---
function InitTrig_TimeMachine takes nothing returns nothing
    set gg_trg_TimeMachine = CreateTrigger(  )
    call DisableTrigger( gg_trg_TimeMachine )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TimeMachine, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_TimeMachine, Condition( function Trig_TimeMachine_Conditions ) )
    call TriggerAddAction( gg_trg_TimeMachine, function Trig_TimeMachine_Actions )
endfunction

// rawcode: A0MT
// nameZh: 57-002-02 時光倒流
// w3a base: ANcl  levels: 1
// cooldown: {"1": 70.0, "2": 55.0, "3": 55.0, "4": 55.0}
// mana: {"1": 1000, "2": 200, "3": 250, "4": 300}
// range: {"1": 0.0, "2": 600.0, "3": 600.0, "4": 600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: TimeMachineRev

// === family TimeMachineRev (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_TimeMachineRev_Conditions (family, line 45854) ---
function Trig_TimeMachineRev_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MT' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TimeMachineRev_Func001Func001C (family, line 45861) ---
function Trig_TimeMachineRev_Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetForLoopIndexA()] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_PlayerHeroUnit[GetForLoopIndexA()]) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TimeMachineRev_Actions (family, line 45871) ---
function Trig_TimeMachineRev_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_TimeMachineRev_Func001Func001C() ) then
            call SetUnitLifeBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], udg_Dora_TM_HP[GetForLoopIndexA()] )
            call SetUnitManaBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], udg_Dora_TM_MP[GetForLoopIndexA()] )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_PlayerHeroUnit[GetForLoopIndexA()], "Abilities\\Spells\\Items\\TomeOfRetraining\\TomeOfRetrainingCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        set udg_Dora_TM_HP[GetForLoopIndexA()] = 9999.00
        set udg_Dora_TM_MP[GetForLoopIndexA()] = 9999.00
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
endfunction

// --- InitTrig_TimeMachineRev (family, line 45896) ---
function InitTrig_TimeMachineRev takes nothing returns nothing
    set gg_trg_TimeMachineRev = CreateTrigger(  )
    call DisableTrigger( gg_trg_TimeMachineRev )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TimeMachineRev, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_TimeMachineRev, Condition( function Trig_TimeMachineRev_Conditions ) )
    call TriggerAddAction( gg_trg_TimeMachineRev, function Trig_TimeMachineRev_Actions )
endfunction

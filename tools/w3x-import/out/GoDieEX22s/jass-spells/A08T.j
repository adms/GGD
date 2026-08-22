// rawcode: A08T
// nameZh: 71-02 靈魂吸取
// w3a base: Afrz  levels: 4
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SAIadd

// === family SAIadd (passive) events=EVENT_PLAYER_UNIT_DEATH ===

// --- Trig_SAIadd_Conditions (family, line 48306) ---
function Trig_SAIadd_Conditions takes nothing returns boolean
    if ( not ( GetKillingUnitBJ() == udg_KingOfDeath ) ) then
        return false
    endif
    if ( not ( GetUnitAbilityLevelSwapped('A08T', udg_KingOfDeath) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SAIadd_Func006C (family, line 48316) ---
function Trig_SAIadd_Func006C takes nothing returns boolean
    if ( not ( udg_DiekingAcc <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SAIadd_Actions (family, line 48323) ---
function Trig_SAIadd_Actions takes nothing returns nothing
    set udg_DiekingAcc = ( udg_DiekingAcc + 1 )
    set udg_DiekingLevel = ( IMinBJ(10, udg_DiekingAcc) * GetUnitAbilityLevelSwapped('A08T', udg_KingOfDeath) )
    call SetUnitAbilityLevelSwapped( 'A0RC', udg_KingOfDeath, udg_DiekingLevel )
    call TriggerSleepAction( 20.00 )
    set udg_DiekingAcc = ( udg_DiekingAcc - 1 )
    if ( Trig_SAIadd_Func006C() ) then
        set udg_DiekingLevel = 0
    else
        set udg_DiekingLevel = ( IMinBJ(10, udg_DiekingAcc) * GetUnitAbilityLevelSwapped('A08T', udg_KingOfDeath) )
    endif
    call SetUnitAbilityLevelSwapped( 'A0RC', udg_KingOfDeath, udg_DiekingLevel )
endfunction

// --- InitTrig_SAIadd (family, line 48338) ---
function InitTrig_SAIadd takes nothing returns nothing
    set gg_trg_SAIadd = CreateTrigger(  )
    call DisableTrigger( gg_trg_SAIadd )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SAIadd, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_SAIadd, Condition( function Trig_SAIadd_Conditions ) )
    call TriggerAddAction( gg_trg_SAIadd, function Trig_SAIadd_Actions )
endfunction

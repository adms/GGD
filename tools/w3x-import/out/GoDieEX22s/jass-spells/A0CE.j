// rawcode: A0CE
// nameZh: 02-01-r 破魔之箭
// w3a base: AIcb  levels: 4
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Learn_FeedBack

// === family Learn_FeedBack (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_Learn_FeedBack_Conditions (family, line 33955) ---
function Trig_Learn_FeedBack_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Hvwd' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Learn_FeedBack_Func001C (family, line 33962) ---
function Trig_Learn_FeedBack_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0CE', GetTriggerUnit()) <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Learn_FeedBack_Func002C (family, line 33969) ---
function Trig_Learn_FeedBack_Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A03C', GetTriggerUnit()) <= 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Learn_FeedBack_Actions (family, line 33976) ---
function Trig_Learn_FeedBack_Actions takes nothing returns nothing
    if ( Trig_Learn_FeedBack_Func001C() ) then
        call UnitAddAbilityBJ( 'A0CE', GetTriggerUnit() )
    else
        call DoNothing(  )
    endif
    if ( Trig_Learn_FeedBack_Func002C() ) then
        call UnitRemoveAbilityBJ( 'A0CE', GetTriggerUnit() )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_Learn_FeedBack (family, line 33990) ---
function InitTrig_Learn_FeedBack takes nothing returns nothing
    set gg_trg_Learn_FeedBack = CreateTrigger(  )
    call DisableTrigger( gg_trg_Learn_FeedBack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Learn_FeedBack, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Learn_FeedBack, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_Learn_FeedBack, Condition( function Trig_Learn_FeedBack_Conditions ) )
    call TriggerAddAction( gg_trg_Learn_FeedBack, function Trig_Learn_FeedBack_Actions )
endfunction

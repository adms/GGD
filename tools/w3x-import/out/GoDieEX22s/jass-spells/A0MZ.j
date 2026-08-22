// rawcode: A0MZ
// nameZh: 80-04 赤兔咆哮
// cooldown: {"1": 15.0, "2": 15.0, "3": 15.0}
// mana: {"1": 70, "2": 110, "3": 150}
// area: {"1": 450.0, "2": 450.0, "3": 450.0}
// duration: {"1": 0.20000000298023224, "2": 0.20000000298023224, "3": 0.20000000298023224}
// hero_duration: {"1": 0.20000000298023224, "2": 0.20000000298023224, "3": 0.20000000298023224}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: RabbitYell, skill4

// === family RabbitYell (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_RabbitYell_Func003C (family, line 50534) ---
function Trig_RabbitYell_Func003C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetAttacker(), 'B02L') == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RabbitYell_Conditions (family, line 50544) ---
function Trig_RabbitYell_Conditions takes nothing returns boolean
    if ( not Trig_RabbitYell_Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_RabbitYell_Func002Func001C (family, line 50551) ---
function Trig_RabbitYell_Func002Func001C takes nothing returns boolean
    if ( not ( GetAttackedUnitBJ() == udg_LuBuMaster ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) <= ( GetUnitAbilityLevelSwapped('A0MZ', udg_LuBuMaster) * 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RabbitYell_Func002C (family, line 50561) ---
function Trig_RabbitYell_Func002C takes nothing returns boolean
    if ( not ( GetAttacker() == udg_LuBuMaster ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) <= ( GetUnitAbilityLevelSwapped('A0MZ', udg_LuBuMaster) + 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_RabbitYell_Actions (family, line 50571) ---
function Trig_RabbitYell_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    if ( Trig_RabbitYell_Func002C() ) then
        call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_LuBuMaster), GetUnitLoc(udg_LuBuMaster), GetUnitLoc(GetAttackedUnitBJ()) )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0MW', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0MW', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0MY', udg_LuBuMaster) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetAttackedUnitBJ()) )
        call PlaySoundOnUnitBJ( gg_snd_DefendCaster, 100.00, GetLastCreatedUnit() )
    else
        if ( Trig_RabbitYell_Func002Func001C() ) then
            call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_LuBuMaster), GetUnitLoc(udg_LuBuMaster), GetUnitLoc(GetAttacker()) )
            call ShowUnitHide( GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A0MW', GetLastCreatedUnit() )
            call SetUnitAbilityLevelSwapped( 'A0MW', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0MY', udg_LuBuMaster) )
            call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetAttacker()) )
            call PlaySoundOnUnitBJ( gg_snd_DefendCaster, 100.00, GetLastCreatedUnit() )
        else
        endif
    endif
    call EnableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_RabbitYell (family, line 50595) ---
function InitTrig_RabbitYell takes nothing returns nothing
    set gg_trg_RabbitYell = CreateTrigger(  )
    call DisableTrigger( gg_trg_RabbitYell )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_RabbitYell, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_RabbitYell, Condition( function Trig_RabbitYell_Conditions ) )
    call TriggerAddAction( gg_trg_RabbitYell, function Trig_RabbitYell_Actions )
endfunction

// === family skill4 (passive) events=EVENT_PLAYER_UNIT_ISSUED_ORDER ===

// --- Trig_skill4_Conditions (family, line 50475) ---
function Trig_skill4_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01U' ) ) then
        return false
    endif
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("immolation") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_skill4_Actions (family, line 50485) ---
function Trig_skill4_Actions takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( true, 'A0RW', GetOwningPlayer(udg_LuBuMaster) )
    call SetUnitAbilityLevelSwapped( 'A0RW', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0MZ', GetTriggerUnit()) )
    call EnableTrigger( gg_trg_skill4eff )
endfunction

// --- InitTrig_skill4 (family, line 50492) ---
function InitTrig_skill4 takes nothing returns nothing
    set gg_trg_skill4 = CreateTrigger(  )
    call DisableTrigger( gg_trg_skill4 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_skill4, EVENT_PLAYER_UNIT_ISSUED_ORDER )
    call TriggerAddCondition( gg_trg_skill4, Condition( function Trig_skill4_Conditions ) )
    call TriggerAddAction( gg_trg_skill4, function Trig_skill4_Actions )
endfunction

// rawcode: A0MY
// nameZh: 80-02 弒鬼神
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0}
// mana: {"1": 50, "2": 85, "3": 120}
// area: {"1": 350.0, "2": 350.0, "3": 350.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: RabbitYell

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

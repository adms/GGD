// rawcode: A0A7
// nameZh: 64-02 酒釀精華
// w3a base: ANcl  levels: 4
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// mana: {"1": 60, "2": 80, "3": 100, "4": 120}
// range: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0, "5": 350.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Wine_Extract_Initiate

// === family Wine_Extract_Initiate (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Wine_Extract_Initiate_Conditions (family, line 46508) ---
function Trig_Wine_Extract_Initiate_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0A7' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Func004Func001C (family, line 46515) ---
function Trig_Wine_Extract_Initiate_Func004Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_ArcaneUnit, 'B00I') == false ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(udg_ArcaneUnit, 'B05A') == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Func004Func002C (family, line 46525) ---
function Trig_Wine_Extract_Initiate_Func004Func002C takes nothing returns boolean
    if ( not ( IsUnitAlly(udg_ArcaneUnit2, GetOwningPlayer(udg_ArcaneUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Func004Func003C (family, line 46532) ---
function Trig_Wine_Extract_Initiate_Func004Func003C takes nothing returns boolean
    if ( not ( IsUnitAlly(udg_ArcaneUnit2, GetOwningPlayer(udg_ArcaneUnit)) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Func004C (family, line 46539) ---
function Trig_Wine_Extract_Initiate_Func004C takes nothing returns boolean
    if ( not Trig_Wine_Extract_Initiate_Func004Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wine_Extract_Initiate_Actions (family, line 46546) ---
function Trig_Wine_Extract_Initiate_Actions takes nothing returns nothing
    set udg_ArcaneUnit = GetTriggerUnit()
    set udg_ArcaneUnit2 = GetSpellTargetUnit()
    set udg_ArcaneInt = GetUnitAbilityLevelSwapped('A0A7', udg_ArcaneUnit)
    if ( Trig_Wine_Extract_Initiate_Func004C() ) then
        if ( Trig_Wine_Extract_Initiate_Func004Func003C() ) then
            call UnitDamageTargetBJ( udg_ArcaneUnit, udg_ArcaneUnit2, ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call SetUnitLifeBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ) ) )
            call SetUnitManaBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + 28.00 ) ) )
        endif
    else
        if ( Trig_Wine_Extract_Initiate_Func004Func002C() ) then
            call UnitDamageTargetBJ( udg_ArcaneUnit, udg_ArcaneUnit2, ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call SetUnitLifeBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ) ) )
            call SetUnitManaBJ( udg_ArcaneUnit2, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_ArcaneUnit2) + ( ( I2R(udg_ArcaneInt) * 40.00 ) + ( 28.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_ArcaneUnit, true)) ) ) ) )
        endif
    endif
    call StartTimerBJ( udg_ArcaneTimer, true, 1.00 )
endfunction

// --- InitTrig_Wine_Extract_Initiate (family, line 46569) ---
function InitTrig_Wine_Extract_Initiate takes nothing returns nothing
    set gg_trg_Wine_Extract_Initiate = CreateTrigger(  )
    call DisableTrigger( gg_trg_Wine_Extract_Initiate )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Wine_Extract_Initiate, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Wine_Extract_Initiate, Condition( function Trig_Wine_Extract_Initiate_Conditions ) )
    call TriggerAddAction( gg_trg_Wine_Extract_Initiate, function Trig_Wine_Extract_Initiate_Actions )
endfunction

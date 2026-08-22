// rawcode: A0A3
// nameZh: 64-04 魔幻浮水印
// w3a base: Ainf  levels: 3
// cooldown: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 0.5}
// mana: {"1": 150, "2": 225, "3": 300, "4": 35, "5": 35}
// range: {"2": 500.0, "3": 500.0, "4": 500.0}
// duration: {"1": 20.0, "2": 20.0, "3": 20.0, "4": 60.0}
// hero_duration: {"1": 20.0, "2": 20.0, "3": 20.0, "4": 60.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Initiate_Mark, Marking

// === family Initiate_Mark (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Initiate_Mark_Conditions (family, line 46651) ---
function Trig_Initiate_Mark_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0A3' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initiate_Mark_Actions (family, line 46658) ---
function Trig_Initiate_Mark_Actions takes nothing returns nothing
    set udg_Mark = GetTriggerUnit()
endfunction

// --- InitTrig_Initiate_Mark (family, line 46663) ---
function InitTrig_Initiate_Mark takes nothing returns nothing
    set gg_trg_Initiate_Mark = CreateTrigger(  )
    call DisableTrigger( gg_trg_Initiate_Mark )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Initiate_Mark, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Initiate_Mark, Condition( function Trig_Initiate_Mark_Conditions ) )
    call TriggerAddAction( gg_trg_Initiate_Mark, function Trig_Initiate_Mark_Actions )
endfunction

// === family Marking (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_Marking_Func001C (family, line 46674) ---
function Trig_Marking_Func001C takes nothing returns boolean
    if ( ( UnitHasBuffBJ(GetAttackedUnitBJ(), 'B00I') == true ) ) then
        return true
    endif
    if ( ( UnitHasBuffBJ(GetAttackedUnitBJ(), 'B05A') == true ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Marking_Conditions (family, line 46684) ---
function Trig_Marking_Conditions takes nothing returns boolean
    if ( not Trig_Marking_Func001C() ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttacker()), GetOwningPlayer(GetAttackedUnitBJ())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Marking_Func002C (family, line 46694) ---
function Trig_Marking_Func002C takes nothing returns boolean
    if ( not ( IsUnitType(GetAttacker(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Marking_Actions (family, line 46701) ---
function Trig_Marking_Actions takes nothing returns nothing
    if ( Trig_Marking_Func002C() ) then
        call UnitDamageTargetBJ( udg_Mark, GetAttacker(), ( GetRandomReal(20.00, 60.00) + ( I2R(GetUnitAbilityLevelSwapped('A0A3', udg_Mark)) * 40.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( udg_Mark, GetAttacker(), ( GetRandomReal(10.00, 50.00) + ( I2R(GetUnitAbilityLevelSwapped('A0A3', udg_Mark)) * 10.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
endfunction

// --- InitTrig_Marking (family, line 46710) ---
function InitTrig_Marking takes nothing returns nothing
    set gg_trg_Marking = CreateTrigger(  )
    call DisableTrigger( gg_trg_Marking )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Marking, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Marking, Condition( function Trig_Marking_Conditions ) )
    call TriggerAddAction( gg_trg_Marking, function Trig_Marking_Actions )
endfunction

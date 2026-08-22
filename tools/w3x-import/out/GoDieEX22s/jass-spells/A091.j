// rawcode: A091
// nameZh: 05-03 及喀爾度
// w3a base: AOws  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 75, "2": 125, "3": 175, "4": 225}
// area: {"1": 550.0, "2": 550.0, "3": 550.0, "4": 550.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: closeMe

// === family closeMe (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_closeMe_Conditions (family, line 28189) ---
function Trig_closeMe_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A091' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_closeMe_Func001Func006Func001C (family, line 28196) ---
function Trig_closeMe_Func001Func006Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetTriggerPlayer()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_closeMe_Func001Func006A (family, line 28212) ---
function Trig_closeMe_Func001Func006A takes nothing returns nothing
    if ( Trig_closeMe_Func001Func006Func001C() ) then
        call SetUnitPositionLoc( GetEnumUnit(), udg_GaSoUnitP )
        call AddSpecialEffectLocBJ( udg_GaSoUnitP, "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_closeMe_Actions (family, line 28221) ---
function Trig_closeMe_Actions takes nothing returns nothing
    set udg_GaSCounter = 1
    loop
        exitwhen udg_GaSCounter > ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 2 )
        call CreateNUnitsAtLoc( 1, 'o00H', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 200.00, ( GetUnitFacing(GetTriggerUnit()) + ( ( 180.00 / I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) * I2R(udg_GaSCounter) ) )), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        set udg_GaS_Unit[udg_GaSCounter] = GetLastCreatedUnit()
        set udg_GaSoUnitP = GetUnitLoc(GetLastCreatedUnit())
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRangeOfLocAll(( 250.00 + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 100.00 ) ), udg_GaSoUnitP), function Trig_closeMe_Func001Func006A )
        set udg_GaSCounter = udg_GaSCounter + 1
    endloop
endfunction

// --- InitTrig_closeMe (family, line 28236) ---
function InitTrig_closeMe takes nothing returns nothing
    set gg_trg_closeMe = CreateTrigger(  )
    call DisableTrigger( gg_trg_closeMe )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_closeMe, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_closeMe, Condition( function Trig_closeMe_Conditions ) )
    call TriggerAddAction( gg_trg_closeMe, function Trig_closeMe_Actions )
endfunction

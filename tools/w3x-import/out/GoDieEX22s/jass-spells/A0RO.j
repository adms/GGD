// rawcode: A0RO
// nameZh: 48-01 魔法鎖鏈
// w3a base: ANcl  levels: 4
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 50, "2": 75, "3": 100, "4": 125}
// range: {"1": 1000.0, "2": 1000.0, "3": 1000.0, "4": 1000.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: link, linkmove

// === family link (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_link_Conditions (family, line 38143) ---
function Trig_link_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_link_Actions (family, line 38150) ---
function Trig_link_Actions takes nothing returns nothing
    local location TedPoint

    set udg_TUnit[0] = GetTriggerUnit()
    set TedPoint = GetSpellTargetLoc()
    set udg_Tpoint = GetUnitLoc(udg_TUnit[0])
    set udg_TAngle = AngleBetweenPoints(udg_Tpoint, TedPoint)
    call RemoveLocation( TedPoint )
    call EnableTrigger( gg_trg_linkmove )
endfunction

// --- InitTrig_link (family, line 38162) ---
function InitTrig_link takes nothing returns nothing
    set gg_trg_link = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_link, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_link, Condition( function Trig_link_Conditions ) )
    call TriggerAddAction( gg_trg_link, function Trig_link_Actions )
endfunction

// === family linkmove (passive) events=none ===

// --- Trig_linkmove_Func001Func007002003002 (family, line 38172) ---
function Trig_linkmove_Func001Func007002003002 takes nothing returns boolean
    return GetBooleanAnd( IsUnitAliveBJ(GetFilterUnit()) == true, IsUnitEnemy(GetFilterUnit(), GetOwningPlayer(udg_TUnit[0])) == true )
endfunction

// --- Trig_linkmove_Func001Func007002003 (family, line 38176) ---
function Trig_linkmove_Func001Func007002003 takes nothing returns boolean
    return GetBooleanAnd( IsUnitType(GetFilterUnit(), UNIT_TYPE_STRUCTURE) == false, Trig_linkmove_Func001Func007002003002() )
endfunction

// --- Trig_linkmove_Actions (family, line 38181) ---
function Trig_linkmove_Actions takes nothing returns nothing
    local location TedPoint
    local group TGroup

    if ( udg_Tdistance <= 20 ) then
        set udg_Tdistance = ( udg_Tdistance + 1 )
        set TedPoint = PolarProjectionBJ(udg_Tpoint, ( 50.00 * I2R(udg_Tdistance) ), udg_TAngle)
        call CreateNUnitsAtLoc( 1, 'u01R', GetOwningPlayer(udg_TUnit[0]), TedPoint, udg_TAngle )
        set udg_Tlinkunit[udg_Tdistance] = GetLastCreatedUnit()
        set TGroup = GetUnitsInRangeOfLocMatching(100.00, TedPoint, Condition(function Trig_linkmove_Func001Func007002003))
        call RemoveLocation( TedPoint )
        if ( udg_Tdistance >= 3 ) then
            set udg_TUnit[1] = GroupPickRandomUnit(TGroup)
            call DestroyGroup(TGroup)
            set TGroup = null
            if ( IsUnitAlly(udg_TUnit[1], GetOwningPlayer(udg_TUnit[0])) != true ) then
                call UnitDamageTargetBJ( udg_TUnit[0], udg_TUnit[1], ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0RO', udg_TUnit[0])) + 50 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            endif
        endif
        if ( udg_TUnit[1] != null ) then
            call EnableTrigger( gg_trg_linkback )
            call DisableTrigger( GetTriggeringTrigger() )
        endif
    else
        call EnableTrigger( gg_trg_linkback )
        call DisableTrigger( GetTriggeringTrigger() )
    endif
endfunction

// --- InitTrig_linkmove (family, line 38211) ---
function InitTrig_linkmove takes nothing returns nothing
    set gg_trg_linkmove = CreateTrigger(  )
    call DisableTrigger( gg_trg_linkmove )
    call TriggerRegisterTimerEventPeriodic( gg_trg_linkmove, 0.03 )
    call TriggerAddAction( gg_trg_linkmove, function Trig_linkmove_Actions )
endfunction

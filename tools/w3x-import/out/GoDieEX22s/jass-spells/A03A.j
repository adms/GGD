// rawcode: A03A
// nameZh: 27-01 忍法風魔手裡劍
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0, "5": 7.0}
// mana: {"1": 45, "2": 75, "3": 105, "4": 135, "5": 75}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Initiate_Fan_Toss

// === family Initiate_Fan_Toss (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Initiate_Fan_Toss_Conditions (family, line 41136) ---
function Trig_Initiate_Fan_Toss_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A03A' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initiate_Fan_Toss_Actions (family, line 41143) ---
function Trig_Initiate_Fan_Toss_Actions takes nothing returns nothing
    set udg_NiJan = GetTriggerUnit()
    set udg_FanTossDamage = ( 50.00 + ( 50.00 * I2R(GetUnitAbilityLevelSwapped('A03A', GetTriggerUnit())) ) )
    set udg_FanTossCenterPoint = GetSpellTargetLoc()
    set udg_TrackWE_Point = GetUnitLoc(GetTriggerUnit())
    set udg_Fan_Right_Point_1 = PolarProjectionBJ(udg_TrackWE_Point, SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )), ( AngleBetweenPoints(udg_TrackWE_Point, udg_FanTossCenterPoint) + ( 45.00 - AcosBJ(( 500.00 / SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )) )) ) ))
    set udg_Fan_Left_Point_1 = PolarProjectionBJ(udg_TrackWE_Point, SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )), ( AngleBetweenPoints(udg_TrackWE_Point, udg_FanTossCenterPoint) - ( 45.00 - AcosBJ(( 500.00 / SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )) )) ) ))
    call CreateNUnitsAtLoc( 1, 'h009', GetOwningPlayer(GetTriggerUnit()), udg_TrackWE_Point, bj_UNIT_FACING )
    set udg_FanLeft = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'h009', GetOwningPlayer(GetTriggerUnit()), udg_TrackWE_Point, bj_UNIT_FACING )
    set udg_FanRight = GetLastCreatedUnit()
    set udg_FanLeftAngle = ( AngleBetweenPoints(udg_TrackWE_Point, udg_FanTossCenterPoint) - 45.00 )
    set udg_FanRightAngle = ( AngleBetweenPoints(udg_TrackWE_Point, udg_FanTossCenterPoint) + 45.00 )
    call RemoveLocation(udg_FanTossCenterPoint)
    call RemoveLocation(udg_TrackWE_Point)
    set udg_FanTravel_DIST = 500.00
    set udg_FanRotationCounter = 0.00
    call EnableTrigger( gg_trg_Fan_Movement )
endfunction

// --- InitTrig_Initiate_Fan_Toss (family, line 41164) ---
function InitTrig_Initiate_Fan_Toss takes nothing returns nothing
    set gg_trg_Initiate_Fan_Toss = CreateTrigger(  )
    call DisableTrigger( gg_trg_Initiate_Fan_Toss )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Initiate_Fan_Toss, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Initiate_Fan_Toss, Condition( function Trig_Initiate_Fan_Toss_Conditions ) )
    call TriggerAddAction( gg_trg_Initiate_Fan_Toss, function Trig_Initiate_Fan_Toss_Actions )
endfunction

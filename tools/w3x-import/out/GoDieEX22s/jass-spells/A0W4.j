// rawcode: A0W4
// nameZh: 91-02 疫病
// w3a base: Asth  levels: 4
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: PlagueLV, PlagueStrike

// === family PlagueLV (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_PlagueLV_Conditions (family, line 53129) ---
function Trig_PlagueLV_Conditions takes nothing returns boolean
    if ( not ( GetTriggerUnit() == udg_DK_DarkKnight ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueLV_Func001Func001Func002C (family, line 53136) ---
function Trig_PlagueLV_Func001Func001Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0W4', udg_DK_DarkKnight) >= 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueLV_Func001Func001C (family, line 53143) ---
function Trig_PlagueLV_Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0W4', udg_DK_DarkKnight) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueLV_Func001C (family, line 53150) ---
function Trig_PlagueLV_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0W4', udg_DK_DarkKnight) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueLV_Actions (family, line 53157) ---
function Trig_PlagueLV_Actions takes nothing returns nothing
    if ( Trig_PlagueLV_Func001C() ) then
        call EnableTrigger( gg_trg_PlagueStrike )
    else
        if ( Trig_PlagueLV_Func001Func001C() ) then
            call EnableTrigger( gg_trg_IcyTouch )
        else
            if ( Trig_PlagueLV_Func001Func001Func002C() ) then
                call EnableTrigger( gg_trg_DeathStrike )
                call DisableTrigger( GetTriggeringTrigger() )
            else
            endif
        endif
    endif
endfunction

// --- InitTrig_PlagueLV (family, line 53174) ---
function InitTrig_PlagueLV takes nothing returns nothing
    set gg_trg_PlagueLV = CreateTrigger(  )
    call DisableTrigger( gg_trg_PlagueLV )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PlagueLV, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PlagueLV, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_PlagueLV, Condition( function Trig_PlagueLV_Conditions ) )
    call TriggerAddAction( gg_trg_PlagueLV, function Trig_PlagueLV_Actions )
endfunction

// === family PlagueStrike (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_PlagueStrike_Conditions (family, line 53186) ---
function Trig_PlagueStrike_Conditions takes nothing returns boolean
    if ( not ( GetAttacker() == udg_DK_DarkKnight ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttackedUnitBJ()), GetOwningPlayer(GetAttacker())) == false ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 20) <= 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueStrike_Func005C (family, line 53202) ---
function Trig_PlagueStrike_Func005C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0W4', udg_DK_DarkKnight) >= 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PlagueStrike_Actions (family, line 53209) ---
function Trig_PlagueStrike_Actions takes nothing returns nothing
    set udg_DK_P2 = GetUnitLoc(GetAttackedUnitBJ())
    if ( Trig_PlagueStrike_Func005C() ) then
        call CreateNUnitsAtLoc( 1, 'u033', GetOwningPlayer(GetAttacker()), udg_DK_P2, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    else
        call CreateNUnitsAtLoc( 1, 'u032', GetOwningPlayer(GetAttacker()), udg_DK_P2, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    endif
    call RemoveLocation( udg_DK_P2 )
endfunction

// --- InitTrig_PlagueStrike (family, line 53222) ---
function InitTrig_PlagueStrike takes nothing returns nothing
    set gg_trg_PlagueStrike = CreateTrigger(  )
    call DisableTrigger( gg_trg_PlagueStrike )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PlagueStrike, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_PlagueStrike, Condition( function Trig_PlagueStrike_Conditions ) )
    call TriggerAddAction( gg_trg_PlagueStrike, function Trig_PlagueStrike_Actions )
endfunction

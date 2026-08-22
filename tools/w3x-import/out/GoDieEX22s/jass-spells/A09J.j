// rawcode: A09J
// nameZh: 33-04 動物拳法
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: animal

// === family animal (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_animal_Func001Func002C (family, line 43496) ---
function Trig_animal_Func001Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 5) == 1 ) ) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetAttacker()))] == true ) ) then
        return false
    endif
    if ( not ( GetAttacker() == udg_GaiaCastUnit ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_animal_Func001C (family, line 43509) ---
function Trig_animal_Func001C takes nothing returns boolean
    if ( ( GetRandomInt(1, 25) <= GetUnitAbilityLevelSwapped('A09J', GetAttacker()) ) ) then
        return true
    endif
    if ( Trig_animal_Func001Func002C() ) then
        return true
    endif
    return false
endfunction

// --- Trig_animal_Conditions (family, line 43519) ---
function Trig_animal_Conditions takes nothing returns boolean
    if ( not Trig_animal_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_animal_Actions (family, line 43526) ---
function Trig_animal_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_FarmWhat1, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_SealWhat2, 100, GetTriggerUnit() )
    set udg_PassivePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetAttacker()), udg_PassivePoint, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04A', GetLastCreatedUnit() )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetTriggerUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "hex", GetTriggerUnit() )
    call RemoveLocation(udg_PassivePoint)
    call EnableTrigger( gg_trg_Closeaeff )
endfunction

// --- InitTrig_animal (family, line 43541) ---
function InitTrig_animal takes nothing returns nothing
    set gg_trg_animal = CreateTrigger(  )
    call DisableTrigger( gg_trg_animal )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_animal, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_animal, Condition( function Trig_animal_Conditions ) )
    call TriggerAddAction( gg_trg_animal, function Trig_animal_Actions )
endfunction

// rawcode: A0TO
// nameZh: 89-04 憤怒的簡諧運動
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Saber_in_pandaJizz

// === family Saber_in_pandaJizz (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_Saber_in_pandaJizz_Conditions (family, line 52784) ---
function Trig_Saber_in_pandaJizz_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'H02K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaJizz_Func002Func001A (family, line 52791) ---
function Trig_Saber_in_pandaJizz_Func002Func001A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Saber_in_pandaJizz_Func002C (family, line 52796) ---
function Trig_Saber_in_pandaJizz_Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= GetUnitAbilityLevelSwapped('A0TO', GetAttacker()) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaJizz_Actions (family, line 52803) ---
function Trig_Saber_in_pandaJizz_Actions takes nothing returns nothing
    if ( Trig_Saber_in_pandaJizz_Func002C() ) then
        set udg_Immediately_P1 = GetUnitLoc(GetAttacker())
        call CreateNUnitsAtLoc( 1, 'oshm', GetOwningPlayer(GetAttacker()), udg_Immediately_P1, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "bloodlust", GetAttacker() )
        call UnitAddAbilityBJ( 'A0SR', GetLastCreatedUnit() )
        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
        call RemoveLocation( udg_Immediately_P1 )
        call PlaySoundOnUnitBJ( gg_snd_PandarenBrewmasterYes1, 100, GetAttacker() )
    else
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetAttacker()), 'oshm'), function Trig_Saber_in_pandaJizz_Func002Func001A )
    endif
endfunction

// --- InitTrig_Saber_in_pandaJizz (family, line 52820) ---
function InitTrig_Saber_in_pandaJizz takes nothing returns nothing
    set gg_trg_Saber_in_pandaJizz = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaJizz )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Saber_in_pandaJizz, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Saber_in_pandaJizz, Condition( function Trig_Saber_in_pandaJizz_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaJizz, function Trig_Saber_in_pandaJizz_Actions )
endfunction

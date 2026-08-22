// rawcode: A0TX
// nameZh: 77-02 雷鳴劍
// w3a base: AOcr  levels: 4
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LightATK

// === family LightATK (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_LightATK_Conditions (family, line 49205) ---
function Trig_LightATK_Conditions takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0TX', GetAttacker()) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightATK_Func001Func008A (family, line 49212) ---
function Trig_LightATK_Func001Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightATK_Actions (family, line 49217) ---
function Trig_LightATK_Actions takes nothing returns nothing
    local location UnitPoint
    local location OrderPoint
 
    set UnitPoint = GetUnitLoc(GetAttacker())

    if ( GetRandomInt(1, udg_Light_Sword_Num) == 2 ) then
        call CreateNUnitsAtLoc( 1, 'h02L', GetOwningPlayer(GetAttacker()), UnitPoint, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0TY', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0TX', GetAttacker()) )
        set OrderPoint = PolarProjectionBJ(UnitPoint, 150.00, GetUnitFacing(GetAttacker()))
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "inferno", OrderPoint )
        call RemoveLocation(UnitPoint)
        call RemoveLocation(OrderPoint)
        call TriggerSleepAction( 2 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h02L'), function Trig_LightATK_Func001Func008A )
    else
    endif
endfunction

// --- InitTrig_LightATK (family, line 49239) ---
function InitTrig_LightATK takes nothing returns nothing
    set gg_trg_LightATK = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightATK )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightATK, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_LightATK, Condition( function Trig_LightATK_Conditions ) )
    call TriggerAddAction( gg_trg_LightATK, function Trig_LightATK_Actions )
endfunction

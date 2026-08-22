// rawcode: A07W
// nameZh: 75-02 幻影鬥氣
// w3a base: AOcr  levels: 4
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MoriyaShadow

// === family MoriyaShadow (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_MoriyaShadow_Conditions (family, line 47216) ---
function Trig_MoriyaShadow_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U00B' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaShadow_Func002Func007A (family, line 47223) ---
function Trig_MoriyaShadow_Func002Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MoriyaShadow_Func002C (family, line 47228) ---
function Trig_MoriyaShadow_Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= ( ( GetUnitAbilityLevelSwapped('A07W', GetAttacker()) * 5 ) + 5 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaShadow_Actions (family, line 47235) ---
function Trig_MoriyaShadow_Actions takes nothing returns nothing
    if ( Trig_MoriyaShadow_Func002C() ) then
        call CreateNUnitsAtLoc( 1, 'h016', GetOwningPlayer(GetAttacker()), GetUnitLoc(GetAttacker()), GetUnitFacing(GetAttacker()) )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call SetUnitVertexColorBJ( GetLastCreatedUnit(), 50.00, 50.00, 50.00, 50.00 )
        call SetUnitAnimation( GetLastCreatedUnit(), "attack" )
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetTriggerUnit(), ( ( I2R(GetUnitAbilityLevelSwapped('A07W', GetAttacker())) * 20.00 ) + 30.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call TriggerSleepAction( 0.50 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetAttacker()), 'h016'), function Trig_MoriyaShadow_Func002Func007A )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_MoriyaShadow (family, line 47250) ---
function InitTrig_MoriyaShadow takes nothing returns nothing
    set gg_trg_MoriyaShadow = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MoriyaShadow, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_MoriyaShadow, Condition( function Trig_MoriyaShadow_Conditions ) )
    call TriggerAddAction( gg_trg_MoriyaShadow, function Trig_MoriyaShadow_Actions )
endfunction

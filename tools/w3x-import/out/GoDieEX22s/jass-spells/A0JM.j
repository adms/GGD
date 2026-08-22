// rawcode: A0JM
// nameZh: 14-02 式神炸裂
// w3a base: AHtc  levels: 4
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0}
// mana: {"1": 150, "2": 180, "3": 210, "4": 240}
// area: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SlaveExp

// === family SlaveExp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SlaveExp_Conditions (family, line 30422) ---
function Trig_SlaveExp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JM' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SlaveExp_Func003Func002Func001Func005Func001Func005C (family, line 30429) ---
function Trig_SlaveExp_Func003Func002Func001Func005Func001Func005C takes nothing returns boolean
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(udg_MoNiUnit)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SlaveExp_Func003Func002Func001Func005Func001C (family, line 30442) ---
function Trig_SlaveExp_Func003Func002Func001Func005Func001C takes nothing returns boolean
    if ( not Trig_SlaveExp_Func003Func002Func001Func005Func001Func005C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_SlaveExp_Func003Func002Func001Func005A (family, line 30449) ---
function Trig_SlaveExp_Func003Func002Func001Func005A takes nothing returns nothing
    if ( Trig_SlaveExp_Func003Func002Func001Func005Func001C() ) then
        call UnitDamageTargetBJ( udg_MoNiUnit, GetEnumUnit(), ( I2R(( ( GetUnitAbilityLevelSwapped('A0JM', udg_MoNiUnit) * 150 ) + 100 )) + I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, udg_MoNiUnit, true) * 3 )) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Demon\\DarkConversion\\ZombifyTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_SlaveExp_Func003Func002Func001C (family, line 30459) ---
function Trig_SlaveExp_Func003Func002Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SlaveExp_Func003Func002A (family, line 30466) ---
function Trig_SlaveExp_Func003Func002A takes nothing returns nothing
    if ( Trig_SlaveExp_Func003Func002Func001C() ) then
        set udg_SlaveExpPoint = GetUnitLoc(GetEnumUnit())
        call KillUnit( GetEnumUnit() )
        call AddSpecialEffectLocBJ( udg_SlaveExpPoint, "Objects\\Spawnmodels\\Naga\\NagaDeath\\NagaDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_SlaveExpPoint, 500.00, 500.00)), function Trig_SlaveExp_Func003Func002Func001Func005A )
        call SetUnitManaBJ( udg_MoNiUnit, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_MoNiUnit) + 150.00 ) )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_SlaveExp_Func003Func003Func001Func005Func001Func005C (family, line 30479) ---
function Trig_SlaveExp_Func003Func003Func001Func005Func001Func005C takes nothing returns boolean
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(udg_MoNiUnit)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SlaveExp_Func003Func003Func001Func005Func001C (family, line 30492) ---
function Trig_SlaveExp_Func003Func003Func001Func005Func001C takes nothing returns boolean
    if ( not Trig_SlaveExp_Func003Func003Func001Func005Func001Func005C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_SlaveExp_Func003Func003Func001Func005A (family, line 30499) ---
function Trig_SlaveExp_Func003Func003Func001Func005A takes nothing returns nothing
    if ( Trig_SlaveExp_Func003Func003Func001Func005Func001C() ) then
        call UnitDamageTargetBJ( udg_MoNiUnit, GetEnumUnit(), ( I2R(( ( GetUnitAbilityLevelSwapped('A0JM', udg_MoNiUnit) * 150 ) + 100 )) + I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, udg_MoNiUnit, true) * 3 )) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Demon\\DarkConversion\\ZombifyTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_SlaveExp_Func003Func003Func001C (family, line 30509) ---
function Trig_SlaveExp_Func003Func003Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SlaveExp_Func003Func003A (family, line 30516) ---
function Trig_SlaveExp_Func003Func003A takes nothing returns nothing
    if ( Trig_SlaveExp_Func003Func003Func001C() ) then
        set udg_SlaveExpPoint = GetUnitLoc(GetEnumUnit())
        call KillUnit( GetEnumUnit() )
        call AddSpecialEffectLocBJ( udg_SlaveExpPoint, "Objects\\Spawnmodels\\Naga\\NagaDeath\\NagaDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_SlaveExpPoint, 500.00, 500.00)), function Trig_SlaveExp_Func003Func003Func001Func005A )
        call SetUnitManaBJ( udg_MoNiUnit, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_MoNiUnit) + 150.00 ) )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_SlaveExp_Func003C (family, line 30529) ---
function Trig_SlaveExp_Func003C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Etyr' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SlaveExp_Actions (family, line 30536) ---
function Trig_SlaveExp_Actions takes nothing returns nothing
    set udg_MoNiUnit = GetTriggerUnit()
    call TriggerSleepAction( 0.01 )
    if ( Trig_SlaveExp_Func003C() ) then
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoNiUnit), 'u00P'), function Trig_SlaveExp_Func003Func003A )
    else
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoNiUnit), 'u00Q'), function Trig_SlaveExp_Func003Func002A )
    endif
endfunction

// --- InitTrig_SlaveExp (family, line 30547) ---
function InitTrig_SlaveExp takes nothing returns nothing
    set gg_trg_SlaveExp = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SlaveExp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SlaveExp, Condition( function Trig_SlaveExp_Conditions ) )
    call TriggerAddAction( gg_trg_SlaveExp, function Trig_SlaveExp_Actions )
endfunction

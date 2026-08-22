// rawcode: A01B
// nameZh: 47-03 九頭龍閃
// w3a base: ANc3  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 120, "2": 180, "3": 240, "4": 300}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// area: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: NineSlash, NineSlashEffect

// === family NineSlash (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NineSlash_Conditions (family, line 43276) ---
function Trig_NineSlash_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A01B' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSlash_Actions (family, line 43283) ---
function Trig_NineSlash_Actions takes nothing returns nothing
    set udg_Kenshine = GetTriggerUnit()
    set udg_KenshineFacing = GetUnitFacing(udg_Kenshine)
    set udg_NineDargonP = GetSpellTargetLoc()
    set udg_NineCount = 0
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_NineDargonP, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 4 , 1)
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0RP', GetLastCreatedUnit() )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "thunderclap" )
    call EnableTrigger( gg_trg_NineSlashEffect )
endfunction

// --- InitTrig_NineSlash (family, line 43297) ---
function InitTrig_NineSlash takes nothing returns nothing
    set gg_trg_NineSlash = CreateTrigger(  )
    call DisableTrigger( gg_trg_NineSlash )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NineSlash, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_NineSlash, Condition( function Trig_NineSlash_Conditions ) )
    call TriggerAddAction( gg_trg_NineSlash, function Trig_NineSlash_Actions )
endfunction

// --- RemoveUnitSP (helper, line 4847) ---
function RemoveUnitSP takes unit R_unit , real Life_Time , real Die_Time returns nothing
    local unit Last = bj_lastCreatedUnit
    local real Bj_Timer = bj_enumDestructableRadius
    local real Bj_Rand = bj_randomSubGroupChance
    set bj_lastCreatedUnit = R_unit
    set bj_enumDestructableRadius = Life_Time
    set bj_randomSubGroupChance = Die_Time
    call ExecuteFunc("RemoveUnitSP_Action")
    set bj_lastCreatedUnit = Last
    set bj_enumDestructableRadius = Bj_Timer
    set bj_randomSubGroupChance = Bj_Rand
endfunction

// === family NineSlashEffect (passive) events=none ===

// --- Trig_NineSlashEffect_Func001Func004Func001C (family, line 43310) ---
function Trig_NineSlashEffect_Func001Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Kenshine)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSlashEffect_Func001Func004A (family, line 43320) ---
function Trig_NineSlashEffect_Func001Func004A takes nothing returns nothing
    if ( Trig_NineSlashEffect_Func001Func004Func001C() ) then
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), ( I2R(( GetUnitAbilityLevelSwapped('A01B', udg_Kenshine) * 50 )) + 25.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_NineSlashEffect_Func001Func009A (family, line 43330) ---
function Trig_NineSlashEffect_Func001Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_NineSlashEffect_Func001C (family, line 43335) ---
function Trig_NineSlashEffect_Func001C takes nothing returns boolean
    if ( not ( udg_NineCount == 8 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSlashEffect_Actions (family, line 43342) ---
function Trig_NineSlashEffect_Actions takes nothing returns nothing
    if ( Trig_NineSlashEffect_Func001C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call SetUnitPositionLoc( udg_Kenshine, udg_NineDargonP )
        call SetUnitAnimationWithRarity( udg_Kenshine, "Spell", RARITY_FREQUENT )
        call TriggerSleepAction( 1.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Kenshine), 'h00Z'), function Trig_NineSlashEffect_Func001Func009A )
    else
        set udg_NineCount = ( udg_NineCount + 1 )
        call CreateNUnitsAtLoc( 1, 'h00Z', GetOwningPlayer(udg_Kenshine), PolarProjectionBJ(udg_NineDargonP, ( I2R(udg_NineCount) * 40.00 ), ( udg_KenshineFacing + ( ( I2R(udg_NineCount) * 40.00 ) + 0.00 ) )), udg_KenshineFacing )
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRangeOfLocAll(210.00, GetUnitLoc(GetLastCreatedUnit())), function Trig_NineSlashEffect_Func001Func004A )
    endif
endfunction

// --- InitTrig_NineSlashEffect (family, line 43358) ---
function InitTrig_NineSlashEffect takes nothing returns nothing
    set gg_trg_NineSlashEffect = CreateTrigger(  )
    call DisableTrigger( gg_trg_NineSlashEffect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_NineSlashEffect, 0.13 )
    call TriggerAddAction( gg_trg_NineSlashEffect, function Trig_NineSlashEffect_Actions )
endfunction

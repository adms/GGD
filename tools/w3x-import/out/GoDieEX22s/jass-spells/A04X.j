// rawcode: A04X
// nameZh: 12-04 龍氣爆發
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 18.0}
// mana: {"1": 215, "2": 280, "3": 345, "4": 180}
// range: {"5": 350.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DragonExp

// === family DragonExp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DragonExp_Conditions (family, line 29391) ---
function Trig_DragonExp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A04X' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DragonExp_Actions (family, line 29398) ---
function Trig_DragonExp_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_ChiRam = GetTriggerUnit()
    set udg_DragonFace = GetUnitFacing(udg_ChiRam)
    set udg_DragonPoint = GetUnitLoc(GetTriggerUnit())
    set udg_DraganDamage = ( 350.00 + I2R(( 300 * GetUnitAbilityLevelSwapped('A04X', udg_ChiRam) )) )
    set udg_DragonAgi = I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true))
    set udg_DragonTimerCounter = 0
    set udg_DragonCounter = 0
    call GroupClear( udg_DragonDamageGroup )
    call CreateNUnitsAtLoc( 1, 'h000', GetOwningPlayer(udg_ChiRam), PolarProjectionBJ(udg_DragonPoint, 125.00, GetUnitFacing(udg_ChiRam)), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    call RemoveLocation(udg_DragonPoint)
    set udg_DragonExpUnit = GetLastCreatedUnit()
    set udg_DragonPoint = GetUnitLoc(udg_DragonExpUnit)
    call StartTimerBJ( udg_DragonTimer, true, 1.00 )
endfunction

// --- InitTrig_DragonExp (family, line 29417) ---
function InitTrig_DragonExp takes nothing returns nothing
    set gg_trg_DragonExp = CreateTrigger(  )
    call DisableTrigger( gg_trg_DragonExp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DragonExp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DragonExp, Condition( function Trig_DragonExp_Conditions ) )
    call TriggerAddAction( gg_trg_DragonExp, function Trig_DragonExp_Actions )
endfunction

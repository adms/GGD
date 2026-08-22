// rawcode: A0MQ
// nameZh: 11-04 三千世界
// w3a base: Absk  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 111, "2": 222, "3": 333}
// duration: {"1": 0.10000000149011612, "2": 0.10000000149011612, "3": 0.10000000149011612}
// hero_duration: {"1": 0.10000000149011612, "2": 0.10000000149011612, "3": 0.10000000149011612}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ThworldStart

// === family ThworldStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ThworldStart_Conditions (family, line 29200) ---
function Trig_ThworldStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MQ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldStart_Func004C (family, line 29207) ---
function Trig_ThworldStart_Func004C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetTriggerUnit(), 'B02Y') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldStart_Func005C (family, line 29214) ---
function Trig_ThworldStart_Func005C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U01U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThworldStart_Actions (family, line 29221) ---
function Trig_ThworldStart_Actions takes nothing returns nothing
    set udg_RoMaster = GetTriggerUnit()
    set udg_ThworldAngle = GetUnitFacing(GetTriggerUnit())
    set udg_ThworldDis = 750.00
    if ( Trig_ThworldStart_Func004C() ) then
        set udg_ThWorldDamage = ( ( 333.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) * 3 )) )
    else
        set udg_ThWorldDamage = ( ( 333.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) + 0.00 )
    endif
    if ( Trig_ThworldStart_Func005C() ) then
        set udg_ThWorldDamage = ( udg_ThWorldDamage + I2R(( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) * 5 )) )
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_RoMaster), "Doodads\\Terrain\\RockChunks\\RockChunks3.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
    set udg_PP1 = GetUnitLoc(udg_RoMaster)
    call CreateNUnitsAtLoc( 1, 'h01S', GetOwningPlayer(GetTriggerUnit()), udg_PP1, udg_ThworldAngle )
    set udg_ThworldSP[0] = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'h01T', GetOwningPlayer(GetTriggerUnit()), udg_PP1, udg_ThworldAngle )
    set udg_ThworldSP[1] = GetLastCreatedUnit()
    call SetUnitAnimation( udg_ThworldSP[1], "Attack Walk Stand Spin" )
    call AddSpecialEffectLocBJ( udg_PP1, "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call ShowUnitHide( udg_RoMaster )
    call RemoveLocation( udg_PP1 )
    call EnableTrigger( gg_trg_ThworldMove )
endfunction

// --- InitTrig_ThworldStart (family, line 29250) ---
function InitTrig_ThworldStart takes nothing returns nothing
    set gg_trg_ThworldStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_ThworldStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ThworldStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ThworldStart, Condition( function Trig_ThworldStart_Conditions ) )
    call TriggerAddAction( gg_trg_ThworldStart, function Trig_ThworldStart_Actions )
endfunction

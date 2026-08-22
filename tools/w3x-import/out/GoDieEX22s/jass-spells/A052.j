// rawcode: A052
// nameZh: 15-03 雷電風暴
// w3a base: ANrf  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 275, "2": 340, "3": 405, "4": 470}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// area: {"1": 280.0, "2": 280.0, "3": 280.0, "4": 280.0}
// duration: {"1": 2.0, "2": 2.0, "3": 2.0, "4": 2.0}
// hero_duration: {"1": 2.0, "2": 2.0, "3": 2.0, "4": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LiteningWind

// === family LiteningWind (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LiteningWind_Conditions (family, line 34574) ---
function Trig_LiteningWind_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A052' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LiteningWind_Func004Func001C (family, line 34581) ---
function Trig_LiteningWind_Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_LitenUnit)) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LiteningWind_Func004A (family, line 34594) ---
function Trig_LiteningWind_Func004A takes nothing returns nothing
    if ( Trig_LiteningWind_Func004Func001C() ) then
        call UnitDamageTargetBJ( udg_LitenUnit, GetEnumUnit(), ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_LitenUnit, true)) * 4.00 ) + 0.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_LiteningWind_Func006A (family, line 34604) ---
function Trig_LiteningWind_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LiteningWind_Actions (family, line 34609) ---
function Trig_LiteningWind_Actions takes nothing returns nothing
    set udg_PLight = GetSpellTargetLoc()
    set udg_LitenUnit = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'e00Y', GetOwningPlayer(udg_LitenUnit), udg_PLight, bj_UNIT_FACING )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, udg_PLight), function Trig_LiteningWind_Func004A )
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_LitenUnit), 'e00Y'), function Trig_LiteningWind_Func006A )
    call RemoveLocation(udg_PLight)
endfunction

// --- InitTrig_LiteningWind (family, line 34620) ---
function InitTrig_LiteningWind takes nothing returns nothing
    set gg_trg_LiteningWind = CreateTrigger(  )
    call DisableTrigger( gg_trg_LiteningWind )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LiteningWind, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LiteningWind, Condition( function Trig_LiteningWind_Conditions ) )
    call TriggerAddAction( gg_trg_LiteningWind, function Trig_LiteningWind_Actions )
endfunction

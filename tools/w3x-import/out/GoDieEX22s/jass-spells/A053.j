// rawcode: A053
// nameZh: 15-04 千之雷
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 100, "2": 180, "3": 260}
// range: {"1": 900.0, "2": 900.0, "3": 900.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ThTh

// === family ThTh (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ThTh_Conditions (family, line 34633) ---
function Trig_ThTh_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A053' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThTh_Func003Func001C (family, line 34640) ---
function Trig_ThTh_Func003Func001C takes nothing returns boolean
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

// --- Trig_ThTh_Func003A (family, line 34653) ---
function Trig_ThTh_Func003A takes nothing returns nothing
    if ( Trig_ThTh_Func003Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'e016', GetOwningPlayer(udg_LitenUnit), udg_PLight, bj_UNIT_FACING )
        call UnitDamageTargetBJ( udg_LitenUnit, GetEnumUnit(), ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_LitenUnit, true)) * 5.00 ) + 0.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\NightElf\\EntBirthTarget\\EntBirthTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_ThTh_Func005A (family, line 34666) ---
function Trig_ThTh_Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ThTh_Func006A (family, line 34671) ---
function Trig_ThTh_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ThTh_Actions (family, line 34676) ---
function Trig_ThTh_Actions takes nothing returns nothing
    set udg_PLight = GetUnitLoc(GetSpellTargetUnit())
    set udg_LitenUnit = GetTriggerUnit()
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, udg_PLight), function Trig_ThTh_Func003A )
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_LitenUnit), 'e016'), function Trig_ThTh_Func005A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_LitenUnit), 'e016'), function Trig_ThTh_Func006A )
    call RemoveLocation(udg_PLight)
endfunction

// --- InitTrig_ThTh (family, line 34687) ---
function InitTrig_ThTh takes nothing returns nothing
    set gg_trg_ThTh = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ThTh, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ThTh, Condition( function Trig_ThTh_Conditions ) )
    call TriggerAddAction( gg_trg_ThTh, function Trig_ThTh_Actions )
endfunction

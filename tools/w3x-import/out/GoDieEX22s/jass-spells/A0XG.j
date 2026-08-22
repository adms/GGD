// rawcode: A0XG
// nameZh: 81-01 Barrel Shot
// w3a base: AHbz  levels: 4
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 30.0}
// mana: {"1": 80, "2": 130, "3": 180, "4": 230}
// area: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: BarrelShot

// === family BarrelShot (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BarrelShot_Conditions (family, line 35912) ---
function Trig_BarrelShot_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0XG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BarrelShot_Func003Func002Func001C (family, line 35919) ---
function Trig_BarrelShot_Func003Func002Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Nanoha_Hero)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BarrelShot_Func003Func002A (family, line 35929) ---
function Trig_BarrelShot_Func003Func002A takes nothing returns nothing
    if ( Trig_BarrelShot_Func003Func002Func001C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Orc\\StasisTrap\\StasisTotemTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( udg_Nanoha_Hero, GetEnumUnit(), ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, udg_Nanoha_Hero, true)) * 4.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_BarrelShot_Func003C (family, line 35939) ---
function Trig_BarrelShot_Func003C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O02V' ) ) then
        return false
    endif
    if ( not ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) >= 150.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BarrelShot_Func013A (family, line 35949) ---
function Trig_BarrelShot_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_BarrelShot_Actions (family, line 35954) ---
function Trig_BarrelShot_Actions takes nothing returns nothing
    set udg_Nanoha_Hero = GetTriggerUnit()
    set udg_Nanoha_BS_Position = GetSpellTargetLoc()
    if ( Trig_BarrelShot_Func003C() ) then
        call SetUnitManaBJ( GetTriggerUnit(), ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) - 150.00 ) )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(330.00, udg_Nanoha_BS_Position), function Trig_BarrelShot_Func003Func002A )
    else
    endif
    call CreateNUnitsAtLoc( 1, 'h02W', GetOwningPlayer(udg_Nanoha_Hero), udg_Nanoha_BS_Position, bj_UNIT_FACING )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "thunderclap" )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "MidchilderNanohaAura.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PlaySoundOnUnitBJ( gg_snd_DefendCaster, 100.00, GetTriggerUnit() )
    call AddSpecialEffectLocBJ( udg_Nanoha_AS_Target, "Abilities\\Spells\\Other\\Incinerate\\FireLordDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PlaySoundOnUnitBJ( gg_snd_FlareTarget3, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( 1.60 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Nanoha_Hero), 'h02W'), function Trig_BarrelShot_Func013A )
endfunction

// --- InitTrig_BarrelShot (family, line 35975) ---
function InitTrig_BarrelShot takes nothing returns nothing
    set gg_trg_BarrelShot = CreateTrigger(  )
    call DisableTrigger( gg_trg_BarrelShot )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BarrelShot, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BarrelShot, Condition( function Trig_BarrelShot_Conditions ) )
    call TriggerAddAction( gg_trg_BarrelShot, function Trig_BarrelShot_Actions )
endfunction

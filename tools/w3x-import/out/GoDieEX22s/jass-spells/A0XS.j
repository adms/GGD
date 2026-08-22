// rawcode: A0XS
// nameZh: 96-01 華山劍法
// w3a base: Asth  levels: 4
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HuashanSword

// === family HuashanSword (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_HuashanSword_Func003C (family, line 44785) ---
function Trig_HuashanSword_Func003C takes nothing returns boolean
    if ( ( GetUnitAbilityLevelSwapped('A0XS', GetAttacker()) > 0 ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetAttacker()) == 'o02X' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_HuashanSword_Conditions (family, line 44795) ---
function Trig_HuashanSword_Conditions takes nothing returns boolean
    if ( not Trig_HuashanSword_Func003C() ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttackedUnitBJ()), GetOwningPlayer(GetAttacker())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HuashanSword_Func002C (family, line 44808) ---
function Trig_HuashanSword_Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= udg_LHC_RandRang ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HuashanSword_Actions (family, line 44815) ---
function Trig_HuashanSword_Actions takes nothing returns nothing
    set udg_LHC_RandRang = ( 5 + ( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_LHC_Hero, true) / 15 ) )
    if ( Trig_HuashanSword_Func002C() ) then
        call AddSpecialEffectTargetUnitBJ( "weapon", GetAttacker(), "Abilities\\Spells\\Other\\Levelup\\LevelupCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( GetAttacker(), GetAttackedUnitBJ(), ( ( 10.00 * I2R(GetUnitAbilityLevelSwapped('A0XS', udg_LHC_Hero)) ) + I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_LHC_Hero, true)) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- InitTrig_HuashanSword (family, line 44826) ---
function InitTrig_HuashanSword takes nothing returns nothing
    set gg_trg_HuashanSword = CreateTrigger(  )
    call DisableTrigger( gg_trg_HuashanSword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HuashanSword, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_HuashanSword, Condition( function Trig_HuashanSword_Conditions ) )
    call TriggerAddAction( gg_trg_HuashanSword, function Trig_HuashanSword_Actions )
endfunction

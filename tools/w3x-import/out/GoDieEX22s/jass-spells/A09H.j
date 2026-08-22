// rawcode: A09H
// nameZh: 38-02 邪王炎殺煉獄焦
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0}
// mana: {"1": 75, "2": 125, "3": 175}
// range: {"1": 450.0, "2": 450.0, "3": 450.0}
// area: {"1": 350.0, "2": 350.0, "3": 350.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FireSword

// === family FireSword (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FireSword_Conditions (family, line 43640) ---
function Trig_FireSword_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09H' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSword_Func002C (family, line 43647) ---
function Trig_FireSword_Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSword_Func004Func001C (family, line 43654) ---
function Trig_FireSword_Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireSword_Func004A (family, line 43661) ---
function Trig_FireSword_Func004A takes nothing returns nothing
    if ( Trig_FireSword_Func004Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), udg_HehiFlameDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Environment\\NightElfBuildingFire\\ElfLargeBuildingFire2.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_FireSword_Actions (family, line 43670) ---
function Trig_FireSword_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_HCancelBuilding, 100, GetTriggerUnit() )
    if ( Trig_FireSword_Func002C() ) then
        set udg_HehiFlameDamage = ( ( I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true) * 2 )) + 100.00 ) + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 150.00 ) )
    else
        set udg_HehiFlameDamage = ( 100.00 + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 150.00 ) )
    endif
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(380.00, GetSpellTargetLoc()), function Trig_FireSword_Func004A )
endfunction

// --- InitTrig_FireSword (family, line 43682) ---
function InitTrig_FireSword takes nothing returns nothing
    set gg_trg_FireSword = CreateTrigger(  )
    call DisableTrigger( gg_trg_FireSword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireSword, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FireSword, Condition( function Trig_FireSword_Conditions ) )
    call TriggerAddAction( gg_trg_FireSword, function Trig_FireSword_Actions )
endfunction

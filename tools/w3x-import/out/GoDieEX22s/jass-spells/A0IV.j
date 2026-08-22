// rawcode: A0IV
// nameZh: 76-03 伸縮自如的槍亂打
// w3a base: ANcs  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 130, "2": 160, "3": 190, "4": 220}
// range: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// area: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// duration: {"1": 1.5, "2": 1.5, "3": 1.5, "4": 1.5}
// hero_duration: {"1": 1.5, "2": 1.5, "3": 1.5, "4": 1.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Luf_gun

// === family Luf_gun (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_gun_Conditions (family, line 36402) ---
function Trig_Luf_gun_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_gun_Func009Func001C (family, line 36409) ---
function Trig_Luf_gun_Func009Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_gun_Func009A (family, line 36422) ---
function Trig_Luf_gun_Func009A takes nothing returns nothing
    if ( Trig_Luf_gun_Func009Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 200.00 ) + 200.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_Luf_gun_Actions (family, line 36432) ---
function Trig_Luf_gun_Actions takes nothing returns nothing
    set udg_LuffeFace = GetUnitFacing(udg_Luffe)
    set udg_LuffeUnit = GetTriggerUnit()
    call CreateTextTagUnitBJ( "TRIGSTR_3856", udg_Luffe, 0, 14.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call PlaySoundOnUnitBJ( gg_snd_WaterElementalMissile3, 100.00, GetTriggerUnit() )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(400.00, GetSpellTargetLoc()), function Trig_Luf_gun_Func009A )
    call PlaySoundOnUnitBJ( gg_snd_DemonHunterMissileHit3, 100.00, GetEnumUnit() )
endfunction

// --- InitTrig_Luf_gun (family, line 36446) ---
function InitTrig_Luf_gun takes nothing returns nothing
    set gg_trg_Luf_gun = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_gun )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_gun, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_gun, Condition( function Trig_Luf_gun_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_gun, function Trig_Luf_gun_Actions )
endfunction

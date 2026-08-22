// rawcode: A0GI
// nameZh: 59-04 野戰型陽電子砲
// cooldown: {"1": 75.0, "2": 75.0, "3": 75.0}
// mana: {"1": 250, "2": 400, "3": 550}
// range: {"1": 450.0, "2": 450.0, "3": 450.0}
// area: {"1": 220.0, "2": 220.0, "3": 220.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ElecPower

// === family ElecPower (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ElecPower_Conditions (family, line 47736) ---
function Trig_ElecPower_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0GI' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ElecPower_Func005002003 (family, line 47743) ---
function Trig_ElecPower_Func005002003 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_HERO) == true )
endfunction

// --- Trig_ElecPower_Func007A (family, line 47747) ---
function Trig_ElecPower_Func007A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 3 )) )
    call CameraSetTargetNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 4 )), 200.00 )
endfunction

// --- Trig_ElecPower_Func009A (family, line 47752) ---
function Trig_ElecPower_Func009A takes nothing returns nothing
    call CameraClearNoiseForPlayer( GetEnumPlayer() )
endfunction

// --- Trig_ElecPower_Actions (family, line 47756) ---
function Trig_ElecPower_Actions takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'h01P', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), GetSpellTargetLoc()) )
    call SetUnitScalePercent( GetLastCreatedUnit(), ( 120.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 30 )) ), ( 120.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 30 )) ), ( 120.00 + I2R(( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetSpellAbilityUnit()) * 30 )) ) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(900.00, GetUnitLoc(GetTriggerUnit()), Condition(function Trig_ElecPower_Func005002003))
    call PlaySoundOnUnitBJ( gg_snd_MarkOfChaos, 100.00, GetTriggerUnit() )
    call ForGroupBJ( udg_TempUnitGroup, function Trig_ElecPower_Func007A )
    call TriggerSleepAction( 1.00 )
    call ForForce( GetPlayersAll(), function Trig_ElecPower_Func009A )
endfunction

// --- InitTrig_ElecPower (family, line 47769) ---
function InitTrig_ElecPower takes nothing returns nothing
    set gg_trg_ElecPower = CreateTrigger(  )
    call DisableTrigger( gg_trg_ElecPower )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ElecPower, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ElecPower, Condition( function Trig_ElecPower_Conditions ) )
    call TriggerAddAction( gg_trg_ElecPower, function Trig_ElecPower_Actions )
endfunction

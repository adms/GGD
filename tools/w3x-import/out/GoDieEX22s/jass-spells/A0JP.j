// rawcode: A0JP
// nameZh: 螺旋劍
// cooldown: {"1": 45.0}
// mana: {"1": 260}
// area: {"1": 250.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: spiralAttack

// === family spiralAttack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_spiralAttack_Conditions (family, line 24451) ---
function Trig_spiralAttack_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_spiralAttack_Func007002003 (family, line 24458) ---
function Trig_spiralAttack_Func007002003 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_HERO) == true )
endfunction

// --- Trig_spiralAttack_Func008A (family, line 24462) ---
function Trig_spiralAttack_Func008A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 15.00 )
    call CameraSetTargetNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 25.00, 300.00 )
endfunction

// --- Trig_spiralAttack_Func012A (family, line 24467) ---
function Trig_spiralAttack_Func012A takes nothing returns nothing
    call CameraClearNoiseForPlayer( GetEnumPlayer() )
endfunction

// --- Trig_spiralAttack_Func013A (family, line 24471) ---
function Trig_spiralAttack_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_spiralAttack_Actions (family, line 24476) ---
function Trig_spiralAttack_Actions takes nothing returns nothing
    set udg_spiralUnit = GetTriggerUnit()
    set udg_SprialPoint = GetUnitLoc(GetTriggerUnit())
    call PlaySoundOnUnitBJ( gg_snd_GoldMineDeath1, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_SnapDragonMissileLaunch1, 100.00, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'o01H', GetOwningPlayer(udg_spiralUnit), GetUnitLoc(udg_spiralUnit), AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), GetSpellTargetLoc()) )
    set udg_TempUnitGroup = GetUnitsInRangeOfLocMatching(900.00, GetUnitLoc(udg_spiralUnit), Condition(function Trig_spiralAttack_Func007002003))
    call ForGroupBJ( udg_TempUnitGroup, function Trig_spiralAttack_Func008A )
    call EnableTrigger( gg_trg_spiralAttackEffect )
    call TriggerSleepAction( 3.00 )
    call DisableTrigger( gg_trg_spiralAttackEffect )
    call ForForce( GetPlayersAll(), function Trig_spiralAttack_Func012A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_spiralUnit), 'o01H'), function Trig_spiralAttack_Func013A )
endfunction

// --- InitTrig_spiralAttack (family, line 24492) ---
function InitTrig_spiralAttack takes nothing returns nothing
    set gg_trg_spiralAttack = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_spiralAttack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_spiralAttack, Condition( function Trig_spiralAttack_Conditions ) )
    call TriggerAddAction( gg_trg_spiralAttack, function Trig_spiralAttack_Actions )
endfunction

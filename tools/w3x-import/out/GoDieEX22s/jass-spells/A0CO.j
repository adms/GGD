// rawcode: A0CO
// nameZh: 72-04 黑化
// w3a base: AOw2  levels: 3
// cooldown: {"1": 90.0, "2": 90.0, "3": 90.0}
// mana: {"1": 250, "2": 350, "3": 450}
// duration: {"1": 0.20000000298023224, "2": 0.20000000298023224, "3": 0.20000000298023224}
// hero_duration: {"1": 0.20000000298023224, "2": 0.20000000298023224, "3": 0.20000000298023224}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: BlackTooth

// === family BlackTooth (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BlackTooth_Conditions (family, line 47344) ---
function Trig_BlackTooth_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlackTooth_Func013Func001C (family, line 47351) ---
function Trig_BlackTooth_Func013Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlackTooth_Func013A (family, line 47358) ---
function Trig_BlackTooth_Func013A takes nothing returns nothing
    if ( Trig_BlackTooth_Func013Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), I2R(udg_WildSaber), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
        call CreateTextTagUnitBJ( ( I2S(R2I(I2R(udg_WildSaber))) + "!" ), udg_blademaster, -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 1.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "carrionswarm", GetUnitLoc(GetEnumUnit()) )
    else
    endif
endfunction

// --- Trig_BlackTooth_Func017A (family, line 47372) ---
function Trig_BlackTooth_Func017A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_BlackTooth_Actions (family, line 47377) ---
function Trig_BlackTooth_Actions takes nothing returns nothing
    set udg_WildSaber = ( ( 30 * GetHeroLevel(GetTriggerUnit()) ) + ( GetRandomInt(20, GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * ( GetUnitAbilityLevelSwapped('A0CO', GetTriggerUnit()) * 9 ) ) )
    call SetUnitVertexColorBJ( GetTriggerUnit(), 20.00, 20.00, 20.00, 10.00 )
    call PauseUnitBJ( true, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'o00F', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0CP', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0CP', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitTimeScalePercent( GetTriggerUnit(), 300.00 )
    call SetUnitAnimationWithRarity( GetTriggerUnit(), "attack", RARITY_RARE )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(700.00, GetUnitLoc(GetTriggerUnit())), function Trig_BlackTooth_Func013A )
    call SetUnitVertexColorBJ( GetTriggerUnit(), 100.00, 100.00, 100.00, 0.00 )
    call SetUnitTimeScalePercent( GetTriggerUnit(), 100.00 )
    call PauseUnitBJ( false, GetTriggerUnit() )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o00F'), function Trig_BlackTooth_Func017A )
endfunction

// --- InitTrig_BlackTooth (family, line 47397) ---
function InitTrig_BlackTooth takes nothing returns nothing
    set gg_trg_BlackTooth = CreateTrigger(  )
    call DisableTrigger( gg_trg_BlackTooth )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BlackTooth, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BlackTooth, Condition( function Trig_BlackTooth_Conditions ) )
    call TriggerAddAction( gg_trg_BlackTooth, function Trig_BlackTooth_Actions )
endfunction

// rawcode: A0U8
// nameZh: 52-04 巨神一擊
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 200, "2": 360, "3": 520}
// range: {"1": 600.0, "2": 600.0, "3": 600.0}
// area: {"1": 400.0, "2": 400.0, "3": 400.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Gigantomakhia_0

// === family Gigantomakhia_0 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Gigantomakhia_0_Conditions (family, line 51859) ---
function Trig_Gigantomakhia_0_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0U8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Gigantomakhia_0_Actions (family, line 51866) ---
function Trig_Gigantomakhia_0_Actions takes nothing returns nothing
    set udg_Buncle_P4 = GetSpellTargetLoc()
    set udg_Buncle_Gi_Damage = ( 200.00 + ( 400.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    set udg_Buncle_Gi_Caster = GetTriggerUnit()
    call PauseUnitBJ( true, GetTriggerUnit() )
    set udg_Buncle_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Buncle_P2 = PolarProjectionBJ(udg_Buncle_P1, 200.00, ( GetUnitFacing(GetTriggerUnit()) + 45.00 ))
    set udg_Buncle_P3 = PolarProjectionBJ(udg_Buncle_P1, 200.00, ( GetUnitFacing(GetTriggerUnit()) + 135.00 ))
    set udg_Buncle_Gi_Angle = AngleBetweenPoints(udg_Buncle_P1, udg_Buncle_P4)
    set udg_Buncle_Gi_MaxDist = ( DistanceBetweenPoints(udg_Buncle_P1, udg_Buncle_P4) / 50.00 )
    call CreateNUnitsAtLoc( 1, 'h02M', GetOwningPlayer(GetTriggerUnit()), udg_Buncle_P2, bj_UNIT_FACING )
    set udg_Buncle_Gi_Unit = GetLastCreatedUnit()
    call IssuePointOrderLocBJ( udg_Buncle_Gi_Unit, "move", udg_Buncle_P3 )
    call RemoveLocation( udg_Buncle_P3 )
    set udg_Buncle_Int = 1
    loop
        exitwhen udg_Buncle_Int > 7
        set udg_Buncle_P3 = PolarProjectionBJ(udg_Buncle_P2, 400.00, GetRandomDirectionDeg())
        call CreateNUnitsAtLocFacingLocBJ( 1, 'h02M', GetOwningPlayer(GetTriggerUnit()), udg_Buncle_P3, udg_Buncle_P2 )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_Buncle_Gi_Group )
        call RemoveLocation( udg_Buncle_P3 )
        set udg_Buncle_Int = udg_Buncle_Int + 1
    endloop
    set udg_Buncle_Int = 0
    set udg_Buncle_Gi_Color = 35.00
    call RemoveLocation( udg_Buncle_P1 )
    call RemoveLocation( udg_Buncle_P2 )
    call SetUnitAnimationWithRarity( GetTriggerUnit(), "attack", RARITY_FREQUENT )
    call SetUnitTimeScalePercent( udg_Buncle_Gi_Caster, 40.00 )
    call TriggerSleepAction( 0.10 )
    call EnableTrigger( gg_trg_Gigantomakhia_1 )
endfunction

// --- InitTrig_Gigantomakhia_0 (family, line 51900) ---
function InitTrig_Gigantomakhia_0 takes nothing returns nothing
    set gg_trg_Gigantomakhia_0 = CreateTrigger(  )
    call DisableTrigger( gg_trg_Gigantomakhia_0 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Gigantomakhia_0, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Gigantomakhia_0, Condition( function Trig_Gigantomakhia_0_Conditions ) )
    call TriggerAddAction( gg_trg_Gigantomakhia_0, function Trig_Gigantomakhia_0_Actions )
endfunction

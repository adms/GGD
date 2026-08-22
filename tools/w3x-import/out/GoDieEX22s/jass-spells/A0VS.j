// rawcode: A0VS
// nameZh: 91-002 亡靈大軍
// w3a base: ANcl  levels: 1
// cooldown: {"1": 60.0}
// mana: {"1": 500}
// range: {"1": 800.0}
// area: {"1": 500.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ArmyOfTheDead

// === family ArmyOfTheDead (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ArmyOfTheDead_Conditions (family, line 53377) ---
function Trig_ArmyOfTheDead_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ArmyOfTheDead_Func010Func006C (family, line 53384) ---
function Trig_ArmyOfTheDead_Func010Func006C takes nothing returns boolean
    if ( not ( ModuloInteger(udg_DK_AD_Index, 2) == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ArmyOfTheDead_Actions (family, line 53391) ---
function Trig_ArmyOfTheDead_Actions takes nothing returns nothing
    set udg_DK_P1 = GetSpellTargetLoc()
    // 暈眩
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_DK_P1, bj_UNIT_FACING )
    call UnitAddAbilityBJ( 'A0VT', GetLastCreatedUnit() )
    call ShowUnitHide( GetLastCreatedUnit() )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    // 召喚食屍鬼
    set udg_DK_AD_Index = 1
    loop
        exitwhen udg_DK_AD_Index > 8
        set udg_DK_P2 = PolarProjectionBJ(udg_DK_P1, 450.00, ( 45.00 * I2R(udg_DK_AD_Index) ))
        call AddSpecialEffectLocBJ( udg_DK_P2, "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateNUnitsAtLocFacingLocBJ( 1, 'u031', GetOwningPlayer(GetTriggerUnit()), udg_DK_P2, udg_DK_P1 )
        call UnitApplyTimedLifeBJ( 20.00, 'BTLF', GetLastCreatedUnit() )
        if ( Trig_ArmyOfTheDead_Func010Func006C() ) then
            call IssueImmediateOrderBJ( GetLastCreatedUnit(), "taunt" )
        else
        endif
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "attack", udg_DK_P1 )
        call RemoveLocation( udg_DK_P2 )
        set udg_DK_AD_Index = udg_DK_AD_Index + 1
    endloop
    call RemoveLocation( udg_DK_P1 )
endfunction

// --- InitTrig_ArmyOfTheDead (family, line 53421) ---
function InitTrig_ArmyOfTheDead takes nothing returns nothing
    set gg_trg_ArmyOfTheDead = CreateTrigger(  )
    call DisableTrigger( gg_trg_ArmyOfTheDead )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ArmyOfTheDead, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ArmyOfTheDead, Condition( function Trig_ArmyOfTheDead_Conditions ) )
    call TriggerAddAction( gg_trg_ArmyOfTheDead, function Trig_ArmyOfTheDead_Actions )
endfunction

// rawcode: A0Y0
// nameZh: 96-03 吸星大法
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 140, "2": 210, "3": 280, "4": 350}
// range: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0, "5": 350.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: StarSucking

// === family StarSucking (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_StarSucking_Conditions (family, line 44837) ---
function Trig_StarSucking_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StarSucking_Func004C (family, line 44844) ---
function Trig_StarSucking_Func004C takes nothing returns boolean
    if ( not ( OrderId2StringBJ(GetUnitCurrentOrder(udg_LHC_Hero)) == "channel" ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StarSucking_Actions (family, line 44851) ---
function Trig_StarSucking_Actions takes nothing returns nothing
    set udg_LHC_Hero = GetTriggerUnit()
    set udg_LHC_SS_Target = GetSpellTargetUnit()
    call TriggerSleepAction( 0.80 )
    if ( Trig_StarSucking_Func004C() ) then
        call SetUnitManaBJ( udg_LHC_SS_Target, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_LHC_SS_Target) - ( 200.00 * I2R(GetUnitAbilityLevelSwapped('A0Y0', udg_LHC_Hero)) ) ) )
        call SetUnitManaBJ( udg_LHC_Hero, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_LHC_Hero) + ( 200.00 * I2R(GetUnitAbilityLevelSwapped('A0Y0', udg_LHC_Hero)) ) ) )
        call AddSpecialEffectTargetUnitBJ( "overhead", udg_LHC_Hero, "Abilities\\Weapons\\WingedSerpentMissile\\WingedSerpentMissile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_LHC_P1 = GetUnitLoc(udg_LHC_Hero)
        set udg_LHC_P2 = GetUnitLoc(udg_LHC_SS_Target)
        call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_LHC_Hero), udg_LHC_P1, udg_LHC_P2 )
        call UnitAddAbilityBJ( 'A0XW', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0XW', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0Y0', udg_LHC_Hero) )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", udg_LHC_SS_Target )
        call KillUnit( GetLastCreatedUnit() )
        call RemoveUnit( GetLastCreatedUnit() )
        call AddSpecialEffectLocBJ( udg_LHC_P2, "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation( udg_LHC_P1)
        call RemoveLocation( udg_LHC_P2)
    else
    endif
endfunction

// --- InitTrig_StarSucking (family, line 44877) ---
function InitTrig_StarSucking takes nothing returns nothing
    set gg_trg_StarSucking = CreateTrigger(  )
    call DisableTrigger( gg_trg_StarSucking )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_StarSucking, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_StarSucking, Condition( function Trig_StarSucking_Conditions ) )
    call TriggerAddAction( gg_trg_StarSucking, function Trig_StarSucking_Actions )
endfunction

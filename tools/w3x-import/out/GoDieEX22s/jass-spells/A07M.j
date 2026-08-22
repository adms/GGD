// rawcode: A07M
// nameZh: 17-03 空破圓斬
// w3a base: ANfl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 95, "2": 130, "3": 165, "4": 200}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SpaceCut

// === family SpaceCut (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_SpaceCut_Conditions (family, line 28556) ---
function Trig_SpaceCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07M' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SpaceCut_Actions (family, line 28563) ---
function Trig_SpaceCut_Actions takes nothing returns nothing
    local location STPoint = GetUnitLoc(GetSpellTargetUnit())
    call TriggerSleepAction( 0.00 )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call TriggerSleepAction( 0.50 )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call SetUnitPositionLoc( GetTriggerUnit(), STPoint )
    call RemoveLocation( STPoint )
    call SetUnitAnimation( GetLastCreatedUnit(), "Attack Walk Stand Spin" )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Weapons\\FlyingMachine\\FlyingMachineImpact.mdl" )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
endfunction

// --- InitTrig_SpaceCut (family, line 28578) ---
function InitTrig_SpaceCut takes nothing returns nothing
    set gg_trg_SpaceCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_SpaceCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SpaceCut, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_SpaceCut, Condition( function Trig_SpaceCut_Conditions ) )
    call TriggerAddAction( gg_trg_SpaceCut, function Trig_SpaceCut_Actions )
endfunction

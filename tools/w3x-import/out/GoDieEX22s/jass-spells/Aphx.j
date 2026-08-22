// rawcode: Aphx
// nameZh: 61-00百連我殺 效果
// mana: {"1": 500}
// duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DMC_Dead, DMC_Revive

// === family DMC_Dead (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DMC_Dead_Conditions (family, line 50667) ---
function Trig_DMC_Dead_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'Aphx' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U012' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Dead_Actions (family, line 50677) ---
function Trig_DMC_Dead_Actions takes nothing returns nothing
    call PauseUnitBJ( true, GetTriggerUnit() )
    set udg_DMC_P1 = GetUnitLoc(GetTriggerUnit())
    call AddSpecialEffectLocBJ( udg_DMC_P1, "Abilities\\Spells\\Human\\MarkOfChaos\\MarkOfChaosTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'u01P', GetOwningPlayer(GetTriggerUnit()), udg_DMC_P1, GetRandomDirectionDeg() )
    call SetUnitPositionLoc( GetLastCreatedUnit(), udg_DMC_P1 )
    call SetUnitAnimation( GetLastCreatedUnit(), "attack" )
    call RemoveLocation(udg_DMC_P1)
endfunction

// --- InitTrig_DMC_Dead (family, line 50689) ---
function InitTrig_DMC_Dead takes nothing returns nothing
    set gg_trg_DMC_Dead = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Dead )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Dead, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DMC_Dead, Condition( function Trig_DMC_Dead_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Dead, function Trig_DMC_Dead_Actions )
endfunction

// === family DMC_Revive (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DMC_Revive_Conditions (family, line 50730) ---
function Trig_DMC_Revive_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'Aphx' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U011' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DMC_Revive_Func007A (family, line 50740) ---
function Trig_DMC_Revive_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DMC_Revive_Actions (family, line 50745) ---
function Trig_DMC_Revive_Actions takes nothing returns nothing
    call PauseUnitBJ( false, GetTriggerUnit() )
    set udg_DMC_P1 = GetUnitLoc(GetTriggerUnit())
    call AddSpecialEffectLocBJ( udg_DMC_P1, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call RemoveLocation(udg_DMC_P1)
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'u01P'), function Trig_DMC_Revive_Func007A )
endfunction

// --- InitTrig_DMC_Revive (family, line 50756) ---
function InitTrig_DMC_Revive takes nothing returns nothing
    set gg_trg_DMC_Revive = CreateTrigger(  )
    call DisableTrigger( gg_trg_DMC_Revive )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DMC_Revive, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DMC_Revive, Condition( function Trig_DMC_Revive_Conditions ) )
    call TriggerAddAction( gg_trg_DMC_Revive, function Trig_DMC_Revive_Actions )
endfunction

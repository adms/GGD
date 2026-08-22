// rawcode: A0I8
// nameZh: 66-02 驚駭
// w3a base: ANcl  levels: 4
// cooldown: {"1": 55.0, "2": 50.0, "3": 45.0, "4": 40.0}
// mana: {"1": 150, "2": 150, "3": 150, "4": 150}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ButtyGhost_Scare

// === family ButtyGhost_Scare (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ButtyGhost_Scare_Conditions (family, line 48865) ---
function Trig_ButtyGhost_Scare_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0I8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ButtyGhost_Scare_Actions (family, line 48872) ---
function Trig_ButtyGhost_Scare_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.00 )
    set udg_P0 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_P0, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0I9', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0I9', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0I8', GetTriggerUnit()) )
    call SetUnitFacingToFaceLocTimed( GetLastCreatedUnit(), udg_P0, 0 )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "silence", udg_P0 )
    call RemoveLocation( udg_P0 )
    call PlaySoundOnUnitBJ( gg_snd_NecropolisUpgrade2, 100.00, GetTriggerUnit() )
endfunction

// --- InitTrig_ButtyGhost_Scare (family, line 48886) ---
function InitTrig_ButtyGhost_Scare takes nothing returns nothing
    set gg_trg_ButtyGhost_Scare = CreateTrigger(  )
    call DisableTrigger( gg_trg_ButtyGhost_Scare )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ButtyGhost_Scare, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ButtyGhost_Scare, Condition( function Trig_ButtyGhost_Scare_Conditions ) )
    call TriggerAddAction( gg_trg_ButtyGhost_Scare, function Trig_ButtyGhost_Scare_Actions )
endfunction

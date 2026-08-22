// rawcode: A0AD
// nameZh: Soulless Hunter
// w3a base: Alsh  levels: 3
// cooldown: {"2": 3.0, "3": 3.0}
// mana: {"1": 40, "2": 45, "3": 50}
// range: {"2": 900.0, "3": 1200.0}
// area: {"1": 0.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Soulless_Hunter

// === family Soulless_Hunter (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Soulless_Hunter_Conditions (family, line 25964) ---
function Trig_Soulless_Hunter_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0AD' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Soulless_Hunter_Actions (family, line 25971) ---
function Trig_Soulless_Hunter_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.50 )
    set udg_SoullessCaster = GetSpellAbilityUnit()
    set udg_SwitchTarget = GetSpellTargetUnit()
    call AddSpecialEffectTargetUnitBJ( "origin", udg_SwitchTarget, "Abilities\\Spells\\Undead\\Unsummon\\UnsummonTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLoc( udg_SwitchTarget, GetUnitLoc(udg_SoullessCaster) )
    call TriggerSleepAction( 0.25 )
    call TriggerSleepAction( 0.25 )
    call DoNothing(  )
endfunction

// --- InitTrig_Soulless_Hunter (family, line 25984) ---
function InitTrig_Soulless_Hunter takes nothing returns nothing
    set gg_trg_Soulless_Hunter = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Soulless_Hunter, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Soulless_Hunter, Condition( function Trig_Soulless_Hunter_Conditions ) )
    call TriggerAddAction( gg_trg_Soulless_Hunter, function Trig_Soulless_Hunter_Actions )
endfunction

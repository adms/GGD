// rawcode: A0J8
// nameZh: 34-冥道殘月破
// w3a base: AHtb  levels: 1
// cooldown: {"1": 45.0}
// mana: {"1": 165}
// duration: {"1": 1.0}
// hero_duration: {"1": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: lzfs

// === family lzfs (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_lzfs_Conditions (family, line 38898) ---
function Trig_lzfs_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0J8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_lzfs_Actions (family, line 38905) ---
function Trig_lzfs_Actions takes nothing returns nothing
    set udg_lzfsUnits2[0] = GetTriggerUnit()
    set udg_lzfsUnits2[1] = GetSpellTargetUnit()
    call ShowUnitHide( udg_lzfsUnits2[0] )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_lzfsUnits2[1]), "AquaSpikeVersion2.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( 0.01 )
    set udg_lzfsCount = 0
    call EnableTrigger( gg_trg_lzfsEffect )
endfunction

// --- InitTrig_lzfs (family, line 38917) ---
function InitTrig_lzfs takes nothing returns nothing
    set gg_trg_lzfs = CreateTrigger(  )
    call DisableTrigger( gg_trg_lzfs )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_lzfs, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_lzfs, Condition( function Trig_lzfs_Conditions ) )
    call TriggerAddAction( gg_trg_lzfs, function Trig_lzfs_Actions )
endfunction

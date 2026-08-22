// rawcode: A0IC
// nameZh: 66-04  靈壓震撼
// cooldown: {"1": 10.0, "2": 10.0, "3": 10.0}
// mana: {"1": 50, "2": 70, "3": 90, "4": 100}
// area: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ButtyGhost_SoulDash_Level

// === family ButtyGhost_SoulDash_Level (passive) events=none ===

// --- Trig_ButtyGhost_SoulDash_Level_Actions (family, line 48897) ---
function Trig_ButtyGhost_SoulDash_Level_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0ID', GetTriggerUnit(), GetUnitAbilityLevelSwapped('A0IC', GetTriggerUnit()) )
endfunction

// --- InitTrig_ButtyGhost_SoulDash_Level (family, line 48902) ---
function InitTrig_ButtyGhost_SoulDash_Level takes nothing returns nothing
    set gg_trg_ButtyGhost_SoulDash_Level = CreateTrigger(  )
    call DisableTrigger( gg_trg_ButtyGhost_SoulDash_Level )
    call TriggerAddAction( gg_trg_ButtyGhost_SoulDash_Level, function Trig_ButtyGhost_SoulDash_Level_Actions )
endfunction

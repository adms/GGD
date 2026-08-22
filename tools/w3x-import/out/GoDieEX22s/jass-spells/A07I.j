// rawcode: A07I
// nameZh: 40-02 必殺！爆熱神音！
// w3a base: AOw2  levels: 3
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0}
// mana: {"1": 55, "2": 85, "3": 115}
// area: {"1": 350.0, "2": 450.0, "3": 550.0}
// duration: {"1": 0.30000001192092896, "2": 0.30000001192092896, "3": 0.30000001192092896}
// hero_duration: {"1": 0.30000001192092896, "2": 0.30000001192092896, "3": 0.30000001192092896}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GrantSound

// === family GrantSound (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GrantSound_Conditions (family, line 39114) ---
function Trig_GrantSound_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07I' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GrantSound_Actions (family, line 39121) ---
function Trig_GrantSound_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_StampedeCaster1, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_BloodlustTarget, 100.00, GetTriggerUnit() )
endfunction

// --- InitTrig_GrantSound (family, line 39127) ---
function InitTrig_GrantSound takes nothing returns nothing
    set gg_trg_GrantSound = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GrantSound, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GrantSound, Condition( function Trig_GrantSound_Conditions ) )
    call TriggerAddAction( gg_trg_GrantSound, function Trig_GrantSound_Actions )
endfunction

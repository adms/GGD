// rawcode: ANfd
// nameZh: 43-04 爆裂海景佛跳牆
// w3a base: ANfd  levels: 3
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 75.0}
// mana: {"1": 160, "2": 220, "3": 280, "4": 350}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: godJumpWall

// === family godJumpWall (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_godJumpWall_Conditions (family, line 37951) ---
function Trig_godJumpWall_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'ANfd' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_godJumpWall_Actions (family, line 37958) ---
function Trig_godJumpWall_Actions takes nothing returns nothing
    call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 3 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
endfunction

// --- InitTrig_godJumpWall (family, line 37963) ---
function InitTrig_godJumpWall takes nothing returns nothing
    set gg_trg_godJumpWall = CreateTrigger(  )
    call DisableTrigger( gg_trg_godJumpWall )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_godJumpWall, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_godJumpWall, Condition( function Trig_godJumpWall_Conditions ) )
    call TriggerAddAction( gg_trg_godJumpWall, function Trig_godJumpWall_Actions )
endfunction

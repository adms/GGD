// rawcode: A0Q6
// nameZh: 82-04 闇之魔法
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 250, "2": 350, "3": 450}
// area: {"1": 50.0, "2": 50.0, "3": 50.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DarkMagic

// === family DarkMagic (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DarkMagic_Conditions (family, line 35603) ---
function Trig_DarkMagic_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Q6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DarkMagic_Actions (family, line 35610) ---
function Trig_DarkMagic_Actions takes nothing returns nothing
    set udg_NegiJudgeThunder = true
    call SetUnitVertexColorBJ( GetTriggerUnit(), 20.00, 20.00, 20.00, 0 )
    call SetUnitAbilityLevelSwapped( 'A0Q0', GetTriggerUnit(), ( GetUnitAbilityLevelSwapped('A0Q6', GetTriggerUnit()) + 1 ) )
    call EnableTrigger( gg_trg_WindThunder )
    call EnableTrigger( gg_trg_HellFire )
    call TriggerSleepAction( 15.00 )
    set udg_NegiJudgeThunder = false
    call UnitRemoveAbilityBJ( 'A0PV', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0PY', GetTriggerUnit() )
    call SetUnitVertexColorBJ( GetTriggerUnit(), 100.00, 100.00, 100.00, 0 )
    call SetUnitAbilityLevelSwapped( 'A0Q0', GetTriggerUnit(), 1 )
    call DisableTrigger( gg_trg_WindThunder )
    call DisableTrigger( gg_trg_HellFire )
endfunction

// --- InitTrig_DarkMagic (family, line 35627) ---
function InitTrig_DarkMagic takes nothing returns nothing
    set gg_trg_DarkMagic = CreateTrigger(  )
    call DisableTrigger( gg_trg_DarkMagic )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DarkMagic, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DarkMagic, Condition( function Trig_DarkMagic_Conditions ) )
    call TriggerAddAction( gg_trg_DarkMagic, function Trig_DarkMagic_Actions )
endfunction

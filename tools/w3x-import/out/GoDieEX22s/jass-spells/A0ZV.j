// rawcode: A0ZV
// nameZh: 37-002 真‧黑核晶
// cooldown: {"1": 20.0}
// mana: {"1": 600}
// range: {"1": 600.0}
// area: {"1": 800.0}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: TrueBlackBoom

// === family TrueBlackBoom (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_TrueBlackBoom_Conditions (family, line 44671) ---
function Trig_TrueBlackBoom_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TrueBlackBoom_Actions (family, line 44678) ---
function Trig_TrueBlackBoom_Actions takes nothing returns nothing
    set udg_AKTCastPoint = GetSpellTargetLoc()
    call CreateNUnitsAtLoc( 1, 'n00W', GetOwningPlayer(GetTriggerUnit()), udg_AKTCastPoint, bj_UNIT_FACING )
    call RemoveLocation( udg_AKTCastPoint )
endfunction

// --- InitTrig_TrueBlackBoom (family, line 44685) ---
function InitTrig_TrueBlackBoom takes nothing returns nothing
    set gg_trg_TrueBlackBoom = CreateTrigger(  )
    call DisableTrigger( gg_trg_TrueBlackBoom )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TrueBlackBoom, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_TrueBlackBoom, Condition( function Trig_TrueBlackBoom_Conditions ) )
    call TriggerAddAction( gg_trg_TrueBlackBoom, function Trig_TrueBlackBoom_Actions )
endfunction

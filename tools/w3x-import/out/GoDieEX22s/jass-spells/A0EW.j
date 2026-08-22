// rawcode: A0EW
// nameZh: 26-04 開天闢地‧洨者聖臨
// w3a base: AEIl  levels: 3
// cooldown: {"1": 75.0, "2": 75.0, "3": 75.0}
// mana: {"1": 140, "2": 210, "3": 280}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// hero_duration: {"1": 7.0, "2": 10.5, "3": 14.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_World

// === family Open_World (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Open_World_Conditions (family, line 38026) ---
function Trig_Open_World_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0EW' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_World_Actions (family, line 38033) ---
function Trig_Open_World_Actions takes nothing returns nothing
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\NightElf\\Starfall\\StarfallCaster.mdl" )
    call RemoveEffectSP( GetLastCreatedEffectBJ() , 3.00 + 3.00* I2R( GetUnitAbilityLevelSwapped( 'A0EW' , GetTriggerUnit() ) ) )
endfunction

// --- InitTrig_Open_World (family, line 38039) ---
function InitTrig_Open_World takes nothing returns nothing
    set gg_trg_Open_World = CreateTrigger(  )
    call DisableTrigger( gg_trg_Open_World )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Open_World, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Open_World, Condition( function Trig_Open_World_Conditions ) )
    call TriggerAddAction( gg_trg_Open_World, function Trig_Open_World_Actions )
endfunction

// --- RemoveEffectSP (helper, line 4814) ---
function RemoveEffectSP takes effect R_Effect , real Life_Time returns nothing
    local real Bj_Timer = bj_enumDestructableRadius
    set bj_lastCreatedEffect = R_Effect
    set bj_enumDestructableRadius = Life_Time
    call ExecuteFunc("RemoveEffectSP_Action")
    set bj_enumDestructableRadius = Bj_Timer
endfunction

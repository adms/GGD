// rawcode: A05T
// nameZh: 08-02 萊丁快速劍
// w3a base: AOcl  levels: 4
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 30.0}
// mana: {"1": 50, "2": 80, "3": 110, "4": 140}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// area: {"1": 250.0, "2": 250.0, "3": 250.0, "4": 250.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LightSpeed

// === family LightSpeed (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_LightSpeed_Conditions (family, line 28771) ---
function Trig_LightSpeed_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05T' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightSpeed_Actions (family, line 28778) ---
function Trig_LightSpeed_Actions takes nothing returns nothing
    local location STPoint = GetUnitLoc(GetSpellTargetUnit())
    call PolledWait( 0.00 )
    call UnitAddAbilityBJ( 'A09O', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call RemoveEffectSP( GetLastCreatedEffectBJ() , 0.5 )
    call TriggerSleepAction( 0.50 )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
    call RemoveEffectSP( GetLastCreatedEffectBJ() , 0.5 )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call RemoveEffectSP( GetLastCreatedEffectBJ() , 0.5 )
    call SetUnitPositionLoc( GetTriggerUnit(), STPoint )
    call RemoveLocation( STPoint )
    call SetUnitAnimation( GetLastCreatedUnit(), "Attack Walk Stand Spin" )
    call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call RemoveEffectSP( GetLastCreatedEffectBJ() , 0.5 )
    call UnitRemoveAbilityBJ( 'A09O', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A09P', GetTriggerUnit() )
endfunction

// --- InitTrig_LightSpeed (family, line 28800) ---
function InitTrig_LightSpeed takes nothing returns nothing
    set gg_trg_LightSpeed = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightSpeed, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_LightSpeed, Condition( function Trig_LightSpeed_Conditions ) )
    call TriggerAddAction( gg_trg_LightSpeed, function Trig_LightSpeed_Actions )
endfunction

// --- RemoveEffectSP (helper, line 4814) ---
function RemoveEffectSP takes effect R_Effect , real Life_Time returns nothing
    local real Bj_Timer = bj_enumDestructableRadius
    set bj_lastCreatedEffect = R_Effect
    set bj_enumDestructableRadius = Life_Time
    call ExecuteFunc("RemoveEffectSP_Action")
    set bj_enumDestructableRadius = Bj_Timer
endfunction

// rawcode: A10H
// nameZh: 13-002 化龍
// w3a base: ANsb  levels: 1
// cooldown: {"1": 8.0}
// mana: {"1": 166}
// range: {"1": 2000.0}
// duration: {"1": 2.0}
// hero_duration: {"1": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: BeDragon_Target

// === family BeDragon_Target (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BeDragon_Target_Conditions (family, line 45095) ---
function Trig_BeDragon_Target_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A10H' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BeDragon_Target_Actions (family, line 45102) ---
function Trig_BeDragon_Target_Actions takes nothing returns nothing
    call InitSetup( GetSpellTargetUnit() )
endfunction

// --- InitTrig_BeDragon_Target (family, line 45107) ---
function InitTrig_BeDragon_Target takes nothing returns nothing
    set gg_trg_BeDragon_Target = CreateTrigger(  )
    call DisableTrigger( gg_trg_BeDragon_Target )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BeDragon_Target, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BeDragon_Target, Condition( function Trig_BeDragon_Target_Conditions ) )
    call TriggerAddAction( gg_trg_BeDragon_Target, function Trig_BeDragon_Target_Actions )
endfunction

// --- InitSetup (helper, line 4958) ---
function InitSetup takes unit DesUnit returns nothing
    local trigger Tri
    local triggeraction TriAct 
    
    set Tri = CreateTrigger()
    set TriAct = TriggerAddAction( Tri , function DamageLink )

    call TriggerRegisterUnitEvent( Tri , DesUnit , EVENT_UNIT_DAMAGED )

    call SetHandleTrigger(  DesUnit , "DTri" , Tri    )
    // 傷害的觸發
    call SetHandleTriggerAction(  DesUnit , "DAct" , TriAct )
    // 傷害的動作

    set Tri = null
    set TriAct = null
    set DesUnit = null
endfunction

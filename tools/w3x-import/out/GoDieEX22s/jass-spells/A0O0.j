// rawcode: A0O0
// nameZh: 94-04 賣扣~~
// w3a base: ANsb  levels: 3
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0}
// mana: {"1": 200, "2": 275, "3": 350}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Mic

// === family Mic (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Mic_Conditions (family, line 53984) ---
function Trig_Mic_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0O0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Mic_Func001C (family, line 53991) ---
function Trig_Mic_Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetSpellTargetUnit(), udg_Des_Group) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetSpellTargetUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitIllusionBJ(GetSpellTargetUnit()) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Mic_Actions (family, line 54004) ---
function Trig_Mic_Actions takes nothing returns nothing
    if ( Trig_Mic_Func001C() ) then
        call GroupAddUnitSimple( GetSpellTargetUnit(), udg_Des_Group )
        call InitSetup( GetSpellTargetUnit() )
    else
    endif
endfunction

// --- InitTrig_Mic (family, line 54013) ---
function InitTrig_Mic takes nothing returns nothing
    set gg_trg_Mic = CreateTrigger(  )
    call DisableTrigger( gg_trg_Mic )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Mic, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Mic, Condition( function Trig_Mic_Conditions ) )
    call TriggerAddAction( gg_trg_Mic, function Trig_Mic_Actions )
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

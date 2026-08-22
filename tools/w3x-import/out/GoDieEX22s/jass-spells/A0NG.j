// rawcode: A0NG
// nameZh: 93-03 這次考試很簡單
// w3a base: AUfn  levels: 4
// cooldown: {"1": 50.0, "2": 60.0, "3": 70.0, "4": 80.0}
// mana: {"1": 200, "2": 320, "3": 440, "4": 560}
// range: {"1": 500.0, "2": 500.0, "3": 500.0, "4": 500.0}
// area: {"1": 10.0, "2": 10.0, "3": 10.0, "4": 10.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: TestsoEasy, TestsoEasyEff

// === family TestsoEasy (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_TestsoEasy_Conditions (family, line 53663) ---
function Trig_TestsoEasy_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0NG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TestsoEasy_Func001C (family, line 53670) ---
function Trig_TestsoEasy_Func001C takes nothing returns boolean
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

// --- Trig_TestsoEasy_Actions (family, line 53683) ---
function Trig_TestsoEasy_Actions takes nothing returns nothing
    if ( Trig_TestsoEasy_Func001C() ) then
        call GroupAddUnitSimple( GetSpellTargetUnit(), udg_Des_Group )
        call InitSetup( GetSpellTargetUnit() )
    else
    endif
endfunction

// --- InitTrig_TestsoEasy (family, line 53692) ---
function InitTrig_TestsoEasy takes nothing returns nothing
    set gg_trg_TestsoEasy = CreateTrigger(  )
    call DisableTrigger( gg_trg_TestsoEasy )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TestsoEasy, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_TestsoEasy, Condition( function Trig_TestsoEasy_Conditions ) )
    call TriggerAddAction( gg_trg_TestsoEasy, function Trig_TestsoEasy_Actions )
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

// === family TestsoEasyEff (passive) events=none ===

// --- Trig_TestsoEasyEff_Func007C (family, line 53703) ---
function Trig_TestsoEasyEff_Func007C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(udg_Pro_TestUnit) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TestsoEasyEff_Actions (family, line 53710) ---
function Trig_TestsoEasyEff_Actions takes nothing returns nothing
    set udg_ProHp = ( GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) * ( 0.10 * I2R(GetUnitAbilityLevelSwapped('A0NG', GetEventDamageSource())) ) )
    set udg_ProMp = ( GetUnitStateSwap(UNIT_STATE_MANA, GetTriggerUnit()) * ( 0.10 * I2R(GetUnitAbilityLevelSwapped('A0NG', GetEventDamageSource())) ) )
    set udg_Pro_TestUnit = GetTriggerUnit()
    call SetUnitLifeBJ( udg_Pro_TestUnit, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_Pro_TestUnit) - udg_ProHp ) )
    call SetUnitManaBJ( udg_Pro_TestUnit, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_Pro_TestUnit) - udg_ProMp ) )
    call TriggerSleepAction( 8.00 )
    if ( Trig_TestsoEasyEff_Func007C() ) then
        call SetUnitLifeBJ( udg_Pro_TestUnit, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_Pro_TestUnit) + udg_ProHp ) )
        call SetUnitManaBJ( udg_Pro_TestUnit, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_Pro_TestUnit) + udg_ProMp ) )
    else
    endif
endfunction

// --- InitTrig_TestsoEasyEff (family, line 53725) ---
function InitTrig_TestsoEasyEff takes nothing returns nothing
    set gg_trg_TestsoEasyEff = CreateTrigger(  )
    call TriggerAddAction( gg_trg_TestsoEasyEff, function Trig_TestsoEasyEff_Actions )
endfunction

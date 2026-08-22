// rawcode: A0PI
// nameZh: 82-00-01 魔法射手-光箭
// w3a base: ANcl  levels: 1
// cooldown: {"1": 5.0}
// mana: {"1": 50}
// range: {"1": 600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LightArrow

// === family LightArrow (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightArrow_Conditions (family, line 35141) ---
function Trig_LightArrow_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0PI' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightArrow_Func002Func004C (family, line 35148) ---
function Trig_LightArrow_Func002Func004C takes nothing returns boolean
    if ( not ( IsUnitIllusionBJ(udg_NegiCastUnit) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(udg_NegiCastUnit, UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitInGroup(udg_NegiCastUnit, udg_Des_Group) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightArrow_Func002Func006C (family, line 35161) ---
function Trig_LightArrow_Func002Func006C takes nothing returns boolean
    if ( not ( udg_LightArrowAccount < ( ( GetHeroLevel(udg_NegiUnit) / 3 ) + 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightArrow_Func002C (family, line 35168) ---
function Trig_LightArrow_Func002C takes nothing returns boolean
    if ( not ( GetTriggerUnit() == GetSpellTargetUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightArrow_Actions (family, line 35175) ---
function Trig_LightArrow_Actions takes nothing returns nothing
    set udg_NegiUnit = GetTriggerUnit()
    if ( Trig_LightArrow_Func002C() ) then
        if ( Trig_LightArrow_Func002Func006C() ) then
            set udg_LightArrowAccount = ( udg_LightArrowAccount + 1 )
            call CreateNUnitsAtLoc( 1, 'u014', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        else
        endif
    else
        set udg_NegiMasterPoint = GetUnitLoc(GetTriggerUnit())
        set udg_LightArrowAccount = ( udg_LightArrowAccount + 1 )
        set udg_NegiCastUnit = GetSpellTargetUnit()
        if ( Trig_LightArrow_Func002Func004C() ) then
            call GroupAddUnitSimple( udg_NegiCastUnit, udg_Des_Group )
            call InitSetup( udg_NegiCastUnit )
        else
        endif
        call EnableTrigger( gg_trg_LightFire )
    endif
endfunction

// --- InitTrig_LightArrow (family, line 35197) ---
function InitTrig_LightArrow takes nothing returns nothing
    set gg_trg_LightArrow = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightArrow )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightArrow, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightArrow, Condition( function Trig_LightArrow_Conditions ) )
    call TriggerAddAction( gg_trg_LightArrow, function Trig_LightArrow_Actions )
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

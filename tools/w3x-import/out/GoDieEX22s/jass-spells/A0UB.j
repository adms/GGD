// rawcode: A0UB
// nameZh: 77-04 真-雷光劍
// cooldown: {"1": 70.0, "2": 70.0, "3": 70.0, "4": 1.0}
// mana: {"1": 150, "2": 225, "3": 300, "4": 1}
// range: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Light_sword

// === family Light_sword (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Light_sword_Conditions (family, line 49762) ---
function Trig_Light_sword_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0UB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_sword_Actions (family, line 49769) ---
function Trig_Light_sword_Actions takes nothing returns nothing
    local unit Caster = GetTriggerUnit()
    local location P1 = GetUnitLoc(GetTriggerUnit())
    local location P2 = GetSpellTargetLoc()
    local location P3
    local real Move_Angle = AngleBetweenPoints(P1, P2)


    //初始化設定
    set P3 = PolarProjectionBJ(P1, 200.00, Move_Angle)
    call CreateNUnitsAtLoc( 1, 'o02U', GetOwningPlayer(Caster), P3, bj_UNIT_FACING )
    set udg_Light_MoveUnit = GetLastCreatedUnit()

    call SetHandleUnit(udg_Light_MoveUnit,"Caster",Caster)
    call SetHandleInt(udg_Light_MoveUnit,"Index",0)
    call SetHandleReal(udg_Light_MoveUnit,"Angle",Move_Angle)

    call RemoveLocation( P1 )
    call RemoveLocation( P2 )
    call RemoveLocation( P3 )
    call EnableTrigger( gg_trg_Light_sword_move )
endfunction

// --- InitTrig_Light_sword (family, line 49793) ---
function InitTrig_Light_sword takes nothing returns nothing
    set gg_trg_Light_sword = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Light_sword, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Light_sword, Condition( function Trig_Light_sword_Conditions ) )
    call TriggerAddAction( gg_trg_Light_sword, function Trig_Light_sword_Actions )
endfunction

// --- SetHandleUnit (helper, line 4556) ---
function SetHandleUnit takes handle subject, string name, unit value returns nothing
    call SaveUnitHandle(LocalVars(),GetHandleIdBJ(subject),StringHashBJ(name),value)
endfunction

// --- SetHandleInt (helper, line 4576) ---
function SetHandleInt takes handle subject, string name, integer value returns nothing
    call SaveInteger(LocalVars(),GetHandleIdBJ(subject),StringHashBJ(name),value)
endfunction

// --- SetHandleReal (helper, line 4584) ---
function SetHandleReal takes handle subject, string name, real value returns nothing
    call SaveReal(LocalVars(),GetHandleIdBJ(subject),StringHashBJ(name),value)
endfunction

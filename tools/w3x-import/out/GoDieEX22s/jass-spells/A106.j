// rawcode: A106
// nameZh: 26-002 鄉民的正義
// w3a base: AOws  levels: 1
// cooldown: {"1": 80.0}
// mana: {"1": 250}
// area: {"1": 10.0}
// duration: {"1": 0.10000000149011612}
// hero_duration: {"1": 0.10000000149011612}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Ptt_Judge

// === family Ptt_Judge (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Ptt_Judge_Conditions (family, line 38050) ---
function Trig_Ptt_Judge_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A106' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Ptt_Judge_Func001Func001C (family, line 38057) ---
function Trig_Ptt_Judge_Func001Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'Utic' ) ) then
        return false
    endif
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Ptt_Judge_Func001A (family, line 38070) ---
function Trig_Ptt_Judge_Func001A takes nothing returns nothing
    local location Ptt_P1
    local location Ptt_P2
    local integer Ptt_LoopCountB

    if ( Trig_Ptt_Judge_Func001Func001C() ) then
            set Ptt_LoopCountB = 1
            set Ptt_P1 = GetUnitLoc(GetEnumUnit())
            loop
                exitwhen Ptt_LoopCountB > 5
                set Ptt_P2 = PolarProjectionBJ(Ptt_P1, 200.00, ( 75.00 * I2R(Ptt_LoopCountB) ))
                call AddSpecialEffectLocBJ( Ptt_P2, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
                call CreateNUnitsAtLocFacingLocBJ( 1, 'h031', GetOwningPlayer(GetTriggerUnit()), Ptt_P2, Ptt_P1 )
                call UnitApplyTimedLifeBJ( 20.00, 'BTLF', GetLastCreatedUnit() )
                call IssueTargetOrderBJ( GetLastCreatedUnit(), "attack", GetEnumUnit() )
                call RemoveLocation( Ptt_P2 )
                set Ptt_LoopCountB = Ptt_LoopCountB + 1
            endloop
            call RemoveLocation( Ptt_P1 )
    else
    endif
endfunction

// --- Trig_Ptt_Judge_Actions (family, line 38094) ---
function Trig_Ptt_Judge_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsInRectAll(GetPlayableMapRect()), function Trig_Ptt_Judge_Func001A )
endfunction

// --- InitTrig_Ptt_Judge (family, line 38099) ---
function InitTrig_Ptt_Judge takes nothing returns nothing
    set gg_trg_Ptt_Judge = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Ptt_Judge, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Ptt_Judge, Condition( function Trig_Ptt_Judge_Conditions ) )
    call TriggerAddAction( gg_trg_Ptt_Judge, function Trig_Ptt_Judge_Actions )
endfunction

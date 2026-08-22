// rawcode: A0ZK
// nameZh: 76-002 霸王色
// w3a base: AOws  levels: 1
// cooldown: {"1": 60.0}
// mana: {"1": 250}
// area: {"1": 0.0}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: KingColor

// === family KingColor (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KingColor_Conditions (family, line 36828) ---
function Trig_KingColor_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZK' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KingColor_Func005Func001A (family, line 36836) ---
function Trig_KingColor_Func005Func001A takes nothing returns nothing
    if ( GetEnumUnit() != GetTriggerUnit() ) then
        call SetUnitLifeBJ( GetEnumUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetEnumUnit()) / 2.00 ) )
    else
    endif
endfunction

// --- Trig_KingColor_Func005C (family, line 36844) ---
function Trig_KingColor_Func005C takes nothing returns boolean

    if ( not ( GetUnitLifePercent(GetTriggerUnit()) <= 50.00 ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 2) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KingColor_Func008A (family, line 36856) ---
function Trig_KingColor_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KingColor_Actions (family, line 36861) ---
function Trig_KingColor_Actions takes nothing returns nothing
    local location Luff_UnitPoint
    local integer Luff_KingColorCont
    local unit Luff

    set Luff_UnitPoint = GetUnitLoc(GetTriggerUnit())
    set Luff = GetTriggerUnit()
    set Luff_KingColorCont = 1
    loop
        exitwhen Luff_KingColorCont > 10
        call CreateNUnitsAtLoc( 1, 'o009', GetOwningPlayer(Luff), Luff_UnitPoint, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 5.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0ZJ', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "impale", PolarProjectionBJ(Luff_UnitPoint, 256.00, ( I2R(Luff_KingColorCont) * 36.00 )) )
        set Luff_KingColorCont = Luff_KingColorCont + 1
    endloop
    if ( Trig_KingColor_Func005C() ) then
        call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, Luff_UnitPoint), function Trig_KingColor_Func005Func001A )
    else
    endif
    call RemoveLocation( Luff_UnitPoint )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(Luff), 'o009'), function Trig_KingColor_Func008A )
endfunction

// --- InitTrig_KingColor (family, line 36887) ---
function InitTrig_KingColor takes nothing returns nothing
    set gg_trg_KingColor = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KingColor, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KingColor, Condition( function Trig_KingColor_Conditions ) )
    call TriggerAddAction( gg_trg_KingColor, function Trig_KingColor_Actions )
endfunction

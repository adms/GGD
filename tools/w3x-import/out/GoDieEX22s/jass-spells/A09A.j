// rawcode: A09A
// nameZh: 72-05 億萬星殞落
// cooldown: {"1": 180.0}
// mana: {"1": 600}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ManyStar

// === family ManyStar (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_ManyStar_Conditions (family, line 47408) ---
function Trig_ManyStar_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09A' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManyStar_Func004Func001Func001C (family, line 47415) ---
function Trig_ManyStar_Func004Func001Func001C takes nothing returns boolean
    if ( ( GetLocationX(udg_JhonPiont) != GetLocationX(GetUnitLoc(udg_StarUnit)) ) ) then
        return true
    endif
    if ( ( IsUnitAliveBJ(udg_StarUnit) == false ) ) then
        return true
    endif
    if ( ( OrderId2StringBJ(GetUnitCurrentOrder(udg_StarUnit)) != "starfall" ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_ManyStar_Func004Func001C (family, line 47428) ---
function Trig_ManyStar_Func004Func001C takes nothing returns boolean
    if ( not Trig_ManyStar_Func004Func001Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManyStar_Func005Func002C (family, line 47435) ---
function Trig_ManyStar_Func005Func002C takes nothing returns boolean
    if ( ( GetLocationX(udg_JhonPiont) != GetLocationX(GetUnitLoc(udg_StarUnit)) ) ) then
        return true
    endif
    if ( ( IsUnitAliveBJ(udg_StarUnit) == false ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_ManyStar_Func005C (family, line 47445) ---
function Trig_ManyStar_Func005C takes nothing returns boolean
    if ( not Trig_ManyStar_Func005Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManyStar_Func006A (family, line 47452) ---
function Trig_ManyStar_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ManyStar_Actions (family, line 47457) ---
function Trig_ManyStar_Actions takes nothing returns nothing
    set udg_JhonStar = 1
    set udg_StarUnit = GetTriggerUnit()
    set udg_JhonPiont = GetUnitLoc(GetTriggerUnit())
    set udg_JhonStar = 1
    loop
        exitwhen udg_JhonStar > 36
        if ( Trig_ManyStar_Func004Func001C() ) then
            set udg_JhonStar = 36
        else
        endif
        call CreateNUnitsAtLoc( 1, 'o008', GetOwningPlayer(udg_StarUnit), PolarProjectionBJ(udg_JhonPiont, 256, ( I2R(udg_JhonStar) * 10.00 )), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 32.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A09B', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A09B', GetLastCreatedUnit(), 1 )
        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "starfall" )
        call PolledWait( 0.10 )
        set udg_JhonStar = udg_JhonStar + 1
    endloop
    if ( Trig_ManyStar_Func005C() ) then
    else
        call TriggerSleepAction( 32.00 )
    endif
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_StarUnit), 'o008'), function Trig_ManyStar_Func006A )
endfunction

// --- InitTrig_ManyStar (family, line 47484) ---
function InitTrig_ManyStar takes nothing returns nothing
    set gg_trg_ManyStar = CreateTrigger(  )
    call DisableTrigger( gg_trg_ManyStar )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ManyStar, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_ManyStar, Condition( function Trig_ManyStar_Conditions ) )
    call TriggerAddAction( gg_trg_ManyStar, function Trig_ManyStar_Actions )
endfunction

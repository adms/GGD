// rawcode: A0MV
// nameZh: 34-002 冥道殘月破
// w3a base: ANcl  levels: 1
// cooldown: {"1": 60.0, "2": 65.0, "3": 65.0, "4": 65.0}
// mana: {"1": 800, "2": 250, "3": 280, "4": 310}
// range: {"1": 600.0, "2": 800.0, "3": 800.0, "4": 800.0}
// area: {"1": 400.0, "2": 300.0, "3": 300.0, "4": 300.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: newlzfs

// === family newlzfs (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_newlzfs_Conditions (family, line 39007) ---
function Trig_newlzfs_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_newlzfs_Actions (family, line 39014) ---
function Trig_newlzfs_Actions takes nothing returns nothing
    set udg_Dog_lzfsMU = GetTriggerUnit()
    set udg_Dog_lzfsP = GetSpellTargetLoc()
    set udg_Dog_lzfsTP = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'h02E', GetOwningPlayer(GetTriggerUnit()), udg_Dog_lzfsTP, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 5 , 1)
    set udg_Dog_lzfsU = GetLastCreatedUnit()
    set udg_Dog_lzfsAngle = AngleBetweenPoints(udg_Dog_lzfsTP, udg_Dog_lzfsP)
    set udg_Dog_lzfsDist = DistanceBetweenPoints(udg_Dog_lzfsTP, udg_Dog_lzfsP)
    call EnableTrigger( gg_trg_newlzfsmove )
endfunction

// --- InitTrig_newlzfs (family, line 39027) ---
function InitTrig_newlzfs takes nothing returns nothing
    set gg_trg_newlzfs = CreateTrigger(  )
    call DisableTrigger( gg_trg_newlzfs )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_newlzfs, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_newlzfs, Condition( function Trig_newlzfs_Conditions ) )
    call TriggerAddAction( gg_trg_newlzfs, function Trig_newlzfs_Actions )
endfunction

// --- RemoveUnitSP (helper, line 4847) ---
function RemoveUnitSP takes unit R_unit , real Life_Time , real Die_Time returns nothing
    local unit Last = bj_lastCreatedUnit
    local real Bj_Timer = bj_enumDestructableRadius
    local real Bj_Rand = bj_randomSubGroupChance
    set bj_lastCreatedUnit = R_unit
    set bj_enumDestructableRadius = Life_Time
    set bj_randomSubGroupChance = Die_Time
    call ExecuteFunc("RemoveUnitSP_Action")
    set bj_lastCreatedUnit = Last
    set bj_enumDestructableRadius = Bj_Timer
    set bj_randomSubGroupChance = Bj_Rand
endfunction

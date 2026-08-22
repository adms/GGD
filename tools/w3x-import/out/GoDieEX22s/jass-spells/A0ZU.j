// rawcode: A0ZU
// nameZh: 15-002 風花-武裝解除
// cooldown: {"1": 65.0}
// mana: {"1": 450}
// range: {"1": 750.0}
// area: {"1": 500.0}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: WindFlowerStart

// === family WindFlowerStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WindFlowerStart_Conditions (family, line 34807) ---
function Trig_WindFlowerStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZU' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WindFlowerStart_Actions (family, line 34814) ---
function Trig_WindFlowerStart_Actions takes nothing returns nothing
    set udg_Negi_FlowerPoint = GetSpellTargetLoc()
    call CreateNUnitsAtLoc( 1, 'o02Y', GetOwningPlayer(GetTriggerUnit()), udg_Negi_FlowerPoint, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 3 , 1)
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "howlofterror" )
endfunction

// --- InitTrig_WindFlowerStart (family, line 34822) ---
function InitTrig_WindFlowerStart takes nothing returns nothing
    set gg_trg_WindFlowerStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_WindFlowerStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WindFlowerStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WindFlowerStart, Condition( function Trig_WindFlowerStart_Conditions ) )
    call TriggerAddAction( gg_trg_WindFlowerStart, function Trig_WindFlowerStart_Actions )
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

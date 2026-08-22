// rawcode: A0MM
// nameZh: 35-00 召喚佩
// cooldown: {"1": 60.0}
// mana: {"1": 120}
// duration: {"1": 0.10000000149011612}
// hero_duration: {"1": 0.10000000149011612}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: CallPay

// === family CallPay (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CallPay_Conditions (family, line 42902) ---
function Trig_CallPay_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MM' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CallPay_Actions (family, line 42909) ---
function Trig_CallPay_Actions takes nothing returns nothing
    call KillUnit( udg_EyesPay )
    call RemoveUnit( udg_EyesPay )
    call CreateNUnitsAtLoc( 1, 'h01Q', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    set udg_EyesPay = GetLastCreatedUnit()
    call IssueTargetOrderBJ( udg_EyesPay, "move", GetTriggerUnit() )
endfunction

// --- InitTrig_CallPay (family, line 42918) ---
function InitTrig_CallPay takes nothing returns nothing
    set gg_trg_CallPay = CreateTrigger(  )
    call DisableTrigger( gg_trg_CallPay )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CallPay, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CallPay, Condition( function Trig_CallPay_Conditions ) )
    call TriggerAddAction( gg_trg_CallPay, function Trig_CallPay_Actions )
endfunction

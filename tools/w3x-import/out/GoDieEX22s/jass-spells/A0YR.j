// rawcode: A0YR
// nameZh: 00-00 加速裝置
// w3a base: AHtc  levels: 1
// cooldown: {"1": 35.0}
// mana: {"1": 0}
// area: {"1": 10.0}
// duration: {"1": 0.0}
// hero_duration: {"1": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Keroro_SpeedUp

// === family Keroro_SpeedUp (active) events=none ===

// --- Trig_Keroro_SpeedUp_Conditions (family, line 20221) ---
function Trig_Keroro_SpeedUp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0YR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Keroro_SpeedUp_Actions (family, line 20228) ---
function Trig_Keroro_SpeedUp_Actions takes nothing returns nothing
    set udg_Immediately_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_Immediately_P1, bj_UNIT_FACING )
    call UnitAddAbilityBJ( 'A0YS', GetLastCreatedUnit() )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "unholyfrenzy", GetTriggerUnit() )
    call KillUnit( GetLastCreatedUnit() )
    call RemoveUnit( GetLastCreatedUnit() )
    call RemoveLocation( udg_Immediately_P1 )
endfunction

// --- InitTrig_Keroro_SpeedUp (family, line 20239) ---
function InitTrig_Keroro_SpeedUp takes nothing returns nothing
    set gg_trg_Keroro_SpeedUp = CreateTrigger(  )
    call DisableTrigger( gg_trg_Keroro_SpeedUp )
    call TriggerAddCondition( gg_trg_Keroro_SpeedUp, Condition( function Trig_Keroro_SpeedUp_Conditions ) )
    call TriggerAddAction( gg_trg_Keroro_SpeedUp, function Trig_Keroro_SpeedUp_Actions )
endfunction

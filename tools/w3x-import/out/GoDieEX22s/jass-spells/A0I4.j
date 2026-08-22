// rawcode: A0I4
// nameZh: 31-01 迴旋爪擊
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 50.0}
// mana: {"1": 120, "2": 150, "3": 180, "4": 275}
// range: {"1": 9999.0, "2": 9999.0, "3": 9999.0, "4": 9999.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: WolfStrike

// === family WolfStrike (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WolfStrike_Conditions (family, line 40896) ---
function Trig_WolfStrike_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0I4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WolfStrike_Func007C (family, line 40903) ---
function Trig_WolfStrike_Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_Henti))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WolfStrike_Actions (family, line 40910) ---
function Trig_WolfStrike_Actions takes nothing returns nothing
    set udg_KnockBack_IndexWolf = 0
    set udg_WolfUnit = GetTriggerUnit()
    set udg_P1Wolf = GetUnitLoc(GetTriggerUnit())
    set udg_P2Wolf = GetSpellTargetLoc()
    set udg_KnockBack_AngleWolf = AngleBetweenPoints(udg_P1Wolf, udg_P2Wolf)
    set udg_WolfDamage = I2R(( ( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) * 2 ) + ( ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 100 ) + 50 ) ))
    if ( Trig_WolfStrike_Func007C() ) then
        set udg_WolfDamage = ( udg_WolfDamage * 2.00 )
    else
    endif
    call CreateNUnitsAtLoc( 1, 'h019', GetOwningPlayer(GetTriggerUnit()), udg_P1Wolf, GetRandomDirectionDeg() )
    set udg_KnockBack_TargetWolf = GetLastCreatedUnit()
    call SetUnitTimeScalePercent( udg_KnockBack_TargetWolf, 600.00 )
    call GroupClear( udg_WolfGroup )
    call ShowUnitHide( udg_WolfUnit )
    call RemoveLocation( udg_P1Wolf )
    call RemoveLocation( udg_P2Wolf )
    call EnableTrigger( gg_trg_WolfStrikeEffect )
endfunction

// --- InitTrig_WolfStrike (family, line 40932) ---
function InitTrig_WolfStrike takes nothing returns nothing
    set gg_trg_WolfStrike = CreateTrigger(  )
    call DisableTrigger( gg_trg_WolfStrike )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WolfStrike, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WolfStrike, Condition( function Trig_WolfStrike_Conditions ) )
    call TriggerAddAction( gg_trg_WolfStrike, function Trig_WolfStrike_Actions )
endfunction

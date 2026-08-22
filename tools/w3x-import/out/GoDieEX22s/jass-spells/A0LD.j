// rawcode: A0LD
// nameZh: 05-招喚金龍
// w3a base: AHtb  levels: 1
// cooldown: {"1": 120.0}
// mana: {"1": 200}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GoldDragonEat

// === family GoldDragonEat (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GoldDragonEat_Func011C (family, line 28496) ---
function Trig_GoldDragonEat_Func011C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0LD' ) ) then
        return false
    endif
    if ( not ( GetOwningPlayer(GetSpellTargetUnit()) != Player(PLAYER_NEUTRAL_AGGRESSIVE) ) ) then
        return false
    endif
    if ( not ( GetUnitLifePercent(GetSpellTargetUnit()) <= 50.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GoldDragonEat_Conditions (family, line 28509) ---
function Trig_GoldDragonEat_Conditions takes nothing returns boolean
    if ( not Trig_GoldDragonEat_Func011C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_GoldDragonEat_Func003C (family, line 28516) ---
function Trig_GoldDragonEat_Func003C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetTriggerUnit(), Player(0)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GoldDragonEat_Actions (family, line 28523) ---
function Trig_GoldDragonEat_Actions takes nothing returns nothing
    set udg_GoldDragonEatedUnit = GetSpellTargetUnit()
    call TriggerSleepAction( 0.01 )
    if ( Trig_GoldDragonEat_Func003C() ) then
        call CreateNUnitsAtLoc( 1, 'h01K', Player(0), GetUnitLoc(udg_GoldDragonEatedUnit), GetUnitFacing(GetTriggerUnit()) )
        set udg_GoldDragonUnit = GetLastCreatedUnit()
    else
        call CreateNUnitsAtLoc( 1, 'h01K', Player(6), GetUnitLoc(udg_GoldDragonEatedUnit), GetUnitFacing(GetTriggerUnit()) )
        set udg_GoldDragonUnit = GetLastCreatedUnit()
    endif
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetAttackedUnitBJ(), 0 )
    call UnitAddItemByIdSwapped( 'gsou', GetLastCreatedUnit() )
    call UnitUseItemTarget( GetLastCreatedUnit(), GetLastCreatedItem(), udg_GoldDragonEatedUnit )
    call TriggerSleepAction( 0.50 )
    call RemoveItem( GetLastCreatedItem() )
    call TriggerSleepAction( 20.00 )
    call KillUnit( udg_GoldDragonUnit )
endfunction

// --- InitTrig_GoldDragonEat (family, line 28543) ---
function InitTrig_GoldDragonEat takes nothing returns nothing
    set gg_trg_GoldDragonEat = CreateTrigger(  )
    call DisableTrigger( gg_trg_GoldDragonEat )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GoldDragonEat, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GoldDragonEat, Condition( function Trig_GoldDragonEat_Conditions ) )
    call TriggerAddAction( gg_trg_GoldDragonEat, function Trig_GoldDragonEat_Actions )
endfunction

// rawcode: A0SG
// nameZh: 24-002 來~快點吃吧
// w3a base: AHtb  levels: 1
// cooldown: {"1": 45.0, "2": 60.0, "3": 60.0, "4": 45.0}
// mana: {"1": 250, "2": 225, "3": 300, "4": 315}
// range: {"1": 250.0, "2": 450.0, "3": 450.0, "4": 285.0}
// duration: {"1": 0.009999999776482582, "2": 1.0, "3": 1.0, "4": 4.0}
// hero_duration: {"1": 0.009999999776482582, "2": 1.0, "3": 1.0, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ComeToEat

// === family ComeToEat (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ComeToEat_Conditions (family, line 27315) ---
function Trig_ComeToEat_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0SG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ComeToEat_Func001C (family, line 27322) ---
function Trig_ComeToEat_Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetSpellTargetUnit()) != 'Hlgr' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ComeToEat_Actions (family, line 27329) ---
function Trig_ComeToEat_Actions takes nothing returns nothing
    if ( Trig_ComeToEat_Func001C() ) then
        set udg_HentiMaskUnit = GetTriggerUnit()
        set udg_ComeToEatUnit = GetSpellTargetUnit()
        set udg_ComToEatTime = 0
        call SetUnitPathing( udg_ComeToEatUnit, false )
        call SetUnitPathing( udg_HentiMaskUnit, false )
        call UnitAddAbilityBJ( 'A0FZ', udg_ComeToEatUnit )
        call SetUnitFlyHeightBJ( udg_ComeToEatUnit, -150.00, 0.00 )
        call SetUnitPositionLoc( udg_ComeToEatUnit, GetUnitLoc(udg_HentiMaskUnit) )
        call SetUnitInvulnerable( udg_ComeToEatUnit, true )
        call SetUnitInvulnerable( udg_HentiMaskUnit, true )
        call PauseUnitBJ( true, udg_ComeToEatUnit )
        call PauseUnitBJ( true, udg_HentiMaskUnit )
        call PlaySoundOnUnitBJ( gg_snd_PeasantPissed3, 100, GetTriggerUnit() )
        call EnableTrigger( gg_trg_ComeToEatEffect )
    else
        call CreateTextTagUnitBJ( "TRIGSTR_5624", GetSpellTargetUnit(), 0, 14.00, 100, 0.00, 0.00, 0 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 48.00, GetUnitFacing(udg_Auzimi) )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    endif
endfunction

// --- InitTrig_ComeToEat (family, line 27355) ---
function InitTrig_ComeToEat takes nothing returns nothing
    set gg_trg_ComeToEat = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ComeToEat, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ComeToEat, Condition( function Trig_ComeToEat_Conditions ) )
    call TriggerAddAction( gg_trg_ComeToEat, function Trig_ComeToEat_Actions )
endfunction

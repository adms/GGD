// rawcode: A0G3
// nameZh: 07-03 列、在、前
// w3a base: ANcl  levels: 4
// cooldown: {"1": 65.0, "2": 65.0, "3": 65.0, "4": 65.0}
// mana: {"1": 220, "2": 250, "3": 280, "4": 310}
// range: {"1": 800.0, "2": 800.0, "3": 800.0, "4": 800.0}
// area: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Jump_Start

// === family Jump_Start (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Jump_Start_Conditions (family, line 34174) ---
function Trig_Jump_Start_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0G3' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Jump_Start_Func017Func001C (family, line 34181) ---
function Trig_Jump_Start_Func017Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Jump_Start_Func017C (family, line 34188) ---
function Trig_Jump_Start_Func017C takes nothing returns boolean
    if ( not ( udg_MoonCombo == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Jump_Start_Actions (family, line 34195) ---
function Trig_Jump_Start_Actions takes nothing returns nothing
    set udg_Jump_Index = 0.00
    set udg_Jump_Caster = GetTriggerUnit()
    set udg_P1_Moon = GetUnitLoc(GetTriggerUnit())
    set udg_P2_Moon = GetSpellTargetLoc()
    set udg_Jump_Angle = AngleBetweenPoints(udg_P1_Moon, udg_P2_Moon)
    set udg_Jump_dDist = ( DistanceBetweenPoints(udg_P1_Moon, udg_P2_Moon) / 41.00 )
    call CreateTextTagUnitBJ( "TRIGSTR_4804", GetTriggerUnit(), -30.00, 16.00, 100.00, 100.00, 100.00, 10.00 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call PauseUnitBJ( true, GetTriggerUnit() )
    call SetUnitPathing( GetTriggerUnit(), false )
    call UnitAddAbilityBJ( 'A0FZ', GetTriggerUnit() )
    call SetUnitTimeScalePercent( GetTriggerUnit(), 40.00 )
    call SetUnitAnimation( GetTriggerUnit(), "attack slam" )
    set udg_MoonDamage = I2R(( ( ( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) * 2 ) + ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 100 ) ) + 350 ))
    if ( Trig_Jump_Start_Func017C() ) then
        if ( Trig_Jump_Start_Func017Func001C() ) then
            set udg_MoonDamage = ( ( 5.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) ) + udg_MoonDamage )
        else
            set udg_MoonDamage = ( ( 10.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) ) + udg_MoonDamage )
        endif
        call CreateTextTagUnitBJ( "TRIGSTR_4805", GetTriggerUnit(), -30.00, 12.00, 100, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, GetUnitFacing(GetTriggerUnit()) )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
    endif
    call PlaySoundBJ( gg_snd_moonjump )
    call EnableTrigger( gg_trg_Jump_Effect )
endfunction

// --- InitTrig_Jump_Start (family, line 34230) ---
function InitTrig_Jump_Start takes nothing returns nothing
    set gg_trg_Jump_Start = CreateTrigger(  )
    call DisableTrigger( gg_trg_Jump_Start )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Jump_Start, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Jump_Start, Condition( function Trig_Jump_Start_Conditions ) )
    call TriggerAddAction( gg_trg_Jump_Start, function Trig_Jump_Start_Actions )
endfunction

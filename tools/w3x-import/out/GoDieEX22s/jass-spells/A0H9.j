// rawcode: A0H9
// nameZh: 19-03 瞬切百殺
// w3a base: ANc1  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 75, "2": 150, "3": 225, "4": 300}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// area: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 450.0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HundredKill

// === family HundredKill (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HundredKill_Conditions (family, line 27469) ---
function Trig_HundredKill_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0H9' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HundredKill_Func006C (family, line 27476) ---
function Trig_HundredKill_Func006C takes nothing returns boolean
    if ( not ( udg_fitCutYes == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HundredKill_Actions (family, line 27483) ---
function Trig_HundredKill_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_Auzimi = GetTriggerUnit()
    set udg_HundredKillPoint = GetSpellTargetLoc()
    set udg_AuzimiHK = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * 1.00 ) + ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 50.00 ) - 10.00 ) )
    if ( Trig_HundredKill_Func006C() ) then
        set udg_AuzimiHK = ( udg_AuzimiHK + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_Auzimi, true)) * 0.50 ) )
        call CreateTextTagUnitBJ( "TRIGSTR_1698", udg_Auzimi, 0, 16.00, 100, 50.00, 50.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(udg_Auzimi) )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
        call CreateTextTagUnitBJ( "TRIGSTR_1696", udg_Auzimi, 0, 16.00, 100, 50.00, 50.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, GetUnitFacing(udg_Auzimi) )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    endif
    call SetUnitInvulnerable( udg_Auzimi, true )
    call SetUnitPathing( udg_Auzimi, false )
    call UnitAddAbilityBJ( 'A09O', udg_Auzimi )
    call UnitAddAbilityBJ( 'A09P', udg_Auzimi )
    call GroupClear( udg_HunKill )
    call TriggerSleepAction( 0.01 )
    call SetUnitTimeScalePercent( udg_Auzimi, 700.00 )
    call SetUnitPositionLocFacingBJ( udg_Auzimi, udg_HundredKillPoint, GetRandomDirectionDeg() )
    call MoveRectToLoc( gg_rct_HundKill, udg_HundredKillPoint )
    set udg_AuzimiCutCount = 0
    set udg_killNumber = 0
    call PlaySoundOnUnitBJ( gg_snd_FlareTarget2, 100, udg_Auzimi )
    call EnableTrigger( gg_trg_HundredKillEffect )
    call TriggerSleepAction( 1.50 )
    call EnableTrigger( gg_trg_HundredKill )
endfunction

// --- InitTrig_HundredKill (family, line 27520) ---
function InitTrig_HundredKill takes nothing returns nothing
    set gg_trg_HundredKill = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HundredKill, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HundredKill, Condition( function Trig_HundredKill_Conditions ) )
    call TriggerAddAction( gg_trg_HundredKill, function Trig_HundredKill_Actions )
endfunction

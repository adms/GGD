// rawcode: A0CT
// nameZh: 20-04 Avalon-永恆的理想鄉
// w3a base: AEtq  levels: 3
// cooldown: {"2": 60.0, "3": 60.0}
// mana: {"1": 150, "2": 250, "3": 350}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: avalonReady, avalonStart

// === family avalonReady (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_avalonReady_Conditions (family, line 32374) ---
function Trig_avalonReady_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CT' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_avalonReady_Actions (family, line 32381) ---
function Trig_avalonReady_Actions takes nothing returns nothing
    set udg_SaberUnit = GetTriggerUnit()
    set udg_IsAvalonReady = true
    call EnableTrigger( gg_trg_avalonStart )
    call TriggerSleepAction( I2R(( GetUnitAbilityLevelSwapped('A0CT', GetTriggerUnit()) + 1 )) )
    call DisableTrigger( gg_trg_avalonStart )
    set udg_IsAvalonReady = false
endfunction

// --- InitTrig_avalonReady (family, line 32391) ---
function InitTrig_avalonReady takes nothing returns nothing
    set gg_trg_avalonReady = CreateTrigger(  )
    call DisableTrigger( gg_trg_avalonReady )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_avalonReady, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_avalonReady, Condition( function Trig_avalonReady_Conditions ) )
    call TriggerAddAction( gg_trg_avalonReady, function Trig_avalonReady_Actions )
endfunction

// === family avalonStart (passive) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_avalonStart_Func001C (family, line 32402) ---
function Trig_avalonStart_Func001C takes nothing returns boolean
    if ( not ( GetSpellTargetUnit() == udg_SaberUnit ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetSpellAbilityUnit()), GetOwningPlayer(udg_SaberUnit)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetSpellAbilityUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_avalonStart_Conditions (family, line 32415) ---
function Trig_avalonStart_Conditions takes nothing returns boolean
    if ( not Trig_avalonStart_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_avalonStart_Func011Func001C (family, line 32422) ---
function Trig_avalonStart_Func011Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_saber)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_avalonStart_Func011A (family, line 32432) ---
function Trig_avalonStart_Func011A takes nothing returns nothing
    if ( Trig_avalonStart_Func011Func001C() ) then
        call UnitDamageTargetBJ( udg_saber, GetEnumUnit(), I2R(udg_WildSaber), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL )
        call CreateNUnitsAtLoc( 1, 'o00G', GetOwningPlayer(udg_saber), GetUnitLoc(GetEnumUnit()), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0CS', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0CS', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0CT', udg_saber) )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_avalonStart_Func013A (family, line 32445) ---
function Trig_avalonStart_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_avalonStart_Actions (family, line 32450) ---
function Trig_avalonStart_Actions takes nothing returns nothing
    set udg_saber = GetSpellTargetUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateTextTagUnitBJ( "TRIGSTR_9854", GetTriggerUnit(), 0, 13.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    set udg_WildSaber = ( ( 30 * GetHeroLevel(GetSpellTargetUnit()) ) + ( GetHeroStatBJ(bj_HEROSTAT_STR, GetSpellTargetUnit(), true) * ( GetUnitAbilityLevelSwapped('A0CT', GetSpellTargetUnit()) * 5 ) ) )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, GetUnitLoc(udg_saber)), function Trig_avalonStart_Func011A )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SaberUnit), 'o00G'), function Trig_avalonStart_Func013A )
endfunction

// --- InitTrig_avalonStart (family, line 32466) ---
function InitTrig_avalonStart takes nothing returns nothing
    set gg_trg_avalonStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_avalonStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_avalonStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_avalonStart, Condition( function Trig_avalonStart_Conditions ) )
    call TriggerAddAction( gg_trg_avalonStart, function Trig_avalonStart_Actions )
endfunction

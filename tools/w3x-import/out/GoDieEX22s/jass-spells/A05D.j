// rawcode: A05D
// nameZh: 42-04 世界終結
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 500, "2": 730, "3": 960}
// range: {"1": 450.0, "2": 450.0, "3": 450.0}
// area: {"1": 450.0, "2": 450.0, "3": 450.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: The_End_ofWorld, The_End_ofWorldCasting_EX, The_End_ofWorldStart

// === family The_End_ofWorld (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_The_End_ofWorld_Conditions (family, line 37712) ---
function Trig_The_End_ofWorld_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05D' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_The_End_ofWorld_Actions (family, line 37719) ---
function Trig_The_End_ofWorld_Actions takes nothing returns nothing
    call CreateTextTagUnitBJ( "TRIGSTR_4021", GetTriggerUnit(), 0, 10.00, 50.00, 50.00, 90.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
endfunction

// --- InitTrig_The_End_ofWorld (family, line 37728) ---
function InitTrig_The_End_ofWorld takes nothing returns nothing
    set gg_trg_The_End_ofWorld = CreateTrigger(  )
    call DisableTrigger( gg_trg_The_End_ofWorld )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_The_End_ofWorld, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_The_End_ofWorld, Condition( function Trig_The_End_ofWorld_Conditions ) )
    call TriggerAddAction( gg_trg_The_End_ofWorld, function Trig_The_End_ofWorld_Actions )
endfunction

// === family The_End_ofWorldCasting_EX (passive) events=none ===

// --- Trig_The_End_ofWorldCasting_EX_Conditions (family, line 37850) ---
function Trig_The_End_ofWorldCasting_EX_Conditions takes nothing returns boolean
    if ( not ( udg_MagicStampOn == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_The_End_ofWorldCasting_EX_Actions (family, line 37857) ---
function Trig_The_End_ofWorldCasting_EX_Actions takes nothing returns nothing
    set udg_EVN_RandPoint = GetRandomLocInRect(RectFromCenterSizeBJ(udg_EndWorldPoint, 450.00, 450.00))
    call CreateNUnitsAtLoc( 1, 'u013', GetOwningPlayer(udg_EndWorldUnit), udg_EVN_RandPoint, GetRandomDirectionDeg() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0P6', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A05D', udg_EVN_Unit) )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "creepthunderclap" )
    call RemoveLocation(udg_EVN_RandPoint)
endfunction

// --- InitTrig_The_End_ofWorldCasting_EX (family, line 37867) ---
function InitTrig_The_End_ofWorldCasting_EX takes nothing returns nothing
    set gg_trg_The_End_ofWorldCasting_EX = CreateTrigger(  )
    call DisableTrigger( gg_trg_The_End_ofWorldCasting_EX )
    call TriggerRegisterTimerEventPeriodic( gg_trg_The_End_ofWorldCasting_EX, 0.20 )
    call TriggerAddCondition( gg_trg_The_End_ofWorldCasting_EX, Condition( function Trig_The_End_ofWorldCasting_EX_Conditions ) )
    call TriggerAddAction( gg_trg_The_End_ofWorldCasting_EX, function Trig_The_End_ofWorldCasting_EX_Actions )
endfunction

// === family The_End_ofWorldStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_The_End_ofWorldStart_Conditions (family, line 37739) ---
function Trig_The_End_ofWorldStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05D' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_The_End_ofWorldStart_Func009Func001C (family, line 37746) ---
function Trig_The_End_ofWorldStart_Func009Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_EndWorldUnit)) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_The_End_ofWorldStart_Func009A (family, line 37759) ---
function Trig_The_End_ofWorldStart_Func009A takes nothing returns nothing
    if ( Trig_The_End_ofWorldStart_Func009Func001C() ) then
        call UnitDamageTargetBJ( udg_EndWorldUnit, GetEnumUnit(), udg_WorldEndDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Undead\\Unsummon\\UnsummonTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_The_End_ofWorldStart_Func010A (family, line 37769) ---
function Trig_The_End_ofWorldStart_Func010A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 18.00 )
endfunction

// --- Trig_The_End_ofWorldStart_Actions (family, line 37773) ---
function Trig_The_End_ofWorldStart_Actions takes nothing returns nothing
    set udg_EndWorldUnit = GetTriggerUnit()
    set udg_EndWorldPoint = GetSpellTargetLoc()
    set udg_WorldEndDamage = I2R(( ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) + 3 ) * GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) ))
    set udg_EndWorldLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_WorldEndCount = 0
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "frostnova.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( 0.01 )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, udg_EndWorldPoint), function Trig_The_End_ofWorldStart_Func009A )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_EndWorldPoint, 1600.00, 1600.00)), function Trig_The_End_ofWorldStart_Func010A )
    call EnableTrigger( gg_trg_The_End_ofWorldCasting )
    call TriggerSleepAction( 1.00 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_The_End_ofWorldStart (family, line 37796) ---
function InitTrig_The_End_ofWorldStart takes nothing returns nothing
    set gg_trg_The_End_ofWorldStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_The_End_ofWorldStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_The_End_ofWorldStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_The_End_ofWorldStart, Condition( function Trig_The_End_ofWorldStart_Conditions ) )
    call TriggerAddAction( gg_trg_The_End_ofWorldStart, function Trig_The_End_ofWorldStart_Actions )
endfunction

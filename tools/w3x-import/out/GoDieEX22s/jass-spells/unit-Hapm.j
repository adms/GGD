// unit rawcode: Hapm
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_WildHqlis, Gigantomakhia_0, Nine_Lives_EX, Trample_Start, berserker

// === family Open_Skill_of_WildHqlis (armed) events=none ===

// --- Trig_Open_Skill_of_WildHqlis_Conditions (family, line 51630) ---
function Trig_Open_Skill_of_WildHqlis_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Hapm' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_WildHqlis_Actions (family, line 51637) ---
function Trig_Open_Skill_of_WildHqlis_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    set udg_BerserkerUnit = GetTriggerUnit()
    call EnableTrigger( gg_trg_berserker )
    call EnableTrigger( gg_trg_Trample_Start )
    call EnableTrigger( gg_trg_Gigantomakhia_0 )
    call EnableTrigger( gg_trg_Nine_Lives_EX )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "Berserker: 八!八!! 薩~卡!!" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_WildHqlis (family, line 51649) ---
function InitTrig_Open_Skill_of_WildHqlis takes nothing returns nothing
    set gg_trg_Open_Skill_of_WildHqlis = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_WildHqlis, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_WildHqlis, Condition( function Trig_Open_Skill_of_WildHqlis_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_WildHqlis, function Trig_Open_Skill_of_WildHqlis_Actions )
endfunction

// === family Gigantomakhia_0 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Gigantomakhia_0_Conditions (family, line 51859) ---
function Trig_Gigantomakhia_0_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0U8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Gigantomakhia_0_Actions (family, line 51866) ---
function Trig_Gigantomakhia_0_Actions takes nothing returns nothing
    set udg_Buncle_P4 = GetSpellTargetLoc()
    set udg_Buncle_Gi_Damage = ( 200.00 + ( 400.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    set udg_Buncle_Gi_Caster = GetTriggerUnit()
    call PauseUnitBJ( true, GetTriggerUnit() )
    set udg_Buncle_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Buncle_P2 = PolarProjectionBJ(udg_Buncle_P1, 200.00, ( GetUnitFacing(GetTriggerUnit()) + 45.00 ))
    set udg_Buncle_P3 = PolarProjectionBJ(udg_Buncle_P1, 200.00, ( GetUnitFacing(GetTriggerUnit()) + 135.00 ))
    set udg_Buncle_Gi_Angle = AngleBetweenPoints(udg_Buncle_P1, udg_Buncle_P4)
    set udg_Buncle_Gi_MaxDist = ( DistanceBetweenPoints(udg_Buncle_P1, udg_Buncle_P4) / 50.00 )
    call CreateNUnitsAtLoc( 1, 'h02M', GetOwningPlayer(GetTriggerUnit()), udg_Buncle_P2, bj_UNIT_FACING )
    set udg_Buncle_Gi_Unit = GetLastCreatedUnit()
    call IssuePointOrderLocBJ( udg_Buncle_Gi_Unit, "move", udg_Buncle_P3 )
    call RemoveLocation( udg_Buncle_P3 )
    set udg_Buncle_Int = 1
    loop
        exitwhen udg_Buncle_Int > 7
        set udg_Buncle_P3 = PolarProjectionBJ(udg_Buncle_P2, 400.00, GetRandomDirectionDeg())
        call CreateNUnitsAtLocFacingLocBJ( 1, 'h02M', GetOwningPlayer(GetTriggerUnit()), udg_Buncle_P3, udg_Buncle_P2 )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_Buncle_Gi_Group )
        call RemoveLocation( udg_Buncle_P3 )
        set udg_Buncle_Int = udg_Buncle_Int + 1
    endloop
    set udg_Buncle_Int = 0
    set udg_Buncle_Gi_Color = 35.00
    call RemoveLocation( udg_Buncle_P1 )
    call RemoveLocation( udg_Buncle_P2 )
    call SetUnitAnimationWithRarity( GetTriggerUnit(), "attack", RARITY_FREQUENT )
    call SetUnitTimeScalePercent( udg_Buncle_Gi_Caster, 40.00 )
    call TriggerSleepAction( 0.10 )
    call EnableTrigger( gg_trg_Gigantomakhia_1 )
endfunction

// --- InitTrig_Gigantomakhia_0 (family, line 51900) ---
function InitTrig_Gigantomakhia_0 takes nothing returns nothing
    set gg_trg_Gigantomakhia_0 = CreateTrigger(  )
    call DisableTrigger( gg_trg_Gigantomakhia_0 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Gigantomakhia_0, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Gigantomakhia_0, Condition( function Trig_Gigantomakhia_0_Conditions ) )
    call TriggerAddAction( gg_trg_Gigantomakhia_0, function Trig_Gigantomakhia_0_Actions )
endfunction

// === family Nine_Lives_EX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Nine_Lives_EX_Conditions (family, line 52050) ---
function Trig_Nine_Lives_EX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0U5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Nine_Lives_EX_Actions (family, line 52057) ---
function Trig_Nine_Lives_EX_Actions takes nothing returns nothing
    set udg_Buncle_Nine_Caster = GetTriggerUnit()
    set udg_Buncle_Nine_Target = GetSpellTargetUnit()
    set udg_Buncle_Nine_CD = 1.00
    set udg_Buncle_Nine_CD2 = 1.00
    set udg_Buncle_Nine_Count = 0
    set udg_Buncle_Nine_Index = 0
    call UnitAddAbilityBJ( 'Avul', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'Avul', udg_Buncle_Nine_Target )
    call PauseUnitBJ( true, GetTriggerUnit() )
    call PauseUnitBJ( true, udg_Buncle_Nine_Target )
    call TriggerSleepAction( 0.20 )
    set udg_Buncle_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Buncle_P2 = GetUnitLoc(udg_Buncle_Nine_Target)
    set udg_Buncle_Nine_Angle = AngleBetweenPoints(udg_Buncle_P2, udg_Buncle_P1)
    set udg_Buncle_P3 = PolarProjectionBJ(udg_Buncle_P2, 100.00, udg_Buncle_Nine_Angle)
    call AddSpecialEffectLocBJ( udg_Buncle_P1, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLocFacingLocBJ( GetTriggerUnit(), udg_Buncle_P3, udg_Buncle_P2 )
    call RemoveLocation( udg_Buncle_P1 )
    call RemoveLocation( udg_Buncle_P2 )
    call RemoveLocation( udg_Buncle_P3 )
    call StartTimerBJ( udg_Buncle_Nine_Timer2, false, 1.10 )
    call EnableTrigger( gg_trg_Nine_Lives_Hits )
    call EnableTrigger( gg_trg_Nine_Lives_out )
    call EnableTrigger( gg_trg_Nine_Lives_clear )
    call TriggerExecute( gg_trg_Nine_Lives_Hits )
endfunction

// --- InitTrig_Nine_Lives_EX (family, line 52087) ---
function InitTrig_Nine_Lives_EX takes nothing returns nothing
    set gg_trg_Nine_Lives_EX = CreateTrigger(  )
    call DisableTrigger( gg_trg_Nine_Lives_EX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Nine_Lives_EX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Nine_Lives_EX, Condition( function Trig_Nine_Lives_EX_Conditions ) )
    call TriggerAddAction( gg_trg_Nine_Lives_EX, function Trig_Nine_Lives_EX_Actions )
endfunction

// === family Trample_Start (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Trample_Start_Conditions (family, line 51709) ---
function Trig_Trample_Start_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0U1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Trample_Start_Actions (family, line 51716) ---
function Trig_Trample_Start_Actions takes nothing returns nothing
    // 變數設定
    set udg_Buncle_trample_Damage = ( 250.00 + ( 100.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    set udg_Buncle_trample_Index = 0.00
    set udg_Buncle_trample_Caster = GetTriggerUnit()
    set udg_Buncle_trample_Target = GetSpellTargetUnit()
    set udg_Buncle_P1 = GetUnitLoc(udg_Buncle_trample_Target)
    set udg_Buncle_P2 = GetUnitLoc(GetTriggerUnit())
    set udg_Buncle_trample_Angle = AngleBetweenPoints(udg_Buncle_P1, udg_Buncle_P2)
    call RemoveLocation( udg_Buncle_P1 )
    call RemoveLocation( udg_Buncle_P2 )
    // 施法者設定
    call PauseUnitBJ( true, udg_Buncle_trample_Target )
    call SetUnitPathing( udg_Buncle_trample_Target, false )
    call UnitAddAbilityBJ( 'Arav', udg_Buncle_trample_Target )
    call UnitAddAbilityBJ( 'Avul', udg_Buncle_trample_Target )
    // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    call EnableTrigger( gg_trg_Trample_Effect )
endfunction

// --- InitTrig_Trample_Start (family, line 51737) ---
function InitTrig_Trample_Start takes nothing returns nothing
    set gg_trg_Trample_Start = CreateTrigger(  )
    call DisableTrigger( gg_trg_Trample_Start )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Trample_Start, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Trample_Start, Condition( function Trig_Trample_Start_Conditions ) )
    call TriggerAddAction( gg_trg_Trample_Start, function Trig_Trample_Start_Actions )
endfunction

// === family berserker (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_berserker_Conditions (family, line 51659) ---
function Trig_berserker_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0VJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_berserker_Actions (family, line 51666) ---
function Trig_berserker_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0VK', GetTriggerUnit(), ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) + 1 ) )
    call SetUnitVertexColorBJ( udg_BerserkerUnit, 100, 30.00, 30.00, 0 )
    call EnableTrigger( gg_trg_berserker_2 )
endfunction

// --- InitTrig_berserker (family, line 51673) ---
function InitTrig_berserker takes nothing returns nothing
    set gg_trg_berserker = CreateTrigger(  )
    call DisableTrigger( gg_trg_berserker )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_berserker, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_berserker, Condition( function Trig_berserker_Conditions ) )
    call TriggerAddAction( gg_trg_berserker, function Trig_berserker_Actions )
endfunction

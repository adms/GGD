// unit rawcode: Ogld
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_BP, BlackTooth, ManyStar

// === family Open_Skill_of_BP (armed) events=none ===

// --- Trig_Open_Skill_of_BP_Conditions (family, line 47318) ---
function Trig_Open_Skill_of_BP_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Ogld' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_BP_Actions (family, line 47325) ---
function Trig_Open_Skill_of_BP_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_BlackTooth )
    call EnableTrigger( gg_trg_ManyStar )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "黑人牙膏: 有沒有乖乖刷牙阿?" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_BP (family, line 47334) ---
function InitTrig_Open_Skill_of_BP takes nothing returns nothing
    set gg_trg_Open_Skill_of_BP = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_BP, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_BP, Condition( function Trig_Open_Skill_of_BP_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_BP, function Trig_Open_Skill_of_BP_Actions )
endfunction

// === family BlackTooth (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BlackTooth_Conditions (family, line 47344) ---
function Trig_BlackTooth_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlackTooth_Func013Func001C (family, line 47351) ---
function Trig_BlackTooth_Func013Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlackTooth_Func013A (family, line 47358) ---
function Trig_BlackTooth_Func013A takes nothing returns nothing
    if ( Trig_BlackTooth_Func013Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), I2R(udg_WildSaber), ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
        call CreateTextTagUnitBJ( ( I2S(R2I(I2R(udg_WildSaber))) + "!" ), udg_blademaster, -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 1.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "carrionswarm", GetUnitLoc(GetEnumUnit()) )
    else
    endif
endfunction

// --- Trig_BlackTooth_Func017A (family, line 47372) ---
function Trig_BlackTooth_Func017A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_BlackTooth_Actions (family, line 47377) ---
function Trig_BlackTooth_Actions takes nothing returns nothing
    set udg_WildSaber = ( ( 30 * GetHeroLevel(GetTriggerUnit()) ) + ( GetRandomInt(20, GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * ( GetUnitAbilityLevelSwapped('A0CO', GetTriggerUnit()) * 9 ) ) )
    call SetUnitVertexColorBJ( GetTriggerUnit(), 20.00, 20.00, 20.00, 10.00 )
    call PauseUnitBJ( true, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'o00F', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0CP', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0CP', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitTimeScalePercent( GetTriggerUnit(), 300.00 )
    call SetUnitAnimationWithRarity( GetTriggerUnit(), "attack", RARITY_RARE )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(700.00, GetUnitLoc(GetTriggerUnit())), function Trig_BlackTooth_Func013A )
    call SetUnitVertexColorBJ( GetTriggerUnit(), 100.00, 100.00, 100.00, 0.00 )
    call SetUnitTimeScalePercent( GetTriggerUnit(), 100.00 )
    call PauseUnitBJ( false, GetTriggerUnit() )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o00F'), function Trig_BlackTooth_Func017A )
endfunction

// --- InitTrig_BlackTooth (family, line 47397) ---
function InitTrig_BlackTooth takes nothing returns nothing
    set gg_trg_BlackTooth = CreateTrigger(  )
    call DisableTrigger( gg_trg_BlackTooth )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BlackTooth, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BlackTooth, Condition( function Trig_BlackTooth_Conditions ) )
    call TriggerAddAction( gg_trg_BlackTooth, function Trig_BlackTooth_Actions )
endfunction

// === family ManyStar (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_ManyStar_Conditions (family, line 47408) ---
function Trig_ManyStar_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A09A' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManyStar_Func004Func001Func001C (family, line 47415) ---
function Trig_ManyStar_Func004Func001Func001C takes nothing returns boolean
    if ( ( GetLocationX(udg_JhonPiont) != GetLocationX(GetUnitLoc(udg_StarUnit)) ) ) then
        return true
    endif
    if ( ( IsUnitAliveBJ(udg_StarUnit) == false ) ) then
        return true
    endif
    if ( ( OrderId2StringBJ(GetUnitCurrentOrder(udg_StarUnit)) != "starfall" ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_ManyStar_Func004Func001C (family, line 47428) ---
function Trig_ManyStar_Func004Func001C takes nothing returns boolean
    if ( not Trig_ManyStar_Func004Func001Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManyStar_Func005Func002C (family, line 47435) ---
function Trig_ManyStar_Func005Func002C takes nothing returns boolean
    if ( ( GetLocationX(udg_JhonPiont) != GetLocationX(GetUnitLoc(udg_StarUnit)) ) ) then
        return true
    endif
    if ( ( IsUnitAliveBJ(udg_StarUnit) == false ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_ManyStar_Func005C (family, line 47445) ---
function Trig_ManyStar_Func005C takes nothing returns boolean
    if ( not Trig_ManyStar_Func005Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManyStar_Func006A (family, line 47452) ---
function Trig_ManyStar_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ManyStar_Actions (family, line 47457) ---
function Trig_ManyStar_Actions takes nothing returns nothing
    set udg_JhonStar = 1
    set udg_StarUnit = GetTriggerUnit()
    set udg_JhonPiont = GetUnitLoc(GetTriggerUnit())
    set udg_JhonStar = 1
    loop
        exitwhen udg_JhonStar > 36
        if ( Trig_ManyStar_Func004Func001C() ) then
            set udg_JhonStar = 36
        else
        endif
        call CreateNUnitsAtLoc( 1, 'o008', GetOwningPlayer(udg_StarUnit), PolarProjectionBJ(udg_JhonPiont, 256, ( I2R(udg_JhonStar) * 10.00 )), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 32.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A09B', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A09B', GetLastCreatedUnit(), 1 )
        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "starfall" )
        call PolledWait( 0.10 )
        set udg_JhonStar = udg_JhonStar + 1
    endloop
    if ( Trig_ManyStar_Func005C() ) then
    else
        call TriggerSleepAction( 32.00 )
    endif
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_StarUnit), 'o008'), function Trig_ManyStar_Func006A )
endfunction

// --- InitTrig_ManyStar (family, line 47484) ---
function InitTrig_ManyStar takes nothing returns nothing
    set gg_trg_ManyStar = CreateTrigger(  )
    call DisableTrigger( gg_trg_ManyStar )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ManyStar, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_ManyStar, Condition( function Trig_ManyStar_Conditions ) )
    call TriggerAddAction( gg_trg_ManyStar, function Trig_ManyStar_Actions )
endfunction

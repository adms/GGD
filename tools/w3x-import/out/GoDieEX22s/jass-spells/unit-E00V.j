// unit rawcode: E00V
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Bear, Bowling, ColdJoke, FindyouEX, GiveMeHoney, Sugoi

// === family Open_Skill_of_Bear (armed) events=none ===

// --- Trig_Open_Skill_of_Bear_Conditions (family, line 50964) ---
function Trig_Open_Skill_of_Bear_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00V' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Bear_Actions (family, line 50971) ---
function Trig_Open_Skill_of_Bear_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_GiveMeHoney )
    call EnableTrigger( gg_trg_Sugoi )
    call EnableTrigger( gg_trg_ColdJoke )
    call EnableTrigger( gg_trg_Bowling )
    call EnableTrigger( gg_trg_FindyouEX )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "小熊維尼: 小豬 我們今天去吃蜜汁紅燒獅子頭好嗎?" + "|r" ) ) )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "小豬: ....." + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Bear (family, line 50984) ---
function InitTrig_Open_Skill_of_Bear takes nothing returns nothing
    set gg_trg_Open_Skill_of_Bear = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Bear, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Bear, Condition( function Trig_Open_Skill_of_Bear_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Bear, function Trig_Open_Skill_of_Bear_Actions )
endfunction

// === family Bowling (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bowling_Conditions (family, line 51448) ---
function Trig_Bowling_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bowling_Actions (family, line 51455) ---
function Trig_Bowling_Actions takes nothing returns nothing
    // 變數設定
    set udg_Bowling_IndexBear = 0
    set udg_BearUnit = GetTriggerUnit()
    set udg_P1Bear = GetUnitLoc(GetTriggerUnit())
    set udg_P2Bear = GetSpellTargetLoc()
    set udg_Bowling_AngleBear = AngleBetweenPoints(udg_P1Bear, udg_P2Bear)
    set udg_BearDamage = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_BearUnit, true)) * 2.00 ) + ( ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0CV', udg_BearUnit)) ) + 50.00 ) )
    call SetUnitTimeScalePercent( udg_BearUnit, 700.00 )
    call GroupClear( udg_BearGroup )
    call RemoveLocation( udg_P1Bear )
    call RemoveLocation( udg_P2Bear )
    call EnableTrigger( gg_trg_BowlingEffect )
endfunction

// --- InitTrig_Bowling (family, line 51471) ---
function InitTrig_Bowling takes nothing returns nothing
    set gg_trg_Bowling = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bowling )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bowling, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bowling, Condition( function Trig_Bowling_Conditions ) )
    call TriggerAddAction( gg_trg_Bowling, function Trig_Bowling_Actions )
endfunction

// === family ColdJoke (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ColdJoke_Conditions (family, line 51304) ---
function Trig_ColdJoke_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func003C (family, line 51311) ---
function Trig_ColdJoke_Func003C takes nothing returns boolean
    if ( not ( udg_Bear_N == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func004C (family, line 51318) ---
function Trig_ColdJoke_Func004C takes nothing returns boolean
    if ( not ( udg_Bear_N == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func005C (family, line 51325) ---
function Trig_ColdJoke_Func005C takes nothing returns boolean
    if ( not ( udg_Bear_N == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func006C (family, line 51332) ---
function Trig_ColdJoke_Func006C takes nothing returns boolean
    if ( not ( udg_Bear_N == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func007C (family, line 51339) ---
function Trig_ColdJoke_Func007C takes nothing returns boolean
    if ( not ( udg_Bear_N == 5 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func008C (family, line 51346) ---
function Trig_ColdJoke_Func008C takes nothing returns boolean
    if ( not ( udg_Bear_N == 6 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func009C (family, line 51353) ---
function Trig_ColdJoke_Func009C takes nothing returns boolean
    if ( not ( udg_Bear_N == 7 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Func010C (family, line 51360) ---
function Trig_ColdJoke_Func010C takes nothing returns boolean
    if ( not ( udg_Bear_N == 8 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ColdJoke_Actions (family, line 51367) ---
function Trig_ColdJoke_Actions takes nothing returns nothing
    // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    set udg_Bear_N = GetRandomInt(1, 8)
    if ( Trig_ColdJoke_Func003C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6538", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func004C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6604", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func005C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6619", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func006C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6620", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func007C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6623", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func008C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6694", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func009C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6785", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
    if ( Trig_ColdJoke_Func010C() ) then
        call CreateTextTagUnitBJ( "TRIGSTR_6786", GetTriggerUnit(), 50.00, 10.00, 100.00, 100.00, 100.00, 0.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
    else
    endif
endfunction

// --- InitTrig_ColdJoke (family, line 51437) ---
function InitTrig_ColdJoke takes nothing returns nothing
    set gg_trg_ColdJoke = CreateTrigger(  )
    call DisableTrigger( gg_trg_ColdJoke )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ColdJoke, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ColdJoke, Condition( function Trig_ColdJoke_Conditions ) )
    call TriggerAddAction( gg_trg_ColdJoke, function Trig_ColdJoke_Actions )
endfunction

// === family FindyouEX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FindyouEX_Conditions (family, line 50994) ---
function Trig_FindyouEX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A10U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FindyouEX_Func001Func001Func004C (family, line 51001) ---
function Trig_FindyouEX_Func001Func001Func004C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_PlayerHeroUnit[GetForLoopIndexA()]) != 'E00V' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FindyouEX_Func001Func001C (family, line 51008) ---
function Trig_FindyouEX_Func001Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetTriggerUnit()), ConvertedPlayer(GetForLoopIndexA())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FindyouEX_Actions (family, line 51015) ---
function Trig_FindyouEX_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 13
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_FindyouEX_Func001Func001C() ) then
            call SetUnitLifePercentBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], ( GetUnitLifePercent(udg_PlayerHeroUnit[GetForLoopIndexA()]) + 50.00 ) )
            call SetUnitManaPercentBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], ( GetUnitManaPercent(udg_PlayerHeroUnit[GetForLoopIndexA()]) + 50.00 ) )
            if ( Trig_FindyouEX_Func001Func001Func004C() ) then
                call SetUnitPositionLoc( udg_PlayerHeroUnit[GetForLoopIndexA()], GetUnitLoc(GetTriggerUnit()) )
                call AddSpecialEffectTargetUnitBJ( "origin", udg_PlayerHeroUnit[GetForLoopIndexA()], "Abilities\\Spells\\Human\\MassTeleport\\MassTeleportTarget.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            else
            endif
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
endfunction

// --- InitTrig_FindyouEX (family, line 51036) ---
function InitTrig_FindyouEX takes nothing returns nothing
    set gg_trg_FindyouEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_FindyouEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FindyouEX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FindyouEX, Condition( function Trig_FindyouEX_Conditions ) )
    call TriggerAddAction( gg_trg_FindyouEX, function Trig_FindyouEX_Actions )
endfunction

// === family GiveMeHoney (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GiveMeHoney_Conditions (family, line 51047) ---
function Trig_GiveMeHoney_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GiveMeHoney_Actions (family, line 51054) ---
function Trig_GiveMeHoney_Actions takes nothing returns nothing
    set udg_Bear_caster = GetTriggerUnit()
    set udg_Bear_target = GetSpellTargetUnit()
    set udg_Bear_P1 = GetUnitLoc(udg_Bear_caster)
    set udg_Bear_P2 = GetUnitLoc(udg_Bear_target)
    set udg_Bear_Angle = AngleBetweenPoints(udg_Bear_P2, udg_Bear_P1)
    set udg_Bear_Index3 = 0
    call PauseUnitBJ( true, udg_Bear_caster )
    call UnitAddAbilityBJ( 'Avul', udg_Bear_caster )
    call UnitAddAbilityBJ( 'A0DA', udg_Bear_caster )
    call CreateNUnitsAtLocFacingLocBJ( 1, 'h023', GetOwningPlayer(udg_Bear_caster), udg_Bear_P1, udg_Bear_P2 )
    set udg_Bear_U1 = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_Bear_P1, bj_UNIT_FACING )
    set udg_Bear_U2 = GetLastCreatedUnit()
    call ShowUnitHide( udg_Bear_U2 )
    call UnitAddAbilityBJ( 'A0RY', udg_Bear_U2 )
    call SetUnitAbilityLevelSwapped( 'A0RY', udg_Bear_U2, GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitVertexColorBJ( udg_Bear_U1, 100.00, 100.00, 100.00, 50.00 )
    call SetUnitTimeScalePercent( udg_Bear_caster, 150.00 )
    call SetUnitAnimation( udg_Bear_caster, "attack slam" )
    call SetUnitAnimation( udg_Bear_U1, "attack slam" )
    call CreateTextTagUnitBJ( "TRIGSTR_5521", udg_Bear_caster, 50.00, 20.00, 100.00, 100.00, 100.00, 0.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call TriggerSleepAction( 0.40 )
    call EnableTrigger( gg_trg_GiveMeHoney_Effect )
    // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
endfunction

// --- InitTrig_GiveMeHoney (family, line 51086) ---
function InitTrig_GiveMeHoney takes nothing returns nothing
    set gg_trg_GiveMeHoney = CreateTrigger(  )
    call DisableTrigger( gg_trg_GiveMeHoney )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GiveMeHoney, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GiveMeHoney, Condition( function Trig_GiveMeHoney_Conditions ) )
    call TriggerAddAction( gg_trg_GiveMeHoney, function Trig_GiveMeHoney_Actions )
endfunction

// === family Sugoi (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Sugoi_Conditions (family, line 51260) ---
function Trig_Sugoi_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0D6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Sugoi_Actions (family, line 51267) ---
function Trig_Sugoi_Actions takes nothing returns nothing
    set udg_Bear_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Bear_P2 = GetUnitLoc(GetSpellTargetUnit())
    call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_Bear_P1, udg_Bear_P2 )
    set udg_BearUnit = GetLastCreatedUnit()
    set udg_Bear_target = GetSpellTargetUnit()
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', udg_BearUnit )
    call ShowUnitHide( udg_BearUnit )
    call UnitAddAbilityBJ( 'A0D8', udg_BearUnit )
    call SetUnitAbilityLevelSwapped( 'A0D8', udg_BearUnit, GetUnitAbilityLevelSwapped('A0D6', GetTriggerUnit()) )
    call IssueTargetOrderBJ( udg_BearUnit, "soulburn", udg_Bear_target )
    call UnitAddAbilityBJ( 'S005', udg_BearUnit )
    call SetUnitAbilityLevelSwapped( 'S005', udg_BearUnit, GetUnitAbilityLevelSwapped('A0D6', GetTriggerUnit()) )
    call IssueTargetOrderBJ( udg_BearUnit, "cripple", udg_Bear_target )
    call KillUnit( udg_BearUnit )
    call RemoveUnit( udg_BearUnit )
    call CreateTextTagUnitBJ( "TRIGSTR_6477", GetTriggerUnit(), 50.00, 12.00, 100.00, 100.00, 100.00, 0.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 70.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call RemoveLocation( udg_Bear_P1 )
    call RemoveLocation( udg_Bear_P2 )
endfunction

// --- InitTrig_Sugoi (family, line 51293) ---
function InitTrig_Sugoi takes nothing returns nothing
    set gg_trg_Sugoi = CreateTrigger(  )
    call DisableTrigger( gg_trg_Sugoi )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Sugoi, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Sugoi, Condition( function Trig_Sugoi_Conditions ) )
    call TriggerAddAction( gg_trg_Sugoi, function Trig_Sugoi_Actions )
endfunction

// unit rawcode: Udea
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Moriya, HeroCome, MagicUp, MoriyaBYEBYE, Run, StupidReady

// === family Open_Skill_of_Moriya (armed) events=none ===

// --- Trig_Open_Skill_of_Moriya_Func003C (family, line 46721) ---
function Trig_Open_Skill_of_Moriya_Func003C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetTriggerUnit()) == 'Udea' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetTriggerUnit()) == 'U00B' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Open_Skill_of_Moriya_Conditions (family, line 46731) ---
function Trig_Open_Skill_of_Moriya_Conditions takes nothing returns boolean
    if ( not Trig_Open_Skill_of_Moriya_Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Moriya_Func011Func001C (family, line 46738) ---
function Trig_Open_Skill_of_Moriya_Func011Func001C takes nothing returns boolean
    if ( not ( GetForLoopIndexA() != 7 ) ) then
        return false
    endif
    if ( not ( ConvertedPlayer(GetForLoopIndexA()) != GetOwningPlayer(GetTriggerUnit()) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Moriya_Actions (family, line 46748) ---
function Trig_Open_Skill_of_Moriya_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    set udg_MoriyaUnit = GetTriggerUnit()
    call EnableTrigger( gg_trg_Run )
    call EnableTrigger( gg_trg_MagicUp )
    call EnableTrigger( gg_trg_MoriyaBYEBYE )
    call EnableTrigger( gg_trg_HeroCome )
    call EnableTrigger( gg_trg_StupidReady )
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "飛鼠先生: 贏定了吧..." + "|r" ) ) )
    set bj_forLoopAIndex = 2
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_Open_Skill_of_Moriya_Func011Func001C() ) then
            call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetForLoopIndexA()] + ( ( GetPlayerName(ConvertedPlayer(GetForLoopIndexA())) + "：幹！" ) + "|r" ) ) )
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
endfunction

// --- InitTrig_Open_Skill_of_Moriya (family, line 46771) ---
function InitTrig_Open_Skill_of_Moriya takes nothing returns nothing
    set gg_trg_Open_Skill_of_Moriya = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Moriya, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Moriya, Condition( function Trig_Open_Skill_of_Moriya_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Moriya, function Trig_Open_Skill_of_Moriya_Actions )
endfunction

// === family HeroCome (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HeroCome_Conditions (family, line 47029) ---
function Trig_HeroCome_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0EY' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeroCome_Func001Func001Func001C (family, line 47036) ---
function Trig_HeroCome_Func001Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[udg_moriyaItem] != GetTriggerUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeroCome_Func001Func002Func001C (family, line 47043) ---
function Trig_HeroCome_Func001Func002Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[udg_moriyaItem] != GetTriggerUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeroCome_Func001C (family, line 47050) ---
function Trig_HeroCome_Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetTriggerUnit(), Player(0)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeroCome_Actions (family, line 47057) ---
function Trig_HeroCome_Actions takes nothing returns nothing
    if ( Trig_HeroCome_Func001C() ) then
        set udg_moriyaItem = 2
        loop
            exitwhen udg_moriyaItem > 6
            if ( Trig_HeroCome_Func001Func002Func001C() ) then
                call SetUnitLifePercentBJ( udg_PlayerHeroUnit[udg_moriyaItem], 100 )
                call SetUnitManaPercentBJ( udg_PlayerHeroUnit[udg_moriyaItem], 100 )
                call SetUnitPositionLoc( udg_PlayerHeroUnit[udg_moriyaItem], GetUnitLoc(GetTriggerUnit()) )
            else
                call SetUnitPositionLoc( udg_PlayerHeroUnit[udg_moriyaItem], GetUnitLoc(GetTriggerUnit()) )
            endif
            set udg_moriyaItem = udg_moriyaItem + 1
        endloop
    else
        set udg_moriyaItem = 8
        loop
            exitwhen udg_moriyaItem > 12
            if ( Trig_HeroCome_Func001Func001Func001C() ) then
                call SetUnitLifePercentBJ( udg_PlayerHeroUnit[udg_moriyaItem], 100 )
                call SetUnitManaPercentBJ( udg_PlayerHeroUnit[udg_moriyaItem], 100 )
                call SetUnitPositionLoc( udg_PlayerHeroUnit[udg_moriyaItem], GetUnitLoc(GetTriggerUnit()) )
            else
                call SetUnitPositionLoc( udg_PlayerHeroUnit[udg_moriyaItem], GetUnitLoc(GetTriggerUnit()) )
            endif
            set udg_moriyaItem = udg_moriyaItem + 1
        endloop
    endif
    call PlaySoundOnUnitBJ( gg_snd_SoulGem, 100, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'o00R', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
endfunction

// --- InitTrig_HeroCome (family, line 47091) ---
function InitTrig_HeroCome takes nothing returns nothing
    set gg_trg_HeroCome = CreateTrigger(  )
    call DisableTrigger( gg_trg_HeroCome )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HeroCome, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HeroCome, Condition( function Trig_HeroCome_Conditions ) )
    call TriggerAddAction( gg_trg_HeroCome, function Trig_HeroCome_Actions )
endfunction

// === family MagicUp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MagicUp_Conditions (family, line 46912) ---
function Trig_MagicUp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CH' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicUp_Func011A (family, line 46919) ---
function Trig_MagicUp_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicUp_Actions (family, line 46924) ---
function Trig_MagicUp_Actions takes nothing returns nothing
    set udg_MoriyaUnit = GetTriggerUnit()
    set udg_MagicUp = GetSpellTargetUnit()
    call UnitDamageTargetBJ( GetTriggerUnit(), udg_MagicUp, ( ( GetUnitStateSwap(UNIT_STATE_MAX_MANA, udg_MagicUp) - GetUnitStateSwap(UNIT_STATE_MANA, udg_MagicUp) ) * ( I2R(GetUnitAbilityLevelSwapped('A0CH', GetTriggerUnit())) * 1.00 ) ), ATTACK_TYPE_MAGIC, DAMAGE_TYPE_NORMAL )
    call SetUnitManaPercentBJ( udg_MagicUp, 100 )
    call MoveRectToLoc( gg_rct_moriyasp, GetUnitLoc(GetTriggerUnit()) )
    call TerrainDeformationWaveBJ( 2.00, GetUnitLoc(GetSpellTargetUnit()), GetRectCenter(gg_rct_moriyasp), 500.00, 120.00, 0.50 )
    call CreateNUnitsAtLoc( 1, 'o00Q', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(udg_MagicUp), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
    call PlaySoundOnUnitBJ( gg_snd_Taunt, 100, GetTriggerUnit() )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoriyaUnit), 'o00Q'), function Trig_MagicUp_Func011A )
endfunction

// --- InitTrig_MagicUp (family, line 46939) ---
function InitTrig_MagicUp takes nothing returns nothing
    set gg_trg_MagicUp = CreateTrigger(  )
    call DisableTrigger( gg_trg_MagicUp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MagicUp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MagicUp, Condition( function Trig_MagicUp_Conditions ) )
    call TriggerAddAction( gg_trg_MagicUp, function Trig_MagicUp_Actions )
endfunction

// === family MoriyaBYEBYE (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MoriyaBYEBYE_Func004Func002C (family, line 46950) ---
function Trig_MoriyaBYEBYE_Func004Func002C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'AIds' ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 5) == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaBYEBYE_Func004C (family, line 46960) ---
function Trig_MoriyaBYEBYE_Func004C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A04C' ) ) then
        return true
    endif
    if ( Trig_MoriyaBYEBYE_Func004Func002C() ) then
        return true
    endif
    return false
endfunction

// --- Trig_MoriyaBYEBYE_Conditions (family, line 46970) ---
function Trig_MoriyaBYEBYE_Conditions takes nothing returns boolean
    if ( not Trig_MoriyaBYEBYE_Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaBYEBYE_Func005Func010C (family, line 46977) ---
function Trig_MoriyaBYEBYE_Func005Func010C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnumUnit()) == 'U00K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoriyaBYEBYE_Func005A (family, line 46984) ---
function Trig_MoriyaBYEBYE_Func005A takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04H', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04I', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A04H', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    set udg_P1 = GetUnitLoc(GetSpellTargetUnit())
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
    if ( Trig_MoriyaBYEBYE_Func005Func010C() ) then
        call SetUnitAbilityLevelSwapped( 'A04I', GetLastCreatedUnit(), 9 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "manaburn", GetEnumUnit() )
    else
        call SetUnitAbilityLevelSwapped( 'A04I', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "manaburn", GetEnumUnit() )
    endif
endfunction

// --- Trig_MoriyaBYEBYE_Func007A (family, line 47003) ---
function Trig_MoriyaBYEBYE_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MoriyaBYEBYE_Actions (family, line 47008) ---
function Trig_MoriyaBYEBYE_Actions takes nothing returns nothing
    call TerrainDeformationWaveBJ( 2.00, GetUnitLoc(GetSpellTargetUnit()), GetRectCenter(gg_rct_moriyasp), 500.00, 120.00, 0.50 )
    set udg_MoriyaUnit = GetTriggerUnit()
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, GetUnitLoc(GetTriggerUnit())), function Trig_MoriyaBYEBYE_Func005A )
    call TriggerSleepAction( 10.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoriyaUnit), 'ogru'), function Trig_MoriyaBYEBYE_Func007A )
endfunction

// --- InitTrig_MoriyaBYEBYE (family, line 47018) ---
function InitTrig_MoriyaBYEBYE takes nothing returns nothing
    set gg_trg_MoriyaBYEBYE = CreateTrigger(  )
    call DisableTrigger( gg_trg_MoriyaBYEBYE )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MoriyaBYEBYE, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MoriyaBYEBYE, Condition( function Trig_MoriyaBYEBYE_Conditions ) )
    call TriggerAddAction( gg_trg_MoriyaBYEBYE, function Trig_MoriyaBYEBYE_Actions )
endfunction

// === family Run (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Run_Conditions (family, line 46781) ---
function Trig_Run_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05S' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Run_Actions (family, line 46788) ---
function Trig_Run_Actions takes nothing returns nothing
    set udg_KnockBack_Index = 0
    set udg_KnockBack_Target = GetTriggerUnit()
    set udg_KnockBack_Angle = GetUnitFacing(GetTriggerUnit())
    call EnableTrigger( gg_trg_Run_Effect )
endfunction

// --- InitTrig_Run (family, line 46796) ---
function InitTrig_Run takes nothing returns nothing
    set gg_trg_Run = CreateTrigger(  )
    call DisableTrigger( gg_trg_Run )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Run, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Run, Condition( function Trig_Run_Conditions ) )
    call TriggerAddAction( gg_trg_Run, function Trig_Run_Actions )
endfunction

// === family StupidReady (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_StupidReady_Conditions (family, line 47102) ---
function Trig_StupidReady_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0FF' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StupidReady_Actions (family, line 47109) ---
function Trig_StupidReady_Actions takes nothing returns nothing
    set udg_MoriyaUnit = GetTriggerUnit()
    set udg_StupidMoriya = ( I2R(( GetHeroLevel(GetTriggerUnit()) + GetRandomInt(5, 10) )) * 200.00 )
    call EnableTrigger( gg_trg_stupidStart )
    call TriggerSleepAction( 6.00 )
    call DisableTrigger( gg_trg_stupidStart )
endfunction

// --- InitTrig_StupidReady (family, line 47118) ---
function InitTrig_StupidReady takes nothing returns nothing
    set gg_trg_StupidReady = CreateTrigger(  )
    call DisableTrigger( gg_trg_StupidReady )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_StupidReady, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_StupidReady, Condition( function Trig_StupidReady_Conditions ) )
    call TriggerAddAction( gg_trg_StupidReady, function Trig_StupidReady_Actions )
endfunction

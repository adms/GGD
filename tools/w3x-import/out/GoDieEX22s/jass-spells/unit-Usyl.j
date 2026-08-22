// unit rawcode: Usyl
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LearnReTurn, ReTurn, Open_Skill_of_Hydralisk, KillAtk

// === family LearnReTurn (passive) events=EVENT_PLAYER_HERO_SKILL ===

// --- Trig_LearnReTurn_Conditions (family, line 46343) ---
function Trig_LearnReTurn_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Usyl' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LearnReTurn_Func001C (family, line 46350) ---
function Trig_LearnReTurn_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0BV', GetLearningUnit()) >= 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LearnReTurn_Actions (family, line 46357) ---
function Trig_LearnReTurn_Actions takes nothing returns nothing
    if ( Trig_LearnReTurn_Func001C() ) then
        set udg_ReTurn = GetTriggerUnit()
        call DisableTrigger( GetTriggeringTrigger() )
        call EnableTrigger( gg_trg_ReTurn )
        call TriggerExecute( gg_trg_ReTurn )
    else
    endif
endfunction

// --- InitTrig_LearnReTurn (family, line 46368) ---
function InitTrig_LearnReTurn takes nothing returns nothing
    set gg_trg_LearnReTurn = CreateTrigger(  )
    call DisableTrigger( gg_trg_LearnReTurn )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LearnReTurn, EVENT_PLAYER_HERO_SKILL )
    call TriggerAddCondition( gg_trg_LearnReTurn, Condition( function Trig_LearnReTurn_Conditions ) )
    call TriggerAddAction( gg_trg_LearnReTurn, function Trig_LearnReTurn_Actions )
endfunction

// === family ReTurn (passive) events=EVENT_PLAYER_UNIT_DEATH ===

// --- Trig_ReTurn_Func003C (family, line 46379) ---
function Trig_ReTurn_Func003C takes nothing returns boolean
    if ( not ( IsUnitType(GetDyingUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetDyingUnit(), GetOwningPlayer(GetKillingUnitBJ())) == false ) ) then
        return false
    endif
    if ( not ( GetKillingUnitBJ() == udg_ReTurn ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ReTurn_Conditions (family, line 46392) ---
function Trig_ReTurn_Conditions takes nothing returns boolean
    if ( not Trig_ReTurn_Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ReTurn_Func002C (family, line 46399) ---
function Trig_ReTurn_Func002C takes nothing returns boolean
    if ( not ( GetHeroStatBJ(bj_HEROSTAT_AGI, GetKillingUnitBJ(), false) < 140 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ReTurn_Actions (family, line 46406) ---
function Trig_ReTurn_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_MercenaryWhat1, 100.00, GetKillingUnitBJ() )
    if ( Trig_ReTurn_Func002C() ) then
        call ModifyHeroStat( bj_HEROSTAT_AGI, udg_ReTurn, bj_MODIFYMETHOD_ADD, GetUnitAbilityLevelSwapped('A0BV', udg_ReTurn) )
    else
        call DisableTrigger( GetTriggeringTrigger() )
    endif
endfunction

// --- InitTrig_ReTurn (family, line 46416) ---
function InitTrig_ReTurn takes nothing returns nothing
    set gg_trg_ReTurn = CreateTrigger(  )
    call DisableTrigger( gg_trg_ReTurn )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ReTurn, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_ReTurn, Condition( function Trig_ReTurn_Conditions ) )
    call TriggerAddAction( gg_trg_ReTurn, function Trig_ReTurn_Actions )
endfunction

// === family Open_Skill_of_Hydralisk (armed) events=none ===

// --- Trig_Open_Skill_of_Hydralisk_Conditions (family, line 46317) ---
function Trig_Open_Skill_of_Hydralisk_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Usyl' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Hydralisk_Actions (family, line 46324) ---
function Trig_Open_Skill_of_Hydralisk_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call DisableTrigger( GetTriggeringTrigger() )
    call EnableTrigger( gg_trg_LearnReTurn )
    call EnableTrigger( gg_trg_KillAtk )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "刺蛇: 吼嘎嘎" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Hydralisk (family, line 46333) ---
function InitTrig_Open_Skill_of_Hydralisk takes nothing returns nothing
    set gg_trg_Open_Skill_of_Hydralisk = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Hydralisk, GetEntireMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Hydralisk, Condition( function Trig_Open_Skill_of_Hydralisk_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Hydralisk, function Trig_Open_Skill_of_Hydralisk_Actions )
endfunction

// === family KillAtk (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KillAtk_Conditions (family, line 46427) ---
function Trig_KillAtk_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0NJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KillAtk_Actions (family, line 46434) ---
function Trig_KillAtk_Actions takes nothing returns nothing
    set udg_P0 = GetUnitLoc(GetSpellTargetUnit())
    call AddSpecialEffectLocBJ( udg_P0, "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call RemoveLocation( udg_P0)
    call TextUse("你別過來!", GetSpellTargetUnit() , 10 , 2 , 100,0,0)
    call AddSpecialEffectTargetUnitBJ( "overhead", GetSpellTargetUnit(), "Abilities\\Spells\\Other\\TalkToMe\\TalkToMe.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- InitTrig_KillAtk (family, line 46445) ---
function InitTrig_KillAtk takes nothing returns nothing
    set gg_trg_KillAtk = CreateTrigger(  )
    call DisableTrigger( gg_trg_KillAtk )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KillAtk, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KillAtk, Condition( function Trig_KillAtk_Conditions ) )
    call TriggerAddAction( gg_trg_KillAtk, function Trig_KillAtk_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

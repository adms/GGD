// unit rawcode: E015
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_NightMarket, Mic, MilkTea, Oran, OranMon, TooLong, chacha

// === family Open_Skill_of_NightMarket (armed) events=none ===

// --- Trig_Open_Skill_of_NightMarket_Conditions (family, line 53785) ---
function Trig_Open_Skill_of_NightMarket_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E015' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_NightMarket_Actions (family, line 53792) ---
function Trig_Open_Skill_of_NightMarket_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    set udg_NM_Master = GetEnteringUnit()
    call EnableTrigger( gg_trg_Oran )
    call EnableTrigger( gg_trg_Mic )
    call EnableTrigger( gg_trg_MilkTea )
    call EnableTrigger( gg_trg_OranMon )
    call EnableTrigger( gg_trg_TooLong )
    call EnableTrigger( gg_trg_chacha )
    call SetPlayerAbilityAvailableBJ( false, 'A0W2', GetOwningPlayer(GetTriggerUnit()) )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "金居福: 恰恰~~!!" + "|r" ) ) )
    call DisableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_Open_Skill_of_NightMarket (family, line 53807) ---
function InitTrig_Open_Skill_of_NightMarket takes nothing returns nothing
    set gg_trg_Open_Skill_of_NightMarket = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_NightMarket, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_NightMarket, Condition( function Trig_Open_Skill_of_NightMarket_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_NightMarket, function Trig_Open_Skill_of_NightMarket_Actions )
endfunction

// === family Mic (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Mic_Conditions (family, line 53984) ---
function Trig_Mic_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0O0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Mic_Func001C (family, line 53991) ---
function Trig_Mic_Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetSpellTargetUnit(), udg_Des_Group) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetSpellTargetUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsUnitIllusionBJ(GetSpellTargetUnit()) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Mic_Actions (family, line 54004) ---
function Trig_Mic_Actions takes nothing returns nothing
    if ( Trig_Mic_Func001C() ) then
        call GroupAddUnitSimple( GetSpellTargetUnit(), udg_Des_Group )
        call InitSetup( GetSpellTargetUnit() )
    else
    endif
endfunction

// --- InitTrig_Mic (family, line 54013) ---
function InitTrig_Mic takes nothing returns nothing
    set gg_trg_Mic = CreateTrigger(  )
    call DisableTrigger( gg_trg_Mic )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Mic, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Mic, Condition( function Trig_Mic_Conditions ) )
    call TriggerAddAction( gg_trg_Mic, function Trig_Mic_Actions )
endfunction

// --- InitSetup (helper, line 4958) ---
function InitSetup takes unit DesUnit returns nothing
    local trigger Tri
    local triggeraction TriAct 
    
    set Tri = CreateTrigger()
    set TriAct = TriggerAddAction( Tri , function DamageLink )

    call TriggerRegisterUnitEvent( Tri , DesUnit , EVENT_UNIT_DAMAGED )

    call SetHandleTrigger(  DesUnit , "DTri" , Tri    )
    // 傷害的觸發
    call SetHandleTriggerAction(  DesUnit , "DAct" , TriAct )
    // 傷害的動作

    set Tri = null
    set TriAct = null
    set DesUnit = null
endfunction

// === family MilkTea (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MilkTea_Conditions (family, line 53958) ---
function Trig_MilkTea_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0QJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MilkTea_Actions (family, line 53965) ---
function Trig_MilkTea_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.10 )
    call UnitAddAbilityBJ( 'A0W2', udg_NM_Master )
    call TriggerSleepAction( 14.00 )
    call UnitRemoveAbilityBJ( 'A0W2', udg_NM_Master )
endfunction

// --- InitTrig_MilkTea (family, line 53973) ---
function InitTrig_MilkTea takes nothing returns nothing
    set gg_trg_MilkTea = CreateTrigger(  )
    call DisableTrigger( gg_trg_MilkTea )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MilkTea, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MilkTea, Condition( function Trig_MilkTea_Conditions ) )
    call TriggerAddAction( gg_trg_MilkTea, function Trig_MilkTea_Actions )
endfunction

// === family Oran (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Oran_Conditions (family, line 53840) ---
function Trig_Oran_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Oran_Func009C (family, line 53847) ---
function Trig_Oran_Func009C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_NM_Master, 'B04K') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Oran_Func010C (family, line 53854) ---
function Trig_Oran_Func010C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_NM_Master))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Oran_Actions (family, line 53861) ---
function Trig_Oran_Actions takes nothing returns nothing
    set udg_NM_OranCaster = GetSpellTargetUnit()
    call TextUse("北斗爆橘拳", udg_NM_OranCaster , 20 , 4 , 100,0,0)
    call PlaySoundOnUnitBJ( gg_snd_PeonDeath, 100.00, udg_NM_Master )
    call AddSpecialEffectTargetUnitBJ( "body", udg_NM_OranCaster, "Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'o001', GetOwningPlayer(udg_NM_Master), GetUnitLoc(udg_NM_OranCaster), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.80, 'BTLF', GetLastCreatedUnit() )
    call UnitDamageTargetBJ( udg_NM_Master, udg_NM_OranCaster, ( ( ( ( I2R(GetUnitAbilityLevelSwapped('A0OV', udg_NM_Master)) * 100.00 ) + 0.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_NM_Master, true)) * 2.00 ) ) + 0.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    if ( Trig_Oran_Func009C() ) then
        call UnitDamageTargetBJ( udg_NM_Master, udg_NM_OranCaster, ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_NM_Master, true)) * 1.50 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
    if ( Trig_Oran_Func010C() ) then
        call UnitDamageTargetBJ( udg_NM_Master, udg_NM_OranCaster, ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_NM_Master, true)) * 5.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
    call SetUnitLifeBJ( udg_NM_Master, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_NM_Master) + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0OV', udg_NM_Master)) ) ) )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_NM_OranCaster, "Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_NM_OranCaster, "death" )
endfunction

// --- InitTrig_Oran (family, line 53885) ---
function InitTrig_Oran takes nothing returns nothing
    set gg_trg_Oran = CreateTrigger(  )
    call DisableTrigger( gg_trg_Oran )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Oran, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Oran, Condition( function Trig_Oran_Conditions ) )
    call TriggerAddAction( gg_trg_Oran, function Trig_Oran_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

// === family OranMon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_OranMon_Conditions (family, line 53896) ---
function Trig_OranMon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0QG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OranMon_Func001C (family, line 53903) ---
function Trig_OranMon_Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_NM_Master, 'B04K') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OranMon_Actions (family, line 53910) ---
function Trig_OranMon_Actions takes nothing returns nothing
    if ( Trig_OranMon_Func001C() ) then
        set udg_NM_P3 = GetUnitLoc(GetTriggerUnit())
        set udg_NM_P4 = PolarProjectionBJ(udg_NM_P3, 256, 45.00)
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_NM_Master), udg_NM_P3, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0QI', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_NM_P4 )
        call RemoveLocation( udg_NM_P4)
        set udg_NM_P4 = PolarProjectionBJ(udg_NM_P3, 256, 135.00)
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_NM_Master), udg_NM_P3, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0QI', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_NM_P4 )
        call RemoveLocation( udg_NM_P4)
        set udg_NM_P4 = PolarProjectionBJ(udg_NM_P3, 256, 225.00)
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_NM_Master), udg_NM_P3, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0QI', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_NM_P4 )
        call RemoveLocation( udg_NM_P4)
        set udg_NM_P4 = PolarProjectionBJ(udg_NM_P3, 256, 315.00)
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_NM_Master), udg_NM_P3, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0QI', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", udg_NM_P4 )
        call RemoveLocation( udg_NM_P4)
        call RemoveLocation( udg_NM_P3)
    else
    endif
endfunction

// --- InitTrig_OranMon (family, line 53947) ---
function InitTrig_OranMon takes nothing returns nothing
    set gg_trg_OranMon = CreateTrigger(  )
    call DisableTrigger( gg_trg_OranMon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_OranMon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_OranMon, Condition( function Trig_OranMon_Conditions ) )
    call TriggerAddAction( gg_trg_OranMon, function Trig_OranMon_Actions )
endfunction

// === family TooLong (armed) events=none ===

// --- Trig_TooLong_Conditions (family, line 54217) ---
function Trig_TooLong_Conditions takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_NM_Master))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TooLong_Actions (family, line 54224) ---
function Trig_TooLong_Actions takes nothing returns nothing
    call ModifyHeroStat( bj_HEROSTAT_STR, udg_NM_Master, bj_MODIFYMETHOD_ADD, 7 )
    call ModifyHeroStat( bj_HEROSTAT_AGI, udg_NM_Master, bj_MODIFYMETHOD_ADD, 7 )
    call ModifyHeroStat( bj_HEROSTAT_INT, udg_NM_Master, bj_MODIFYMETHOD_ADD, 7 )
    call TextUse("太拖戲啦~~", udg_NM_Master , 15 , 2 , 50,50,0)
endfunction

// --- InitTrig_TooLong (family, line 54232) ---
function InitTrig_TooLong takes nothing returns nothing
    set gg_trg_TooLong = CreateTrigger(  )
    call DisableTrigger( gg_trg_TooLong )
    call TriggerRegisterTimerEventPeriodic( gg_trg_TooLong, 60.00 )
    call TriggerAddCondition( gg_trg_TooLong, Condition( function Trig_TooLong_Conditions ) )
    call TriggerAddAction( gg_trg_TooLong, function Trig_TooLong_Actions )
endfunction

// === family chacha (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_chacha_Conditions (family, line 53817) ---
function Trig_chacha_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0O8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_chacha_Actions (family, line 53824) ---
function Trig_chacha_Actions takes nothing returns nothing
    call TextUse("恰恰~", udg_NM_Master , 20 , 2 , 100,0,0)
endfunction

// --- InitTrig_chacha (family, line 53829) ---
function InitTrig_chacha takes nothing returns nothing
    set gg_trg_chacha = CreateTrigger(  )
    call DisableTrigger( gg_trg_chacha )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_chacha, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_chacha, Condition( function Trig_chacha_Conditions ) )
    call TriggerAddAction( gg_trg_chacha, function Trig_chacha_Actions )
endfunction

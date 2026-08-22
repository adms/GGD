// unit rawcode: U00N
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_Luffe, KingColor, Luf_Axe, Luf_RockFire_D8, Luf_Three, Luf_died, Luf_gun, Luf_two_Effect

// === family Open_Skill_of_Luffe (armed) events=none ===

// --- Trig_Open_Skill_of_Luffe_Conditions (family, line 36182) ---
function Trig_Open_Skill_of_Luffe_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00N' ) ) then
        return false
    endif
    if ( not ( IsUnitIllusionBJ(GetTriggerUnit()) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_Luffe_Actions (family, line 36192) ---
function Trig_Open_Skill_of_Luffe_Actions takes nothing returns nothing
    call DestroyTrigger(GetTriggeringTrigger())
    call EnableTrigger( gg_trg_Luf_died )
    call TriggerRegisterUnitEvent( gg_trg_Luf_died, GetTriggerUnit(), EVENT_UNIT_DEATH )
    call EnableTrigger( gg_trg_Luf_Axe )
    call EnableTrigger( gg_trg_Luf_gun )
    call EnableTrigger( gg_trg_Luf_two_Effect )
    call EnableTrigger( gg_trg_Luf_RockFire_D8 )
    call EnableTrigger( gg_trg_Luf_Three )
    call EnableTrigger( gg_trg_KingColor )
    set udg_Luffe = GetTriggerUnit()
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 12
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call SetPlayerAbilityAvailableBJ( false, 'A0J0', ConvertedPlayer(GetForLoopIndexA()) )
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    call DisableTrigger( GetTriggeringTrigger() )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "魯夫: 我睡覺也能吃東西" + "|r" ) ) )
endfunction

// --- InitTrig_Open_Skill_of_Luffe (family, line 36215) ---
function InitTrig_Open_Skill_of_Luffe takes nothing returns nothing
    set gg_trg_Open_Skill_of_Luffe = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_Luffe, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_Luffe, Condition( function Trig_Open_Skill_of_Luffe_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_Luffe, function Trig_Open_Skill_of_Luffe_Actions )
endfunction

// === family KingColor (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KingColor_Conditions (family, line 36828) ---
function Trig_KingColor_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZK' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KingColor_Func005Func001A (family, line 36836) ---
function Trig_KingColor_Func005Func001A takes nothing returns nothing
    if ( GetEnumUnit() != GetTriggerUnit() ) then
        call SetUnitLifeBJ( GetEnumUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetEnumUnit()) / 2.00 ) )
    else
    endif
endfunction

// --- Trig_KingColor_Func005C (family, line 36844) ---
function Trig_KingColor_Func005C takes nothing returns boolean

    if ( not ( GetUnitLifePercent(GetTriggerUnit()) <= 50.00 ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 2) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KingColor_Func008A (family, line 36856) ---
function Trig_KingColor_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KingColor_Actions (family, line 36861) ---
function Trig_KingColor_Actions takes nothing returns nothing
    local location Luff_UnitPoint
    local integer Luff_KingColorCont
    local unit Luff

    set Luff_UnitPoint = GetUnitLoc(GetTriggerUnit())
    set Luff = GetTriggerUnit()
    set Luff_KingColorCont = 1
    loop
        exitwhen Luff_KingColorCont > 10
        call CreateNUnitsAtLoc( 1, 'o009', GetOwningPlayer(Luff), Luff_UnitPoint, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 5.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0ZJ', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "impale", PolarProjectionBJ(Luff_UnitPoint, 256.00, ( I2R(Luff_KingColorCont) * 36.00 )) )
        set Luff_KingColorCont = Luff_KingColorCont + 1
    endloop
    if ( Trig_KingColor_Func005C() ) then
        call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, Luff_UnitPoint), function Trig_KingColor_Func005Func001A )
    else
    endif
    call RemoveLocation( Luff_UnitPoint )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(Luff), 'o009'), function Trig_KingColor_Func008A )
endfunction

// --- InitTrig_KingColor (family, line 36887) ---
function InitTrig_KingColor takes nothing returns nothing
    set gg_trg_KingColor = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KingColor, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KingColor, Condition( function Trig_KingColor_Conditions ) )
    call TriggerAddAction( gg_trg_KingColor, function Trig_KingColor_Actions )
endfunction

// === family Luf_Axe (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_Axe_Func001C (family, line 36239) ---
function Trig_Luf_Axe_Func001C takes nothing returns boolean
    if ( not ( GetSpellTargetUnit() != gg_unit_Utic_0117 ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A0IS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Axe_Conditions (family, line 36249) ---
function Trig_Luf_Axe_Conditions takes nothing returns boolean
    if ( not Trig_Luf_Axe_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Axe_Actions (family, line 36256) ---
function Trig_Luf_Axe_Actions takes nothing returns nothing
    set udg_Luff_Jump_Index = 0.00
    set udg_LuffAxeLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_Luff_ToDamUnit = GetTriggerUnit()
    set udg_Luff_Jump_Caster = GetSpellTargetUnit()
    set udg_Luff_P1 = GetUnitLoc(GetSpellTargetUnit())
    set udg_Luff_Jump_Angle = AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), GetUnitLoc(udg_Luff_Jump_Caster))
    set udg_Luff_P2 = PolarProjectionBJ(GetUnitLoc(udg_Luff_Jump_Caster), ( DistanceBetweenPoints(GetUnitLoc(udg_Luff_Jump_Caster), GetUnitLoc(udg_Luff_ToDamUnit)) * -2.00 ), udg_Luff_Jump_Angle)
    set udg_Luff_Axe_FinalPoint = GetUnitLoc(GetTriggerUnit())
    set udg_Luff_Jump_dDist = ( DistanceBetweenPoints(udg_Luff_P1, udg_Luff_P2) / 41.00 )
    call AddSpecialEffectTargetUnitBJ( "right foot", udg_Luff_ToDamUnit, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
    set udg_LufEffect[1] = GetLastCreatedEffectBJ()
    call PauseUnitBJ( true, udg_Luff_Jump_Caster )
    call PauseUnitBJ( true, udg_Luff_ToDamUnit )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_Luff_ToDamUnit), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLocFacingLocBJ( udg_Luff_ToDamUnit, PolarProjectionBJ(GetUnitLoc(udg_Luff_Jump_Caster), 100.00, udg_Luff_Jump_Angle), GetUnitLoc(udg_Luff_Jump_Caster) )
    call SetUnitAnimationWithRarity( udg_Luff_ToDamUnit, "spell", RARITY_RARE )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_Luff_Jump_Caster, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
    set udg_LufEffect[2] = GetLastCreatedEffectBJ()
    call UnitAddAbilityBJ( 'A0FZ', udg_Luff_ToDamUnit )
    call UnitAddAbilityBJ( 'A0FZ', udg_Luff_Jump_Caster )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_Luff_ToDamUnit), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitTimeScalePercent( udg_Luff_Jump_Caster, 40.00 )
    call SetUnitAnimation( udg_Luff_Jump_Caster, "death" )
    call EnableTrigger( gg_trg_Luf_Axe_Effect )
endfunction

// --- InitTrig_Luf_Axe (family, line 36286) ---
function InitTrig_Luf_Axe takes nothing returns nothing
    set gg_trg_Luf_Axe = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_Axe )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_Axe, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_Axe, Condition( function Trig_Luf_Axe_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_Axe, function Trig_Luf_Axe_Actions )
endfunction

// === family Luf_RockFire_D8 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_RockFire_D8_Conditions (family, line 36537) ---
function Trig_Luf_RockFire_D8_Conditions takes nothing returns boolean
    if ( not ( GetSpellTargetUnit() != gg_unit_Utic_0117 ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A0IP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_RockFire_D8_Actions (family, line 36547) ---
function Trig_Luf_RockFire_D8_Actions takes nothing returns nothing
    set udg_Luff_KnockBack_Index = 0
    set udg_Luff_KnockBack_Target = GetSpellTargetUnit()
    set udg_Luff_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Luff_P2 = GetUnitLoc(GetSpellTargetUnit())
    call TriggerSleepAction( 0.05 )
    set udg_Luff_KnockBack_Angle = AngleBetweenPoints(udg_Luff_P1, udg_Luff_P2)
    call AddSpecialEffectLocBJ( udg_Luff_P1, "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLocFacingLocBJ( udg_Luff_ToDamUnit, PolarProjectionBJ(udg_Luff_P2, -100.00, udg_Luff_KnockBack_Angle), udg_Luff_P2 )
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\NightElf\\Blink\\BlinkTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_4019", udg_Luff_ToDamUnit, 0, 14.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call SetUnitTimeScalePercent( udg_Luff_ToDamUnit, 300.00 )
    call SetUnitAnimation( udg_Luff_ToDamUnit, "Attack Slam" )
    call TriggerSleepAction( 0.10 )
    call SetUnitTimeScalePercent( udg_Luff_ToDamUnit, 100 )
    call UnitDamageTargetBJ( GetTriggerUnit(), udg_Luff_KnockBack_Target, udg_LufDamMath, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    call AddSpecialEffectTargetUnitBJ( "hand", udg_Luff_KnockBack_Target, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    set udg_LufEffect[3] = GetLastCreatedEffectBJ()
    call EnableTrigger( gg_trg_Luf_RockFire_Effect_D8 )
    call RemoveLocation(udg_Luff_P1)
    call RemoveLocation(udg_Luff_P2)
endfunction

// --- InitTrig_Luf_RockFire_D8 (family, line 36577) ---
function InitTrig_Luf_RockFire_D8 takes nothing returns nothing
    set gg_trg_Luf_RockFire_D8 = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_RockFire_D8 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_RockFire_D8, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_RockFire_D8, Condition( function Trig_Luf_RockFire_D8_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_RockFire_D8, function Trig_Luf_RockFire_D8_Actions )
endfunction

// === family Luf_Three (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_Three_Conditions (family, line 36651) ---
function Trig_Luf_Three_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RZ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Three_Actions (family, line 36658) ---
function Trig_Luf_Three_Actions takes nothing returns nothing
    set udg_Luffe_three_caster = GetTriggerUnit()
    set udg_Luffe_three_P1 = GetUnitLoc(udg_Luffe_three_caster)
    set udg_Luffe_three_Index = 0.00
    call PauseUnitBJ( true, udg_Luffe_three_caster )
    call UnitAddAbilityBJ( 'Avul', udg_Luffe_three_caster )
    call UnitAddAbilityBJ( 'Arav', udg_Luffe_three_caster )
    call UnitAddAbilityBJ( 'A0S1', udg_Luffe_three_caster )
    call SetUnitAnimation( udg_Luffe_three_caster, "attack slam" )
    call AddSpecialEffectLocBJ( udg_Luffe_three_P1, "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call EnableTrigger( gg_trg_Luf_Three_Effect )
endfunction

// --- InitTrig_Luf_Three (family, line 36673) ---
function InitTrig_Luf_Three takes nothing returns nothing
    set gg_trg_Luf_Three = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_Three )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_Three, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_Three, Condition( function Trig_Luf_Three_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_Three, function Trig_Luf_Three_Actions )
endfunction

// === family Luf_died (armed) events=none ===

// --- Trig_Luf_died_Actions (family, line 36225) ---
function Trig_Luf_died_Actions takes nothing returns nothing
    set udg_LufDamMath = 0.00
endfunction

// --- InitTrig_Luf_died (family, line 36230) ---
function InitTrig_Luf_died takes nothing returns nothing
    set gg_trg_Luf_died = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_died )
    call TriggerAddAction( gg_trg_Luf_died, function Trig_Luf_died_Actions )
endfunction

// === family Luf_gun (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_gun_Conditions (family, line 36402) ---
function Trig_Luf_gun_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_gun_Func009Func001C (family, line 36409) ---
function Trig_Luf_gun_Func009Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_gun_Func009A (family, line 36422) ---
function Trig_Luf_gun_Func009A takes nothing returns nothing
    if ( Trig_Luf_gun_Func009Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 200.00 ) + 200.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_Luf_gun_Actions (family, line 36432) ---
function Trig_Luf_gun_Actions takes nothing returns nothing
    set udg_LuffeFace = GetUnitFacing(udg_Luffe)
    set udg_LuffeUnit = GetTriggerUnit()
    call CreateTextTagUnitBJ( "TRIGSTR_3856", udg_Luffe, 0, 14.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call PlaySoundOnUnitBJ( gg_snd_WaterElementalMissile3, 100.00, GetTriggerUnit() )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(400.00, GetSpellTargetLoc()), function Trig_Luf_gun_Func009A )
    call PlaySoundOnUnitBJ( gg_snd_DemonHunterMissileHit3, 100.00, GetEnumUnit() )
endfunction

// --- InitTrig_Luf_gun (family, line 36446) ---
function InitTrig_Luf_gun takes nothing returns nothing
    set gg_trg_Luf_gun = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_gun )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_gun, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_gun, Condition( function Trig_Luf_gun_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_gun, function Trig_Luf_gun_Actions )
endfunction

// === family Luf_two_Effect (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_two_Effect_Func008001 (family, line 36457) ---
function Trig_Luf_two_Effect_Func008001 takes nothing returns boolean
    return ( GetSpellAbilityId() == 'A0IR' )
endfunction

// --- Trig_Luf_two_Effect_Func008002 (family, line 36461) ---
function Trig_Luf_two_Effect_Func008002 takes nothing returns boolean
    return ( GetSpellAbilityId() == 'A0IQ' )
endfunction

// --- Trig_Luf_two_Effect_Conditions (family, line 36465) ---
function Trig_Luf_two_Effect_Conditions takes nothing returns boolean
    if ( not GetBooleanOr( Trig_Luf_two_Effect_Func008001(), Trig_Luf_two_Effect_Func008002() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_two_Effect_Func003Func001C (family, line 36472) ---
function Trig_Luf_two_Effect_Func003Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00N' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_two_Effect_Func003Func002C (family, line 36479) ---
function Trig_Luf_two_Effect_Func003Func002C takes nothing returns boolean
    if ( not ( udg_LufDamMath < 0.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_two_Effect_Func003C (family, line 36486) ---
function Trig_Luf_two_Effect_Func003C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_two_Effect_Actions (family, line 36493) ---
function Trig_Luf_two_Effect_Actions takes nothing returns nothing
    set udg_Immediately_P1 = GetUnitLoc(GetTriggerUnit())
    call PlaySoundOnUnitBJ( gg_snd_TrollWoodWorksWhat1, 100.00, GetTriggerUnit() )
    if ( Trig_Luf_two_Effect_Func003C() ) then
        if ( Trig_Luf_two_Effect_Func003Func001C() ) then
            set udg_LufDamMath = ( udg_LufDamMath + ( 2.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Luffe, true)) ) )
        else
            set udg_LufDamMath = ( udg_LufDamMath - ( 2.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Luffe, true)) ) )
        endif
        if ( Trig_Luf_two_Effect_Func003Func002C() ) then
            set udg_LufDamMath = 0.00
        else
        endif
    else
        call DoNothing(  )
    endif
    call AddSpecialEffectLocBJ( udg_Immediately_P1, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call RemoveLocation(udg_Immediately_P1)
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 20
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        set udg_Immediately_P1 = GetUnitLoc(GetTriggerUnit())
        call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_Immediately_P1, ( 15.00 * I2R(GetForLoopIndexB()) ), ( 35.00 * I2R(GetForLoopIndexB()) )), "Environment\\LargeBuildingFire\\LargeBuildingFire1.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation(udg_Immediately_P1)
        call TriggerSleepAction( 0.01 )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_Luf_two_Effect (family, line 36526) ---
function InitTrig_Luf_two_Effect takes nothing returns nothing
    set gg_trg_Luf_two_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_two_Effect )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_two_Effect, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_two_Effect, Condition( function Trig_Luf_two_Effect_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_two_Effect, function Trig_Luf_two_Effect_Actions )
endfunction

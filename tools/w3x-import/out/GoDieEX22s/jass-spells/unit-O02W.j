// unit rawcode: O02W
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Open_Skill_of_LHC, HuashanSword, NineSwords, NineSwords_LVup, StarSucking

// === family Open_Skill_of_LHC (armed) events=none ===

// --- Trig_Open_Skill_of_LHC_Conditions (family, line 44756) ---
function Trig_Open_Skill_of_LHC_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O02W' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_Skill_of_LHC_Actions (family, line 44763) ---
function Trig_Open_Skill_of_LHC_Actions takes nothing returns nothing
    set udg_LHC_Hero = GetTriggerUnit()
    call EnableTrigger( gg_trg_HuashanSword )
    call EnableTrigger( gg_trg_StarSucking )
    call EnableTrigger( gg_trg_NineSwords )
    call EnableTrigger( gg_trg_NineSwords_LVup )
    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "令狐沖: 你們三個,是甚麼南北?" + "|r" ) ) )
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyTrigger(GetTriggeringTrigger())
endfunction

// --- InitTrig_Open_Skill_of_LHC (family, line 44775) ---
function InitTrig_Open_Skill_of_LHC takes nothing returns nothing
    set gg_trg_Open_Skill_of_LHC = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_Open_Skill_of_LHC, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Open_Skill_of_LHC, Condition( function Trig_Open_Skill_of_LHC_Conditions ) )
    call TriggerAddAction( gg_trg_Open_Skill_of_LHC, function Trig_Open_Skill_of_LHC_Actions )
endfunction

// === family HuashanSword (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_HuashanSword_Func003C (family, line 44785) ---
function Trig_HuashanSword_Func003C takes nothing returns boolean
    if ( ( GetUnitAbilityLevelSwapped('A0XS', GetAttacker()) > 0 ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetAttacker()) == 'o02X' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_HuashanSword_Conditions (family, line 44795) ---
function Trig_HuashanSword_Conditions takes nothing returns boolean
    if ( not Trig_HuashanSword_Func003C() ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttackedUnitBJ()), GetOwningPlayer(GetAttacker())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HuashanSword_Func002C (family, line 44808) ---
function Trig_HuashanSword_Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= udg_LHC_RandRang ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HuashanSword_Actions (family, line 44815) ---
function Trig_HuashanSword_Actions takes nothing returns nothing
    set udg_LHC_RandRang = ( 5 + ( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_LHC_Hero, true) / 15 ) )
    if ( Trig_HuashanSword_Func002C() ) then
        call AddSpecialEffectTargetUnitBJ( "weapon", GetAttacker(), "Abilities\\Spells\\Other\\Levelup\\LevelupCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call UnitDamageTargetBJ( GetAttacker(), GetAttackedUnitBJ(), ( ( 10.00 * I2R(GetUnitAbilityLevelSwapped('A0XS', udg_LHC_Hero)) ) + I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_LHC_Hero, true)) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
endfunction

// --- InitTrig_HuashanSword (family, line 44826) ---
function InitTrig_HuashanSword takes nothing returns nothing
    set gg_trg_HuashanSword = CreateTrigger(  )
    call DisableTrigger( gg_trg_HuashanSword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HuashanSword, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_HuashanSword, Condition( function Trig_HuashanSword_Conditions ) )
    call TriggerAddAction( gg_trg_HuashanSword, function Trig_HuashanSword_Actions )
endfunction

// === family NineSwords (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NineSwords_Conditions (family, line 44888) ---
function Trig_NineSwords_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSwords_Func006Func006C (family, line 44895) ---
function Trig_NineSwords_Func006Func006C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(udg_LHC_NS_Target) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSwords_Func010A (family, line 44902) ---
function Trig_NineSwords_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_NineSwords_Actions (family, line 44907) ---
function Trig_NineSwords_Actions takes nothing returns nothing
    set udg_LHC_Hero = GetTriggerUnit()
    set udg_LHC_NS_Target = GetSpellTargetUnit()
    set udg_LHC_NS_P1 = GetUnitLoc(GetSpellTargetUnit())
    set udg_LHC_NS_Count = 0
    set udg_LHC_NS_Count = 1
    loop
        exitwhen udg_LHC_NS_Count > 9
        call TriggerSleepAction( 0.04 )
        set udg_LHC_NS_P2 = PolarProjectionBJ(udg_LHC_NS_P1, 140.00, GetRandomDirectionDeg())
        call CreateNUnitsAtLoc( 1, 'o02X', GetOwningPlayer(udg_LHC_Hero), udg_LHC_NS_P1, GetUnitFacing(udg_LHC_Hero) )
        call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
        call SetUnitVertexColorBJ( GetLastCreatedUnit(), 0.00, 0.00, 100, 60.00 )
        if ( Trig_NineSwords_Func006Func006C() ) then
            call IssueTargetOrderBJ( GetLastCreatedUnit(), "attack", udg_LHC_NS_Target )
        else
        endif
        call RemoveLocation( udg_LHC_NS_P2)
        set udg_LHC_NS_Count = udg_LHC_NS_Count + 1
    endloop
    call RemoveLocation( udg_LHC_NS_P1)
    call TriggerSleepAction( 9.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_LHC_Hero), 'o02X'), function Trig_NineSwords_Func010A )
endfunction

// --- InitTrig_NineSwords (family, line 44933) ---
function InitTrig_NineSwords takes nothing returns nothing
    set gg_trg_NineSwords = CreateTrigger(  )
    call DisableTrigger( gg_trg_NineSwords )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NineSwords, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_NineSwords, Condition( function Trig_NineSwords_Conditions ) )
    call TriggerAddAction( gg_trg_NineSwords, function Trig_NineSwords_Actions )
endfunction

// === family NineSwords_LVup (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_NineSwords_LVup_Conditions (family, line 44944) ---
function Trig_NineSwords_LVup_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O02W' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSwords_LVup_Func002C (family, line 44951) ---
function Trig_NineSwords_LVup_Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0Y5', GetTriggerUnit()) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSwords_LVup_Actions (family, line 44958) ---
function Trig_NineSwords_LVup_Actions takes nothing returns nothing
    call SetPlayerTechResearchedSwap( 'Rome', GetUnitAbilityLevelSwapped('A0Y5', GetTriggerUnit()), GetOwningPlayer(GetTriggerUnit()) )
    if ( Trig_NineSwords_LVup_Func002C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_NineSwords_LVup (family, line 44968) ---
function InitTrig_NineSwords_LVup takes nothing returns nothing
    set gg_trg_NineSwords_LVup = CreateTrigger(  )
    call DisableTrigger( gg_trg_NineSwords_LVup )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NineSwords_LVup, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NineSwords_LVup, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_NineSwords_LVup, Condition( function Trig_NineSwords_LVup_Conditions ) )
    call TriggerAddAction( gg_trg_NineSwords_LVup, function Trig_NineSwords_LVup_Actions )
endfunction

// === family StarSucking (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_StarSucking_Conditions (family, line 44837) ---
function Trig_StarSucking_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y0' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StarSucking_Func004C (family, line 44844) ---
function Trig_StarSucking_Func004C takes nothing returns boolean
    if ( not ( OrderId2StringBJ(GetUnitCurrentOrder(udg_LHC_Hero)) == "channel" ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StarSucking_Actions (family, line 44851) ---
function Trig_StarSucking_Actions takes nothing returns nothing
    set udg_LHC_Hero = GetTriggerUnit()
    set udg_LHC_SS_Target = GetSpellTargetUnit()
    call TriggerSleepAction( 0.80 )
    if ( Trig_StarSucking_Func004C() ) then
        call SetUnitManaBJ( udg_LHC_SS_Target, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_LHC_SS_Target) - ( 200.00 * I2R(GetUnitAbilityLevelSwapped('A0Y0', udg_LHC_Hero)) ) ) )
        call SetUnitManaBJ( udg_LHC_Hero, ( GetUnitStateSwap(UNIT_STATE_MANA, udg_LHC_Hero) + ( 200.00 * I2R(GetUnitAbilityLevelSwapped('A0Y0', udg_LHC_Hero)) ) ) )
        call AddSpecialEffectTargetUnitBJ( "overhead", udg_LHC_Hero, "Abilities\\Weapons\\WingedSerpentMissile\\WingedSerpentMissile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_LHC_P1 = GetUnitLoc(udg_LHC_Hero)
        set udg_LHC_P2 = GetUnitLoc(udg_LHC_SS_Target)
        call CreateNUnitsAtLocFacingLocBJ( 1, 'hfoo', GetOwningPlayer(udg_LHC_Hero), udg_LHC_P1, udg_LHC_P2 )
        call UnitAddAbilityBJ( 'A0XW', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0XW', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0Y0', udg_LHC_Hero) )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", udg_LHC_SS_Target )
        call KillUnit( GetLastCreatedUnit() )
        call RemoveUnit( GetLastCreatedUnit() )
        call AddSpecialEffectLocBJ( udg_LHC_P2, "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation( udg_LHC_P1)
        call RemoveLocation( udg_LHC_P2)
    else
    endif
endfunction

// --- InitTrig_StarSucking (family, line 44877) ---
function InitTrig_StarSucking takes nothing returns nothing
    set gg_trg_StarSucking = CreateTrigger(  )
    call DisableTrigger( gg_trg_StarSucking )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_StarSucking, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_StarSucking, Condition( function Trig_StarSucking_Conditions ) )
    call TriggerAddAction( gg_trg_StarSucking, function Trig_StarSucking_Actions )
endfunction

// rawcode: A0TK
// nameZh: 89-02 憤怒的菊花
// w3a base: AHbh  levels: 4
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Saber_in_pandaChrysanthemum

// === family Saber_in_pandaChrysanthemum (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_Saber_in_pandaChrysanthemum_Conditions (family, line 52680) ---
function Trig_Saber_in_pandaChrysanthemum_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttackedUnitBJ()) == 'H02K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func005A (family, line 52687) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func005A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", GetEnumUnit() )
    call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_9436", GetEnumUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call SetUnitManaPercentBJ( GetEnumUnit(), ( GetUnitManaPercent(GetEnumUnit()) * 0.50 ) )
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func018A (family, line 52700) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func018A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func019A (family, line 52705) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func020A (family, line 52710) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004Func022C (family, line 52715) ---
function Trig_Saber_in_pandaChrysanthemum_Func004Func022C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 100) <= ( GetUnitAbilityLevelSwapped('A0TK', GetAttackedUnitBJ()) * 3 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Func004C (family, line 52722) ---
function Trig_Saber_in_pandaChrysanthemum_Func004C takes nothing returns boolean
    if ( not ( udg_Panda_AttackedTimes < 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaChrysanthemum_Actions (family, line 52729) ---
function Trig_Saber_in_pandaChrysanthemum_Actions takes nothing returns nothing
    set udg_PandaUnit = GetAttackedUnitBJ()
    set udg_Panda_AttackedTimes = ( udg_Panda_AttackedTimes + 1 )
    call SetUnitVertexColorBJ( GetAttackedUnitBJ(), ( 100.00 - I2R(( udg_Panda_AttackedTimes * 2 )) ), 100, ( 100.00 - I2R(( udg_Panda_AttackedTimes * 5 )) ), 0 )
    if ( Trig_Saber_in_pandaChrysanthemum_Func004C() ) then
        if ( Trig_Saber_in_pandaChrysanthemum_Func004Func022C() ) then
            set udg_P_fire = GetUnitLoc(GetAttacker())
            call CreateNUnitsAtLoc( 1, 'e00F', GetOwningPlayer(GetAttackedUnitBJ()), udg_P_fire, bj_UNIT_FACING )
            call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
            call RemoveUnitSP( GetLastCreatedUnit() , 0.50 , 1.00)
            call RemoveLocation( udg_P_fire )
            call UnitAddAbilityBJ( 'S006', GetLastCreatedUnit() )
            call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetAttacker(), 0 )
            call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", GetAttacker() )
            call PlaySoundOnUnitBJ( gg_snd_PandarenBrewmasterPissed8, 100, GetTriggerUnit() )
            call AddSpecialEffectTargetUnitBJ( "chest", GetAttacker(), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
        endif
    else
        set udg_P_fire = GetUnitLoc(GetAttackedUnitBJ())
        call CreateNUnitsAtLoc( 1, 'e00F', GetOwningPlayer(GetAttackedUnitBJ()), udg_P_fire, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'S006', GetLastCreatedUnit() )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(800.00, udg_P_fire), function Trig_Saber_in_pandaChrysanthemum_Func004Func005A )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_PandaUnit, "Abilities\\Weapons\\GlaiveMissile\\GlaiveMissileTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_PandaUnit, "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_PandaUnit, "Objects\\Spawnmodels\\Demon\\DemonSmallDeathExplode\\DemonSmallDeathExplode.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_PandaUnit, "Objects\\Spawnmodels\\Naga\\NagaBlood\\NagaBloodWindserpent.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call PlaySoundOnUnitBJ( gg_snd_PandarenBrewmasterPissed8, 100, GetTriggerUnit() )
        set udg_Panda_AttackedTimes = 0
        call SetUnitVertexColorBJ( GetDyingUnit(), 100.00, 100, 100.00, 0 )
        call TriggerSleepAction( 3.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PandaUnit), 'e00F'), function Trig_Saber_in_pandaChrysanthemum_Func004Func018A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PandaUnit), 'e00F'), function Trig_Saber_in_pandaChrysanthemum_Func004Func019A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PandaUnit), 'e00F'), function Trig_Saber_in_pandaChrysanthemum_Func004Func020A )
    endif
endfunction

// --- InitTrig_Saber_in_pandaChrysanthemum (family, line 52773) ---
function InitTrig_Saber_in_pandaChrysanthemum takes nothing returns nothing
    set gg_trg_Saber_in_pandaChrysanthemum = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaChrysanthemum )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Saber_in_pandaChrysanthemum, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Saber_in_pandaChrysanthemum, Condition( function Trig_Saber_in_pandaChrysanthemum_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaChrysanthemum, function Trig_Saber_in_pandaChrysanthemum_Actions )
endfunction

// --- RemoveUnitSP (helper, line 4847) ---
function RemoveUnitSP takes unit R_unit , real Life_Time , real Die_Time returns nothing
    local unit Last = bj_lastCreatedUnit
    local real Bj_Timer = bj_enumDestructableRadius
    local real Bj_Rand = bj_randomSubGroupChance
    set bj_lastCreatedUnit = R_unit
    set bj_enumDestructableRadius = Life_Time
    set bj_randomSubGroupChance = Die_Time
    call ExecuteFunc("RemoveUnitSP_Action")
    set bj_lastCreatedUnit = Last
    set bj_enumDestructableRadius = Bj_Timer
    set bj_randomSubGroupChance = Bj_Rand
endfunction

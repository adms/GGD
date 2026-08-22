// rawcode: A0M7
// nameZh: 45-01 火遁-豪火龍之術
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0}
// mana: {"1": 150, "2": 180, "3": 210, "4": 240}
// area: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ChoChuFireDro

// === family ChoChuFireDro (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ChoChuFireDro_Conditions (family, line 42096) ---
function Trig_ChoChuFireDro_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0M7' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChoChuFireDro_Func009A (family, line 42103) ---
function Trig_ChoChuFireDro_Func009A takes nothing returns nothing
    call SetUnitPositionLoc( GetEnumUnit(), udg_ChoChuTargetPoint )
endfunction

// --- Trig_ChoChuFireDro_Func015Func001C (family, line 42107) ---
function Trig_ChoChuFireDro_Func015Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(udg_ChoChuUnit), GetOwningPlayer(GetEnumUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChoChuFireDro_Func015A (family, line 42114) ---
function Trig_ChoChuFireDro_Func015A takes nothing returns nothing
    if ( Trig_ChoChuFireDro_Func015Func001C() ) then
        call UnitDamageTargetBJ( udg_ChoChuUnit, GetEnumUnit(), ( I2R(( udg_ChoChuSkill * 100 )) + ( 150.00 + I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_ChoChuUnit, true) * 2 )) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_ChoChuFireDro_Func017A (family, line 42124) ---
function Trig_ChoChuFireDro_Func017A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChoChuFireDro_Func019A (family, line 42129) ---
function Trig_ChoChuFireDro_Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChoChuFireDro_Func020A (family, line 42134) ---
function Trig_ChoChuFireDro_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChoChuFireDro_Func021A (family, line 42139) ---
function Trig_ChoChuFireDro_Func021A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChoChuFireDro_Actions (family, line 42144) ---
function Trig_ChoChuFireDro_Actions takes nothing returns nothing
    set udg_ChoChuUnit = GetTriggerUnit()
    set udg_ChoChuSkill = GetUnitAbilityLevelSwapped('A0M7', GetTriggerUnit())
    set udg_ChoChuTargetPoint = GetSpellTargetLoc()
    set udg_ChoChuPoint = GetUnitLoc(GetTriggerUnit())
    set udg_ChoChuCounter = 1
    loop
        exitwhen udg_ChoChuCounter > ( GetUnitAbilityLevelSwapped('A0M7', GetTriggerUnit()) * 1 )
        call CreateNUnitsAtLoc( 1, 'o020', GetOwningPlayer(GetTriggerUnit()), udg_ChoChuPoint, GetUnitFacing(GetTriggerUnit()) )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_ChoChuGroup )
        set udg_ChoChuCounter = udg_ChoChuCounter + 1
    endloop
    call CreateNUnitsAtLoc( 1, 'o021', GetOwningPlayer(GetTriggerUnit()), udg_ChoChuPoint, GetUnitFacing(GetTriggerUnit()) )
    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_ChoChuGroup )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_ChoChuGroup, function Trig_ChoChuFireDro_Func009A )
    call AddSpecialEffectLocBJ( udg_ChoChuTargetPoint, "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_ChoChuTargetPoint, bj_UNIT_FACING )
    call UnitAddAbilityBJ( 'Acht', GetLastCreatedUnit() )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "howlofterror" )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(330.00, udg_ChoChuTargetPoint), function Trig_ChoChuFireDro_Func015A )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_ChoChuGroup, function Trig_ChoChuFireDro_Func017A )
    call GroupClear( udg_ChoChuGroup )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ChoChuUnit), 'o020'), function Trig_ChoChuFireDro_Func019A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ChoChuUnit), 'o021'), function Trig_ChoChuFireDro_Func020A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ChoChuUnit), 'hfoo'), function Trig_ChoChuFireDro_Func021A )
endfunction

// --- InitTrig_ChoChuFireDro (family, line 42175) ---
function InitTrig_ChoChuFireDro takes nothing returns nothing
    set gg_trg_ChoChuFireDro = CreateTrigger(  )
    call DisableTrigger( gg_trg_ChoChuFireDro )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ChoChuFireDro, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ChoChuFireDro, Condition( function Trig_ChoChuFireDro_Conditions ) )
    call TriggerAddAction( gg_trg_ChoChuFireDro, function Trig_ChoChuFireDro_Actions )
endfunction

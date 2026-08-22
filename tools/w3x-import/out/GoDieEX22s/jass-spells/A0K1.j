// rawcode: A0K1
// nameZh: 53-01 獸王牙操彈
// w3a base: ANcs  levels: 4
// cooldown: {"1": 35.0, "2": 35.0, "3": 35.0, "4": 35.0}
// mana: {"1": 180, "2": 210, "3": 240, "4": 270}
// area: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: KaoLight

// === family KaoLight (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KaoLight_Conditions (family, line 40097) ---
function Trig_KaoLight_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0K1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KaoLight_Func008A (family, line 40104) ---
function Trig_KaoLight_Func008A takes nothing returns nothing
    call SetUnitPositionLoc( GetEnumUnit(), GetRandomLocInRect(RectFromCenterSizeBJ(udg_KaoCastPoint, 450.00, 450.00)) )
endfunction

// --- Trig_KaoLight_Func010A (family, line 40108) ---
function Trig_KaoLight_Func010A takes nothing returns nothing
    call SetUnitPositionLoc( GetEnumUnit(), GetRandomLocInRect(RectFromCenterSizeBJ(udg_KaoTarget, 250.00, 250.00)) )
endfunction

// --- Trig_KaoLight_Func013Func001C (family, line 40112) ---
function Trig_KaoLight_Func013Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(udg_KaoUnit), GetOwningPlayer(GetEnumUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KaoLight_Func013A (family, line 40119) ---
function Trig_KaoLight_Func013A takes nothing returns nothing
    if ( Trig_KaoLight_Func013Func001C() ) then
        call UnitDamageTargetBJ( udg_KaoUnit, GetEnumUnit(), udg_KaoDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_KaoLight_Func015A (family, line 40129) ---
function Trig_KaoLight_Func015A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KaoLight_Func016A (family, line 40134) ---
function Trig_KaoLight_Func016A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KaoLight_Actions (family, line 40139) ---
function Trig_KaoLight_Actions takes nothing returns nothing
    set udg_KaoSkill = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_KaoTarget = GetSpellTargetLoc()
    set udg_KaoUnit = GetTriggerUnit()
    set udg_KaoCastPoint = GetUnitLoc(GetTriggerUnit())
    set udg_KaoDamage = ( I2R(( udg_KaoSkill * 100 )) + ( 150.00 + I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, udg_KaoUnit, true) * 3 )) ) )
    set udg_KaoCounter = 1
    loop
        exitwhen udg_KaoCounter > ( udg_KaoSkill + 2 )
        call CreateNUnitsAtLoc( 1, 'o014', GetOwningPlayer(udg_KaoUnit), udg_KaoCastPoint, GetUnitFacing(udg_KaoUnit) )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_KaoGroup )
        set udg_KaoCounter = udg_KaoCounter + 1
    endloop
    call TriggerSleepAction( 0.05 )
    call ForGroupBJ( udg_KaoGroup, function Trig_KaoLight_Func008A )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_KaoGroup, function Trig_KaoLight_Func010A )
    call AddSpecialEffectLocBJ( udg_KaoTarget, "Abilities\\Spells\\Other\\Doom\\DoomDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_KaoTarget, 450.00, 450.00)), function Trig_KaoLight_Func013A )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_KaoGroup, function Trig_KaoLight_Func015A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_KaoUnit), 'o014'), function Trig_KaoLight_Func016A )
    call GroupClear( udg_KaoGroup )
endfunction

// --- InitTrig_KaoLight (family, line 40166) ---
function InitTrig_KaoLight takes nothing returns nothing
    set gg_trg_KaoLight = CreateTrigger(  )
    call DisableTrigger( gg_trg_KaoLight )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KaoLight, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KaoLight, Condition( function Trig_KaoLight_Conditions ) )
    call TriggerAddAction( gg_trg_KaoLight, function Trig_KaoLight_Actions )
endfunction

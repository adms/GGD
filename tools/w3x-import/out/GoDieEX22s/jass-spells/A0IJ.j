// rawcode: A0IJ
// nameZh: 45-03 千鳥
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 120, "2": 185, "3": 250, "4": 315}
// range: {"1": 700.0, "2": 700.0, "3": 700.0, "4": 700.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LightCut

// === family LightCut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightCut_Conditions (family, line 41777) ---
function Trig_LightCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCut_Func024A (family, line 41784) ---
function Trig_LightCut_Func024A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCut_Func025A (family, line 41789) ---
function Trig_LightCut_Func025A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCut_Actions (family, line 41794) ---
function Trig_LightCut_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_ZZ_LC_Caster = GetTriggerUnit()
    set udg_ZZ_LC_Target = GetSpellTargetUnit()
    set udg_ZZ_LC_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_ZZ_LC_P2 = GetUnitLoc(udg_ZZ_LC_Target)
    set udg_ZZ_LC_Damage = I2R(( ( ( GetHeroLevel(GetTriggerUnit()) * 20 ) + ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 200 ) ) + 200 ))
    set udg_ZZ_LC_Dist = ( 45.00 + ( I2R(GetUnitAbilityLevelSwapped('A0U7', GetTriggerUnit())) * 5.00 ) )
    set udg_ZZ_LC_Tolerance = ( 160.00 + ( I2R(GetUnitAbilityLevelSwapped('A0U7', GetTriggerUnit())) * 40.00 ) )
    set udg_ZZ_LC_Get = true
    set udg_ZZ_LC_Count = 0
    call AddSpecialEffectLocBJ( udg_ZZ_LC_P1, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A0I5', udg_ZZ_LC_Caster )
    call SetUnitAnimation( udg_ZZ_LC_Caster, "attack slam" )
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\Orc\\Purge\\PurgeBuffTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_ZZ_LC_Int = 1
    loop
        exitwhen udg_ZZ_LC_Int > 12
        set udg_ZZ_LC_P3 = PolarProjectionBJ(udg_ZZ_LC_P1, ( I2R(udg_ZZ_LC_Int) * 12.00 ), ( I2R(udg_ZZ_LC_Int) * 30.00 ))
        call CreateNUnitsAtLoc( 1, 'n00N', GetOwningPlayer(GetTriggerUnit()), udg_ZZ_LC_P3, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call RemoveLocation( udg_ZZ_LC_P3 )
        set udg_ZZ_LC_Int = udg_ZZ_LC_Int + 1
    endloop
    call RemoveLocation( udg_ZZ_LC_P1 )
    call TriggerSleepAction( 0.20 )
    call SetUnitPathing( udg_ZZ_LC_Caster, false )
    call EnableTrigger( gg_trg_LightCutRun )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'n00N'), function Trig_LightCut_Func024A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'o022'), function Trig_LightCut_Func025A )
endfunction

// --- InitTrig_LightCut (family, line 41830) ---
function InitTrig_LightCut takes nothing returns nothing
    set gg_trg_LightCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightCut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightCut, Condition( function Trig_LightCut_Conditions ) )
    call TriggerAddAction( gg_trg_LightCut, function Trig_LightCut_Actions )
endfunction

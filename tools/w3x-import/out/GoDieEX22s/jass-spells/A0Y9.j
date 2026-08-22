// rawcode: A0Y9
// nameZh: 95-04 藍色戰氣一百重天
// w3a base: Aprg  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 140, "2": 220, "3": 300}
// range: {"1": 200.0, "2": 200.0, "3": 200.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Hundred_Sky

// === family Hundred_Sky (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Hundred_Sky_Conditions (family, line 54596) ---
function Trig_Hundred_Sky_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y9' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hundred_Sky_Func003C (family, line 54603) ---
function Trig_Hundred_Sky_Func003C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_HEUnit, 'B04Y') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hundred_Sky_Func005C (family, line 54610) ---
function Trig_Hundred_Sky_Func005C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_HE_100_Target, 'B050') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Hundred_Sky_Actions (family, line 54617) ---
function Trig_Hundred_Sky_Actions takes nothing returns nothing
    set udg_HE_100_Target = GetSpellTargetUnit()
    set udg_HE_100_Damage = ( 300.00 + ( 300.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    if ( Trig_Hundred_Sky_Func003C() ) then
        set udg_HE_P = GetUnitLoc(GetTriggerUnit())
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_HEUnit), udg_HE_P, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0UT', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0UT', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A0Y9', GetTriggerUnit()) )
        call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
        call KillUnit( GetLastCreatedUnit() )
        call RemoveUnit( GetLastCreatedUnit() )
        call AddSpecialEffectLocBJ( udg_HE_P, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation( udg_HE_P )
    else
    endif
    call TriggerSleepAction( 0.00 )
    if ( Trig_Hundred_Sky_Func005C() ) then
        call UnitDamageTargetBJ( udg_HEUnit, udg_HE_100_Target, udg_HE_100_Damage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", udg_HE_100_Target, "Units\\NightElf\\Wisp\\WispExplode.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call AddSpecialEffectTargetUnitBJ( "overhead", udg_HE_100_Target, "Abilities\\Spells\\Human\\Avatar\\AvatarCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- InitTrig_Hundred_Sky (family, line 54646) ---
function InitTrig_Hundred_Sky takes nothing returns nothing
    set gg_trg_Hundred_Sky = CreateTrigger(  )
    call DisableTrigger( gg_trg_Hundred_Sky )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Hundred_Sky, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Hundred_Sky, Condition( function Trig_Hundred_Sky_Conditions ) )
    call TriggerAddAction( gg_trg_Hundred_Sky, function Trig_Hundred_Sky_Actions )
endfunction

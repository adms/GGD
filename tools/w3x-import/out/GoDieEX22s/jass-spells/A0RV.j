// rawcode: A0RV
// nameZh: 18-02 寄生種子
// w3a base: Alsh  levels: 4
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 30.0}
// mana: {"1": 80, "2": 105, "3": 130, "4": 155}
// range: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// area: {"1": 0.0}
// duration: {"1": 5.0, "2": 5.0, "3": 5.0, "4": 5.0}
// hero_duration: {"1": 5.0, "2": 5.0, "3": 5.0, "4": 5.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: plant

// === family plant (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_plant_Conditions (family, line 27875) ---
function Trig_plant_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_plant_Func005Func011Func001C (family, line 27882) ---
function Trig_plant_Func005Func011Func001C takes nothing returns boolean
    if ( not ( GetUnitLifePercent(udg_Fox_Unit) <= 50.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_plant_Func005Func011C (family, line 27889) ---
function Trig_plant_Func005Func011C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_Fox_Unit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_plant_Func005C (family, line 27896) ---
function Trig_plant_Func005C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_plantUnit, 'Blsh') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_plant_Func009A (family, line 27903) ---
function Trig_plant_Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_plant_Actions (family, line 27908) ---
function Trig_plant_Actions takes nothing returns nothing
    set udg_Fox_Unit = GetTriggerUnit()
    set udg_plantUnit = GetSpellTargetUnit()
    set udg_Fox_LV = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), udg_Fox_Unit)
    call TriggerSleepAction( 0.01 )
    if ( Trig_plant_Func005C() ) then
        call UnitDamageTargetBJ( udg_Fox_Unit, udg_plantUnit, 75.00, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call TriggerSleepAction( 5.00 )
        set udg_Fox_P = GetUnitLoc(udg_plantUnit)
        call CreateNUnitsAtLoc( 1, 'o00A', GetOwningPlayer(udg_Fox_Unit), udg_Fox_P, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 3.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A009', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A009', GetLastCreatedUnit(), udg_Fox_LV )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), udg_plantUnit, 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "entanglingroots", udg_plantUnit )
        if ( Trig_plant_Func005Func011C() ) then
            if ( Trig_plant_Func005Func011Func001C() ) then
                call PlaySoundOnUnitBJ( gg_snd_SpiritOfVengeanceYes3, 100, udg_Fox_Unit )
                set udg_plantDamage = ( GetUnitStateSwap(UNIT_STATE_MAX_LIFE, udg_plantUnit) * 0.80 )
                // 冒煙熔岩
                call AddSpecialEffectLocBJ( GetUnitLoc(udg_plantUnit), "Doodads\\Outland\\Rocks\\Outland_MagmaRock\\Outland_MagmaRock1.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
                // 裂縫噴焰
                call AddSpecialEffectLocBJ( GetUnitLoc(udg_plantUnit), "Doodads\\Barrens\\Rocks\\BarrensFissure\\BarrensFissure1.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
                // 植物
                call AddSpecialEffectLocBJ( GetUnitLoc(udg_plantUnit), "Doodads\\Outland\\Plants\\Outland_Plant\\Outland_Plant1.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
                call AddSpecialEffectLocBJ( GetUnitLoc(udg_plantUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            else
                set udg_plantDamage = ( GetUnitStateSwap(UNIT_STATE_MAX_LIFE, udg_plantUnit) * 0.40 )
                // 植物
                call AddSpecialEffectLocBJ( GetUnitLoc(udg_plantUnit), "Doodads\\Outland\\Plants\\Outland_Plant\\Outland_Plant1.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
                call AddSpecialEffectLocBJ( GetUnitLoc(udg_plantUnit), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            endif
            call UnitDamageTargetBJ( udg_Fox_Unit, udg_plantUnit, udg_plantDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_plantUnit, "BloodBreathStream.mdx" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_plantUnit, "Objects\\Spawnmodels\\Demon\\DemonLargeDeathExplode\\DemonLargeDeathExplode.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call CreateTextTagUnitBJ( ( I2S(R2I(udg_plantDamage)) + "!" ), udg_plantUnit, -30.00, 10.00, 30.00, 90.00, 0.00, 10.00 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        else
            call DoNothing(  )
        endif
    else
    endif
    call RemoveLocation( udg_Fox_P )
    call TriggerSleepAction( 2 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Fox_Unit), 'o00A'), function Trig_plant_Func009A )
endfunction

// --- InitTrig_plant (family, line 27969) ---
function InitTrig_plant takes nothing returns nothing
    set gg_trg_plant = CreateTrigger(  )
    call DisableTrigger( gg_trg_plant )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_plant, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_plant, Condition( function Trig_plant_Conditions ) )
    call TriggerAddAction( gg_trg_plant, function Trig_plant_Actions )
endfunction

// rawcode: A0CH
// nameZh: 65-03 魔法膨脹
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"2": 150, "3": 225, "4": 300}
// range: {"1": 550.0, "2": 550.0, "3": 550.0, "4": 550.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MagicUp

// === family MagicUp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MagicUp_Conditions (family, line 46912) ---
function Trig_MagicUp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CH' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicUp_Func011A (family, line 46919) ---
function Trig_MagicUp_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicUp_Actions (family, line 46924) ---
function Trig_MagicUp_Actions takes nothing returns nothing
    set udg_MoriyaUnit = GetTriggerUnit()
    set udg_MagicUp = GetSpellTargetUnit()
    call UnitDamageTargetBJ( GetTriggerUnit(), udg_MagicUp, ( ( GetUnitStateSwap(UNIT_STATE_MAX_MANA, udg_MagicUp) - GetUnitStateSwap(UNIT_STATE_MANA, udg_MagicUp) ) * ( I2R(GetUnitAbilityLevelSwapped('A0CH', GetTriggerUnit())) * 1.00 ) ), ATTACK_TYPE_MAGIC, DAMAGE_TYPE_NORMAL )
    call SetUnitManaPercentBJ( udg_MagicUp, 100 )
    call MoveRectToLoc( gg_rct_moriyasp, GetUnitLoc(GetTriggerUnit()) )
    call TerrainDeformationWaveBJ( 2.00, GetUnitLoc(GetSpellTargetUnit()), GetRectCenter(gg_rct_moriyasp), 500.00, 120.00, 0.50 )
    call CreateNUnitsAtLoc( 1, 'o00Q', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(udg_MagicUp), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
    call PlaySoundOnUnitBJ( gg_snd_Taunt, 100, GetTriggerUnit() )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoriyaUnit), 'o00Q'), function Trig_MagicUp_Func011A )
endfunction

// --- InitTrig_MagicUp (family, line 46939) ---
function InitTrig_MagicUp takes nothing returns nothing
    set gg_trg_MagicUp = CreateTrigger(  )
    call DisableTrigger( gg_trg_MagicUp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MagicUp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MagicUp, Condition( function Trig_MagicUp_Conditions ) )
    call TriggerAddAction( gg_trg_MagicUp, function Trig_MagicUp_Actions )
endfunction

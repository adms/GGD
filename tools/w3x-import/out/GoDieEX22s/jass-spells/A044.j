// rawcode: A044
// nameZh: 16-03 無無明亦無
// w3a base: AEmb  levels: 4
// cooldown: {"1": 40.0, "2": 40.0, "3": 40.0, "4": 40.0}
// mana: {"1": 115, "2": 165, "3": 215, "4": 265}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Empty

// === family Empty (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Empty_Conditions (family, line 31450) ---
function Trig_Empty_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A044' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Empty_Actions (family, line 31457) ---
function Trig_Empty_Actions takes nothing returns nothing
    set udg_GosofKingP = GetUnitLoc(udg_GosofKing)
    set udg_GosofKingCP = GetUnitLoc(GetSpellTargetUnit())
    set udg_GosofKingAG = AngleBetweenPoints(udg_GosofKingP, udg_GosofKingCP)
    set udg_GosofKingCU = GetSpellTargetUnit()
    call TriggerSleepAction( 0.50 )
    call CreateNUnitsAtLoc( 1, 'u018', GetOwningPlayer(udg_GosofKing), udg_GosofKingCP, udg_GosofKingAG )
    set udg_GosofKingEmptyUnit = GetLastCreatedUnit()
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_GosofKing), udg_GosofKingP, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0WP', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0WP', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A044', udg_GosofKing) )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "purge", udg_GosofKingCU )
    call UnitDamageTargetBJ( udg_GosofKing, udg_GosofKingCU, ( 200.00 + ( 150.00 * I2R(GetUnitAbilityLevelSwapped('A044', udg_GosofKing)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    call RemoveLocation(udg_GosofKingP)
    set udg_GosofKingP = PolarProjectionBJ(udg_GosofKingCP, 100.00, udg_GosofKingAG)
    call SetUnitPositionLocFacingBJ( udg_GosofKing, udg_GosofKingP, udg_GosofKingAG )
    call RemoveLocation(udg_GosofKingCP)
    call RemoveLocation(udg_GosofKingP)
    call TriggerSleepAction( 1.00 )
    call KillUnit( udg_GosofKingEmptyUnit )
    call RemoveUnit( udg_GosofKingEmptyUnit )
endfunction

// --- InitTrig_Empty (family, line 31484) ---
function InitTrig_Empty takes nothing returns nothing
    set gg_trg_Empty = CreateTrigger(  )
    call DisableTrigger( gg_trg_Empty )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Empty, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Empty, Condition( function Trig_Empty_Conditions ) )
    call TriggerAddAction( gg_trg_Empty, function Trig_Empty_Actions )
endfunction

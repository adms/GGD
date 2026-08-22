// rawcode: A05I
// nameZh: 44-04 心臟麻痺
// w3a base: ANbr  levels: 3
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0}
// mana: {"1": 150, "2": 250, "3": 350}
// area: {"1": 0.5, "2": 0.5, "3": 0.5}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: DeathHeart

// === family DeathHeart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DeathHeart_Conditions (family, line 42352) ---
function Trig_DeathHeart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05I' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathHeart_Actions (family, line 42359) ---
function Trig_DeathHeart_Actions takes nothing returns nothing
    set udg_DeathHeartDam = ( ( GetUnitStateSwap(UNIT_STATE_MAX_LIFE, udg_DeathUnit) * ( 0.05 + ( 0.10 * I2R(GetUnitAbilityLevelSwapped('A05I', GetTriggerUnit())) ) ) ) + 450.00 )
    call EnableTrigger( gg_trg_DeathHeartBuff )
    call CreateNUnitsAtLoc( 1, 'o002', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(udg_DeathUnit), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0EC', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0EC', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), udg_DeathUnit, 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "unholyfrenzy", udg_DeathUnit )
    call PlaySoundOnUnitBJ( gg_snd_GruntYesAttack3, 100, GetTriggerUnit() )
    call TriggerSleepAction( 1.00 )
    call DisableTrigger( gg_trg_DeathHeartBuff )
endfunction

// --- InitTrig_DeathHeart (family, line 42375) ---
function InitTrig_DeathHeart takes nothing returns nothing
    set gg_trg_DeathHeart = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathHeart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathHeart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DeathHeart, Condition( function Trig_DeathHeart_Conditions ) )
    call TriggerAddAction( gg_trg_DeathHeart, function Trig_DeathHeart_Actions )
endfunction

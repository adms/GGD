// rawcode: A0AF
// nameZh: 25-01 北斗懺悔拳
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0, "5": 8.0}
// mana: {"1": 90, "2": 120, "3": 150, "4": 325, "5": 85}
// range: {"1": 150.0, "2": 150.0, "3": 150.0, "4": 250.0, "5": 9999.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: YouDie

// === family YouDie (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_YouDie_Conditions (family, line 38571) ---
function Trig_YouDie_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0AF' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_YouDie_Func028Func003C (family, line 38578) ---
function Trig_YouDie_Func028Func003C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_YouDieKiller))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U00L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_YouDie_Func028C (family, line 38588) ---
function Trig_YouDie_Func028C takes nothing returns boolean
    if ( not Trig_YouDie_Func028Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_YouDie_Actions (family, line 38595) ---
function Trig_YouDie_Actions takes nothing returns nothing
    set udg_YouDieUnit = GetSpellTargetUnit()
    set udg_YouDieKiller = GetTriggerUnit()
    call CreateTextTagUnitBJ( "TRIGSTR_5735", udg_YouDieUnit, 0, 10.00, 100.00, 50.00, 50.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call TriggerSleepAction( 1.00 )
    call PlaySoundOnUnitBJ( gg_snd_PeonWhat2, 100.00, udg_YouDieKiller )
    call CreateTextTagUnitBJ( "TRIGSTR_5863", udg_YouDieUnit, 0, 10.00, 100.00, 50.00, 50.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 1.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call TriggerSleepAction( 1.00 )
    call PlaySoundOnUnitBJ( gg_snd_GruntWhat2, 100.00, udg_YouDieKiller )
    call CreateTextTagUnitBJ( "TRIGSTR_5864", udg_YouDieUnit, 0, 10.00, 100.00, 50.00, 50.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 1.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call TriggerSleepAction( 1.00 )
    call PlaySoundOnUnitBJ( gg_snd_PeonDeath, 100.00, udg_YouDieKiller )
    call AddSpecialEffectTargetUnitBJ( "body", udg_YouDieUnit, "Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'o001', GetOwningPlayer(udg_YouDieKiller), GetUnitLoc(udg_YouDieUnit), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.80, 'BTLF', GetLastCreatedUnit() )
    if ( Trig_YouDie_Func028C() ) then
        call UnitDamageTargetBJ( GetLastCreatedUnit(), udg_YouDieUnit, ( ( ( ( I2R(GetUnitAbilityLevelSwapped('A0AF', udg_YouDieKiller)) * 150.00 ) + 0.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_YouDieKiller, true)) * 9.00 ) ) + 0.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( GetLastCreatedUnit(), udg_YouDieUnit, ( ( ( ( I2R(GetUnitAbilityLevelSwapped('A0AF', udg_YouDieKiller)) * 150.00 ) + 0.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_YouDieKiller, true)) * 3.00 ) ) + 0.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call AddSpecialEffectTargetUnitBJ( "chest", udg_YouDieUnit, "Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_YouDieUnit, "death" )
endfunction

// --- InitTrig_YouDie (family, line 38634) ---
function InitTrig_YouDie takes nothing returns nothing
    set gg_trg_YouDie = CreateTrigger(  )
    call DisableTrigger( gg_trg_YouDie )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_YouDie, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_YouDie, Condition( function Trig_YouDie_Conditions ) )
    call TriggerAddAction( gg_trg_YouDie, function Trig_YouDie_Actions )
endfunction

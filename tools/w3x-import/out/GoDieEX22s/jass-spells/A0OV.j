// rawcode: A0OV
// nameZh: 94-01 北斗爆橘拳
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0, "5": 8.0}
// mana: {"1": 50, "2": 100, "3": 150, "4": 325, "5": 85}
// range: {"1": 150.0, "2": 150.0, "3": 150.0, "4": 250.0, "5": 9999.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Oran

// === family Oran (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Oran_Conditions (family, line 53840) ---
function Trig_Oran_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Oran_Func009C (family, line 53847) ---
function Trig_Oran_Func009C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_NM_Master, 'B04K') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Oran_Func010C (family, line 53854) ---
function Trig_Oran_Func010C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_NM_Master))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Oran_Actions (family, line 53861) ---
function Trig_Oran_Actions takes nothing returns nothing
    set udg_NM_OranCaster = GetSpellTargetUnit()
    call TextUse("北斗爆橘拳", udg_NM_OranCaster , 20 , 4 , 100,0,0)
    call PlaySoundOnUnitBJ( gg_snd_PeonDeath, 100.00, udg_NM_Master )
    call AddSpecialEffectTargetUnitBJ( "body", udg_NM_OranCaster, "Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'o001', GetOwningPlayer(udg_NM_Master), GetUnitLoc(udg_NM_OranCaster), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.80, 'BTLF', GetLastCreatedUnit() )
    call UnitDamageTargetBJ( udg_NM_Master, udg_NM_OranCaster, ( ( ( ( I2R(GetUnitAbilityLevelSwapped('A0OV', udg_NM_Master)) * 100.00 ) + 0.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_NM_Master, true)) * 2.00 ) ) + 0.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    if ( Trig_Oran_Func009C() ) then
        call UnitDamageTargetBJ( udg_NM_Master, udg_NM_OranCaster, ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_NM_Master, true)) * 1.50 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
    if ( Trig_Oran_Func010C() ) then
        call UnitDamageTargetBJ( udg_NM_Master, udg_NM_OranCaster, ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_NM_Master, true)) * 5.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
    endif
    call SetUnitLifeBJ( udg_NM_Master, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_NM_Master) + ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0OV', udg_NM_Master)) ) ) )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_NM_OranCaster, "Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_NM_OranCaster, "death" )
endfunction

// --- InitTrig_Oran (family, line 53885) ---
function InitTrig_Oran takes nothing returns nothing
    set gg_trg_Oran = CreateTrigger(  )
    call DisableTrigger( gg_trg_Oran )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Oran, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Oran, Condition( function Trig_Oran_Conditions ) )
    call TriggerAddAction( gg_trg_Oran, function Trig_Oran_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

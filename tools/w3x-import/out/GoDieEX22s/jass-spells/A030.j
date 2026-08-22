// rawcode: A030
// nameZh: 27-04 忍法暗殺奧義-飛燕閃
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 45.0}
// mana: {"1": 150, "2": 225, "3": 300, "4": 315}
// range: {"1": 450.0, "2": 450.0, "3": 450.0, "4": 285.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 4.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FlySwallow

// === family FlySwallow (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FlySwallow_Conditions (family, line 41649) ---
function Trig_FlySwallow_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A030' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FlySwallow_Func007C (family, line 41656) ---
function Trig_FlySwallow_Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_FlySwallowUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FlySwallow_Actions (family, line 41663) ---
function Trig_FlySwallow_Actions takes nothing returns nothing
    set udg_FlySwallowUnit = GetTriggerUnit()
    set udg_FlySwallowTarget = GetSpellTargetUnit()
    call UnitAddAbilityBJ( 'A0F3', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )
    call TriggerSleepAction( 0.10 )
    call SetUnitPositionLocFacingBJ( udg_FlySwallowUnit, PolarProjectionBJ(GetUnitLoc(udg_FlySwallowTarget), 150.00, AngleBetweenPoints(GetUnitLoc(udg_FlySwallowUnit), GetUnitLoc(udg_FlySwallowTarget))), GetUnitFacing(udg_FlySwallowUnit) )
    if ( Trig_FlySwallow_Func007C() ) then
        call UnitDamageTargetBJ( udg_FlySwallowUnit, udg_FlySwallowTarget, I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_FlySwallowUnit, true) * 6 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( udg_FlySwallowUnit, udg_FlySwallowTarget, I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_FlySwallowUnit, true) * 3 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call SetUnitVertexColorBJ( udg_FlySwallowUnit, 100.00, 100.00, 100.00, 0.00 )
    call TriggerSleepAction( 0.10 )
    call UnitRemoveAbilityBJ( 'A0F3', udg_FlySwallowUnit )
    call UnitRemoveAbilityBJ( 'A09P', udg_FlySwallowUnit )
endfunction

// --- InitTrig_FlySwallow (family, line 41682) ---
function InitTrig_FlySwallow takes nothing returns nothing
    set gg_trg_FlySwallow = CreateTrigger(  )
    call DisableTrigger( gg_trg_FlySwallow )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FlySwallow, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FlySwallow, Condition( function Trig_FlySwallow_Conditions ) )
    call TriggerAddAction( gg_trg_FlySwallow, function Trig_FlySwallow_Actions )
endfunction

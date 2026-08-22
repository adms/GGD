// rawcode: A0IS
// nameZh: 76-01 伸縮自如的橡膠戰斧
// w3a base: AEer  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 80, "2": 110, "3": 140, "4": 170}
// range: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Luf_Axe

// === family Luf_Axe (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_Axe_Func001C (family, line 36239) ---
function Trig_Luf_Axe_Func001C takes nothing returns boolean
    if ( not ( GetSpellTargetUnit() != gg_unit_Utic_0117 ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A0IS' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Axe_Conditions (family, line 36249) ---
function Trig_Luf_Axe_Conditions takes nothing returns boolean
    if ( not Trig_Luf_Axe_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Axe_Actions (family, line 36256) ---
function Trig_Luf_Axe_Actions takes nothing returns nothing
    set udg_Luff_Jump_Index = 0.00
    set udg_LuffAxeLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_Luff_ToDamUnit = GetTriggerUnit()
    set udg_Luff_Jump_Caster = GetSpellTargetUnit()
    set udg_Luff_P1 = GetUnitLoc(GetSpellTargetUnit())
    set udg_Luff_Jump_Angle = AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), GetUnitLoc(udg_Luff_Jump_Caster))
    set udg_Luff_P2 = PolarProjectionBJ(GetUnitLoc(udg_Luff_Jump_Caster), ( DistanceBetweenPoints(GetUnitLoc(udg_Luff_Jump_Caster), GetUnitLoc(udg_Luff_ToDamUnit)) * -2.00 ), udg_Luff_Jump_Angle)
    set udg_Luff_Axe_FinalPoint = GetUnitLoc(GetTriggerUnit())
    set udg_Luff_Jump_dDist = ( DistanceBetweenPoints(udg_Luff_P1, udg_Luff_P2) / 41.00 )
    call AddSpecialEffectTargetUnitBJ( "right foot", udg_Luff_ToDamUnit, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
    set udg_LufEffect[1] = GetLastCreatedEffectBJ()
    call PauseUnitBJ( true, udg_Luff_Jump_Caster )
    call PauseUnitBJ( true, udg_Luff_ToDamUnit )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_Luff_ToDamUnit), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLocFacingLocBJ( udg_Luff_ToDamUnit, PolarProjectionBJ(GetUnitLoc(udg_Luff_Jump_Caster), 100.00, udg_Luff_Jump_Angle), GetUnitLoc(udg_Luff_Jump_Caster) )
    call SetUnitAnimationWithRarity( udg_Luff_ToDamUnit, "spell", RARITY_RARE )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_Luff_Jump_Caster, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
    set udg_LufEffect[2] = GetLastCreatedEffectBJ()
    call UnitAddAbilityBJ( 'A0FZ', udg_Luff_ToDamUnit )
    call UnitAddAbilityBJ( 'A0FZ', udg_Luff_Jump_Caster )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_Luff_ToDamUnit), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitTimeScalePercent( udg_Luff_Jump_Caster, 40.00 )
    call SetUnitAnimation( udg_Luff_Jump_Caster, "death" )
    call EnableTrigger( gg_trg_Luf_Axe_Effect )
endfunction

// --- InitTrig_Luf_Axe (family, line 36286) ---
function InitTrig_Luf_Axe takes nothing returns nothing
    set gg_trg_Luf_Axe = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_Axe )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_Axe, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_Axe, Condition( function Trig_Luf_Axe_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_Axe, function Trig_Luf_Axe_Actions )
endfunction

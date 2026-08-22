// rawcode: A0IP
// nameZh: 76-02 伸縮自如的橡膠火箭砲
// w3a base: AHtb  levels: 4
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0}
// mana: {"1": 65, "2": 95, "3": 125, "4": 155}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Luf_RockFire_D8

// === family Luf_RockFire_D8 (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_RockFire_D8_Conditions (family, line 36537) ---
function Trig_Luf_RockFire_D8_Conditions takes nothing returns boolean
    if ( not ( GetSpellTargetUnit() != gg_unit_Utic_0117 ) ) then
        return false
    endif
    if ( not ( GetSpellAbilityId() == 'A0IP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_RockFire_D8_Actions (family, line 36547) ---
function Trig_Luf_RockFire_D8_Actions takes nothing returns nothing
    set udg_Luff_KnockBack_Index = 0
    set udg_Luff_KnockBack_Target = GetSpellTargetUnit()
    set udg_Luff_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_Luff_P2 = GetUnitLoc(GetSpellTargetUnit())
    call TriggerSleepAction( 0.05 )
    set udg_Luff_KnockBack_Angle = AngleBetweenPoints(udg_Luff_P1, udg_Luff_P2)
    call AddSpecialEffectLocBJ( udg_Luff_P1, "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLocFacingLocBJ( udg_Luff_ToDamUnit, PolarProjectionBJ(udg_Luff_P2, -100.00, udg_Luff_KnockBack_Angle), udg_Luff_P2 )
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\NightElf\\Blink\\BlinkTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_4019", udg_Luff_ToDamUnit, 0, 14.00, 100, 0.00, 0.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call SetUnitTimeScalePercent( udg_Luff_ToDamUnit, 300.00 )
    call SetUnitAnimation( udg_Luff_ToDamUnit, "Attack Slam" )
    call TriggerSleepAction( 0.10 )
    call SetUnitTimeScalePercent( udg_Luff_ToDamUnit, 100 )
    call UnitDamageTargetBJ( GetTriggerUnit(), udg_Luff_KnockBack_Target, udg_LufDamMath, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    call AddSpecialEffectTargetUnitBJ( "hand", udg_Luff_KnockBack_Target, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    set udg_LufEffect[3] = GetLastCreatedEffectBJ()
    call EnableTrigger( gg_trg_Luf_RockFire_Effect_D8 )
    call RemoveLocation(udg_Luff_P1)
    call RemoveLocation(udg_Luff_P2)
endfunction

// --- InitTrig_Luf_RockFire_D8 (family, line 36577) ---
function InitTrig_Luf_RockFire_D8 takes nothing returns nothing
    set gg_trg_Luf_RockFire_D8 = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_RockFire_D8 )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_RockFire_D8, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_RockFire_D8, Condition( function Trig_Luf_RockFire_D8_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_RockFire_D8, function Trig_Luf_RockFire_D8_Actions )
endfunction

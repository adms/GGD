// rawcode: A0ET
// nameZh: 74-02 八刀一閃
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 50.0}
// mana: {"1": 150, "2": 180, "3": 210, "4": 275}
// range: {"1": 850.0, "2": 850.0, "3": 850.0, "4": 9999.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: OneCut

// === family OneCut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_OneCut_Conditions (family, line 48378) ---
function Trig_OneCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ET' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_OneCut_Actions (family, line 48385) ---
function Trig_OneCut_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_SephUnit = GetTriggerUnit()
    set udg_OneCutCastPoint = GetSpellTargetLoc()
    set udg_OneCutPoint = GetUnitLoc(GetTriggerUnit())
    set udg_OneCutLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_OneCutCounter = 1
    set udg_OneCutDist = ( DistanceBetweenPoints(udg_OneCutCastPoint, udg_OneCutPoint) / 50.00 )
    call AddSpecialEffectLocBJ( udg_OneCutPoint, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A05U', udg_SephUnit )
    call PlaySoundOnUnitBJ( gg_snd_SnapDragonMissileLaunch1, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( 0.10 )
    call SetUnitPathing( udg_SephUnit, false )
    call EnableTrigger( gg_trg_OneCutMove )
    set udg_SupernovaStart = true
endfunction

// --- InitTrig_OneCut (family, line 48404) ---
function InitTrig_OneCut takes nothing returns nothing
    set gg_trg_OneCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_OneCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_OneCut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_OneCut, Condition( function Trig_OneCut_Conditions ) )
    call TriggerAddAction( gg_trg_OneCut, function Trig_OneCut_Actions )
endfunction

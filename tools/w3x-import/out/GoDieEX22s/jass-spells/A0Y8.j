// rawcode: A0Y8
// nameZh: 95-03 皇者戰氣第五十重天
// w3a base: Alsh  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 120, "2": 160, "3": 200, "4": 240}
// range: {"1": 1300.0, "2": 1300.0, "3": 1300.0, "4": 1300.0}
// area: {"1": 0.0}
// duration: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 0.5}
// hero_duration: {"1": 0.5, "2": 0.5, "3": 0.5, "4": 0.5}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Fifty_Sky

// === family Fifty_Sky (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Fifty_Sky_Conditions (family, line 54435) ---
function Trig_Fifty_Sky_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Y8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Fifty_Sky_Actions (family, line 54442) ---
function Trig_Fifty_Sky_Actions takes nothing returns nothing
    set udg_HE_50_Target = GetSpellTargetUnit()
    set udg_HE_50_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_HE_50_P2 = GetUnitLoc(udg_HE_50_Target)
    set udg_HE_50_slv = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_HE_50_Counter = 0
    set udg_HE_50_Damage = 0.00
    set udg_HE_50_Dist = R2I(( DistanceBetweenPoints(udg_HE_50_P1, udg_HE_50_P2) / 50.00 ))
    set udg_HE_50_Get = false
    call AddSpecialEffectLocBJ( udg_KniSkillPoint, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A0YI', udg_HEUnit )
    call SetUnitAnimation( udg_HEUnit, "walk" )
    call TriggerSleepAction( 0.00 )
    call SetUnitPathing( udg_HEUnit, false )
    call EnableTrigger( gg_trg_Fifty_Sky_Effect )
endfunction

// --- InitTrig_Fifty_Sky (family, line 54461) ---
function InitTrig_Fifty_Sky takes nothing returns nothing
    set gg_trg_Fifty_Sky = CreateTrigger(  )
    call DisableTrigger( gg_trg_Fifty_Sky )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Fifty_Sky, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Fifty_Sky, Condition( function Trig_Fifty_Sky_Conditions ) )
    call TriggerAddAction( gg_trg_Fifty_Sky, function Trig_Fifty_Sky_Actions )
endfunction

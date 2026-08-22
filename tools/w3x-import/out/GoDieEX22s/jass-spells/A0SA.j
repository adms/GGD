// rawcode: A0SA
// nameZh: 44-002 交換筆記本
// w3a base: AHtb  levels: 1
// cooldown: {"1": 45.0, "2": 60.0, "3": 60.0, "4": 45.0}
// mana: {"1": 350, "2": 225, "3": 300, "4": 315}
// range: {"2": 450.0, "3": 450.0, "4": 285.0}
// duration: {"1": 0.20000000298023224, "2": 1.0, "3": 1.0, "4": 4.0}
// hero_duration: {"1": 0.20000000298023224, "2": 1.0, "3": 1.0, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ChangeNote

// === family ChangeNote (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ChangeNote_Conditions (family, line 42420) ---
function Trig_ChangeNote_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0SA' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChangeNote_Actions (family, line 42427) ---
function Trig_ChangeNote_Actions takes nothing returns nothing
    set udg_tempHP = GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit())
    call SetUnitLifeBJ( GetTriggerUnit(), GetUnitStateSwap(UNIT_STATE_LIFE, GetSpellTargetUnit()) )
    call SetUnitLifeBJ( GetSpellTargetUnit(), udg_tempHP )
    set udg_DeathUnit = null
    call CreateTextTagUnitBJ( ( GetUnitName(udg_DeathUnit) + " 我們來交換日記吧~" ), GetSpellTargetUnit(), 0, 10.00, 80.00, 80.00, 80.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.70 )
    call PlaySoundOnUnitBJ( gg_snd_KaelYesAttack3, 100, GetTriggerUnit() )
endfunction

// --- InitTrig_ChangeNote (family, line 42441) ---
function InitTrig_ChangeNote takes nothing returns nothing
    set gg_trg_ChangeNote = CreateTrigger(  )
    call DisableTrigger( gg_trg_ChangeNote )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ChangeNote, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ChangeNote, Condition( function Trig_ChangeNote_Conditions ) )
    call TriggerAddAction( gg_trg_ChangeNote, function Trig_ChangeNote_Actions )
endfunction

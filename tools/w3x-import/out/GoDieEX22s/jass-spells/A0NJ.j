// rawcode: A0NJ
// nameZh: 49-00 撲殺爪擊
// w3a base: AHtb  levels: 1
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 150, "2": 120, "3": 170, "4": 220}
// range: {"1": 100.0}
// duration: {"1": 1.5, "2": 1.0, "3": 1.5, "4": 2.0}
// hero_duration: {"1": 1.5, "2": 1.0, "3": 1.5, "4": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: KillAtk

// === family KillAtk (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KillAtk_Conditions (family, line 46427) ---
function Trig_KillAtk_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0NJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KillAtk_Actions (family, line 46434) ---
function Trig_KillAtk_Actions takes nothing returns nothing
    set udg_P0 = GetUnitLoc(GetSpellTargetUnit())
    call AddSpecialEffectLocBJ( udg_P0, "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call RemoveLocation( udg_P0)
    call TextUse("你別過來!", GetSpellTargetUnit() , 10 , 2 , 100,0,0)
    call AddSpecialEffectTargetUnitBJ( "overhead", GetSpellTargetUnit(), "Abilities\\Spells\\Other\\TalkToMe\\TalkToMe.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
endfunction

// --- InitTrig_KillAtk (family, line 46445) ---
function InitTrig_KillAtk takes nothing returns nothing
    set gg_trg_KillAtk = CreateTrigger(  )
    call DisableTrigger( gg_trg_KillAtk )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KillAtk, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KillAtk, Condition( function Trig_KillAtk_Conditions ) )
    call TriggerAddAction( gg_trg_KillAtk, function Trig_KillAtk_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

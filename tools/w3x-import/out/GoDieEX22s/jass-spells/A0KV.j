// rawcode: A0KV
// nameZh: 90-00 寄生種子
// w3a base: AEsh  levels: 1
// cooldown: {"1": 45.0}
// mana: {"1": 100}
// duration: {"1": 5.099999904632568}
// hero_duration: {"1": 5.099999904632568}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Parasitism_Seed

// === family Parasitism_Seed (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Parasitism_Seed_Conditions (family, line 26584) ---
function Trig_Parasitism_Seed_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Parasitism_Seed_Func003Func002C (family, line 26591) ---
function Trig_Parasitism_Seed_Func003Func002C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_Frog_Seed_Target, 'B04X') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Parasitism_Seed_Actions (family, line 26598) ---
function Trig_Parasitism_Seed_Actions takes nothing returns nothing
    set udg_Frog_Hero = GetTriggerUnit()
    set udg_Frog_Seed_Target = GetSpellTargetUnit()
    set udg_Frog_Seed_Index = 1
    loop
        exitwhen udg_Frog_Seed_Index > 5
        call TriggerSleepAction( 0.95 )
        if ( Trig_Parasitism_Seed_Func003Func002C() ) then
            call AddSpecialEffectTargetUnitBJ( "origin", udg_Frog_Hero, "Abilities\\Spells\\Human\\Heal\\HealTarget.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitLifeBJ( udg_Frog_Hero, ( GetUnitStateSwap(UNIT_STATE_LIFE, udg_Frog_Hero) + 50.00 ) )
        else
            return
        endif
        set udg_Frog_Seed_Index = udg_Frog_Seed_Index + 1
    endloop
endfunction

// --- InitTrig_Parasitism_Seed (family, line 26617) ---
function InitTrig_Parasitism_Seed takes nothing returns nothing
    set gg_trg_Parasitism_Seed = CreateTrigger(  )
    call DisableTrigger( gg_trg_Parasitism_Seed )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Parasitism_Seed, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Parasitism_Seed, Condition( function Trig_Parasitism_Seed_Conditions ) )
    call TriggerAddAction( gg_trg_Parasitism_Seed, function Trig_Parasitism_Seed_Actions )
endfunction

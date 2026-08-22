// rawcode: A0IH
// nameZh: 18-03 妖狐變化
// w3a base: AEIl  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 200, "2": 300, "3": 400, "4": 500}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 8.0, "2": 12.0, "3": 16.0, "4": 20.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Gorama

// === family Gorama (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Gorama_Conditions (family, line 28156) ---
function Trig_Gorama_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IH' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Gorama_Actions (family, line 28163) ---
function Trig_Gorama_Actions takes nothing returns nothing
    set udg_Fox_Unit = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_AltarOfEldersWhat1, 100.00, GetTriggerUnit() )
    call MoveRectToLoc( gg_rct_Gorama, GetUnitLoc(GetTriggerUnit()) )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 10
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call AddSpecialEffectLocBJ( GetRandomLocInRect(gg_rct_Gorama), "Abilities\\Spells\\Undead\\Unsummon\\UnsummonTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_Gorama (family, line 28178) ---
function InitTrig_Gorama takes nothing returns nothing
    set gg_trg_Gorama = CreateTrigger(  )
    call DisableTrigger( gg_trg_Gorama )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Gorama, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Gorama, Condition( function Trig_Gorama_Conditions ) )
    call TriggerAddAction( gg_trg_Gorama, function Trig_Gorama_Actions )
endfunction

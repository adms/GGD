// rawcode: A076
// nameZh: 雅典娜的驚嘆號
// cooldown: {"1": 60.0}
// mana: {"1": 480}
// area: {"1": 900.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AtheaAttatk

// === family AtheaAttatk (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AtheaAttatk_Func001Func001Func001C (family, line 24522) ---
function Trig_AtheaAttatk_Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07R' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AtheaAttatk_Func001Func001C (family, line 24529) ---
function Trig_AtheaAttatk_Func001Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A076' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AtheaAttatk_Func001C (family, line 24536) ---
function Trig_AtheaAttatk_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A004' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AtheaAttatk_Actions (family, line 24543) ---
function Trig_AtheaAttatk_Actions takes nothing returns nothing
    if ( Trig_AtheaAttatk_Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * 3.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Objects\\Spawnmodels\\Naga\\NagaDeath\\NagaDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        if ( Trig_AtheaAttatk_Func001Func001C() ) then
            call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * 6.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Objects\\Spawnmodels\\Naga\\NagaDeath\\NagaDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
            if ( Trig_AtheaAttatk_Func001Func001Func001C() ) then
                call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), ( I2R(GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true)) * 9.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
                call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Objects\\Spawnmodels\\Naga\\NagaDeath\\NagaDeath.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            else
            endif
        endif
    endif
endfunction

// --- InitTrig_AtheaAttatk (family, line 24565) ---
function InitTrig_AtheaAttatk takes nothing returns nothing
    set gg_trg_AtheaAttatk = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AtheaAttatk, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddAction( gg_trg_AtheaAttatk, function Trig_AtheaAttatk_Actions )
endfunction

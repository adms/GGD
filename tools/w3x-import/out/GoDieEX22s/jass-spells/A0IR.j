// rawcode: A0IR
// nameZh: 76-00 二檔
// cooldown: {"1": 60.0}
// mana: {"1": 0}
// duration: {"1": 0.10000000149011612}
// hero_duration: {"1": 20.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Luf_two_Effect

// === family Luf_two_Effect (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_two_Effect_Func008001 (family, line 36457) ---
function Trig_Luf_two_Effect_Func008001 takes nothing returns boolean
    return ( GetSpellAbilityId() == 'A0IR' )
endfunction

// --- Trig_Luf_two_Effect_Func008002 (family, line 36461) ---
function Trig_Luf_two_Effect_Func008002 takes nothing returns boolean
    return ( GetSpellAbilityId() == 'A0IQ' )
endfunction

// --- Trig_Luf_two_Effect_Conditions (family, line 36465) ---
function Trig_Luf_two_Effect_Conditions takes nothing returns boolean
    if ( not GetBooleanOr( Trig_Luf_two_Effect_Func008001(), Trig_Luf_two_Effect_Func008002() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_two_Effect_Func003Func001C (family, line 36472) ---
function Trig_Luf_two_Effect_Func003Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00N' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_two_Effect_Func003Func002C (family, line 36479) ---
function Trig_Luf_two_Effect_Func003Func002C takes nothing returns boolean
    if ( not ( udg_LufDamMath < 0.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_two_Effect_Func003C (family, line 36486) ---
function Trig_Luf_two_Effect_Func003C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_two_Effect_Actions (family, line 36493) ---
function Trig_Luf_two_Effect_Actions takes nothing returns nothing
    set udg_Immediately_P1 = GetUnitLoc(GetTriggerUnit())
    call PlaySoundOnUnitBJ( gg_snd_TrollWoodWorksWhat1, 100.00, GetTriggerUnit() )
    if ( Trig_Luf_two_Effect_Func003C() ) then
        if ( Trig_Luf_two_Effect_Func003Func001C() ) then
            set udg_LufDamMath = ( udg_LufDamMath + ( 2.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Luffe, true)) ) )
        else
            set udg_LufDamMath = ( udg_LufDamMath - ( 2.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Luffe, true)) ) )
        endif
        if ( Trig_Luf_two_Effect_Func003Func002C() ) then
            set udg_LufDamMath = 0.00
        else
        endif
    else
        call DoNothing(  )
    endif
    call AddSpecialEffectLocBJ( udg_Immediately_P1, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call RemoveLocation(udg_Immediately_P1)
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 20
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        set udg_Immediately_P1 = GetUnitLoc(GetTriggerUnit())
        call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_Immediately_P1, ( 15.00 * I2R(GetForLoopIndexB()) ), ( 35.00 * I2R(GetForLoopIndexB()) )), "Environment\\LargeBuildingFire\\LargeBuildingFire1.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation(udg_Immediately_P1)
        call TriggerSleepAction( 0.01 )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_Luf_two_Effect (family, line 36526) ---
function InitTrig_Luf_two_Effect takes nothing returns nothing
    set gg_trg_Luf_two_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_two_Effect )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_two_Effect, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_two_Effect, Condition( function Trig_Luf_two_Effect_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_two_Effect, function Trig_Luf_two_Effect_Actions )
endfunction

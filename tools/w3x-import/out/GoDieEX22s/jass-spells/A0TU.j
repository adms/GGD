// rawcode: A0TU
// nameZh: 89-002 俄羅斯輪盤
// w3a base: AHtb  levels: 1
// cooldown: {"1": 1.0, "2": 60.0, "3": 60.0, "4": 45.0}
// mana: {"1": 50, "2": 225, "3": 300, "4": 315}
// range: {"1": 350.0, "2": 450.0, "3": 450.0, "4": 285.0}
// duration: {"1": 0.009999999776482582, "2": 1.0, "3": 1.0, "4": 4.0}
// hero_duration: {"1": 0.009999999776482582, "2": 1.0, "3": 1.0, "4": 4.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Saber_in_pandaEX

// === family Saber_in_pandaEX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Saber_in_pandaEX_Conditions (family, line 52855) ---
function Trig_Saber_in_pandaEX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0TU' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Func003Func001Func009C (family, line 52862) ---
function Trig_Saber_in_pandaEX_Func003Func001Func009C takes nothing returns boolean
    if ( not ( GetRandomInt(0, 1) == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Func003Func001C (family, line 52869) ---
function Trig_Saber_in_pandaEX_Func003Func001C takes nothing returns boolean
    if ( not ( udg_PandaRandom == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Func003Func005C (family, line 52876) ---
function Trig_Saber_in_pandaEX_Func003Func005C takes nothing returns boolean
    if ( not ( GetRandomInt(0, 1) == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Func003C (family, line 52883) ---
function Trig_Saber_in_pandaEX_Func003C takes nothing returns boolean
    if ( not ( udg_PandaRandom == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Saber_in_pandaEX_Actions (family, line 52890) ---
function Trig_Saber_in_pandaEX_Actions takes nothing returns nothing
    set udg_PandaRandom = GetRandomInt(1, 6)
    if ( Trig_Saber_in_pandaEX_Func003C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetTriggerUnit(), 99999.00, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
        call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "Units\\Undead\\Abomination\\AbominationExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        if ( Trig_Saber_in_pandaEX_Func003Func005C() ) then
            call CreateTextTagUnitBJ( "TRIGSTR_4993", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
        else
            call CreateTextTagUnitBJ( "TRIGSTR_5313", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
        endif
    else
        if ( Trig_Saber_in_pandaEX_Func003Func001C() ) then
            call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), 99999.00, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
            call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Units\\Undead\\Abomination\\AbominationExplosion.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            if ( Trig_Saber_in_pandaEX_Func003Func001Func009C() ) then
                call CreateTextTagUnitBJ( "TRIGSTR_6575", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
                call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
                call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
                call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
                call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            else
                call CreateTextTagUnitBJ( "TRIGSTR_6574", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
                call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
                call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
                call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
                call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
                call PlaySoundOnUnitBJ( gg_snd_MortarImpact, 100, GetTriggerUnit() )
            endif
        else
            call CreateTextTagUnitBJ( "TRIGSTR_6576", GetTriggerUnit(), 0, 12.00, 100, 0.00, 0.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        endif
    endif
endfunction

// --- InitTrig_Saber_in_pandaEX (family, line 52952) ---
function InitTrig_Saber_in_pandaEX takes nothing returns nothing
    set gg_trg_Saber_in_pandaEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_Saber_in_pandaEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Saber_in_pandaEX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Saber_in_pandaEX, Condition( function Trig_Saber_in_pandaEX_Conditions ) )
    call TriggerAddAction( gg_trg_Saber_in_pandaEX, function Trig_Saber_in_pandaEX_Actions )
endfunction

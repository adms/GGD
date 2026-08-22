// rawcode: A0DZ
// nameZh: 20-01 風王結界
// w3a base: ANrg  levels: 3
// mana: {"1": 0, "2": 0, "3": 0, "4": 0}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Air

// === family Air (passive) events=none ===

// --- Trig_Air_Func001C (family, line 32088) ---
function Trig_Air_Func001C takes nothing returns boolean
    if ( not ( udg_AUD_DamagedUnit != null ) ) then
        return false
    endif
    if ( not ( GetUnitStateSwap(UNIT_STATE_MANA, GetEventDamageSource()) >= ( 15.00 + ( 15.00 * I2R(GetUnitAbilityLevelSwapped('A0DZ', GetEventDamageSource())) ) ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Air_Actions (family, line 32098) ---
function Trig_Air_Actions takes nothing returns nothing
    if ( Trig_Air_Func001C() ) then
        set udg_AUD_DamagedUnit = null
        set udg_SaberAirDamage = ( 10.00 + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetEventDamageSource(), true)) * ( 0.50 + ( I2R(GetUnitAbilityLevelSwapped('A0DZ', GetEventDamageSource())) * 0.50 ) ) ) )
        call UnitDamageTargetBJ( GetEventDamageSource(), GetTriggerUnit(), udg_SaberAirDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call SetUnitManaBJ( GetEventDamageSource(), ( GetUnitStateSwap(UNIT_STATE_MANA, GetEventDamageSource()) - ( 15.00 + ( 15.00 * I2R(GetUnitAbilityLevelSwapped('A0DZ', GetEventDamageSource())) ) ) ) )
        call CreateTextTagUnitBJ( ( I2S(R2I(udg_SaberAirDamage)) + "!" ), GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
    endif
endfunction

// --- InitTrig_Air (family, line 32114) ---
function InitTrig_Air takes nothing returns nothing
    set gg_trg_Air = CreateTrigger(  )
    call TriggerAddAction( gg_trg_Air, function Trig_Air_Actions )
endfunction

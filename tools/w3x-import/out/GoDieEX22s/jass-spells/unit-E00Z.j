// unit rawcode: E00Z
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AzumiShadowNew, AzumiHit

// === family AzumiShadowNew (passive) events=none ===

// --- Trig_AzumiShadowNew_Func001Func005Func002C (family, line 27735) ---
function Trig_AzumiShadowNew_Func001Func005Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEventDamageSource()) == 'E00K' ) ) then
        return false
    endif
    if ( not ( RAbsBJ(( ModuloReal(( ( GetUnitFacing(GetEventDamageSource()) - GetUnitFacing(GetTriggerUnit()) ) + 180.00 ), 360.00) - 180.00 )) <= 90.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AzumiShadowNew_Func001Func005C (family, line 27745) ---
function Trig_AzumiShadowNew_Func001Func005C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetEventDamageSource()) == 'E00Z' ) ) then
        return true
    endif
    if ( Trig_AzumiShadowNew_Func001Func005Func002C() ) then
        return true
    endif
    return false
endfunction

// --- Trig_AzumiShadowNew_Func001Func007C (family, line 27755) ---
function Trig_AzumiShadowNew_Func001Func007C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEventDamageSource()) == 'E00Z' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AzumiShadowNew_Func001C (family, line 27762) ---
function Trig_AzumiShadowNew_Func001C takes nothing returns boolean
    if ( not ( udg_AzumiATKUnit != null ) ) then
        return false
    endif
    if ( not ( GetUnitAbilityLevelSwapped('A02Y', GetEventDamageSource()) > 0 ) ) then
        return false
    endif
    if ( not Trig_AzumiShadowNew_Func001Func005C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_AzumiShadowNew_Actions (family, line 27775) ---
function Trig_AzumiShadowNew_Actions takes nothing returns nothing
    if ( Trig_AzumiShadowNew_Func001C() ) then
        set udg_AzumiATKUnit = null
        set udg_Auzimi = GetEventDamageSource()
        set udg_AzumiShadowPoint = GetUnitLoc(GetEventDamageSource())
        if ( Trig_AzumiShadowNew_Func001Func007C() ) then
            set udg_AzumiDamage = ( ( I2R(( GetUnitAbilityLevelSwapped('A02Y', udg_Auzimi) * 100 )) + I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Auzimi, true)) ) + 75.00 )
        else
            set udg_AzumiDamage = ( ( I2R(( GetUnitAbilityLevelSwapped('A02Y', udg_Auzimi) * 100 )) + I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, udg_Auzimi, true)) ) + 0.00 )
        endif
        call UnitDamageTargetBJ( udg_Auzimi, GetTriggerUnit(), udg_AzumiDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call CreateTextTagUnitBJ( ( I2S(R2I(udg_AzumiDamage)) + "!" ), GetEventDamageSource(), -30.00, 10.00, 80.00, 10.00, 10.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call AddSpecialEffectTargetUnitBJ( "chest", GetTriggerUnit(), "BloodBreathStream.mdx" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation( udg_AzumiShadowPoint )
        call EnableTrigger( gg_trg_AzumiHit )
    else
    endif
endfunction

// --- InitTrig_AzumiShadowNew (family, line 27800) ---
function InitTrig_AzumiShadowNew takes nothing returns nothing
    set gg_trg_AzumiShadowNew = CreateTrigger(  )
    call TriggerAddAction( gg_trg_AzumiShadowNew, function Trig_AzumiShadowNew_Actions )
endfunction

// === family AzumiHit (armed) events=none ===

// --- Trig_AzumiHit_Func001Func005A (family, line 27683) ---
function Trig_AzumiHit_Func001Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AzumiHit_Func001Func006A (family, line 27688) ---
function Trig_AzumiHit_Func001Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AzumiHit_Func001Func007A (family, line 27693) ---
function Trig_AzumiHit_Func001Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AzumiHit_Func001Func008A (family, line 27698) ---
function Trig_AzumiHit_Func001Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AzumiHit_Func001C (family, line 27703) ---
function Trig_AzumiHit_Func001C takes nothing returns boolean
    if ( not ( udg_AuzmiHITPre == udg_AzumiHIT ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AzumiHit_Actions (family, line 27710) ---
function Trig_AzumiHit_Actions takes nothing returns nothing
    if ( Trig_AzumiHit_Func001C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        set udg_AuzmiHITPre = 0
        set udg_AzumiHIT = 0
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Auzimi), 'u018'), function Trig_AzumiHit_Func001Func005A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Auzimi), 'h017'), function Trig_AzumiHit_Func001Func006A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Auzimi), 'o031'), function Trig_AzumiHit_Func001Func007A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Auzimi), 'o031'), function Trig_AzumiHit_Func001Func008A )
    else
        set udg_AuzmiHITPre = udg_AzumiHIT
    endif
endfunction

// --- InitTrig_AzumiHit (family, line 27725) ---
function InitTrig_AzumiHit takes nothing returns nothing
    set gg_trg_AzumiHit = CreateTrigger(  )
    call DisableTrigger( gg_trg_AzumiHit )
    call TriggerRegisterTimerEventPeriodic( gg_trg_AzumiHit, 0.90 )
    call TriggerAddAction( gg_trg_AzumiHit, function Trig_AzumiHit_Actions )
endfunction

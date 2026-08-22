// rawcode: A0WB
// nameZh: 92-03 狂草泥馬
// w3a base: Absk  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 90, "2": 120, "3": 150, "4": 180}
// duration: {"2": 12.0, "3": 12.0, "4": 12.0}
// hero_duration: {"2": 12.0, "3": 12.0, "4": 12.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: NewTrdHorse

// === family NewTrdHorse (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NewTrdHorse_Conditions (family, line 45350) ---
function Trig_NewTrdHorse_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0WB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NewTrdHorse_Func003C (family, line 45357) ---
function Trig_NewTrdHorse_Func003C takes nothing returns boolean
    if ( not ( udg_Horse_Dam > ( 400.00 * I2R(GetUnitAbilityLevelSwapped('A0WB', GetTriggerUnit())) ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NewTrdHorse_Func004Func001C (family, line 45364) ---
function Trig_NewTrdHorse_Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NewTrdHorse_Func004A (family, line 45371) ---
function Trig_NewTrdHorse_Func004A takes nothing returns nothing
    if ( Trig_NewTrdHorse_Func004Func001C() ) then
        call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), udg_Horse_Dam, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call TextUse(R2S(udg_Horse_Dam), GetEnumUnit() , 10 , 4 , 80,10,10)
    else
    endif
endfunction

// --- Trig_NewTrdHorse_Func012A (family, line 45379) ---
function Trig_NewTrdHorse_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_NewTrdHorse_Actions (family, line 45384) ---
function Trig_NewTrdHorse_Actions takes nothing returns nothing
    set udg_Horse_Point = GetUnitLoc(GetTriggerUnit())
    set udg_Horse_Dam = ( I2R(GetPlayerState(GetOwningPlayer(GetTriggerUnit()), PLAYER_STATE_RESOURCE_GOLD)) * ( 0.10 * I2R(GetUnitAbilityLevelSwapped('A0WB', GetTriggerUnit())) ) )
    if ( Trig_NewTrdHorse_Func003C() ) then
        set udg_Horse_Dam = ( 400.00 * I2R(GetUnitAbilityLevelSwapped('A0WB', GetTriggerUnit())) )
    else
    endif
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, udg_Horse_Point), function Trig_NewTrdHorse_Func004A )
    call CreateNUnitsAtLoc( 1, 'o00Q', GetOwningPlayer(udg_Horse), udg_Horse_Point, bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.50, 'BTLF', GetLastCreatedUnit() )
    call PlaySoundOnUnitBJ( gg_snd_Taunt, 100, udg_Horse )
    call RemoveLocation( udg_Horse_Point )
    call TriggerSleepAction( 1.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_Horse), 'o00Q'), function Trig_NewTrdHorse_Func012A )
endfunction

// --- InitTrig_NewTrdHorse (family, line 45401) ---
function InitTrig_NewTrdHorse takes nothing returns nothing
    set gg_trg_NewTrdHorse = CreateTrigger(  )
    call DisableTrigger( gg_trg_NewTrdHorse )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NewTrdHorse, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_NewTrdHorse, Condition( function Trig_NewTrdHorse_Conditions ) )
    call TriggerAddAction( gg_trg_NewTrdHorse, function Trig_NewTrdHorse_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

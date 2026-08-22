// rawcode: A0BR
// nameZh: 60-04 迴旋斬
// w3a base: AOw2  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 170, "2": 290, "3": 410}
// area: {"1": 375.0, "2": 375.0, "3": 375.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: CircleCut

// === family CircleCut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CircleCut_Conditions (family, line 46102) ---
function Trig_CircleCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0BR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CircleCut_Func007A (family, line 46109) ---
function Trig_CircleCut_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_CircleCut_Func008A (family, line 46114) ---
function Trig_CircleCut_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_CircleCut_Func009A (family, line 46119) ---
function Trig_CircleCut_Func009A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_CircleCut_Actions (family, line 46124) ---
function Trig_CircleCut_Actions takes nothing returns nothing
    set udg_LinkUnit = GetTriggerUnit()
    set udg_P_Link = GetUnitLoc(GetTriggerUnit())
    set udg_LinkDamage = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) * 0.50 )
    set udg_LinkCounter = 0
    call PlaySoundOnUnitBJ( gg_snd_AxeMissileLaunch1, 100.00, GetEnumUnit() )
    call EnableTrigger( gg_trg_CircleCut_Moving )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_CircleCut_Func007A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_CircleCut_Func008A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_CircleCut_Func009A )
endfunction

// --- InitTrig_CircleCut (family, line 46137) ---
function InitTrig_CircleCut takes nothing returns nothing
    set gg_trg_CircleCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_CircleCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CircleCut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CircleCut, Condition( function Trig_CircleCut_Conditions ) )
    call TriggerAddAction( gg_trg_CircleCut, function Trig_CircleCut_Actions )
endfunction

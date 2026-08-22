// rawcode: A0TV
// nameZh: 77-01 百烈櫻華斬
// w3a base: AOws  levels: 4
// cooldown: {"1": 40.0, "2": 40.0, "3": 40.0, "4": 40.0}
// mana: {"1": 75, "2": 110, "3": 145, "4": 180}
// area: {"1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SaKu, SaKuSpaNew

// === family SaKu (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SaKu_Conditions (family, line 49084) ---
function Trig_SaKu_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0TV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SaKu_Actions (family, line 49128) ---
function Trig_SaKu_Actions takes nothing returns nothing
    local location UnitPoint

    set UnitPoint = GetUnitLoc(GetTriggerUnit())
    call ForGroupBJ( GetUnitsInRangeOfLocAll(400.00 , UnitPoint) , function Trig_Pick_Func002A ) 
    call TriggerSleepAction( 3.00 )

    call RemoveLocation (UnitPoint)
endfunction

// --- InitTrig_SaKu (family, line 49139) ---
function InitTrig_SaKu takes nothing returns nothing
    set gg_trg_SaKu = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SaKu, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SaKu, Condition( function Trig_SaKu_Conditions ) )
    call TriggerAddAction( gg_trg_SaKu, function Trig_SaKu_Actions )
endfunction

// === family SaKuSpaNew (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_SaKuSpaNew_Conditions (family, line 49149) ---
function Trig_SaKuSpaNew_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0TV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SaKuSpaNew_Actions (family, line 49156) ---
function Trig_SaKuSpaNew_Actions takes nothing returns nothing
    set udg_Inshou = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_DarkSummoningLaunch1, 100.00, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'o01D', GetOwningPlayer(udg_Inshou), GetUnitLoc(udg_Inshou), bj_UNIT_FACING )
    set udg_InshouCreateUnit[25] = GetLastCreatedUnit()
    set udg_InshouSize = 0
    call EnableTrigger( gg_trg_SizeChange )
    call TriggerSleepAction( 1.00 )
    call DisableTrigger( gg_trg_SizeChange )
    call KillUnit( udg_InshouCreateUnit[25] )
    call RemoveUnit( udg_InshouCreateUnit[25] )
endfunction

// --- InitTrig_SaKuSpaNew (family, line 49170) ---
function InitTrig_SaKuSpaNew takes nothing returns nothing
    set gg_trg_SaKuSpaNew = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SaKuSpaNew, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_SaKuSpaNew, Condition( function Trig_SaKuSpaNew_Conditions ) )
    call TriggerAddAction( gg_trg_SaKuSpaNew, function Trig_SaKuSpaNew_Actions )
endfunction

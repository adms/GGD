// rawcode: A0OG
// nameZh: 38-01 邪王炎殺劍
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 50.0}
// mana: {"1": 85, "2": 115, "3": 145, "4": 275}
// range: {"1": 650.0, "2": 650.0, "3": 650.0, "4": 9999.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HehiSword

// === family HehiSword (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HehiSword_Conditions (family, line 43741) ---
function Trig_HehiSword_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0OG' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSword_Func007C (family, line 43748) ---
function Trig_HehiSword_Func007C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U010' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HehiSword_Actions (family, line 43755) ---
function Trig_HehiSword_Actions takes nothing returns nothing
    // 變數設定
    set udg_HehiRush_IndexMoon = 0
    set udg_HehiRush_Target = GetTriggerUnit()
    set udg_HehiRush_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_HehiRush_P2 = GetUnitLoc(GetTriggerUnit())
    set udg_HehiRush_Angle = GetUnitFacing(GetTriggerUnit())
    if ( Trig_HehiSword_Func007C() ) then
        set udg_HehiRush_Damage = I2R(( ( 100 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) + ( 150 + R2I(I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true) * 3 ))) ) ))
    else
        set udg_HehiRush_Damage = I2R(( ( 100 * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) + ( 150 + R2I(I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true))) ) ))
    endif
    call UnitAddAbilityBJ( 'A0J6', GetTriggerUnit() )
    call GroupClear( udg_HehiRush_Group )
    call UnitAddAbilityBJ( 'Avul', GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_DarkSummoningLaunch1, 100, GetTriggerUnit() )
    call EnableTrigger( gg_trg_HehiSwordEffect )
endfunction

// --- InitTrig_HehiSword (family, line 43775) ---
function InitTrig_HehiSword takes nothing returns nothing
    set gg_trg_HehiSword = CreateTrigger(  )
    call DisableTrigger( gg_trg_HehiSword )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HehiSword, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HehiSword, Condition( function Trig_HehiSword_Conditions ) )
    call TriggerAddAction( gg_trg_HehiSword, function Trig_HehiSword_Actions )
endfunction

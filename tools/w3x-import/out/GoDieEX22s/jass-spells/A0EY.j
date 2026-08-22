// rawcode: A0EY
// nameZh: 物品英雄之笛
// cooldown: {"1": 0.0}
// duration: {"1": 0.10000000149011612}
// hero_duration: {"1": 0.10000000149011612}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HeroCome

// === family HeroCome (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HeroCome_Conditions (family, line 47029) ---
function Trig_HeroCome_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0EY' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeroCome_Func001Func001Func001C (family, line 47036) ---
function Trig_HeroCome_Func001Func001Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[udg_moriyaItem] != GetTriggerUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeroCome_Func001Func002Func001C (family, line 47043) ---
function Trig_HeroCome_Func001Func002Func001C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[udg_moriyaItem] != GetTriggerUnit() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeroCome_Func001C (family, line 47050) ---
function Trig_HeroCome_Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetTriggerUnit(), Player(0)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HeroCome_Actions (family, line 47057) ---
function Trig_HeroCome_Actions takes nothing returns nothing
    if ( Trig_HeroCome_Func001C() ) then
        set udg_moriyaItem = 2
        loop
            exitwhen udg_moriyaItem > 6
            if ( Trig_HeroCome_Func001Func002Func001C() ) then
                call SetUnitLifePercentBJ( udg_PlayerHeroUnit[udg_moriyaItem], 100 )
                call SetUnitManaPercentBJ( udg_PlayerHeroUnit[udg_moriyaItem], 100 )
                call SetUnitPositionLoc( udg_PlayerHeroUnit[udg_moriyaItem], GetUnitLoc(GetTriggerUnit()) )
            else
                call SetUnitPositionLoc( udg_PlayerHeroUnit[udg_moriyaItem], GetUnitLoc(GetTriggerUnit()) )
            endif
            set udg_moriyaItem = udg_moriyaItem + 1
        endloop
    else
        set udg_moriyaItem = 8
        loop
            exitwhen udg_moriyaItem > 12
            if ( Trig_HeroCome_Func001Func001Func001C() ) then
                call SetUnitLifePercentBJ( udg_PlayerHeroUnit[udg_moriyaItem], 100 )
                call SetUnitManaPercentBJ( udg_PlayerHeroUnit[udg_moriyaItem], 100 )
                call SetUnitPositionLoc( udg_PlayerHeroUnit[udg_moriyaItem], GetUnitLoc(GetTriggerUnit()) )
            else
                call SetUnitPositionLoc( udg_PlayerHeroUnit[udg_moriyaItem], GetUnitLoc(GetTriggerUnit()) )
            endif
            set udg_moriyaItem = udg_moriyaItem + 1
        endloop
    endif
    call PlaySoundOnUnitBJ( gg_snd_SoulGem, 100, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'o00R', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
endfunction

// --- InitTrig_HeroCome (family, line 47091) ---
function InitTrig_HeroCome takes nothing returns nothing
    set gg_trg_HeroCome = CreateTrigger(  )
    call DisableTrigger( gg_trg_HeroCome )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HeroCome, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HeroCome, Condition( function Trig_HeroCome_Conditions ) )
    call TriggerAddAction( gg_trg_HeroCome, function Trig_HeroCome_Actions )
endfunction

// rawcode: A0YP
// nameZh: 00-00 緊急逃脫裝置
// w3a base: AHds  levels: 1
// cooldown: {"1": 50.0}
// mana: {"1": 0}
// duration: {"1": 0.10000000149011612}
// hero_duration: {"1": 0.10000000149011612}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Keroro_Recall

// === family Keroro_Recall (active) events=none ===

// --- Trig_Keroro_Recall_Conditions (family, line 20269) ---
function Trig_Keroro_Recall_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0YP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Keroro_Recall_Func019C (family, line 20276) ---
function Trig_Keroro_Recall_Func019C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(udg_KeroroUnit), Player(0)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Keroro_Recall_Actions (family, line 20283) ---
function Trig_Keroro_Recall_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    call DisableTrigger( gg_trg_Keroro_SpeedUp )
    call DisableTrigger( gg_trg_Keroro_Dead )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Items\\TomeOfRetraining\\TomeOfRetrainingCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitPositionLoc( gg_unit_nzep_0121, GetUnitLoc(GetTriggerUnit()) )
    call SetUnitFlyHeightBJ( gg_unit_nzep_0121, 600.00, 0.00 )
    call SetUnitInvulnerable( GetTriggerUnit(), true )
    call PauseUnitBJ( true, GetTriggerUnit() )
    call SetUnitAnimationWithRarity( GetTriggerUnit(), "dissipate", RARITY_FREQUENT )
    call TriggerSleepAction( 1.00 )
    call DisplayTextToForce( GetPlayersAll(), "TRIGSTR_8809" )
    call SetUnitInvulnerable( GetTriggerUnit(), false )
    call KillUnit( GetTriggerUnit() )
    call RemoveUnit( GetTriggerUnit() )
    call KillUnit( gg_unit_nzep_0121 )
    call RemoveUnit( gg_unit_nzep_0121 )
    call ShowUnitShow( udg_KeroroUnit )
    if ( Trig_Keroro_Recall_Func019C() ) then
        call SetUnitPositionLoc( udg_KeroroUnit, GetRectCenter(gg_rct_LoveHeroPoint) )
    else
        call SetUnitPositionLoc( udg_KeroroUnit, GetRectCenter(gg_rct_DieHeroPoint) )
    endif
endfunction

// --- InitTrig_Keroro_Recall (family, line 20310) ---
function InitTrig_Keroro_Recall takes nothing returns nothing
    set gg_trg_Keroro_Recall = CreateTrigger(  )
    call DisableTrigger( gg_trg_Keroro_Recall )
    call TriggerAddCondition( gg_trg_Keroro_Recall, Condition( function Trig_Keroro_Recall_Conditions ) )
    call TriggerAddAction( gg_trg_Keroro_Recall, function Trig_Keroro_Recall_Actions )
endfunction

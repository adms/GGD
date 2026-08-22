// rawcode: A10U
// nameZh: 84-002 我只想確定你在這裡
// w3a base: AOws  levels: 1
// cooldown: {"1": 70.0}
// mana: {"1": 250}
// area: {"1": 1600.0}
// duration: {"1": 2.009999990463257}
// hero_duration: {"1": 2.009999990463257}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: FindyouEX

// === family FindyouEX (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FindyouEX_Conditions (family, line 50994) ---
function Trig_FindyouEX_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A10U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FindyouEX_Func001Func001Func004C (family, line 51001) ---
function Trig_FindyouEX_Func001Func001Func004C takes nothing returns boolean
    if ( not ( GetUnitTypeId(udg_PlayerHeroUnit[GetForLoopIndexA()]) != 'E00V' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FindyouEX_Func001Func001C (family, line 51008) ---
function Trig_FindyouEX_Func001Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetTriggerUnit()), ConvertedPlayer(GetForLoopIndexA())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FindyouEX_Actions (family, line 51015) ---
function Trig_FindyouEX_Actions takes nothing returns nothing
    set bj_forLoopAIndex = 1
    set bj_forLoopAIndexEnd = 13
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        if ( Trig_FindyouEX_Func001Func001C() ) then
            call SetUnitLifePercentBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], ( GetUnitLifePercent(udg_PlayerHeroUnit[GetForLoopIndexA()]) + 50.00 ) )
            call SetUnitManaPercentBJ( udg_PlayerHeroUnit[GetForLoopIndexA()], ( GetUnitManaPercent(udg_PlayerHeroUnit[GetForLoopIndexA()]) + 50.00 ) )
            if ( Trig_FindyouEX_Func001Func001Func004C() ) then
                call SetUnitPositionLoc( udg_PlayerHeroUnit[GetForLoopIndexA()], GetUnitLoc(GetTriggerUnit()) )
                call AddSpecialEffectTargetUnitBJ( "origin", udg_PlayerHeroUnit[GetForLoopIndexA()], "Abilities\\Spells\\Human\\MassTeleport\\MassTeleportTarget.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            else
            endif
        else
        endif
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
endfunction

// --- InitTrig_FindyouEX (family, line 51036) ---
function InitTrig_FindyouEX takes nothing returns nothing
    set gg_trg_FindyouEX = CreateTrigger(  )
    call DisableTrigger( gg_trg_FindyouEX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FindyouEX, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FindyouEX, Condition( function Trig_FindyouEX_Conditions ) )
    call TriggerAddAction( gg_trg_FindyouEX, function Trig_FindyouEX_Actions )
endfunction

// rawcode: A01W
// nameZh: 37-04-03 天地魔鬥
// cooldown: {"1": 15.0}
// mana: {"1": 450}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: HolyShit

// === family HolyShit (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HolyShit_Conditions (family, line 44502) ---
function Trig_HolyShit_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A01W' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HolyShit_Func006A (family, line 44509) ---
function Trig_HolyShit_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HolyShit_Actions (family, line 44514) ---
function Trig_HolyShit_Actions takes nothing returns nothing
    set udg_BNChang = GetTriggerUnit()
    set udg_BaMP = GetUnitLoc(udg_BNChang)
    set udg_BaM = 1
    loop
        exitwhen udg_BaM > 18
        call CreateNUnitsAtLoc( 1, 'o00B', GetOwningPlayer(udg_BNChang), udg_BaMP, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A01X', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A024', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A01X', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call SetUnitAbilityLevelSwapped( 'A024', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(udg_BaMP, 256.00, ( I2R(udg_BaM) * 20.00 )) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "impale", PolarProjectionBJ(udg_BaMP, 256.00, ( I2R(udg_BaM) * 20.00 )) )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_BaMP, 256, ( I2R(udg_BaM) * 20.00 )), "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.05 )
        set udg_BaM = udg_BaM + 1
    endloop
    call TriggerSleepAction( 5.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BNChang), 'o00B'), function Trig_HolyShit_Func006A )
endfunction

// --- InitTrig_HolyShit (family, line 44540) ---
function InitTrig_HolyShit takes nothing returns nothing
    set gg_trg_HolyShit = CreateTrigger(  )
    call DisableTrigger( gg_trg_HolyShit )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HolyShit, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HolyShit, Condition( function Trig_HolyShit_Conditions ) )
    call TriggerAddAction( gg_trg_HolyShit, function Trig_HolyShit_Actions )
endfunction

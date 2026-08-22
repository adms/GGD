// rawcode: A0SY
// nameZh: 23-03 雷牙一閃˙雷牙烈霸
// w3a base: AOsh  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 150, "2": 220, "3": 290, "4": 360}
// range: {"1": 750.0, "2": 750.0, "3": 750.0, "4": 750.0}
// area: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: LigtingExp

// === family LigtingExp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LigtingExp_Conditions (family, line 31279) ---
function Trig_LigtingExp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0SY' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LigtingExp_Func006Func001A (family, line 31286) ---
function Trig_LigtingExp_Func006Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_LigtingExp_Func010A (family, line 31290) ---
function Trig_LigtingExp_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LigtingExp_Actions (family, line 31295) ---
function Trig_LigtingExp_Actions takes nothing returns nothing
    set udg_FateUnit = GetTriggerUnit()
    set udg_HolySwordPoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'u02R', GetOwningPlayer(udg_FateUnit), udg_HolySwordPoint, bj_UNIT_FACING )
    call AddSpecialEffectLocBJ( udg_HolySwordPoint, "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_LigtingExp_Func006Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    set udg_LigtingExpCount = 1
    loop
        exitwhen udg_LigtingExpCount > 15
        call AddSpecialEffectLocBJ( GetRandomLocInRect(RectFromCenterSizeBJ(udg_HolySwordPoint, 350.00, 350.00)), "Abilities\\Spells\\Human\\HolyBolt\\HolyBoltSpecialArt.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.01 )
        set udg_LigtingExpCount = udg_LigtingExpCount + 1
    endloop
    call TriggerSleepAction( 2.00 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_FateUnit), 'u02R'), function Trig_LigtingExp_Func010A )
endfunction

// --- InitTrig_LigtingExp (family, line 31328) ---
function InitTrig_LigtingExp takes nothing returns nothing
    set gg_trg_LigtingExp = CreateTrigger(  )
    call DisableTrigger( gg_trg_LigtingExp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LigtingExp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LigtingExp, Condition( function Trig_LigtingExp_Conditions ) )
    call TriggerAddAction( gg_trg_LigtingExp, function Trig_LigtingExp_Actions )
endfunction

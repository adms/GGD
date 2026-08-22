// rawcode: A0JZ
// nameZh: 14-04 AKT戰隊
// w3a base: ANmo  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 175, "2": 275, "3": 375, "4": 475}
// range: {"1": 550.0, "2": 650.0, "3": 750.0, "4": 850.0}
// area: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0}
// duration: {"1": 0.10000000149011612, "2": 1.0, "3": 2.0, "4": 3.0}
// hero_duration: {"1": 0.10000000149011612, "2": 1.0, "3": 2.0, "4": 3.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: AKT_Effect, AKT_start, AKT_stop

// === family AKT_Effect (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AKT_Effect_Conditions (family, line 31012) ---
function Trig_AKT_Effect_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JZ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_Effect_Func008A (family, line 31019) ---
function Trig_AKT_Effect_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_AKT_Effect_Actions (family, line 31024) ---
function Trig_AKT_Effect_Actions takes nothing returns nothing
    set udg_MoNiUnit = GetTriggerUnit()
    set udg_AKTEffectCount = 0
    call CreateNUnitsAtLoc( 1, 'o01L', GetOwningPlayer(GetTriggerUnit()), GetSpellTargetLoc(), bj_UNIT_FACING )
    set udg_AKTSpecialUnit[2] = GetLastCreatedUnit()
    call SetUnitScalePercent( udg_AKTSpecialUnit[2], 500.00, 100.00, 100.00 )
    call EnableTrigger( gg_trg_AKT_CloseEffect )
    call TriggerSleepAction( 10.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_MoNiUnit), 'o01L'), function Trig_AKT_Effect_Func008A )
endfunction

// --- InitTrig_AKT_Effect (family, line 31036) ---
function InitTrig_AKT_Effect takes nothing returns nothing
    set gg_trg_AKT_Effect = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AKT_Effect, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_AKT_Effect, Condition( function Trig_AKT_Effect_Conditions ) )
    call TriggerAddAction( gg_trg_AKT_Effect, function Trig_AKT_Effect_Actions )
endfunction

// === family AKT_start (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AKT_start_Conditions (family, line 30557) ---
function Trig_AKT_start_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JZ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Func007C (family, line 30564) ---
function Trig_AKT_start_Func007C takes nothing returns boolean
    if ( not ( udg_AKTLevelSkill > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Func009C (family, line 30571) ---
function Trig_AKT_start_Func009C takes nothing returns boolean
    if ( not ( udg_AKTLevelSkill > 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Func011C (family, line 30578) ---
function Trig_AKT_start_Func011C takes nothing returns boolean
    if ( not ( udg_AKTLevelSkill > 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Func013C (family, line 30585) ---
function Trig_AKT_start_Func013C takes nothing returns boolean
    if ( not ( udg_AKTLevelSkill > 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Func015C (family, line 30592) ---
function Trig_AKT_start_Func015C takes nothing returns boolean
    if ( not ( udg_AKTBool == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Func017C (family, line 30599) ---
function Trig_AKT_start_Func017C takes nothing returns boolean
    if ( not ( udg_AKTBool == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Func019C (family, line 30606) ---
function Trig_AKT_start_Func019C takes nothing returns boolean
    if ( not ( udg_AKTBool == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Func021C (family, line 30613) ---
function Trig_AKT_start_Func021C takes nothing returns boolean
    if ( not ( udg_AKTBool == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_start_Actions (family, line 30620) ---
function Trig_AKT_start_Actions takes nothing returns nothing
    set udg_AKTUnit = GetTriggerUnit()
    set udg_AKTUnitPoint = GetUnitLoc(GetTriggerUnit())
    set udg_AKTCastPoint = GetSpellTargetLoc()
    set udg_AKTJumpAngle = AngleBetweenPoints(udg_AKTUnitPoint, udg_AKTCastPoint)
    set udg_AKTLevelSkill = GetUnitAbilityLevelSwapped('A0JZ', udg_AKTUnit)
    // 夏那
    if ( Trig_AKT_start_Func007C() ) then
        call CreateNUnitsAtLoc( 1, 'h01H', GetOwningPlayer(udg_AKTUnit), PolarProjectionBJ(udg_AKTCastPoint, 700.00, ( udg_AKTJumpAngle + 135.00 )), ( udg_AKTJumpAngle + 315.00 ) )
        set udg_AKTJumpIndex = 21
        set udg_AKTSpecialUnit[5] = GetLastCreatedUnit()
        call SetUnitPathing( udg_AKTCreateUnit, false )
        call EnableTrigger( gg_trg_AKT_1 )
    else
    endif
    // 和香
    if ( Trig_AKT_start_Func009C() ) then
        call CreateNUnitsAtLoc( 1, 'h01G', GetOwningPlayer(udg_AKTUnit), PolarProjectionBJ(udg_AKTCastPoint, 500.00, ( udg_AKTJumpAngle + 45.00 )), ( udg_AKTJumpAngle + 225.00 ) )
        set udg_AKTSpecialUnit[6] = GetLastCreatedUnit()
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[6]), "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call SetUnitPathing( udg_AKTCreateUnit, false )
    else
    endif
    // 涼宮
    if ( Trig_AKT_start_Func011C() ) then
        call CreateNUnitsAtLoc( 1, 'h01I', GetOwningPlayer(udg_AKTUnit), PolarProjectionBJ(udg_AKTCastPoint, 500.00, ( udg_AKTJumpAngle - 45.00 )), ( udg_AKTJumpAngle + 135.00 ) )
        set udg_AKTSpecialUnit[7] = GetLastCreatedUnit()
        call SetUnitPathing( udg_AKTCreateUnit, false )
    else
    endif
    // 皮卡
    if ( Trig_AKT_start_Func013C() ) then
        call CreateNUnitsAtLoc( 1, 'h01F', GetOwningPlayer(udg_AKTUnit), PolarProjectionBJ(udg_AKTCastPoint, 500.00, ( udg_AKTJumpAngle - 135.00 )), ( udg_AKTJumpAngle + 45.00 ) )
        set udg_AKTSpecialUnit[8] = GetLastCreatedUnit()
        call SetUnitPathing( udg_AKTCreateUnit, false )
    else
    endif
    // 效果發動
    if ( Trig_AKT_start_Func015C() ) then
    else
        call KillUnit( udg_AKTSpecialUnit[2] )
        call RemoveUnit( udg_AKTSpecialUnit[2] )
        set bj_forLoopAIndex = 5
        set bj_forLoopAIndexEnd = ( udg_AKTLevelSkill + 4 )
        loop
            exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[GetForLoopIndexA()]), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call KillUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
            call RemoveUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
            set bj_forLoopAIndex = bj_forLoopAIndex + 1
        endloop
    endif
    call TriggerSleepAction( 0.50 )
    if ( Trig_AKT_start_Func017C() ) then
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[5]), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call KillUnit( udg_AKTSpecialUnit[5] )
        call RemoveUnit( udg_AKTSpecialUnit[5] )
        call SetUnitAnimation( udg_AKTSpecialUnit[6], "spell" )
        call TriggerExecute( gg_trg_AKT_2 )
    else
        call KillUnit( udg_AKTSpecialUnit[2] )
        call RemoveUnit( udg_AKTSpecialUnit[2] )
        set bj_forLoopAIndex = 5
        set bj_forLoopAIndexEnd = ( udg_AKTLevelSkill + 4 )
        loop
            exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[GetForLoopIndexA()]), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call KillUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
            call RemoveUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
            set bj_forLoopAIndex = bj_forLoopAIndex + 1
        endloop
    endif
    call TriggerSleepAction( 0.50 )
    if ( Trig_AKT_start_Func019C() ) then
        call DisableTrigger( gg_trg_CloseDestAddAb )
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[6]), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call KillUnit( udg_AKTSpecialUnit[6] )
        call RemoveUnit( udg_AKTSpecialUnit[6] )
        call TriggerExecute( gg_trg_AKT_3 )
    else
        call KillUnit( udg_AKTSpecialUnit[2] )
        call RemoveUnit( udg_AKTSpecialUnit[2] )
        set bj_forLoopAIndex = 5
        set bj_forLoopAIndexEnd = ( udg_AKTLevelSkill + 4 )
        loop
            exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[GetForLoopIndexA()]), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call KillUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
            call RemoveUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
            set bj_forLoopAIndex = bj_forLoopAIndex + 1
        endloop
    endif
    call TriggerSleepAction( 0.50 )
    if ( Trig_AKT_start_Func021C() ) then
        call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[7]), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call KillUnit( udg_AKTSpecialUnit[7] )
        call RemoveUnit( udg_AKTSpecialUnit[7] )
        set udg_AKTJumpIndex = 1
        call TriggerExecute( gg_trg_AKT_4 )
    else
        call KillUnit( udg_AKTSpecialUnit[2] )
        call RemoveUnit( udg_AKTSpecialUnit[2] )
        set bj_forLoopAIndex = 5
        set bj_forLoopAIndexEnd = ( udg_AKTLevelSkill + 4 )
        loop
            exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[GetForLoopIndexA()]), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call KillUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
            call RemoveUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
            set bj_forLoopAIndex = bj_forLoopAIndex + 1
        endloop
    endif
    call TriggerSleepAction( 3.50 )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_AKTSpecialUnit[8]), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call KillUnit( udg_AKTSpecialUnit[8] )
    call RemoveUnit( udg_AKTSpecialUnit[8] )
    call TriggerSleepAction( 1.20 )
    call DisableTrigger( gg_trg_AKT_CloseEffect )
    call KillUnit( udg_AKTSpecialUnit[2] )
    call RemoveUnit( udg_AKTSpecialUnit[2] )
    set bj_forLoopAIndex = 5
    set bj_forLoopAIndexEnd = 8
    loop
        exitwhen bj_forLoopAIndex > bj_forLoopAIndexEnd
        call KillUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
        call RemoveUnit( udg_AKTSpecialUnit[GetForLoopIndexA()] )
        set bj_forLoopAIndex = bj_forLoopAIndex + 1
    endloop
    set udg_AKTBool = false
endfunction

// --- InitTrig_AKT_start (family, line 30761) ---
function InitTrig_AKT_start takes nothing returns nothing
    set gg_trg_AKT_start = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AKT_start, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_AKT_start, Condition( function Trig_AKT_start_Conditions ) )
    call TriggerAddAction( gg_trg_AKT_start, function Trig_AKT_start_Actions )
endfunction

// === family AKT_stop (active) events=EVENT_PLAYER_UNIT_SPELL_ENDCAST ===

// --- Trig_AKT_stop_Conditions (family, line 30771) ---
function Trig_AKT_stop_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JZ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AKT_stop_Actions (family, line 30778) ---
function Trig_AKT_stop_Actions takes nothing returns nothing
    set udg_AKTBool = true
    set udg_AKTEffectCount = 0
endfunction

// --- InitTrig_AKT_stop (family, line 30784) ---
function InitTrig_AKT_stop takes nothing returns nothing
    set gg_trg_AKT_stop = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AKT_stop, EVENT_PLAYER_UNIT_SPELL_ENDCAST )
    call TriggerAddCondition( gg_trg_AKT_stop, Condition( function Trig_AKT_stop_Conditions ) )
    call TriggerAddAction( gg_trg_AKT_stop, function Trig_AKT_stop_Actions )
endfunction

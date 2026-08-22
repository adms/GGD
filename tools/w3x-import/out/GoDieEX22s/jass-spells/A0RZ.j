// rawcode: A0RZ
// nameZh: 76-04 三檔.巨人迴旋彈
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 200, "2": 310, "3": 420}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// hero_duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Luf_Three, Luf_Three_Effect

// === family Luf_Three (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Luf_Three_Conditions (family, line 36651) ---
function Trig_Luf_Three_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RZ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Three_Actions (family, line 36658) ---
function Trig_Luf_Three_Actions takes nothing returns nothing
    set udg_Luffe_three_caster = GetTriggerUnit()
    set udg_Luffe_three_P1 = GetUnitLoc(udg_Luffe_three_caster)
    set udg_Luffe_three_Index = 0.00
    call PauseUnitBJ( true, udg_Luffe_three_caster )
    call UnitAddAbilityBJ( 'Avul', udg_Luffe_three_caster )
    call UnitAddAbilityBJ( 'Arav', udg_Luffe_three_caster )
    call UnitAddAbilityBJ( 'A0S1', udg_Luffe_three_caster )
    call SetUnitAnimation( udg_Luffe_three_caster, "attack slam" )
    call AddSpecialEffectLocBJ( udg_Luffe_three_P1, "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call EnableTrigger( gg_trg_Luf_Three_Effect )
endfunction

// --- InitTrig_Luf_Three (family, line 36673) ---
function InitTrig_Luf_Three takes nothing returns nothing
    set gg_trg_Luf_Three = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_Three )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Luf_Three, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Luf_Three, Condition( function Trig_Luf_Three_Conditions ) )
    call TriggerAddAction( gg_trg_Luf_Three, function Trig_Luf_Three_Actions )
endfunction

// === family Luf_Three_Effect (passive) events=none ===

// --- Trig_Luf_Three_Effect_Func005C (family, line 36684) ---
function Trig_Luf_Three_Effect_Func005C takes nothing returns boolean
    if ( not ( udg_Luffe_three_Index == 11.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Three_Effect_Func006C (family, line 36691) ---
function Trig_Luf_Three_Effect_Func006C takes nothing returns boolean
    if ( not ( udg_Luffe_three_Index > 11.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Three_Effect_Func007Func006001003001 (family, line 36698) ---
function Trig_Luf_Three_Effect_Func007Func006001003001 takes nothing returns boolean
    return ( IsUnitAliveBJ(GetFilterUnit()) == true )
endfunction

// --- Trig_Luf_Three_Effect_Func007Func006001003002001 (family, line 36702) ---
function Trig_Luf_Three_Effect_Func007Func006001003002001 takes nothing returns boolean
    return ( IsUnitEnemy(GetFilterUnit(), GetOwningPlayer(udg_Luffe_three_caster)) == true )
endfunction

// --- Trig_Luf_Three_Effect_Func007Func006001003002002 (family, line 36706) ---
function Trig_Luf_Three_Effect_Func007Func006001003002002 takes nothing returns boolean
    return ( IsUnitType(GetFilterUnit(), UNIT_TYPE_STRUCTURE) != true )
endfunction

// --- Trig_Luf_Three_Effect_Func007Func006001003002 (family, line 36710) ---
function Trig_Luf_Three_Effect_Func007Func006001003002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Luf_Three_Effect_Func007Func006001003002001(), Trig_Luf_Three_Effect_Func007Func006001003002002() )
endfunction

// --- Trig_Luf_Three_Effect_Func007Func006001003 (family, line 36714) ---
function Trig_Luf_Three_Effect_Func007Func006001003 takes nothing returns boolean
    return GetBooleanAnd( Trig_Luf_Three_Effect_Func007Func006001003001(), Trig_Luf_Three_Effect_Func007Func006001003002() )
endfunction

// --- Trig_Luf_Three_Effect_Func007Func006A (family, line 36718) ---
function Trig_Luf_Three_Effect_Func007Func006A takes nothing returns nothing
    call UnitDamageTargetBJ( udg_Luffe_three_caster, GetEnumUnit(), ( ( 300.00 + ( 300.00 * I2R(GetUnitAbilityLevelSwapped('A0RZ', udg_Luffe_three_caster)) ) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_Luffe_three_caster, true)) * 2.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
endfunction

// --- Trig_Luf_Three_Effect_Func007C (family, line 36722) ---
function Trig_Luf_Three_Effect_Func007C takes nothing returns boolean
    if ( not ( udg_Luffe_three_Index == 18.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Three_Effect_Func008Func011Func001C (family, line 36729) ---
function Trig_Luf_Three_Effect_Func008Func011Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnumUnit()) == 'h029' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) == 'h028' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Three_Effect_Func008Func011A (family, line 36739) ---
function Trig_Luf_Three_Effect_Func008Func011A takes nothing returns nothing
    if ( Trig_Luf_Three_Effect_Func008Func011Func001C() ) then
        call KillUnit( GetEnumUnit() )
        call RemoveUnit( GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_Luf_Three_Effect_Func008C (family, line 36747) ---
function Trig_Luf_Three_Effect_Func008C takes nothing returns boolean
    if ( not ( udg_Luffe_three_Index >= 21.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Luf_Three_Effect_Actions (family, line 36754) ---
function Trig_Luf_Three_Effect_Actions takes nothing returns nothing
    set udg_Luffe_three_Index = ( udg_Luffe_three_Index + 1 )
    // 二次函數(拋物線)，Index=1,21時高度=0；Index=11時高度=1000
    set udg_Luffe_three_height = ( ( -10.00 * Pow(( udg_Luffe_three_Index - 11.00 ), 2.00) ) + 1000.00 )
    call SetUnitFlyHeightBJ( udg_Luffe_three_caster, udg_Luffe_three_height, 0.00 )
    if ( Trig_Luf_Three_Effect_Func005C() ) then
        call CreateNUnitsAtLoc( 1, 'h026', GetOwningPlayer(udg_Luffe_three_caster), udg_Luffe_three_P1, GetRandomDirectionDeg() )
        set udg_Luffe_three_punch = GetLastCreatedUnit()
        call SetUnitFlyHeightBJ( udg_Luffe_three_punch, ( udg_Luffe_three_height - ( 33.00 * udg_Luffe_three_Index ) ), 0.00 )
        call CreateNUnitsAtLoc( 1, 'h027', GetOwningPlayer(udg_Luffe_three_caster), udg_Luffe_three_P1, GetRandomDirectionDeg() )
        set udg_Luffe_three_wind = GetLastCreatedUnit()
        call SetUnitVertexColorBJ( udg_Luffe_three_wind, 100, 100, 100, 99.99 )
        call SetUnitFlyHeightBJ( udg_Luffe_three_wind, ( udg_Luffe_three_height - ( 33.00 * udg_Luffe_three_Index ) ), 0.00 )
    else
    endif
    if ( Trig_Luf_Three_Effect_Func006C() ) then
        call SetUnitFacingTimed( udg_Luffe_three_punch, ( GetUnitFacing(udg_Luffe_three_punch) + 170.00 ), 0.00 )
        call SetUnitFlyHeightBJ( udg_Luffe_three_punch, ( udg_Luffe_three_height - ( 33.00 * udg_Luffe_three_Index ) ), 0.00 )
        call SetUnitFlyHeightBJ( udg_Luffe_three_wind, ( udg_Luffe_three_height - ( 33.00 * udg_Luffe_three_Index ) ), 0.00 )
    else
    endif
    if ( Trig_Luf_Three_Effect_Func007C() ) then
        call UnitAddAbilityBJ( 'A0S2', udg_Luffe_three_punch )
        call SetUnitAbilityLevelSwapped( 'A0S2', udg_Luffe_three_punch, GetUnitAbilityLevelSwapped('A0RZ', udg_Luffe_three_caster) )
        call IssueImmediateOrderBJ( udg_Luffe_three_punch, "thunderclap" )
        // 300+(sLV*200)+(力量*3)
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRangeOfLocMatching(380.00, udg_Luffe_three_P1, Condition(function Trig_Luf_Three_Effect_Func007Func006001003)), function Trig_Luf_Three_Effect_Func007Func006A )
        call TerrainDeformationRippleBJ( 4, true, udg_Luffe_three_P1, 800.00, 600.00, 200.00, 1, 400.00 )
        call CreateNUnitsAtLoc( 1, 'h028', GetOwningPlayer(udg_Luffe_three_caster), udg_Luffe_three_P1, bj_UNIT_FACING )
        call KillUnit( GetLastCreatedUnit() )
        call CreateNUnitsAtLoc( 1, 'h029', GetOwningPlayer(udg_Luffe_three_caster), udg_Luffe_three_P1, bj_UNIT_FACING )
        call KillUnit( GetLastCreatedUnit() )
        set udg_Luffe_three_N = 1
        loop
            exitwhen udg_Luffe_three_N > 5
            set udg_Luffe_three_P2 = PolarProjectionBJ(udg_Luffe_three_P1, GetRandomReal(0.00, 300.00), GetRandomDirectionDeg())
            call AddSpecialEffectLocBJ( udg_Luffe_three_P2, "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call RemoveLocation( udg_Luffe_three_P2 )
            set udg_Luffe_three_N = udg_Luffe_three_N + 1
        endloop
        call RemoveLocation( udg_Luffe_three_P1 )
    else
    endif
    if ( Trig_Luf_Three_Effect_Func008C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call UnitRemoveAbilityBJ( 'A0S1', udg_Luffe_three_caster )
        call UnitRemoveAbilityBJ( 'Arav', udg_Luffe_three_caster )
        call UnitRemoveAbilityBJ( 'Avul', udg_Luffe_three_caster )
        call PauseUnitBJ( false, udg_Luffe_three_caster )
        call TriggerSleepAction( 0.50 )
        call KillUnit( udg_Luffe_three_punch )
        call RemoveUnit( udg_Luffe_three_punch )
        call TriggerSleepAction( 1.00 )
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRectOfPlayer(GetPlayableMapRect(), GetOwningPlayer(udg_Luffe_three_caster)), function Trig_Luf_Three_Effect_Func008Func011A )
        call KillUnit( udg_Luffe_three_wind )
        call RemoveUnit( udg_Luffe_three_wind )
    else
    endif
endfunction

// --- InitTrig_Luf_Three_Effect (family, line 36818) ---
function InitTrig_Luf_Three_Effect takes nothing returns nothing
    set gg_trg_Luf_Three_Effect = CreateTrigger(  )
    call DisableTrigger( gg_trg_Luf_Three_Effect )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Luf_Three_Effect, 0.04 )
    call TriggerAddAction( gg_trg_Luf_Three_Effect, function Trig_Luf_Three_Effect_Actions )
endfunction

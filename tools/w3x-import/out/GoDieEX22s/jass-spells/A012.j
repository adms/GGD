// rawcode: A012
// nameZh: 47-04 天翔龍閃
// w3a base: AOww  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"2": 350, "3": 500}
// duration: {"1": 2.0, "2": 2.0, "3": 2.0}
// hero_duration: {"1": 2.0, "2": 2.0, "3": 2.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: SkySlash

// === family SkySlash (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_SkySlash_Conditions (family, line 43185) ---
function Trig_SkySlash_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A012' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SkySlash_Func002Func001C (family, line 43192) ---
function Trig_SkySlash_Func002Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SkySlash_Func002A (family, line 43208) ---
function Trig_SkySlash_Func002A takes nothing returns nothing
    if ( Trig_SkySlash_Func002Func001C() ) then
        call SetUnitPositionLoc( GetEnumUnit(), GetUnitLoc(GetTriggerUnit()) )
        call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_SkySlash_Func003Func005A (family, line 43217) ---
function Trig_SkySlash_Func003Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SkySlash_Func003Func006A (family, line 43222) ---
function Trig_SkySlash_Func003Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SkySlash_Func003Func007A (family, line 43227) ---
function Trig_SkySlash_Func003Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SkySlash_Func003C (family, line 43232) ---
function Trig_SkySlash_Func003C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SkySlash_Actions (family, line 43239) ---
function Trig_SkySlash_Actions takes nothing returns nothing
    set udg_SkySlashUnit = GetTriggerUnit()
    call ForGroupBJ( GetUnitsInRangeOfLocAll(200.00, GetUnitLoc(GetTriggerUnit())), function Trig_SkySlash_Func002A )
    if ( Trig_SkySlash_Func003C() ) then
        set udg_SkySlashP = GetUnitLoc(GetTriggerUnit())
        call CreateNUnitsAtLoc( 1, 'o01P', GetOwningPlayer(GetTriggerUnit()), udg_SkySlashP, bj_UNIT_FACING )
        set udg_SkySlash = 1
        loop
            exitwhen udg_SkySlash > 18
            call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), udg_SkySlashP, ( I2R(udg_SkySlash) * 20.00 ) )
            call ShowUnitHide( GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A09F', GetLastCreatedUnit() )
            call SetUnitAbilityLevelSwapped( 'A09F', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
            call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(udg_SkySlashP, 300.00, ( I2R(udg_SkySlash) * 20.00 )) )
            set udg_SkySlash = udg_SkySlash + 1
        endloop
        call TriggerSleepAction( 2.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'o01P'), function Trig_SkySlash_Func003Func005A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_SkySlash_Func003Func006A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hkni'), function Trig_SkySlash_Func003Func007A )
        call RemoveLocation(udg_SkySlashP)
    else
    endif
endfunction

// --- InitTrig_SkySlash (family, line 43265) ---
function InitTrig_SkySlash takes nothing returns nothing
    set gg_trg_SkySlash = CreateTrigger(  )
    call DisableTrigger( gg_trg_SkySlash )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SkySlash, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_SkySlash, Condition( function Trig_SkySlash_Conditions ) )
    call TriggerAddAction( gg_trg_SkySlash, function Trig_SkySlash_Actions )
endfunction

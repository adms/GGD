// rawcode: A0G2
// nameZh: 07-02 者、皆、陣
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// mana: {"1": 110, "2": 140, "3": 170, "4": 275}
// range: {"1": 9999.0, "2": 9999.0, "3": 9999.0, "4": 9999.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MoonKnock

// === family MoonKnock (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MoonKnock_Conditions (family, line 34327) ---
function Trig_MoonKnock_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0G2' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoonKnock_Func006Func001C (family, line 34334) ---
function Trig_MoonKnock_Func006Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoonKnock_Func006C (family, line 34341) ---
function Trig_MoonKnock_Func006C takes nothing returns boolean
    if ( not ( udg_MoonCombo == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoonKnock_Func020Func002A (family, line 34348) ---
function Trig_MoonKnock_Func020Func002A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_MoonKnock_Func020Func003Func001C (family, line 34352) ---
function Trig_MoonKnock_Func020Func003Func001C takes nothing returns boolean
    if ( not ( IsUnitInGroup(GetEnumUnit(), udg_MoonGroup) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoonKnock_Func020Func003A (family, line 34359) ---
function Trig_MoonKnock_Func020Func003A takes nothing returns nothing
    if ( Trig_MoonKnock_Func020Func003Func001C() ) then
        call GroupAddUnitSimple( GetEnumUnit(), udg_MoonGroup )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_MoonKnock_Func021Func001C (family, line 34367) ---
function Trig_MoonKnock_Func021Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_KnockBack_TargetMoon)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoonKnock_Func021A (family, line 34380) ---
function Trig_MoonKnock_Func021A takes nothing returns nothing
    if ( Trig_MoonKnock_Func021Func001C() ) then
        call UnitDamageTargetBJ( udg_KnockBack_TargetMoon, GetEnumUnit(), udg_MoonDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_MoonKnock_Actions (family, line 34390) ---
function Trig_MoonKnock_Actions takes nothing returns nothing
    set udg_KnockBack_IndexMoon = 0
    set udg_KnockBack_TargetMoon = GetTriggerUnit()
    set udg_P1Moon = GetUnitLoc(GetTriggerUnit())
    set udg_KnockBack_AngleMoon = GetUnitFacing(GetTriggerUnit())
    set udg_MoonDamage = I2R(( ( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) * GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) ) + 225 ))
    if ( Trig_MoonKnock_Func006C() ) then
        if ( Trig_MoonKnock_Func006Func001C() ) then
            set udg_MoonDamage = ( ( 3.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) ) + udg_MoonDamage )
        else
            set udg_MoonDamage = ( ( 6.00 * I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) ) + udg_MoonDamage )
        endif
        call CreateTextTagUnitBJ( "TRIGSTR_4806", GetTriggerUnit(), -30.00, 12.00, 100, 0.00, 0.00, 10.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        call CreateNUnitsAtLoc( 1, 'o00W', GetOwningPlayer(udg_KnockBack_TargetMoon), GetUnitLoc(GetEnumUnit()), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    else
    endif
    call CreateTextTagUnitBJ( "TRIGSTR_4801", GetTriggerUnit(), -30.00, 16.00, 100.00, 100.00, 100.00, 10.00 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, GetUnitFacing(GetTriggerUnit()) )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call UnitAddAbilityBJ( 'A09O', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )
    call GroupClear( udg_MoonGroup )
    call UnitAddAbilityBJ( 'Avul', GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_DarkSummoningLaunch1, 100, GetTriggerUnit() )
    call PlaySoundBJ( gg_snd_moongo )
    call TriggerSleepAction( 0.10 )
    set udg_P1Moon = GetUnitLoc(udg_KnockBack_TargetMoon)
    set udg_KnockBack_IndexMoon = 1
    loop
        exitwhen udg_KnockBack_IndexMoon > 3
        set udg_P1Moon = PolarProjectionBJ(udg_P1Moon, 200.00, udg_KnockBack_AngleMoon)
        call EnumDestructablesInCircleBJ( 300.00, udg_P1Moon, function Trig_MoonKnock_Func020Func002A )
        call ForGroupBJ( GetUnitsInRangeOfLocAll(300.00, udg_P1Moon), function Trig_MoonKnock_Func020Func003A )
        set udg_KnockBack_IndexMoon = udg_KnockBack_IndexMoon + 1
    endloop
    call ForGroupBJ( udg_MoonGroup, function Trig_MoonKnock_Func021A )
    call SetUnitPositionLoc( udg_KnockBack_TargetMoon, udg_P1Moon )
    call SetUnitAnimationWithRarity( udg_KnockBack_TargetMoon, "Attack Slam", RARITY_FREQUENT )
    call GroupClear( udg_MoonGroup )
    call UnitRemoveAbilityBJ( 'A09O', udg_KnockBack_TargetMoon )
    call UnitRemoveAbilityBJ( 'A09P', udg_KnockBack_TargetMoon )
    call UnitRemoveAbilityBJ( 'Avul', udg_KnockBack_TargetMoon )
    set udg_MoonCombo = 2
    call TriggerSleepAction( 1.00 )
    set udg_MoonCombo = 0
endfunction

// --- InitTrig_MoonKnock (family, line 34444) ---
function InitTrig_MoonKnock takes nothing returns nothing
    set gg_trg_MoonKnock = CreateTrigger(  )
    call DisableTrigger( gg_trg_MoonKnock )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MoonKnock, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MoonKnock, Condition( function Trig_MoonKnock_Conditions ) )
    call TriggerAddAction( gg_trg_MoonKnock, function Trig_MoonKnock_Actions )
endfunction

// rawcode: A03I
// nameZh: 27-03 忍法千變萬化之刀
// w3a base: Absk  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0, "5": 15.0}
// mana: {"1": 120, "2": 180, "3": 240, "4": 300, "5": 125}
// duration: {"1": 0.0}
// hero_duration: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 30.0, "5": 15.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Deal_Elemental_Effect, Set_Charges

// === family Deal_Elemental_Effect (passive) events=none ===

// --- Trig_Deal_Elemental_Effect_Func002Func001001001 (family, line 41481) ---
function Trig_Deal_Elemental_Effect_Func002Func001001001 takes nothing returns boolean
    return ( GetEventDamageSource() == udg_NiJan2 )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001001002 (family, line 41485) ---
function Trig_Deal_Elemental_Effect_Func002Func001001002 takes nothing returns boolean
    return ( UnitHasBuffBJ(GetEventDamageSource(), 'B00C') == true )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001001 (family, line 41489) ---
function Trig_Deal_Elemental_Effect_Func002Func001001 takes nothing returns boolean
    return GetBooleanAnd( Trig_Deal_Elemental_Effect_Func002Func001001001(), Trig_Deal_Elemental_Effect_Func002Func001001002() )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002001 (family, line 41493) ---
function Trig_Deal_Elemental_Effect_Func002Func001002001 takes nothing returns boolean
    return ( IsUnitEnemy(GetTriggerUnit(), GetOwningPlayer(GetEventDamageSource())) == true )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002002001 (family, line 41497) ---
function Trig_Deal_Elemental_Effect_Func002Func001002002001 takes nothing returns boolean
    return ( IsUnitType(GetTriggerUnit(), UNIT_TYPE_STRUCTURE) == false )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002002002 (family, line 41501) ---
function Trig_Deal_Elemental_Effect_Func002Func001002002002 takes nothing returns boolean
    return ( udg_NumberofCharges > 0 )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002002 (family, line 41505) ---
function Trig_Deal_Elemental_Effect_Func002Func001002002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Deal_Elemental_Effect_Func002Func001002002001(), Trig_Deal_Elemental_Effect_Func002Func001002002002() )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002 (family, line 41509) ---
function Trig_Deal_Elemental_Effect_Func002Func001002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Deal_Elemental_Effect_Func002Func001002001(), Trig_Deal_Elemental_Effect_Func002Func001002002() )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001Func002C (family, line 41513) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001Func002C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(udg_NiJan2)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001C (family, line 41526) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001A (family, line 41533) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001A takes nothing returns nothing
    if ( Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'h00A', GetOwningPlayer(udg_NiJan2), udg_ElementalBuffPoint, bj_UNIT_FACING )
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), ( 80.00 + ( 50.00 * I2R(GetUnitAbilityLevelSwapped('A03I', udg_NiJan2)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Weapons\\GryphonRiderMissile\\GryphonRiderMissileTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( ( I2S(R2I(( ( 50.00 * I2R(GetUnitAbilityLevelSwapped('A03I', udg_NiJan2)) ) + 80.00 ))) + "!" ), GetEnumUnit(), -30.00, 10.00, 10.00, 10.00, 90.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001C (family, line 41549) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001C (family, line 41556) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001C (family, line 41563) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003C (family, line 41570) ---
function Trig_Deal_Elemental_Effect_Func002Func003C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func007C (family, line 41577) ---
function Trig_Deal_Elemental_Effect_Func002Func007C takes nothing returns boolean
    if ( not ( udg_NumberofCharges == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002C (family, line 41584) ---
function Trig_Deal_Elemental_Effect_Func002C takes nothing returns boolean
    if ( not GetBooleanAnd( Trig_Deal_Elemental_Effect_Func002Func001001(), Trig_Deal_Elemental_Effect_Func002Func001002() ) ) then
        return false
    endif
    if ( not ( udg_ElementalBuffedUnit != null ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Actions (family, line 41594) ---
function Trig_Deal_Elemental_Effect_Actions takes nothing returns nothing
    call DestroyEffectBJ( udg_ElementalTrail )
    if ( Trig_Deal_Elemental_Effect_Func002C() ) then
        if ( Trig_Deal_Elemental_Effect_Func002Func003C() ) then
            call CreateNUnitsAtLoc( 1, 'h00A', GetOwningPlayer(udg_NiJan2), udg_ElementalBuffPoint, bj_UNIT_FACING )
            call RemoveLocation(udg_ElementalBuffPoint)
            call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A03N', GetLastCreatedUnit() )
            call SetUnitAbilityLevelSwapped( 'A03N', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A03I', udg_NiJan2) )
            call IssueTargetOrderBJ( GetLastCreatedUnit(), "acidbomb", udg_ElementalBuffedUnit )
        else
            if ( Trig_Deal_Elemental_Effect_Func002Func003Func001C() ) then
                call CreateNUnitsAtLoc( 1, 'h00A', GetOwningPlayer(udg_NiJan2), udg_ElementalBuffPoint, bj_UNIT_FACING )
                call RemoveLocation(udg_ElementalBuffPoint)
                call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                call UnitAddAbilityBJ( 'A03Z', GetLastCreatedUnit() )
                call SetUnitAbilityLevelSwapped( 'A03Z', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A03I', udg_NiJan2) )
                call IssueTargetOrderBJ( GetLastCreatedUnit(), "thunderbolt", udg_ElementalBuffedUnit )
            else
                if ( Trig_Deal_Elemental_Effect_Func002Func003Func001Func001C() ) then
                    call CreateNUnitsAtLoc( 1, 'h00A', GetOwningPlayer(udg_NiJan2), udg_ElementalBuffPoint, bj_UNIT_FACING )
                    call RemoveLocation(udg_ElementalBuffPoint)
                    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                    call UnitAddAbilityBJ( 'A03O', GetLastCreatedUnit() )
                    call SetUnitAbilityLevelSwapped( 'A03O', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A03I', udg_NiJan2) )
                    call IssueTargetOrderBJ( GetLastCreatedUnit(), "frostnova", udg_ElementalBuffedUnit )
                else
                    if ( Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001C() ) then
                        call ForGroupBJ( GetUnitsInRangeOfLocAll(350.00, GetUnitLoc(udg_NiJan2)), function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001A )
                    else
                        call DoNothing(  )
                    endif
                endif
            endif
        endif
        call RemoveLocation(udg_ElementalBuffPoint)
        set udg_NumberofCharges = ( udg_NumberofCharges - 1 )
        set udg_ElementalBuffedUnit = null
        if ( Trig_Deal_Elemental_Effect_Func002Func007C() ) then
            call UnitRemoveBuffBJ( 'B00C', GetEventDamageSource() )
        else
        endif
    else
    endif
endfunction

// --- InitTrig_Deal_Elemental_Effect (family, line 41641) ---
function InitTrig_Deal_Elemental_Effect takes nothing returns nothing
    set gg_trg_Deal_Elemental_Effect = CreateTrigger(  )
    call TriggerAddAction( gg_trg_Deal_Elemental_Effect, function Trig_Deal_Elemental_Effect_Actions )
endfunction

// === family Set_Charges (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Set_Charges_Conditions (family, line 41344) ---
function Trig_Set_Charges_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A03I' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Set_Charges_Func003A (family, line 41351) ---
function Trig_Set_Charges_Func003A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Set_Charges_Actions (family, line 41356) ---
function Trig_Set_Charges_Actions takes nothing returns nothing
    set udg_NiJan2 = GetTriggerUnit()
    set udg_NumberofCharges = ( 3 + ( GetUnitAbilityLevelSwapped('A03I', udg_NiJan2) * 3 ) )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_NiJan2), 'h00A'), function Trig_Set_Charges_Func003A )
endfunction

// --- InitTrig_Set_Charges (family, line 41363) ---
function InitTrig_Set_Charges takes nothing returns nothing
    set gg_trg_Set_Charges = CreateTrigger(  )
    call DisableTrigger( gg_trg_Set_Charges )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Set_Charges, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Set_Charges, Condition( function Trig_Set_Charges_Conditions ) )
    call TriggerAddAction( gg_trg_Set_Charges, function Trig_Set_Charges_Actions )
endfunction

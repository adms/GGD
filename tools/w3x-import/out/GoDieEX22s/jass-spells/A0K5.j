// rawcode: A0K5
// nameZh: 00-00 移動物品
// cooldown: {"1": 0.0}
// duration: {"1": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: MoveItem

// === family MoveItem (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MoveItem_Conditions (family, line 8412) ---
function Trig_MoveItem_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0K5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveItem_Func003Func003Func001C (family, line 8419) ---
function Trig_MoveItem_Func003Func003Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(udg_ItemUnit, Player(0)) == true ) ) then
        return false
    endif
    if ( not ( RectContainsUnit(gg_rct_LoveItemLimt, udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_ItemUnit))]) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveItem_Func003Func003Func002C (family, line 8429) ---
function Trig_MoveItem_Func003Func003Func002C takes nothing returns boolean
    if ( not ( IsUnitAlly(udg_ItemUnit, Player(6)) == true ) ) then
        return false
    endif
    if ( not ( RectContainsUnit(gg_rct_DieItemLimt, udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_ItemUnit))]) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveItem_Func003Func003C (family, line 8439) ---
function Trig_MoveItem_Func003Func003C takes nothing returns boolean
    if ( Trig_MoveItem_Func003Func003Func001C() ) then
        return true
    endif
    if ( Trig_MoveItem_Func003Func003Func002C() ) then
        return true
    endif
    return false
endfunction

// --- Trig_MoveItem_Func003Func005Func001C (family, line 8449) ---
function Trig_MoveItem_Func003Func005Func001C takes nothing returns boolean
    if ( not ( UnitItemInSlotBJ(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_ItemUnit))], udg_ItemNum) == null ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveItem_Func003Func006Func001C (family, line 8456) ---
function Trig_MoveItem_Func003Func006Func001C takes nothing returns boolean
    if ( not ( UnitItemInSlotBJ(udg_ItemUnit, udg_ItemNum) != null ) ) then
        return false
    endif
    if ( not ( udg_ItemCheck > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveItem_Func003C (family, line 8466) ---
function Trig_MoveItem_Func003C takes nothing returns boolean
    if ( not ( udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_ItemUnit))] != null ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_ItemUnit))]) == true ) ) then
        return false
    endif
    if ( not Trig_MoveItem_Func003Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_MoveItem_Actions (family, line 8479) ---
function Trig_MoveItem_Actions takes nothing returns nothing
    call SetUnitAnimation( GetTriggerUnit(), "Spell" )
    set udg_ItemUnit = GetTriggerUnit()
    if ( Trig_MoveItem_Func003C() ) then
        set udg_ItemCheck = 0
        set udg_ItemNum = 1
        loop
            exitwhen udg_ItemNum > 6
            if ( Trig_MoveItem_Func003Func005Func001C() ) then
                set udg_ItemCheck = ( udg_ItemCheck + 1 )
            else
            endif
            set udg_ItemNum = udg_ItemNum + 1
        endloop
        set udg_ItemNum = 1
        loop
            exitwhen udg_ItemNum > 6
            if ( Trig_MoveItem_Func003Func006Func001C() ) then
                set udg_ItemCheck = ( udg_ItemCheck - 1 )
                call UnitRemoveItemSwapped( UnitItemInSlotBJ(udg_ItemUnit, udg_ItemNum), udg_ItemUnit )
                call UnitAddItemSwapped( GetLastRemovedItem(), udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_ItemUnit))] )
            else
            endif
            set udg_ItemNum = udg_ItemNum + 1
        endloop
    else
    endif
    call TriggerSleepAction( 3.00 )
    call SetUnitAnimation( udg_ItemUnit, "Stand" )
endfunction

// --- InitTrig_MoveItem (family, line 8511) ---
function InitTrig_MoveItem takes nothing returns nothing
    set gg_trg_MoveItem = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MoveItem, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MoveItem, Condition( function Trig_MoveItem_Conditions ) )
    call TriggerAddAction( gg_trg_MoveItem, function Trig_MoveItem_Actions )
endfunction

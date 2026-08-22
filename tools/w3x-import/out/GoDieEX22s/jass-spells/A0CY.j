// rawcode: A0CY
// nameZh: 57-00 四次元口袋
// cooldown: {"1": 20.0}
// mana: {"1": 75}
// area: {"1": 800.0}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: PacketItem

// === family PacketItem (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_PacketItem_Conditions (family, line 45569) ---
function Trig_PacketItem_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CY' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PacketItem_Func002Func001Func001C (family, line 45576) ---
function Trig_PacketItem_Func002Func001Func001C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 6) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PacketItem_Func002Func001C (family, line 45583) ---
function Trig_PacketItem_Func002Func001C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 5) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PacketItem_Func002C (family, line 45590) ---
function Trig_PacketItem_Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 4) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PacketItem_Actions (family, line 45597) ---
function Trig_PacketItem_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.50 )
    if ( Trig_PacketItem_Func002C() ) then
        if ( Trig_PacketItem_Func002Func001C() ) then
            if ( Trig_PacketItem_Func002Func001Func001C() ) then
                call CreateItemLoc( 'whwd', GetUnitLoc(GetTriggerUnit()) )
            else
                call CreateItemLoc( 'pres', GetUnitLoc(GetTriggerUnit()) )
            endif
        else
            call CreateItemLoc( 'pghe', GetUnitLoc(GetTriggerUnit()) )
        endif
    else
        call CreateItemLoc( 'phea', GetUnitLoc(GetTriggerUnit()) )
    endif
endfunction

// --- InitTrig_PacketItem (family, line 45615) ---
function InitTrig_PacketItem takes nothing returns nothing
    set gg_trg_PacketItem = CreateTrigger(  )
    call DisableTrigger( gg_trg_PacketItem )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PacketItem, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_PacketItem, Condition( function Trig_PacketItem_Conditions ) )
    call TriggerAddAction( gg_trg_PacketItem, function Trig_PacketItem_Actions )
endfunction

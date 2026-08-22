// rawcode: A0AG
// nameZh: 58-04-x 傷害刺激
// w3a base: AItx  levels: 50
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: WildPikaAttacked

// === family WildPikaAttacked (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_WildPikaAttacked_Func002C (family, line 40344) ---
function Trig_WildPikaAttacked_Func002C takes nothing returns boolean
    if ( ( GetAttackedUnitBJ() == udg_PikaUnit ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_WildPikaAttacked_Conditions (family, line 40351) ---
function Trig_WildPikaAttacked_Conditions takes nothing returns boolean
    if ( not Trig_WildPikaAttacked_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_WildPikaAttacked_Func001C (family, line 40358) ---
function Trig_WildPikaAttacked_Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0AG', udg_PikaUnit) >= 50 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WildPikaAttacked_Actions (family, line 40365) ---
function Trig_WildPikaAttacked_Actions takes nothing returns nothing
    if ( Trig_WildPikaAttacked_Func001C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
        call SetUnitAbilityLevelSwapped( 'A0AG', udg_PikaUnit, 50 )
        call SetUnitVertexColorBJ( udg_PikaUnit, 100, 0.00, 0.00, 0 )
    else
        call IncUnitAbilityLevelSwapped( 'A0AG', udg_PikaUnit )
        call SetUnitVertexColorBJ( udg_PikaUnit, 100, ( 100.00 - I2R(( GetUnitAbilityLevelSwapped('A0AG', udg_PikaUnit) * 2 )) ), ( 100.00 - I2R(( GetUnitAbilityLevelSwapped('A0AG', udg_PikaUnit) * 2 )) ), 0 )
    endif
endfunction

// --- InitTrig_WildPikaAttacked (family, line 40377) ---
function InitTrig_WildPikaAttacked takes nothing returns nothing
    set gg_trg_WildPikaAttacked = CreateTrigger(  )
    call DisableTrigger( gg_trg_WildPikaAttacked )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WildPikaAttacked, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_WildPikaAttacked, Condition( function Trig_WildPikaAttacked_Conditions ) )
    call TriggerAddAction( gg_trg_WildPikaAttacked, function Trig_WildPikaAttacked_Actions )
endfunction

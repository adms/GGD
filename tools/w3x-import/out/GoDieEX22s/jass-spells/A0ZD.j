// rawcode: A0ZD
// nameZh: 98-01 理財的習慣
// w3a base: AOcr  levels: 4
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: GoldWood

// === family GoldWood (passive) events=none ===

// --- Trig_GoldWood_Conditions (family, line 55095) ---
function Trig_GoldWood_Conditions takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0ZD', udg_Mentor) > 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GoldWood_Actions (family, line 55102) ---
function Trig_GoldWood_Actions takes nothing returns nothing
    set udg_Mentor_GoldAdd = R2I(( ( 0.01 * I2R(GetUnitAbilityLevelSwapped('A0ZD', udg_Mentor)) ) * I2R(GetPlayerState(GetOwningPlayer(udg_Mentor), PLAYER_STATE_RESOURCE_GOLD)) ))
    set udg_Mentor_WoodAdd = R2I(( ( 0.01 * I2R(GetUnitAbilityLevelSwapped('A0ZD', udg_Mentor)) ) * I2R(GetPlayerState(GetOwningPlayer(udg_Mentor), PLAYER_STATE_RESOURCE_LUMBER)) ))
    call AdjustPlayerStateBJ( udg_Mentor_GoldAdd, GetOwningPlayer(udg_Mentor), PLAYER_STATE_RESOURCE_GOLD )
    call AdjustPlayerStateBJ( udg_Mentor_WoodAdd, GetOwningPlayer(udg_Mentor), PLAYER_STATE_RESOURCE_LUMBER )
    call TextUse(  ("+" + I2S(udg_Mentor_GoldAdd) )  , udg_Mentor , 10 , 4 , 90,90,0)
    call TextUse(  ( "+" + I2S(udg_Mentor_WoodAdd) )  , udg_Mentor , 10 , 4 , 0,90,0)
endfunction

// --- InitTrig_GoldWood (family, line 55112) ---
function InitTrig_GoldWood takes nothing returns nothing
    set gg_trg_GoldWood = CreateTrigger(  )
    call DisableTrigger( gg_trg_GoldWood )
    call TriggerRegisterTimerEventPeriodic( gg_trg_GoldWood, 60.00 )
    call TriggerAddCondition( gg_trg_GoldWood, Condition( function Trig_GoldWood_Conditions ) )
    call TriggerAddAction( gg_trg_GoldWood, function Trig_GoldWood_Actions )
endfunction

// --- TextUse (helper, line 4866) ---
function TextUse takes string s1,unit u1,real size,real lifetime,real red,real green,real blue returns nothing
    call CreateTextTagUnitBJ( s1, u1, 0, size, red, green, blue, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 75.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), lifetime )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.80 )
endfunction

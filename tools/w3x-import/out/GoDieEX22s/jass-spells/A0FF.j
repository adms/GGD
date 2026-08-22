// rawcode: A0FF
// nameZh: 65-002 永恆的愚蠢鄉
// cooldown: {"2": 90.0, "3": 90.0}
// mana: {"1": 150, "2": 250, "3": 350}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: StupidReady

// === family StupidReady (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_StupidReady_Conditions (family, line 47102) ---
function Trig_StupidReady_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0FF' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_StupidReady_Actions (family, line 47109) ---
function Trig_StupidReady_Actions takes nothing returns nothing
    set udg_MoriyaUnit = GetTriggerUnit()
    set udg_StupidMoriya = ( I2R(( GetHeroLevel(GetTriggerUnit()) + GetRandomInt(5, 10) )) * 200.00 )
    call EnableTrigger( gg_trg_stupidStart )
    call TriggerSleepAction( 6.00 )
    call DisableTrigger( gg_trg_stupidStart )
endfunction

// --- InitTrig_StupidReady (family, line 47118) ---
function InitTrig_StupidReady takes nothing returns nothing
    set gg_trg_StupidReady = CreateTrigger(  )
    call DisableTrigger( gg_trg_StupidReady )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_StupidReady, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_StupidReady, Condition( function Trig_StupidReady_Conditions ) )
    call TriggerAddAction( gg_trg_StupidReady, function Trig_StupidReady_Actions )
endfunction

// rawcode: A0FS
// nameZh: 69-04 魔力增幅
// w3a base: Aamk  levels: 3
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: ManaIcrease

// === family ManaIcrease (passive) events=EVENT_PLAYER_HERO_LEVEL,EVENT_PLAYER_HERO_SKILL ===

// --- Trig_ManaIcrease_Conditions (family, line 32708) ---
function Trig_ManaIcrease_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'E00Q' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManaIcrease_Func002C (family, line 32715) ---
function Trig_ManaIcrease_Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0FS', GetTriggerUnit()) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ManaIcrease_Actions (family, line 32722) ---
function Trig_ManaIcrease_Actions takes nothing returns nothing
    call SetPlayerTechResearchedSwap( 'Rhpt', GetUnitAbilityLevelSwapped('A0FS', GetTriggerUnit()), GetOwningPlayer(GetTriggerUnit()) )
    if ( Trig_ManaIcrease_Func002C() ) then
        call DisableTrigger( GetTriggeringTrigger() )
    else
        call DoNothing(  )
    endif
endfunction

// --- InitTrig_ManaIcrease (family, line 32732) ---
function InitTrig_ManaIcrease takes nothing returns nothing
    set gg_trg_ManaIcrease = CreateTrigger(  )
    call DisableTrigger( gg_trg_ManaIcrease )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ManaIcrease, EVENT_PLAYER_HERO_SKILL )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ManaIcrease, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_ManaIcrease, Condition( function Trig_ManaIcrease_Conditions ) )
    call TriggerAddAction( gg_trg_ManaIcrease, function Trig_ManaIcrease_Actions )
endfunction

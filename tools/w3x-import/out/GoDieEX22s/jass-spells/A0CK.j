// rawcode: A0CK
// nameZh: 28-02 把你變成餅乾
// w3a base: AHtb  levels: 6
// cooldown: {"1": 60.0, "2": 50.0, "3": 40.0, "4": 30.0, "5": 20.0, "6": 10.0}
// mana: {"1": 100, "2": 160, "3": 220, "4": 280, "5": 340, "6": 400}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582, "5": 0.009999999776482582, "6": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582, "5": 0.009999999776482582, "6": 0.009999999776482582}
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: Cookie

// === family Cookie (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Cookie_Func001Func003C (family, line 40519) ---
function Trig_Cookie_Func001Func003C takes nothing returns boolean
    if ( ( GetOwningPlayer(GetSpellTargetUnit()) == Player(0) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetSpellTargetUnit()) == Player(6) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetSpellTargetUnit()) == Player(PLAYER_NEUTRAL_AGGRESSIVE) ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Cookie_Func001C (family, line 40532) ---
function Trig_Cookie_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CK' ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetSpellTargetUnit(), UNIT_TYPE_HERO) != true ) ) then
        return false
    endif
    if ( not Trig_Cookie_Func001Func003C() ) then
        return false
    endif
    if ( not ( GetUnitLevel(GetSpellTargetUnit()) < 10 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Cookie_Conditions (family, line 40548) ---
function Trig_Cookie_Conditions takes nothing returns boolean
    if ( not Trig_Cookie_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Cookie_Func006A (family, line 40555) ---
function Trig_Cookie_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Cookie_Func007A (family, line 40560) ---
function Trig_Cookie_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Cookie_Func008A (family, line 40565) ---
function Trig_Cookie_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Cookie_Actions (family, line 40570) ---
function Trig_Cookie_Actions takes nothing returns nothing
    call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Abilities\\Spells\\Orc\\FeralSpirit\\feralspiritdone.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PlaySoundOnUnitBJ( gg_snd_EggSackDeath1, 100.00, GetTriggerUnit() )
    call CreateItemLoc( 'I03N', GetUnitLoc(GetSpellTargetUnit()) )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h02J'), function Trig_Cookie_Func006A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h02J'), function Trig_Cookie_Func007A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h02J'), function Trig_Cookie_Func008A )
endfunction

// --- InitTrig_Cookie (family, line 40581) ---
function InitTrig_Cookie takes nothing returns nothing
    set gg_trg_Cookie = CreateTrigger(  )
    call DisableTrigger( gg_trg_Cookie )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Cookie, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Cookie, Condition( function Trig_Cookie_Conditions ) )
    call TriggerAddAction( gg_trg_Cookie, function Trig_Cookie_Actions )
endfunction

// rawcode: A0I8
// hero: godie-e00t (slot W)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e00t.json
// nameZh: 驚駭
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e00t.json#abilities.W
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Zgv actions=ZGv (trigger var WP)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 55.0, "2": 50.0, "3": 45.0, "4": 40.0}
// mana: {"1": 150, "2": 150, "3": 150, "4": 150}
// data[1] per level: {"2": 0.0, "1": 0.0, "3": 0.0, "4": 0.0}
// data[3] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "thunderclap", "2": "thunderclap", "3": "thunderclap", "4": "thunderclap"}
// slice tiers: core=['Zgv', 'ZGv'] depth1=[] depth2=[]

// --- Zgv (core, line 25382 in war3map.j) ---
function Zgv takes nothing returns boolean
return(GetSpellAbilityId()=='A0I8')
endfunction

// --- ZGv (core, line 25385 in war3map.j) ---
function ZGv takes nothing returns nothing
call TriggerSleepAction(.0)
set f=GetUnitLoc(GetTriggerUnit())
call CreateNUnitsAtLoc(1,'ogru',GetOwningPlayer(GetTriggerUnit()),f,bj_UNIT_FACING)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A0I9')
call SetUnitAbilityLevelSwapped('A0I9',bj_lastCreatedUnit,GetUnitAbilityLevelSwapped('A0I8',GetTriggerUnit()))
call SetUnitFacingToFaceLocTimed(bj_lastCreatedUnit,f,0)
call IssuePointOrderByIdLoc(bj_lastCreatedUnit,$D0270,f)
call RemoveLocation(f)
call PlaySoundOnUnitBJ(KD,100.,GetTriggerUnit())
endfunction

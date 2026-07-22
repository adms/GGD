// rawcode: A0NE
// hero: godie-n00b (slot W)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-n00b.json
// nameZh: 複製鏡
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-n00b.json#abilities.W
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_CAST cond=wmv actions=wpv (trigger var qp)
// w3a base: AIil  levels: 3
// cooldown: {"1": 75.0, "2": 75.0, "3": 75.0}
// mana: {"1": 200, "2": 300, "3": 400}
// range: {"1": 600.0, "2": 600.0, "3": 600.0}
// area: {"2": 200.0, "3": 200.0}
// duration: {"1": 20.0, "2": 25.0, "3": 30.0}
// hero_duration: {"1": 20.0, "2": 25.0, "3": 30.0}
// slice tiers: core=['wmv', 'wpv'] depth1=['wMv'] depth2=[]

// --- wmv (core, line 23820 in war3map.j) ---
function wmv takes nothing returns boolean
return(GetSpellAbilityId()=='A0NE')
endfunction

// --- wMv (depth1, line 23823 in war3map.j) ---
function wMv takes nothing returns boolean
return(GetSpellTargetUnit()==AS)
endfunction

// --- wpv (core, line 23826 in war3map.j) ---
function wpv takes nothing returns nothing
if(wMv())then
call IssueImmediateOrderById(GetTriggerUnit(),$D0004)
endif
call PlaySoundOnUnitBJ(df,100.,GetTriggerUnit())
endfunction

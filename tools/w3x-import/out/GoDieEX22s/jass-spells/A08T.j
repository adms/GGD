// rawcode: A08T
// hero: godie-u00k (slot W)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-u00k.json
// nameZh: 靈魂吸取
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-u00k.json#abilities.W
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=EVENT_PLAYER_UNIT_DEATH cond=zPv actions=zQv (trigger var pP)
// handler: event=EVENT_PLAYER_UNIT_DEATH cond=None actions=zQv (trigger var pP)
// w3a base: Afrz  levels: 4
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582, "4": 0.009999999776482582}
// slice tiers: core=['zPv', 'zQv'] depth1=['zqv'] depth2=[]

// --- zPv (core, line 25069 in war3map.j) ---
function zPv takes nothing returns boolean
return(GetKillingUnit()==mo)and(GetUnitAbilityLevelSwapped('A08T',mo)>0)
endfunction

// --- zqv (depth1, line 25072 in war3map.j) ---
function zqv takes nothing returns boolean
return(vO<=0)
endfunction

// --- zQv (core, line 25075 in war3map.j) ---
function zQv takes nothing returns nothing
set vO=(vO+1)
set eO=(IMinBJ($A,vO)*GetUnitAbilityLevelSwapped('A08T',mo))
call SetUnitAbilityLevelSwapped('A0RC',mo,eO)
call TriggerSleepAction(20.)
set vO=(vO-1)
if(zqv())then
set eO=0
else
set eO=(IMinBJ($A,vO)*GetUnitAbilityLevelSwapped('A08T',mo))
endif
call SetUnitAbilityLevelSwapped('A0RC',mo,eO)
endfunction

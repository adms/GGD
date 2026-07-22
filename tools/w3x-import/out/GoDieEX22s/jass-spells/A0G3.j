// rawcode: A0G3
// hero: godie-hpb1 (slot E)  championDoc: content/champions/godie-hpb1.json
// nameZh: 列、在、前
// abilityDoc: content/abilities/godie-hpb1.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=juv actions=jWv (trigger var kl)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 65.0, "2": 65.0, "3": 65.0, "4": 65.0}
// mana: {"1": 220, "2": 250, "3": 280, "4": 310}
// range: {"1": 800.0, "2": 800.0, "3": 800.0, "4": 800.0}
// area: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 2, "3": 2, "4": 2, "2": 2}
// data[3] per level: {"1": 3, "3": 3, "2": 3, "4": 3}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "silence", "2": "silence", "3": "silence", "4": "silence"}
// slice tiers: core=['juv', 'jWv'] depth1=['jUv', 'jwv'] depth2=[]

// --- juv (core, line 17635 in war3map.j) ---
function juv takes nothing returns boolean
return(GetSpellAbilityId()=='A0G3')
endfunction

// --- jUv (depth1, line 17638 in war3map.j) ---
function jUv takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(GetTriggerUnit())))]==false)
endfunction

// --- jwv (depth1, line 17641 in war3map.j) ---
function jwv takes nothing returns boolean
return(oo==2)
endfunction

// --- jWv (core, line 17644 in war3map.j) ---
function jWv takes nothing returns nothing
set Tx=.0
set ux=GetTriggerUnit()
set Ux=GetUnitLoc(GetTriggerUnit())
set wx=GetSpellTargetLoc()
set Wx=AngleBetweenPoints(Ux,wx)
set yx=(DistanceBetweenPoints(Ux,wx)/ 41.)
call CreateTextTagUnitBJ("列、在、前",GetTriggerUnit(),-30.,16.,100.,100.,100.,10.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,3.)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
call PauseUnit(GetTriggerUnit(),true)
call SetUnitPathing(GetTriggerUnit(),false)
call UnitAddAbility(GetTriggerUnit(),'A0FZ')
call SetUnitTimeScalePercent(GetTriggerUnit(),40.)
call SetUnitAnimation(GetTriggerUnit(),"attack slam")
set eo=I2R((((GetHeroStatBJ(0,GetTriggerUnit(),true)*2)+(GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())*'d'))+350))
if(jwv())then
if(jUv())then
set eo=((5.*I2R(GetHeroStatBJ(1,GetTriggerUnit(),true)))+eo)
else
set eo=((10.*I2R(GetHeroStatBJ(1,GetTriggerUnit(),true)))+eo)
endif
call CreateTextTagUnitBJ("連技！",GetTriggerUnit(),-30.,12.,'d',.0,.0,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,GetUnitFacing(GetTriggerUnit()))
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
endif
call PlaySoundBJ(hD)
call EnableTrigger(Kl)
endfunction

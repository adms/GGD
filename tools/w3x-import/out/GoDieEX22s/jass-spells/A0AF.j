// rawcode: A0AF
// hero: godie-u00l (slot Q)  championDoc: content/champions/godie-u00l.json
// nameZh: 北斗懺悔拳
// abilityDoc: content/abilities/godie-u00l.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=MBv actions=Mdv (trigger var Em)
// w3a base: ANcl  levels: None
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0, "5": 8.0}
// mana: {"1": 90, "2": 120, "3": 150, "4": 325, "5": 85}
// range: {"2": 150.0, "3": 150.0, "4": 250.0, "5": 9999.0, "1": 150.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0, "5": 0.0}
// data[2] per level: {"1": 1, "2": 1, "3": 1, "5": 3, "4": 1}
// data[3] per level: {"1": 29, "2": 29, "3": 29, "5": 5, "4": 29}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0, "5": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
// data[6] per level: {"1": "cripple", "2": "cripple", "3": "cripple", "4": "cripple", "5": "coldarrows"}
// slice tiers: core=['MBv', 'Mdv'] depth1=['MCv'] depth2=['Mcv']

// --- MBv (core, line 20007 in war3map.j) ---
function MBv takes nothing returns boolean
return(GetSpellAbilityId()=='A0AF')
endfunction

// --- Mcv (depth2, line 20010 in war3map.j) ---
function Mcv takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(Hx)))])and(GetUnitTypeId(GetAttacker())=='U00L')
endfunction

// --- MCv (depth1, line 20013 in war3map.j) ---
function MCv takes nothing returns boolean
return(Mcv())
endfunction

// --- Mdv (core, line 20016 in war3map.j) ---
function Mdv takes nothing returns nothing
set hx=GetSpellTargetUnit()
set Hx=GetTriggerUnit()
call CreateTextTagUnitBJ("你還有 3 秒可以懺悔這輩子的罪孽",hx,0,10.,100.,50.,50.,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,32.,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
call TriggerSleepAction(1.)
call PlaySoundOnUnitBJ(SD,100.,Hx)
call CreateTextTagUnitBJ("2",hx,0,10.,100.,50.,50.,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,32.,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,1.)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.)
call TriggerSleepAction(1.)
call PlaySoundOnUnitBJ(eD,100.,Hx)
call CreateTextTagUnitBJ("1",hx,0,10.,100.,50.,50.,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,32.,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,1.)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.)
call TriggerSleepAction(1.)
call PlaySoundOnUnitBJ(sD,100.,Hx)
call AddSpecialEffectTargetUnitBJ("body",hx,"Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call CreateNUnitsAtLoc(1,'o001',GetOwningPlayer(Hx),GetUnitLoc(hx),bj_UNIT_FACING)
call UnitApplyTimedLifeBJ(.8,'BTLF',bj_lastCreatedUnit)
if(MCv())then
call UnitDamageTargetBJ(bj_lastCreatedUnit,hx,((((I2R(GetUnitAbilityLevelSwapped('A0AF',Hx))*150.)+.0)+(I2R(GetHeroStatBJ(0,Hx,true))*9.))+.0),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
else
call UnitDamageTargetBJ(bj_lastCreatedUnit,hx,((((I2R(GetUnitAbilityLevelSwapped('A0AF',Hx))*150.)+.0)+(I2R(GetHeroStatBJ(0,Hx,true))*3.))+.0),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
call AddSpecialEffectTargetUnitBJ("chest",hx,"Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call SetUnitAnimation(hx,"death")
endfunction

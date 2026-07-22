// rawcode: A0OV
// hero: godie-e015 (slot Q)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e015.json
// nameZh: 北斗爆橘拳
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e015.json#abilities.Q
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=ame actions=aPe (trigger var WQ)
// w3a base: ANcl  levels: None
// cooldown: {"1": 25.0, "2": 25.0, "3": 25.0, "4": 25.0, "5": 8.0}
// mana: {"1": 50, "2": 100, "3": 150, "4": 325, "5": 85}
// range: {"2": 150.0, "3": 150.0, "4": 250.0, "5": 9999.0, "1": 150.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0, "5": 0.0}
// data[2] per level: {"1": 1, "2": 1, "3": 1, "5": 3, "4": 1}
// data[3] per level: {"1": 29, "2": 29, "3": 29, "5": 5, "4": 29}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0, "5": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
// data[6] per level: {"1": "cripple", "2": "cripple", "3": "cripple", "4": "cripple", "5": "coldarrows"}
// slice tiers: core=['ame', 'aPe'] depth1=['Ru', 'aMe', 'ape'] depth2=[]

// --- Ru (depth1, line 3068 in war3map.j) ---
function Ru takes string s1,unit u1,real Iu,real Au,real Nu,real bu,real Bu returns nothing
call CreateTextTagUnitBJ(s1,u1,0,Iu,Nu,bu,Bu,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,75.,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,Au)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.8)
endfunction

// --- ame (core, line 27897 in war3map.j) ---
function ame takes nothing returns boolean
return(GetSpellAbilityId()=='A0OV')
endfunction

// --- aMe (depth1, line 27900 in war3map.j) ---
function aMe takes nothing returns boolean
return(UnitHasBuffBJ(Ib,'B04K'))
endfunction

// --- ape (depth1, line 27903 in war3map.j) ---
function ape takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(Ib)))])
endfunction

// --- aPe (core, line 27906 in war3map.j) ---
function aPe takes nothing returns nothing
set db=GetSpellTargetUnit()
call Ru("北斗爆橘拳",db,20,4,'d',0,0)
call PlaySoundOnUnitBJ(sD,100.,Ib)
call AddSpecialEffectTargetUnitBJ("body",db,"Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call CreateNUnitsAtLoc(1,'o001',GetOwningPlayer(Ib),GetUnitLoc(db),bj_UNIT_FACING)
call UnitApplyTimedLifeBJ(.8,'BTLF',bj_lastCreatedUnit)
call UnitDamageTargetBJ(Ib,db,((((I2R(GetUnitAbilityLevelSwapped('A0OV',Ib))*100.)+.0)+(I2R(GetHeroStatBJ(0,Ib,true))*2.))+.0),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
if(aMe())then
call UnitDamageTargetBJ(Ib,db,(I2R(GetHeroStatBJ(0,Ib,true))*1.5),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
if(ape())then
call UnitDamageTargetBJ(Ib,db,(I2R(GetHeroStatBJ(0,Ib,true))*5.),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
call SetWidgetLife(Ib,(GetUnitStateSwap(UNIT_STATE_LIFE,Ib)+(100.*I2R(GetUnitAbilityLevelSwapped('A0OV',Ib)))))
call AddSpecialEffectTargetUnitBJ("chest",db,"Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call SetUnitAnimation(db,"death")
endfunction

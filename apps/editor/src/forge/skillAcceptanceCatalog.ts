import type { SkillTypePreset } from "./skillTypePresets";

export type SkillAcceptanceGroup = "owner-union" | "runtime-coverage";

export interface SkillAcceptanceCandidate {
  readonly id: string;
  readonly name: string;
  readonly group: SkillAcceptanceGroup;
  readonly acceptance: string;
  readonly forgeTypeId?: SkillTypePreset["id"];
  readonly vfxFixture?: true;
  readonly mirrorOf?: string;
  readonly chain?: string;
  readonly requiredEffectKinds?: readonly string[];
  readonly requiredHooks?: readonly string[];
  readonly requiredConditionKinds?: readonly string[];
  readonly requiredTemplateIds?: readonly string[];
}

/**
 * A theme is the player-facing mechanic being proven, while a candidate is one
 * concrete shipped JSON document. Mirrors intentionally share a theme, and the
 * three-document Avalon activation/retaliation chain is one end-to-end theme.
 * Keeping this derivation next to the catalogue prevents the UI from claiming
 * "42" while tests only count the 46 files.
 */
export function skillAcceptanceThemeId(candidate: SkillAcceptanceCandidate): string {
  if (candidate.chain) return `chain:${candidate.chain}`;
  return `ability:${candidate.mirrorOf ?? candidate.id}`;
}

const owner = (
  candidate: Omit<SkillAcceptanceCandidate, "group">,
): SkillAcceptanceCandidate => ({ ...candidate, group: "owner-union" });

const runtime = (
  candidate: Omit<SkillAcceptanceCandidate, "group">,
): SkillAcceptanceCandidate => ({ ...candidate, group: "runtime-coverage" });

/**
 * Existing shipped abilities used to prove that Forge can rebuild real content.
 *
 * This is deliberately an Editor-owned acceptance catalogue, not game content:
 * it never writes the listed documents and it does not make them promotable.
 * The first 25 rows are the Owner's VFX set + the 14 Forge archetypes + explicit
 * additions. The remaining 21 rows close every effect/hook/condition currently
 * exercised by shipped ability documents.
 */
export const SKILL_ACCEPTANCE_CANDIDATES: readonly SkillAcceptanceCandidate[] = [
  owner({
    id: "godie-hart.r", name: "01-04 超究武神霸斬", forgeTypeId: "combo", vfxFixture: true,
    requiredEffectKinds: ["comboStrikes", "invulnerable"],
    acceptance: "七次傷害逐擊對齊施法者揮砍與目標受擊，最後才播放黃藍終結光柱；不得用大量月牙代替角色動作。",
  }),
  owner({
    id: "godie-hjai.e", name: "04-03 龍破斬", forgeTypeId: "projectile-blast", vfxFixture: true,
    requiredEffectKinds: ["spawnModelFx", "damageArea"], requiredConditionKinds: ["recentCast"],
    acceptance: "投射物先飛行再於遠端爆炸；沿途命中與終點範圍分開，詠唱、震動、爆炸與傷害點對齊。",
  }),
  owner({
    id: "godie-h020.e", name: "04-03 龍破斬", mirrorOf: "godie-hjai.e",
    requiredEffectKinds: ["spawnModelFx", "damageArea"], requiredConditionKinds: ["recentCast"],
    acceptance: "與 godie-hjai.e 的機制、級距和演出一致；任何逐欄差異都必須在重建前顯示。",
  }),
  owner({
    id: "godie-hjai.r", name: "04-04 神滅斬", vfxFixture: true,
    requiredEffectKinds: ["damage", "applyStatus"], requiredConditionKinds: ["recentCast"],
    acceptance: "角色實際衝向目標完成黑色光刀斬擊；傷害與暈眩同時落在命中點，近期EX增幅只套一次。",
  }),
  owner({
    id: "godie-nbbc.r", name: "08-04 阿邦快速劍X", vfxFixture: true,
    requiredEffectKinds: ["damageLine", "blink", "damageArea"],
    acceptance: "A式直線衝擊波先發生，B式再瞬移斬擊；只有交叉點產生額外範圍傷害。",
  }),
  owner({
    id: "godie-nbbc.e", name: "08-03 龍鬥氣砲咒文", vfxFixture: true,
    requiredEffectKinds: ["spawnProjectile", "damage"],
    acceptance: "藍色橫向氣功砲從角色前方發射，施法動作、方向、碰撞與傷害線一致。",
  }),
  owner({
    id: "godie-ogrh.r", name: "09-04 龜派氣功", forgeTypeId: "beam", vfxFixture: true,
    requiredEffectKinds: ["damageLine", "screenShake"],
    acceptance: "蓄力後發射橘色橫向光束；長度、寬度、直線傷害、震動及超級賽亞人增幅正確。",
  }),
  owner({
    id: "godie-o00x.r", name: "09-04 龜派氣功", mirrorOf: "godie-ogrh.r",
    requiredEffectKinds: ["damageLine", "screenShake"],
    acceptance: "與 godie-ogrh.r 逐欄一致；角色模型差異不得改變光束尺寸、時序或傷害線。",
  }),
  owner({
    id: "godie-e002.ex", name: "20-002 解放.約束勝利劍MAX", forgeTypeId: "reactive", vfxFixture: true,
    chain: "avalon-ex", requiredHooks: ["onReflectSuccess"], requiredEffectKinds: ["delayed", "damageLine"],
    acceptance: "只能由真反彈成功事件觸發；七斬逐擊有攻擊與受擊動作，最後才施放直線終結砲，禁止假 cast。",
  }),
  owner({
    id: "godie-e00l.r", name: "20-04 Avalon-永恆的理想鄉", chain: "avalon-ex",
    requiredHooks: ["onDamageTaken", "onReflectSuccess"], requiredEffectKinds: ["applyBuff", "damage"],
    acceptance: "啟動兩秒反彈狀態；只反彈符合條件的承受傷害，每次成功只能送出一則反彈事件。",
  }),
  owner({
    id: "godie-e00l.ex", name: "20-002 解放.約束勝利劍MAX", chain: "avalon-ex", mirrorOf: "godie-e002.ex",
    requiredHooks: ["onReflectSuccess"], requiredEffectKinds: ["delayed", "damageLine"],
    acceptance: "承接 godie-e00l.r 的反彈事件並完整播放七斬與終結砲；與 godie-e002.ex 的差異必須可見。",
  }),
  owner({
    id: "godie-hvsh.r", name: "48-04 騎英之疆繩", vfxFixture: true,
    requiredEffectKinds: ["spawnModelFx"],
    acceptance: "飛馬載角色高速衝刺後接藍色橫向砲；角色位移、衝撞與光束不能脫節。",
  }),
  owner({
    id: "godie-hvwd.e", name: "02-03 魂飛魄散", forgeTypeId: "single-burst",
    requiredTemplateIds: ["tpl-single-strike"],
    acceptance: "卡面描述為直線、模板卻是單體；Editor 必須標紅語意衝突，不能靜默通過。",
  }),
  owner({
    id: "godie-o00k.e", name: "86-03 神鳴", forgeTypeId: "instant-area",
    requiredTemplateIds: ["tpl-instant-blast"],
    acceptance: "卡面描述為前方直線、模板卻是瞬發範圍；Editor 必須顯示衝突並允許換成直線積木。",
  }),
  owner({
    id: "godie-hjai.w", name: "04-02 炸彈陣", forgeTypeId: "periodic-field",
    requiredTemplateIds: ["tpl-periodic-field"],
    acceptance: "區域先持續五秒週期傷害，火柱消失後仍有殘留DoT；兩個持續階段不可合併。",
  }),
  owner({
    id: "godie-nbbc.w", name: "08-02 萊丁快速劍", forgeTypeId: "blink-strike",
    requiredEffectKinds: ["blink"], requiredTemplateIds: ["tpl-single-strike"],
    acceptance: "鎖定目標後瞬移至身前斬擊，附近雷擊是第二個範圍效果，不得只留下單體傷害。",
  }),
  owner({
    id: "godie-u00v.r", name: "78-04 死亡噴射肘擊", forgeTypeId: "charge-push",
    requiredEffectKinds: ["blink", "knockback", "applyStatus"],
    acceptance: "卡面寫飛奔、現況卻是 blink；重建時必須顯示差異並驗證衝鋒、撞擊、擊退與暈眩。",
  }),
  owner({
    id: "godie-hapm.w", name: "52-02 蹂躪編年史", forgeTypeId: "leap",
    requiredEffectKinds: ["leap", "invulnerable"], requiredConditionKinds: ["status"],
    acceptance: "抓取、拋出及沿線碰撞分階段；狂怒時才追加恐懼，無敵窗不得超過動作。",
  }),
  owner({
    id: "godie-e001.r", name: "22-04 雛見澤症候群L5", forgeTypeId: "self-buff",
    requiredEffectKinds: ["championForm", "applyBuff"],
    acceptance: "變身期間提高攻擊與移速並降低最大生命；結束後完整復原，不留下永久屬性。",
  }),
  owner({
    id: "godie-e00s.w", name: "70-02 大怒石", forgeTypeId: "on-attack",
    requiredHooks: ["onBasicAttack"], requiredEffectKinds: ["damageArea"],
    acceptance: "每次普攻觸發小範圍擴散，30/40/50/60%逐級正確；被動不得播放主動施法動作。",
  }),
  owner({
    id: "godie-etyr.r", name: "14-04 聖夜降臨", forgeTypeId: "summon",
    requiredTemplateIds: ["tpl-summon-agent"], requiredEffectKinds: ["damageArea"],
    acceptance: "召喚一個式神維持八秒，召喚瞬間另有範圍傷害；死亡及到期清理正確。",
  }),
  owner({
    id: "godie-ogld.ex", name: "72-002 億萬衛星殞落", forgeTypeId: "barrage",
    requiredEffectKinds: ["randomArea", "damageArea"],
    acceptance: "三十秒內每秒一個隨機落點，共三十次；每顆分別判定範圍，不能全部疊在中心。",
  }),
  owner({
    id: "godie-udea.r", name: "65-04 天譴",
    requiredEffectKinds: ["chainLightning", "spendMana", "damageArea"],
    acceptance: "最多二十個起點各開獨立連鎖，每鏈最多十六次且每跳剩九成；逐擊燒魔並對最近目標追加傷害。",
  }),
  owner({
    id: "godie-h01n.r", name: "79-04 卍解",
    requiredEffectKinds: ["championForm", "modifyCooldown"],
    acceptance: "變身提高攻速且只縮短瞬步冷卻50%；八秒結束後外觀與冷卻規則一起恢復。",
  }),
  owner({
    id: "godie-h00l.r", name: "60-04 完美盾反",
    requiredHooks: ["onDamageTaken", "onReflectSuccess"], requiredEffectKinds: ["restore", "knockback"],
    acceptance: "三秒內反彈AD與AP；只有成功反彈技能AP傷害才回復並擊退，防禦動作只播放一次。",
  }),

  runtime({
    id: "godie-hvsh.e", name: "48-03 鮮血神殿",
    requiredHooks: ["onInterval", "onKill"], requiredEffectKinds: ["heal", "grantAttribute"],
    acceptance: "領域逐秒傷害與雙減速；每名受害者各回復1%最大生命，累計擊殺十四人才永久增加全能力。",
  }),
  runtime({
    id: "godie-n00b.passive", name: "57-00 四次元口袋",
    requiredEffectKinds: ["weightedBranch", "grantGold", "restore", "taunt"],
    acceptance: "55/30/15權重只選一支分支；金錢、回復或限時增益完成後再嘲諷附近敵人。",
  }),
  runtime({
    id: "godie-e00r.ex", name: "59-001 完全暴走",
    requiredHooks: ["onDamageTaken", "onInterval"], requiredConditionKinds: ["stat"],
    requiredEffectKinds: ["dispel", "invulnerable"],
    acceptance: "受傷後才檢查生命門檻；觸發時驅散負面並套用暴走、吸血、迴避、攻速上限與免疫，禁止假 cast。",
  }),
  runtime({
    id: "godie-e00s.ex", name: "70-002 樹海降臨",
    requiredHooks: ["onAbilityCast"], requiredEffectKinds: ["weightedBranch", "restore"],
    acceptance: "只有施放千年練成才觸發追加傷害與友軍治療；施放其他技能不得發動。",
  }),
  runtime({
    id: "godie-e00w.passive", name: "77-00 浮雲-旋一閃",
    requiredHooks: ["onEvade"], requiredEffectKinds: ["damageArea", "applyStatus"],
    acceptance: "只有成功迴避物理攻擊才旋轉反擊；未迴避不得播放，範圍傷害、暈眩與動作同點發生。",
  }),
  runtime({
    id: "godie-edem.r", name: "45-04 哥哥",
    requiredHooks: ["onAbilityHit"], requiredConditionKinds: ["status"], requiredEffectKinds: ["damageArea"],
    acceptance: "只有千鳥命中帶燃燒標記的敵人才引發麒麟；缺少任一條件都不得觸發。",
  }),
  runtime({
    id: "godie-emfr.e", name: "15-03 獄炎煉我",
    requiredHooks: ["onBasicAttack", "onDamageDealt"], requiredEffectKinds: ["damage", "damageArea"],
    acceptance: "變身期間普攻附火傷、技能命中引發範圍爆炎及燃燒，並承受移速減半；事件來源不能互相誤觸。",
  }),
  runtime({
    id: "godie-nbbc.passive", name: "08-00 龍紋記憶",
    requiredHooks: ["onStunned"], requiredEffectKinds: ["grantAttribute", "spawnVfx"],
    acceptance: "只有被暈眩時覺醒三秒，三屬性增加100%；再次暈眩只刷新，不得疊成四倍或八倍。",
  }),
  runtime({
    id: "godie-e00l.passive", name: "20-00 銀色甲胄",
    requiredHooks: ["onDamageTaken"], requiredEffectKinds: ["shield"],
    acceptance: "魔力高於30%才有機率產生減傷盾；耗盾順序與等級係數正確，並揭露和新版內容的差異。",
  }),
  runtime({
    id: "godie-e00r.q", name: "59-01 吞噬",
    requiredHooks: ["onInterval"], requiredConditionKinds: ["status"], requiredEffectKinds: ["devour"],
    acceptance: "自動找最近且低於3/5/7/9%生命的敵人處決並回復；暴走門檻加倍，不耗魔也不需要按鍵。",
  }),
  runtime({
    id: "godie-e00s.r", name: "70-04 千年練成",
    requiredConditionKinds: ["status"], requiredEffectKinds: ["summon", "randomArea", "damageArea"],
    acceptance: "隨機生成4/6/8棵樹精，每棵出生各造成範圍傷害；定身時傷害加倍，八秒後完整清除。",
  }),
  runtime({
    id: "godie-h02k.ex", name: "89-002 俄羅斯輪盤",
    requiredConditionKinds: ["kind", "status"], requiredEffectKinds: ["weightedBranch", "damage", "applyStatus"],
    acceptance: "一般、致盲、混亂使用各自權重；目標死、自身死、恐懼只能命中一支分支，即死只對英雄成立。",
  }),
  runtime({
    id: "godie-edem.e", name: "45-03 千鳥",
    requiredEffectKinds: ["dash", "damageLine"],
    acceptance: "角色沿直線衝刺且沿途敵人受傷；位移距離與傷害線一致，不能退化成瞬移或終點爆炸。",
  }),
  runtime({
    id: "godie-edem.ex", name: "45-002 天照",
    requiredEffectKinds: ["dot", "damageArea", "applyStatus"],
    acceptance: "大範圍持續十秒逐秒燃燒，沉默與攻擊力降低40%同時存在並準時結束。",
  }),
  runtime({
    id: "godie-efur.passive", name: "13-00 念。攻防轉換",
    requiredHooks: ["onBasicAttack"], requiredEffectKinds: ["cycleBuff"],
    acceptance: "每次普攻按AP、AD、防禦、魔抗循環；各自維持一秒且可並存，但順序不得錯亂。",
  }),
  runtime({
    id: "godie-emfr.ex", name: "15-002 敵彈吸收陣。太陰道",
    requiredHooks: ["onDamageTaken", "onReflectSuccess"], requiredEffectKinds: ["eventValueConversion"],
    acceptance: "反彈100%魔法傷害並將事件值轉為MP與暫時AP；多次成功可累加，五秒後完整歸零。",
  }),
  runtime({
    id: "godie-emns.ex", name: "44-002 交換筆記本",
    requiredEffectKinds: ["swapResource"],
    acceptance: "交換雙方現存生命而非最大生命或傷害；死亡邊界、無效目標及交換順序正確。",
  }),
  runtime({
    id: "godie-emns.passive", name: "44-00 機警",
    requiredEffectKinds: ["manaBarrier"],
    acceptance: "傷害先由魔力屏障以1MP抵3傷害，魔力不足才進生命；被動不得顯示或播放主動施法。",
  }),
  runtime({
    id: "godie-h01u.r", name: "80-04 赤兔咆哮",
    requiredHooks: ["onBasicAttack", "onDamageTaken"], requiredEffectKinds: ["proxyCast"],
    acceptance: "AP與AD暫升150/200/250%；普攻與受傷各20%機率代理施放弒鬼神，同一事件不得重複代理。",
  }),
  runtime({
    id: "godie-h02u.ex", name: "92-002 最終戈壁",
    requiredEffectKinds: ["delayed", "grantXp"],
    acceptance: "六秒內每秒準時增加75經驗，共六次；不得因幀率多發、漏發或在排程結束後殘留。",
  }),
  runtime({
    id: "godie-hapm.q", name: "52-01 狂戰士之怒",
    requiredHooks: ["onDamageTaken"], requiredEffectKinds: ["extendBuff"],
    acceptance: "攻速與吸血依四級提升；每承受5%最大生命傷害延長兩秒，同一門檻只能延長一次。",
  }),
] as const;

export const SKILL_ACCEPTANCE_THEME_IDS = new Set(
  SKILL_ACCEPTANCE_CANDIDATES.map(skillAcceptanceThemeId),
);

export const CAPABILITY_ONLY_EFFECT_KINDS = [
  "carry", "convertTeam", "evasion", "pull", "revive", "shieldBreak",
] as const;

export const CAPABILITY_ONLY_HOOK_EVENTS = [
  "onAllyDamaged", "onAllyDeath", "onBossSpawn", "onBoundaryTouch",
  "onCrowdControlApplied", "onCrowdControlReceived", "onDashOrBlink", "onDeath",
  "onFireRingIgnite", "onGuardianDown", "onHeal", "onLethalDamage", "onOverheal",
  "onProjectileExpire", "onRevive", "onRoundEnd", "onRoundStart", "onShieldBroken",
  "onShieldGained", "onStatCapReached", "onStatusApplied", "onUltimateCast", "onUltimateHit",
] as const;

export const CAPABILITY_ONLY_CONDITION_KINDS = ["chance", "equipment"] as const;

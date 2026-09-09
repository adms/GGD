/**
 * CASTABILITY 的**判定層** —— 「按下這一格，場上到底有沒有東西真的動」。
 *
 * ⭐ 2026-08-18（GH#374 洞②）從 `castabilitySweep.test.ts` **抽出來**的一段。
 *
 * 為什麼要抽：判定以前整段住在那支測試檔的區域函式裡，於是它**沒有辦法被夾具驗**
 * —— 想證明「一支只有 `spawnVfx` 的假技能不會被算成 ✅」，唯一的路是去掃普查的
 * 原始碼字串，而那正是七種失敗形態⑥（用掃原始碼字串代替行為）。抽成模組之後，
 * 普查與守衛讀的是**同一份**判定（形態⑤：被測的不是出貨的那個）。
 *
 * ⛔ 這裡**只**做判定，不建世界、不施放、不寫報表 —— 那些留在普查那一支。
 */
import type { SimWorld } from "./SimWorld";
import type { AbilityDef } from "./content/defs";

/**
 * ⭐ 2026-08-19 —— 這一階被動被 `whileForm` **閘在另一個身體裡**嗎？
 *
 * ⚠️ 這不是一個缺陷判準，是一個**量測範圍**的宣告。普查在**本體形態**下開世界
 * （`spawnChampion` 從來不變身），所以一份寫著 `whileForm: "alternate"` 的 rank
 * 區塊**依定義**不會掛上來源 —— `abilities/abilityPassives.ts::rankBlock` 的形態閘
 * 就是這樣寫的，而且那是**正確行為**。
 *
 * ⛔ 把它算成 ❌ 是把「內容壞掉」與「儀器沒看那一半」混成同一個數字：
 * 79-002 虛化的格擋在卍解狀態下**真的會生效**，而普查從第一天起就把它列在
 * FAIL 表上，於是那一格佔著一列缺陷帳單、卻沒有任何人修得動它。
 *
 * ⛔ 也不可以只看 `ranks[0]`：一支七階被動可能只有高階才閘住形態。
 * 這裡取的是**普查真的學到的那一階**（`rankBlock` 的同一條夾取）。
 */
export function passiveFormGate(def: AbilityDef, rank: number): "any" | "base" | "alternate" {
  const ranks = def.passive?.ranks;
  if (!ranks?.length) return "any";
  const block = ranks[Math.min(Math.max(1, rank), ranks.length) - 1];
  return block?.whileForm ?? "any";
}

/**
 * Events that constitute "a real effect happened" (excludes abilityCast/castBegin).
 *
 * THIS LIST IS THE MEASURING INSTRUMENT, and a kind missing from it is a FALSE
 * ❌, not a content bug. `championForm` (task #249 變身) is the case that proved
 * it: the moment 妖狐變化 / ChangeDNA / 瘋狂皮卡丘 were bound to the real body
 * swap, all three measured "cast accepted but produced no measurable effect" —
 * the swap rewrites `ChampionComp.championId` + `StatsComp.championId` and emits
 * `championForm`, and NONE of `snapshotChannels()`'s counters can see that.
 *
 * The bar for adding a kind here is the same one the originals meet: the event
 * fires ONLY from an effect actually resolving, never from regen, upkeep or
 * movement. `championForm` is emitted from exactly one place —
 * `ChampionFormSystem.setBody` — so it cannot be spoofed by anything else.
 */
export const EFFECT_EVENTS: ReadonlySet<string> = new Set([
  "damage",
  "heal",
  "manaRestore",
  "projectileSpawn",
  "knockdown",
  "championForm",
  // ⭐ 2026-08-19（GH#385）—— `swapResource`（44-002 交換筆記本）。
  //
  // 它是這個引擎裡唯一一處「兩條血條同時被改寫上百點，而沒有任何觀察者知道」：
  // 交換**刻意**繞開 `damageQueue` 與 `healTarget`（否則護甲／護盾／【重創】會
  // 醒過來，而卡片上寫的是「交換」），而那兩條路正好是所有計數器的來源。
  // 量到的：44-002 在普查上是 ❌，實際上把施法者 572.5→679.2、目標 676.0→575.3。
  // 這是 `championForm` 那一段講的同一件事 —— 缺一個 kind 是**假的 ❌**，不是內容缺陷。
  //
  // 門檻與其他每一個一樣：它**只從 `effects/swapResource.ts` 的交換那一行**發出來，
  // ⛔ 回血／upkeep／移動都偽造不了。
  "resourceSwap",
]);

/**
 * ⛔ **`vfxSpawn` 被刻意留在 {@link EFFECT_EVENTS} 外面**（2026-08-18 / GH#374 洞②）。
 *
 * 普查問的是「按下去**有沒有真的產生效果**」。`vfxSpawn` 唯一保證的是**畫面上有
 * 東西**，而一支只有畫面的技能逐位元改不動任何一個數字 —— 把它算成 ✅ 等於讓這份
 * 量測對 CLAUDE.md 第一·五守則整族缺陷永遠說謊。報表自己的註解早就寫著「若全靠
 * vfx 過關代表量測太寬鬆」，而那個數字**沒有任何閘在看**；GH#373 的 5 支主動天生技
 * 就是這樣在全綠的測試底下上架的。
 *
 * ⚠️ `projectileSpawn` **留著**，那不是同一件事：一顆投射物是場上真的存在、會碰撞、
 * 會擋視線的實體，⛔ 不是一張貼圖。（它的 payload 空不空由
 * `content/abilityNoOpEffects.ts` 的 `projectile-no-payload` 那條規則管。）
 */
export const COSMETIC_ONLY_EVENT = "vfxSpawn";

/** Broad snapshot of the effect-bearing channels regen/movement cannot spoof. */
export interface ChannelSnapshot {
  shields: number;
  statuses: number;
  buffs: number;
  projectiles: number;
  taunts: number;
  /** 場上所有英雄的金幣總和 —— `grantGold` 是唯一會在這個世界裡動它的東西。 */
  gold: number;
  /** 場上活著的召喚物具數（`world.summon.size`）—— `spawnSummon` 是唯一的寫入者。 */
  summons: number;
}

export function snapshotChannels(world: SimWorld): ChannelSnapshot {
  let shields = 0;
  for (const hp of world.health.values()) shields += hp.shields.length;
  let statuses = 0;
  for (const st of world.status.values()) statuses += st.effects.length;
  let buffs = 0;
  for (const sc of world.stats.values()) buffs += sc.sources.filter((s) => s.kind === "buff").length;
  // ⭐ 2026-08-20（GH#407）—— 金幣是**第六個**看得見的頻道。
  //
  // ⚠️ 它在此之前是量測盲點，而且盲得**剛好**：`goldGrant` 事件在 `paid === 0`
  // 時照樣發（`effects/grantGold.ts` 的 emit 沒有門檻），所以把事件收進
  // {@link EFFECT_EVENTS} 會反過來造出「說了但沒發生」的假 ✅ —— 只有**錢真的
  // 進了口袋**這個狀態差才是可觀測的改變。
  // 為什麼現在要它：57-00 哆啦A夢的天生技是一顆 `weightedBranch`，權重最大的
  // 那一支（55/100）整支 payload 就是 `grantGold` —— 少了這一格，一支完整實作
  // 的技能會有一半的 seed 量出「什麼都沒發生」，而真相是儀器沒有那根指針（GH#407）。
  // ⛔ 它不可能被回血／移動偽造：這個世界裡沒有擊殺賞金、沒有掉落金幣、
  // 沒有商店，`grantGold` 是唯一的寫入者。
  let gold = 0;
  for (const champ of world.champion.values()) gold += champ.gold;
  // ⭐ 2026-08-18 —— 【嘲弄】是**第五個**看得見的頻道。
  //
  // ⚠️ 它在此之前是量測盲點：`taunt` 既不發事件、也不是護盾／狀態／buff／投射物
  // —— 它寫的是 `world.taunt`（受害者 → 被迫打誰、到哪一絕對 tick）。於是 86-00
  // 裝可愛接上真的嘲弄之後，普查照樣回報「只有特效」。
  // ⛔ 它不可能被回血／移動偽造：唯一的寫入者是 `sim/taunt.ts::applyTaunt`。
  //
  // ⭐ 2026-09-06（GH#1087）—— 召喚是**第七個**看得見的頻道。
  //
  // ⚠️ 它在此之前是量測盲點，而且盲得跟嘲弄一模一樣：`spawnSummon` 既不掛
  // 狀態／buff／護盾、也不發任何 {@link EFFECT_EVENTS} 裡的事件（只有
  // `summonFailed`／`summonDespawn`）—— 它寫的是 `world.summon`（一具新身體 →
  // 主人／到期 tick／上限組）。於是 GH#1078 把每一份模板預設真的放一次時，
  // `tpl-summon-agent` 在真的 SimWorld 裡召喚成功（`world.summon.size` 0→1）
  // 而這裡回 FAIL —— 照上面的檔頭，那是「缺一個 kind 是**假的 ❌**」，那條 lane
  // 只好在自己的測試裡多量一根指針（`EXTRA_CHANNELS`）。指針補在這裡，補丁就刪。
  // ⛔ 它不可能被回血／upkeep／移動偽造：`world.summon.set` 只住在
  // `sim/summons.ts::spawnSummon`，而那一行只從 `effects/summon.ts` 的 handler 走到。
  // ⚠️ 讀的是**具數**，⛔ 不是「有沒有 summon 這個 kind」：一支指向未註冊身體的
  // 召喚會發 `summonFailed` 而一具都不生 —— 它在這裡仍然要是 ❌（守衛的控制組）。
  return {
    shields,
    statuses,
    buffs,
    projectiles: world.projectile.size,
    taunts: world.taunt.size,
    gold,
    summons: world.summon.size,
  };
}

/**
 * ⭐ GH#407 —— 這棵效果樹裡「**換一顆 seed 就可能走不同路**」的節點。
 *
 * ⚠️ 這不是一個缺陷判準，是一個**量測方法**的判準。普查對每一格開一個
 * 固定 seed 的世界，於是一支帶隨機分支的技能，它的 ✅／❌ 是**一次擲骰**：
 * 實測（GH#374 收尾時）13-04 龍星群 12/24 顆 seed 命中、70-04 千年練成 16/24。
 * ⛔ 一條會擋 CI 的 gate 不可以是抽樣 —— 它紅的時候訊息會說「這一格壞了」，
 * 而真相是 seed。
 *
 * ⇒ 普查用這一支**推導**出哪些格子要跨多顆 seed 量，⛔ 不是列一張技能白名單
 * （那是第四個住處，一定會過期）。下一支用 `weightedBranch` / `chance` 的技能
 * 不必再改這裡一個字（第〇·五守則）。
 *
 * 收哪三種，各自的理由：
 *   · `weightedBranch` —— 一次 draw 選一支，不同支的 payload 完全不同；
 *     只有**兩支以上**權重為正才算隨機（單支＝決定性，`weight:0` 選不到）。
 *   · `chance` 條件葉 —— `0 < p < 1` 才算；`p:1` / `p:0` 是決定性的。
 *   · `randomArea` —— 落點隨機。⭐ 它**已經**被 `nextScatterPoint` 釘成決定性，
 *     收進來不是因為它壞了，而是為了讓那份釘法**每一批都被重新證明一次**
 *     （拿掉它 → 這些格子立刻變成 seed 依賴 → 閘紅）。
 */
export function stochasticNodeKinds(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const v of node) stochasticNodeKinds(v, out);
    return out;
  }
  const rec = node as Record<string, unknown>;
  if (rec.kind === "weightedBranch" && Array.isArray(rec.branches)) {
    let live = 0;
    for (const b of rec.branches) {
      const w = (b as { weight?: unknown } | null)?.weight;
      if (typeof w === "number" && w > 0) live++;
    }
    if (live >= 2) out.add("weightedBranch");
  }
  if (rec.kind === "chance" && typeof rec.p === "number" && rec.p > 0 && rec.p < 1) {
    out.add("chance");
  }
  if (rec.kind === "randomArea") out.add("randomArea");
  for (const v of Object.values(rec)) stochasticNodeKinds(v, out);
  return out;
}

/**
 * ⭐ `VFX_ONLY` 是 GH#374 加的第三種結果，⛔ 它**不可以**併進 PASS，也**不可以**
 * 併進 FAIL。
 *
 * 它是一個**真實存在的狀態**：技能放得出去、冷卻真的付了、玩家畫面上真的看得到
 * 東西 —— 而血量、位置、狀態一個都沒動。併進 PASS 是說謊（GH#373 就是這樣上架的），
 * 併進 FAIL 則把「按不下去／丟例外」跟「按得下去但是空的」混成同一個數字，
 * 而那兩件事要修的地方完全不同。所以它自己算一格。
 */
export type CastOutcomeVerdict = "PASS" | "VFX_ONLY" | "FAIL";

export interface CastOutcome {
  verdict: CastOutcomeVerdict;
  /** what fired first, for the report */
  channel?: string;
  reason?: string;
}

export interface CastObservation {
  /** every event type emitted from the cast tick through the end of the window */
  events: readonly string[];
  before: ChannelSnapshot;
  after: ChannelSnapshot;
  /** the caster physically left its anchor (or has a nav override) */
  moved: boolean;
  /** how many effects the ability actually authored (0 = empty effect list) */
  effectsAuthored: number;
}

/**
 * Decide whether one cast produced a measurable effect.
 *
 * ⛔ 判定順序是刻意的：gameplay 頻道**全部**排在 `vfx` 前面，所以一支既有傷害
 * 又有特效的技能永遠記在 `damage` 上，⛔ 不會被特效蓋掉。`vfx` 只有在**其他全部
 * 都沒發生**的時候才會是那個 channel —— 而那一刻它就是 `VFX_ONLY`。
 */
export function classifyCastOutcome(o: CastObservation): CastOutcome {
  const { events, before, after, moved } = o;
  const fired = (t: string): boolean => events.includes(t);

  let channel = "";
  if (fired("damage")) channel = "damage";
  else if (fired("projectileSpawn")) channel = "projectile";
  else if (fired("heal")) channel = "heal";
  else if (fired("manaRestore")) channel = "manaRestore";
  else if (after.shields > before.shields) channel = "shield";
  else if (after.statuses > before.statuses) channel = "status";
  else if (after.buffs > before.buffs) channel = "buff";
  else if (after.taunts > before.taunts) channel = "taunt";
  // 金幣與 `dash` / `championForm` 同一列、同一個理由：它是 gameplay 頻道
  // （口袋裡的數字真的變了），⛔ 不是裝飾，所以排在 `vfx` 上面。
  else if (after.gold > before.gold) channel = "gold";
  // 召喚與 `taunt` / `gold` 同一列、同一個理由：它是 gameplay 頻道（場上多了一具
  // 會走會打的身體），⛔ 不是裝飾，所以排在 `vfx` 上面（GH#1087）。
  else if (after.summons > before.summons) channel = "summon";
  else if (moved) channel = "dash";
  // 變身 (#249) sits ABOVE `vfx` for the same reason `dash` does: it is a
  // gameplay channel (the body's whole stat sheet is replaced), and the report's
  // "if everything passes on vfx the measurement is too loose" note would
  // misread it as decoration.
  else if (fired("championForm")) channel = "championForm";
  // 交換與 `championForm` / `dash` 同一列、同一個理由：它是 gameplay 頻道
  // （兩條血條被重寫），⛔ 不是裝飾，所以排在 `vfx` 上面。
  else if (fired("resourceSwap")) channel = "resourceSwap";
  else if (fired(COSMETIC_ONLY_EVENT)) channel = "vfx";

  const anyEvent = events.some((t) => EFFECT_EVENTS.has(t));
  const anyState =
    after.shields > before.shields ||
    after.statuses > before.statuses ||
    after.buffs > before.buffs ||
    after.projectiles > before.projectiles ||
    after.taunts > before.taunts ||
    after.gold > before.gold ||
    after.summons > before.summons ||
    moved;

  if (anyEvent || anyState) return { verdict: "PASS", channel };

  if (channel === "vfx") {
    return {
      verdict: "VFX_ONLY",
      channel,
      reason:
        "只有特效（spawnVfx）—— 放得出去、看得到東西，場上一個數字都沒動" +
        "（GH#374 洞②：vfx 不算 PASS，也不併進 FAIL）",
    };
  }
  return {
    verdict: "FAIL",
    reason:
      o.effectsAuthored === 0
        ? "no effects authored (empty effect list)"
        : "cast accepted but produced no measurable effect (no-op)",
  };
}

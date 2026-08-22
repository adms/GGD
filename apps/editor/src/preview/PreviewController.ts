/**
 * PreviewController — the editor's live-preview seam.
 *
 * CONTRACT (per the master plan): the controller owns ONE Babylon
 * Engine/Scene + ONE sandbox SimWorld and reuses the REAL render/vfx/sim.
 * Champion preview computes FinalStats through the real statPipeline and
 * plays clips; ability preview casts through a PreviewDriver -> IntentFrame
 * (never a direct effectRunner poke); items/augments attach a ModifierSource
 * and show stat deltas; vfx spawn through the shared toParticleSystem factory.
 *
 * THIS FILE ships the interface + `SimPreviewController`, which runs the DATA
 * half through the real engine (sandbox SimWorld + real statPipeline/registries
 * — no mocks).
 *
 * ⚠️ **這段檔頭在 2026-08-22 之前寫著「renderless … Babylon 那一半是 client
 * engineer 的接縫」，而那句話撐了一年**（GH#174，第三守則：註解會說謊）。
 * 現在畫面那一半住在同一個資料夾的 `BabylonPreviewController.ts`：它**持有**
 * 一份這裡的 `createSimPreviewController()` 並把每一支資料方法原樣轉發，
 * 所以 ⛔ 沒有第二份 finalStats、⛔ 沒有第二條施法路徑。
 *
 * ⭐ `mount()` 在這一支裡**仍然是空的，而且應該是空的** —— 它是「沒有畫布時
 * 這個介面該有的行為」，不是一個待辦。要畫面的呼叫端拿 Babylon 那一支。
 */
import {
  SimWorld,
  SKELETON_ARENA,
  spawnChampion,
  registerChampion,
  attachSource,
  recomputeStats,
  resolveScaling,
  ALL_STATS,
  rankUpAbility,
  type ChampionDef,
  type ItemDef,
  type AugmentDef,
  type AbilityDef,
  type CoreAbilitySlot,
  type CastableSlot,
  type CastTarget,
  type IntentFrame,
  type Stat,
  type EffectDef,
  type Vec2,
} from "@ggd/shared/sim";
import { Abilities } from "@ggd/shared/sim/content/registry";
import { rankScalar } from "@ggd/shared/sim/perRank";
import { attachItemSource } from "@ggd/shared/sim/economy/itemSource";
import { liveAttribute } from "@ggd/shared/sim/stats/attrSources";
import type { AttrLookup } from "@ggd/shared/sim";
import { asSeatId, asTeamId, type EntityId } from "@ggd/shared/ids";

export interface ChampionPreview {
  level: number;
  finalStats: Record<Stat, number>;
  hp: number;
  mana: number;
}

export interface EffectLine {
  /** indentation depth (nested spawnProjectile.onHit) */
  depth: number;
  kind: EffectDef["kind"];
  summary: string;
  /** resolved amount per rank (damage/heal/shield), using real FinalStats */
  perRank?: number[];
}

export interface AbilityPreview {
  ability: AbilityDef;
  casterStats: Record<Stat, number>;
  lines: EffectLine[];
}

export interface StatDelta {
  stat: Stat;
  before: number;
  after: number;
}

// ─────────────────────────────────────────── 真的放一次 (GH#174) ──────────
/**
 * ⭐ **這一段是「即時試放」從『唸給你聽』變成『真的打出去』的那一半**（GH#174）。
 *
 * 在此之前 `previewAbility` 只走 `effectLines` —— 它讀 `AbilityDef.effects` 把每一條
 * **翻譯成中文**，一個 tick 都沒有跑過。那對「這張卡的數字對不對」是夠的，對
 * 「這張卡**放得出去嗎**」完全無能：法力不夠、冷卻沒好、`castType` 根本拿不到
 * 目標、被 `castTimeRules` 擋住 —— 這四種在編輯器裡**長得跟成功一模一樣**。
 *
 * ⛔ 而修法**不是**在這裡呼叫 `castAbility()`。GH#174 逐字寫著「必須透過
 * PreviewDriver 發 IntentFrame 進 `world.step()`，**不可以**直接戳 effectRunner」，
 * 理由是失敗形態⑤：直接戳等於**繞過** CommandSystem 的每一道閘，於是預覽會
 * 「成功」地放出一發遊戲裡按下去毫無反應的技能。所以下面走的是玩家那條路：
 * 一個 `IntentFrame` 丟進 `world.step()`，答案從 `world.events` 讀回來。
 */
export interface CastPreviewOptions {
  level?: number;
  /**
   * 送出指令**之前**先把這一格點到第幾階。⚠️ 預設 1 而不是 0 —— 剛 spawn 的
   * Q/W/E/R 是 rank 0（沒學），照原樣送出去只會拿回一句 `not-learned`，
   * 而那不是作者想試的東西。EX / PASSIVE 不吃這一格（它們不排等級）。
   */
  rank?: number;
  /** 指令送出後再跑幾個 tick，讓投射物與延遲效果真的走完。預設見 `CAST_PREVIEW_TICKS`。 */
  ticks?: number;
  /** 落點；省略＝施法者正前方 `ability.range` 處（`ground`/`skillshot` 都吃得到）。 */
  point?: Vec2;
}

/** 一次試放之後，**世界真的發生了什麼**。⛔ 不是把 effects 陣列覆述一遍。 */
export interface CastPreviewTrace {
  /** sim 收下了這一發嗎。⚠️ 由 `abilityCast` 事件判定，⛔ 不是「我送出去了」。 */
  accepted: boolean;
  /** 被拒時 `castRejected` 給的理由（`CastResult`），例如 `cooldown` / `mana` / `not-learned`。 */
  reason?: string;
  manaBefore: number;
  manaAfter: number;
  /** 送出那一刻起算的冷卻（tick）。0 而 `accepted` 為 true = 這支技能沒有冷卻。 */
  cooldownTicks: number;
  /** 這幾個 tick 內 `world.events` 排出來的東西，照順序。⭐ 3D 面板照它播特效。 */
  events: readonly { type: string; tick: number; data: Record<string, unknown> }[];
}

/**
 * 試放預設跑滿一秒。⚠️ 這個數字是**決策點**（第一守則）所以它是一個具名常數 +
 * 一格 `opts.ticks`，⛔ 不是散在函式裡的字面值：投射物飛得到、`dot` 至少跳一拍，
 * 而作者要看一個八秒的持續傷害走完時，改的是呼叫端的那一格。
 */
export const CAST_PREVIEW_TICKS = 30;

export interface PreviewController {
  /** attach the (future) Babylon canvas; renderless impl records the intent */
  mount(canvas: HTMLCanvasElement | null): void;
  dispose(): void;
  previewChampion(def: ChampionDef, opts?: { level?: number }): ChampionPreview;
  previewAbility(champion: ChampionDef, slot: CoreAbilitySlot, opts?: { level?: number }): AbilityPreview;
  /**
   * 真的把這一發打出去 —— PreviewDriver → `IntentFrame` → `world.step()`（GH#174）。
   * ⛔ 實作不可以呼叫 `castAbility()` 或 effectRunner：那會繞過 CommandSystem 的閘。
   */
  castAbility(
    champion: ChampionDef,
    slot: CastableSlot,
    opts?: CastPreviewOptions,
  ): CastPreviewTrace;
  previewItem(item: ItemDef, on: ChampionDef, opts?: { level?: number }): StatDelta[];
  previewAugment(aug: AugmentDef, on: ChampionDef, opts?: { level?: number }): StatDelta[];
  /** stub: records the request; Babylon impl plays the ParticleSystem */
  spawnVfx(vfxKey: string): void;
  /** advance the sandbox SimWorld by fixed ticks (empty intents) */
  stepFixed(ticks: number): void;
}

/**
 * 試放用的**假想敵**離施法者多遠（world units）。
 *
 * ⚠️ 這個數字是一個決策點（第一守則）：太遠，短射程的技能一律回 `out-of-range`；
 * 太近，`skillshot` 的方向向量會退化。3 單位在出貨射程的下緣之內
 * （最短的近戰技能是 ~1.5u），而 `castTargetFor` 對 `ground`/`skillshot`
 * 一律**改用 `ability.range`**，所以這一格真正只服務 `targeted`。
 */
const CAST_PREVIEW_DUMMY_GAP = 3;

/** Sandbox world + champion, going through the REAL registries/spawn/statPipeline. */
function sandbox(
  def: ChampionDef,
  level: number,
  /**
   * 多生一個**敵隊的身體**站在前方（GH#174 的試放用）。
   *
   * ⛔ 預設 false 是刻意的：`previewItem` / `previewAugment` 量的是「裝上去之後
   * 我的數字變成多少」，世界裡多一具身體對它們沒有意義，而**任何**額外實體都會
   * 讓那兩支的 tick 內容改變。只有真的要放招的那一條路需要有人可以打。
   */
  opts: { dummy?: boolean } = {},
): { world: SimWorld; id: EntityId; dummyId: EntityId | null } {
  // Sandbox registries: the latest edited doc wins. `overrideAbilities` is
  // REQUIRED here — registerChampion now defaults to letting the standalone
  // content/abilities/<id>.json doc win (it is the source of truth at boot), so
  // without this flag the champion being edited would preview the copy loaded
  // from disk instead of the one on screen.
  registerChampion(def, { overrideAbilities: true });
  const world = new SimWorld(SKELETON_ARENA, 0xc0ffee);
  const id = spawnChampion(world, {
    championId: def.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: 0 },
    zone: 0,
    level,
  });
  if (opts.dummy !== true) return { world, id, dummyId: null };
  // ⚠️ 同一份 def 當假想敵是刻意的：這裡要的是「一個**合法的敵方身體**」，
  // ⛔ 不是一個平衡對手。換成別人只會把「這一發打得中嗎」變成「那個人的護甲多少」。
  const dummyId = spawnChampion(world, {
    championId: def.id,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: CAST_PREVIEW_DUMMY_GAP },
    zone: 0,
    level,
  });
  return { world, id, dummyId };
}

/**
 * 把一支技能的 `castType` 換成一個**這一發真的可以送出去**的 `CastTarget`。
 *
 * ⭐ 它刻意跟客戶端的 `AimResolver.resolveCastTarget` 是同一套語意
 * （self→self、skillshot/dash→dir、ground→point、targeted→entity），
 * ⛔ 但**不 import 它** —— 那支住在 `apps/client/src/input/`，是滑鼠與手把的
 * 瞄準器，它的輸入是游標。編輯器沒有游標，也沒有一個「玩家指著哪裡」的答案。
 */
function castTargetFor(
  ability: Pick<AbilityDef, "castType" | "range"> | undefined,
  self: Vec2,
  dummy: Vec2 | null,
  dummyId: EntityId | null,
  point?: Vec2,
): CastTarget {
  const castType = ability?.castType ?? "self";
  const range = ability?.range ?? CAST_PREVIEW_DUMMY_GAP;
  // 「前方」＝ 假想敵所在的方向；沒有假想敵時退回 +Z（sandbox 生怪的那一軸）。
  const dx = dummy ? dummy.x - self.x : 0;
  const dz = dummy ? dummy.z - self.z : 1;
  const len = Math.hypot(dx, dz) || 1;
  const dir: Vec2 = { x: dx / len, z: dz / len };
  switch (castType) {
    case "self":
      return { type: "self" };
    case "skillshot":
    case "dash":
      return { type: "dir", dir };
    case "ground":
      // ⚠️ 落點放在**射程的最遠處**，⛔ 不是假想敵腳下：`ground` 的 sim 端會夾，
      // 而作者要看的正是「這個圈畫在我打得到的地方嗎」。
      return { type: "point", point: point ?? { x: self.x + dir.x * range, z: self.z + dir.z * range } };
    case "targeted":
      // 沒有假想敵時仍然回一個合法形狀 —— sim 會回 `bad-target`，
      // ⛔ 而那句話正是我們要讓作者看到的，不是一個被我們吞掉的例外。
      return dummyId === null ? { type: "self" } : { type: "entity", entityId: dummyId };
  }
}

function effectLines(
  effects: readonly EffectDef[],
  finalStats: Record<Stat, number>,
  /**
   * 施法者的三圍讀取器 —— `Scaling.attrRatios`(「等同總力量」)唯一的資料來源。
   * 由 `sandbox()` 建的**真實**沙盒實體提供,不是一個回 0 的樁:預覽如果不接
   * 這一條,一張 朗基努斯之槍 式的卡在編輯器裡會顯示成 0 傷害,而設計師會照
   * 那個假數字去調平衡(#106 的「預覽不可以說謊」)。
   */
  attrs: AttrLookup,
  maxRank: number,
  depth = 0,
  out: EffectLine[] = [],
): EffectLine[] {
  for (const e of effects) {
    switch (e.kind) {
      case "damage": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r, attrs));
        // 百分比生命與存款加成都必須出現在摘要裡:`perRank` 只是 `amount` 那一項,
        // 一張 12% 最大生命 + 存款加成的卡在預覽裡會看起來像一發平庸的固定傷害,
        // 而設計師會照那個假數字去調平衡。
        const pct =
          e.hpPct === undefined
            ? ""
            : `, +目標${e.hpPct.basis === "current" ? "當前" : "最大"}生命 ` +
              `${e.hpPct.perRank.map((v) => `${Math.round(v * 1000) / 10}%`).join("/")}`;
        const banked =
          e.bankedBonus === undefined
            ? ""
            : `, +存款「${e.bankedBonus.statusId}」×${e.bankedBonus.coeff}（上限 ${e.bankedBonus.max}）`;
        // [反彈] 同一個理由,而且更極端:一張反彈卡的 `amount` 通常就是 0,
        // 所以少了這一段,反射之盾在預覽裡會是一行乾淨的「physical damage 0」——
        // 一個看起來壞掉、實際上是滿血的機制。
        const reflect =
          e.incomingPct === undefined
            ? ""
            : `, +反彈${
                { raw: "原始", mitigated: "減免後", hpLost: "實際失血" }[
                  e.incomingPct.basis ?? "mitigated"
                ]
              }傷害 ${e.incomingPct.perRank.map((v) => `${Math.round(v * 1000) / 10}%`).join("/")}`;
        // 資源百分比 / 距離 / 折返 —— 同一個理由,而且更極端:這三支道具的
        // `amount` 全部是 0,所以少了這幾段,虛哭神去 / 瑪那魔杖 / 炎神弩 在
        // 預覽裡都會是一行乾淨的「physical damage 0」——一個看起來壞掉、實際上
        // 是滿血的機制,設計師會照那個 0 去調平衡。
        const RES_SUBJ = { self: "自身", target: "目標" } as const;
        const RES_KIND = { health: "生命", mana: "魔力" } as const;
        const RES_BASIS = { current: "現存", max: "最大", missing: "已損失" } as const;
        const res =
          e.resourcePct === undefined
            ? ""
            : `, +${RES_SUBJ[e.resourcePct.subject]}${RES_BASIS[e.resourcePct.basis]}` +
              `${RES_KIND[e.resourcePct.resource]} ` +
              ((e.resourcePct.scale ?? "ratio") === "points"
                ? `百分比數值 ×${e.resourcePct.perRank.join("/")}(0~100 當點數)`
                : e.resourcePct.perRank.map((v) => `${Math.round(v * 1000) / 10}%`).join("/"));
        const distance =
          e.distanceScale === undefined
            ? ""
            : `, +距離 0→${e.distanceScale.atRange}u 線性 ` +
              `${e.distanceScale.near}→${e.distanceScale.far}`;
        const refund =
          e.refund === undefined
            ? ""
            : `, 折返己方${e.refund.resource === "mana" ? "魔力" : "生命"} ` +
              `${Math.round(e.refund.pct * 100)}%（${
                (e.refund.basis ?? "hpLost") === "hpLost" ? "實際失血" : "減免後"
              }）`;
        out.push({
          depth,
          kind: e.kind,
          summary: `${e.damageType} damage${pct}${banked}${reflect}${res}${distance}${refund}`,
          perRank,
        });
        break;
      }
      // 擴散 (task #210). The radius / falloff / cap all belong in the summary:
      // the numbers a designer needs to sanity-check are "how big" and "how many",
      // and `perRank` alone (the centre-of-circle amount) would read as a plain
      // single-target nuke — the same blank-preview trap the note below records,
      // one level subtler because it renders SOMETHING.
      case "damageArea": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r, attrs));
        const taper = e.falloff !== undefined && e.falloff < 1 ? `, ×${e.falloff} at rim` : "";
        const cap = e.maxTargets !== undefined ? `, max ${e.maxTargets}` : "";
        const origin = e.includeOrigin === true ? ", incl. epicentre" : "";
        out.push({
          depth,
          kind: e.kind,
          summary: `${e.damageType} area damage r=${e.radius}u${taper}${cap}${origin}`,
          perRank,
        });
        break;
      }
      case "heal": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r, attrs));
        out.push({ depth, kind: e.kind, summary: "heal", perRank });
        break;
      }
      case "shield": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r, attrs));
        out.push({ depth, kind: e.kind, summary: `shield for ${e.duration}s`, perRank });
        break;
      }
      case "applyStatus":
        out.push({
          depth,
          kind: e.kind,
          summary: `apply ${e.statusId} for ${e.duration}s${e.stun ? " (stun)" : ""}${e.root ? " (root)" : ""}${e.moveSpeedMult !== undefined ? ` (ms ×${e.moveSpeedMult})` : ""}`,
        });
        break;
      case "applyBuff":
        out.push({
          depth,
          kind: e.kind,
          // ⭐ Lane 3 —— 這一行是作者唯一看得到「這張卡到底做了什麼」的地方，
          // 所以三格新語意都要印出來：`permanent`（否則永久增益會印成
          // 「for undefineds」）、`applyTo`（自我增益 vs 落在目標身上）、
          // `statusId`（這份增益同時是一個具名標記）。印錯就是卡片說謊。
          summary:
            `buff ${e.modifiers.map((m) => `${m.stat} ${m.op} ${m.value}`).join(", ")} ` +
            `${e.permanent === true ? "永久" : `for ${e.duration}s`}` +
            `${e.applyTo === "self" ? " → 自己" : " → 目標"}` +
            `${e.statusId !== undefined ? ` [標記 ${e.statusId}]` : ""}` +
            `${e.exclusiveGroup !== undefined ? ` [互斥組 ${e.exclusiveGroup}]` : ""}`,
        });
        break;
      case "dash":
        out.push({ depth, kind: e.kind, summary: `dash ${e.mode} ${e.maxDistance}u @ ${e.speed}u/s` });
        break;
      // TASK #247 follow-up. `leap` was added to the shared EffectDef union but
      // never taught to this switch, so 蒼月潮 07-03 — an ability whose ONLY
      // effect is a leap — previewed as an EMPTY effect list: the exact
      // 「表單看到的 == 遊戲跑的」 break the `restore`/`spawnVfx` note below
      // already records. The landing payload recurses like spawnProjectile's,
      // because that is where a leap's damage actually lives.
      case "leap": {
        const who = e.applyTo === "target" ? "target" : "self";
        const where =
          e.mode === "inPlace"
            ? "in place"
            : `to point${e.throwDistance !== undefined ? ` (throw ${e.throwDistance}u)` : ""}`;
        out.push({
          depth,
          kind: e.kind,
          summary: `leap ${who} ${where}, apex ${e.apexHeight}u over ${e.durationSec}s${
            e.landRadius ? `, land AoE ${e.landRadius}u` : ""
          }${e.onLand?.length ? ", on land:" : ""}`,
        });
        if (e.onLand?.length) effectLines(e.onLand, finalStats, attrs, maxRank, depth + 1, out);
        break;
      }
      case "spawnProjectile":
        out.push({ depth, kind: e.kind, summary: `projectile ${e.projectileId}, on hit:` });
        effectLines(e.onHit, finalStats, attrs, maxRank, depth + 1, out);
        break;
      // ⭐ GH#541 連段 —— 節奏可能住在**共用表**（`family` → `config.combo-strikes@1`），
      // 所以預覽要說得出「幾段從哪裡來」，⛔ 不可以印一個編輯器自己算的假數字。
      case "comboStrikes": {
        const n =
          e.steps !== undefined && e.steps.length > 0
            ? `${e.steps.length} 段（不等間隔）`
            : e.strikes !== undefined
              ? `${e.strikes} 段${e.intervalSec !== undefined ? ` × ${e.intervalSec}s` : ""}`
              : e.family !== undefined
                ? `節奏由家族表 \`${e.family}\` 決定（載入時解析）`
                : "⛔ 排不出班表（沒有 steps / strikes / family）";
        out.push({ depth, kind: e.kind, summary: `連段 ${n}，每段：` });
        effectLines(e.perStrike, finalStats, attrs, maxRank, depth + 1, out);
        if (e.finisher !== undefined && e.finisher.length > 0) {
          out.push({
            depth,
            kind: e.kind,
            summary: `收尾${e.finisherDelaySec !== undefined ? `（+${e.finisherDelaySec}s）` : ""}：`,
          });
          effectLines(e.finisher, finalStats, attrs, maxRank, depth + 1, out);
        }
        break;
      }
      // ⭐ GH#147 吸引 —— `knockback` 的反向。三種落點,⛔ 不是一個 boolean。
      case "pull": {
        const dest =
          e.destination === "anchorRing"
            ? `等分錨點環（${e.anchorCount ?? "?"} 點 · 半徑 ${e.anchorRadius ?? "?"}）`
            : e.destination === "point"
              ? "這一次的落點"
              : "施法者腳下";
        out.push({ depth, kind: e.kind, summary: `吸引到${dest}，速度 ${e.speed}` });
        break;
      }
      // `restore` and `spawnVfx` used to fall through this switch silently, so an
      // ability made of them previewed as a BLANK effect list — the one place
      // 「表單看到的 == 遊戲跑的」 breaks is exactly where a designer trusts it.
      // 鑄技工坊's 原地震波 / 變身強化 templates emit both, so they are covered now.
      case "restore": {
        const parts: string[] = [];
        // ⭐ G2（GH#299）—— 這兩格逐階可以是陣列。預覽面板讀的是 `maxRank`，
        // 因為它回答的是「這支技能練滿是什麼樣」；⛔ 取 rank 1 會讓一支逐階
        // 遞增的回復在編輯器上永遠顯示最弱的那一階，而那正是這個 case 當初
        // 補進來要修的同一種病（表單看到的 ≠ 遊戲跑的）。
        const healthPct = rankScalar(e.healthPct, maxRank);
        const manaPct = rankScalar(e.manaPct, maxRank);
        if (healthPct !== undefined) parts.push(`${Math.round(healthPct * 100)}% max HP`);
        if (manaPct !== undefined) parts.push(`${Math.round(manaPct * 100)}% max mana`);
        out.push({
          depth,
          kind: e.kind,
          summary: `restore ${parts.length > 0 ? parts.join(" + ") : "(nothing set)"}`,
        });
        break;
      }
      case "spawnVfx":
        out.push({
          depth,
          kind: e.kind,
          summary: `vfx ${e.vfxId} at ${e.at ?? "self"}${e.durationSec !== undefined ? ` for ${e.durationSec}s` : ""}`,
        });
        break;
      // 變身 (task #249). The destination body is NOT in the effect — it is the
      // hero's own `transform.counterpartId` — so the preview names the
      // DIRECTION and the duration, which is all this effect actually decides.
      case "championForm":
        out.push({
          depth,
          kind: e.kind,
          summary: `champion form → ${e.to}${
            e.durationSec !== undefined ? ` for ${e.durationSec}s` : " (no expiry)"
          }`,
        });
        break;
      /* ═══════════════════════════════════════════════════════════════════
       * RESERVED KINDS (GH#289). The sim handlers throw until their lane
       * lands (sim/effects/effectRegistry.ts), so the preview says so IN THE
       * LINE rather than rendering a confident summary of a spell that would
       * crash the tick. The `never` tripwire below is why they are here at
       * all: growing the union without teaching this switch does not compile.
       *
       * When a lane implements its kind, replace its case here with a real
       * summary — that IS part of landing the feature, not a follow-up.
       * ═══════════════════════════════════════════════════════════════════ */
      case "dot": {
        // lane P1 LANDED. The card names the CADENCE, the PAYOUT COUNT and the
        // re-application rule, because those are the three things an author
        // cannot read off the raw fields: 「每 0.5 秒、持續 2 秒」 is four
        // payouts, not two, and 「再放一次」 means something different under
        // each of the three stacking modes.
        const stacking = e.stacking ?? "refresh";
        const payouts = Math.floor(e.durationSec / e.intervalSec) + (e.tickOnApply === true ? 1 : 0);
        const stack =
          stacking === "stack"
            ? `疊加 ×${e.maxStacks ?? 99} 上限`
            : stacking === "independent"
              ? "各自獨立計時"
              : "重複施放只延長時間";
        const orphan = e.onCasterDeath === "stop" ? "，施法者死亡即中斷" : "";
        out.push({
          depth,
          kind: e.kind,
          summary: `持續傷害 ${e.damageType} 每 ${e.intervalSec}s / 共 ${e.durationSec}s → ${payouts} 次 — ${stack}${orphan}`,
        });
        break;
      }
      case "summon":
        out.push({
          depth,
          kind: e.kind,
          summary: `⚠ NOT IMPLEMENTED (lane P2) — summon ${e.count}× ${e.championId}${
            e.durationSec !== undefined ? ` for ${e.durationSec}s` : " (permanent)"
          }`,
        });
        break;
      case "invulnerable": {
        // lane P3 LANDED. The card must say which AXES this grant actually
        // refuses — 「無敵」 alone is the lie that made 41-002 絕對屏障 ship as
        // +500 armour and 07-01 臨、兵、鬥 ship as a movement-speed buff.
        const mode = e.blocksDamage ?? "all";
        const dmg =
          mode === "none"
            ? "無傷害免疫"
            : mode === "all"
              ? "免疫所有傷害"
              : `免疫${mode === "magic" ? "魔法" : "物理"}傷害`;
        const tru = (e.blocksTrueDamage ?? mode === "all") ? " + 真實傷害" : "";
        const cc = e.blocksControl === true ? " + 免控" : "";
        out.push({
          depth,
          kind: e.kind,
          summary: `無敵/免疫 ${e.applyTo ?? "self"} ${e.durationSec}s — ${dmg}${tru}${cc}`,
        });
        break;
      }
      case "knockback":
        out.push({
          depth,
          kind: e.kind,
          summary: `⚠ NOT IMPLEMENTED (lane P4) — knockback ${e.distance}u @ ${e.speed}u/s from ${e.from ?? "caster"}`,
        });
        break;
      case "cycleBuff": {
        // 輪替增益 (揍敵客阿福 13-00). The preview line names the ORDER, because
        // the order is the mechanic: which step a swing lands on is derived from
        // the live expiry ticks, so a designer who cannot see the ring in the
        // card cannot tell this apart from four buffs applied at random.
        const ring = e.steps
          .map((s) => `${s.modifiers.map((m) => `${m.stat}${m.op === "pctAdd" ? ` +${Math.round(m.value * 100)}%` : ` ${m.value}`}`).join("/")} ${s.duration}s`)
          .join(" → ");
        out.push({
          depth,
          kind: e.kind,
          summary: `輪替增益 [${e.cycleKey}] on ${e.applyTo ?? "self"} — ${ring} → 循環`,
        });
        break;
      }
      case "evasion":
        out.push({
          depth,
          kind: e.kind,
          summary: `⚠ NOT IMPLEMENTED (lane P5) — ${Math.round(e.chance * 100)}% evasion on ${e.applyTo ?? "self"} for ${e.durationSec}s`,
        });
        break;
      // 18-00 薔薇荊棘之刃 —— 面前的一條直線 (sim/effects/damageLine.ts)。
      // 長寬都寫出來, 因為「3 個身位」在預覽裡看不出來, 而它是這張卡的全部。
      case "damageLine":
        out.push({
          depth,
          kind: e.kind,
          summary:
            `直線 ${e.damageType} 傷害 — 長 ${e.length} × 寬 ${e.width}, ` +
            `朝向 ${e.aim === "facing" ? "身體面向" : "事件目標"}, ` +
            `最多 ${e.maxTargets ?? "預設"} 人` +
            `${e.includeOrigin ? " (含震央)" : ""}${e.canCrit ? " · 可爆擊" : ""}`,
        });
        break;
      // 20-01 風王結界 —— 法球每次觸發自付法力 (sim/effects/spendMana.ts)。
      // ⚠️ 這一格漏掉的代價不是「預覽少一行字」：這個 switch 的 default 分支是
      // `throw`,所以少一個 case = **編輯器預覽碰到這個 kind 直接爆**,
      // 也就違反了「新機制要編輯器可調」。2026-07-31 由駁斥者量到。
      case "spendMana": {
        const perRank = ranks(maxRank).map((r) => resolveScaling(finalStats, e.amount, r, attrs));
        out.push({
          depth,
          kind: e.kind,
          summary:
            `扣除法力` +
            `${e.pctMaxMana !== undefined ? ` + 最大法力 ${Math.round(e.pctMaxMana * 100)}%` : ""}` +
            ` (${e.applyTo === "target" ? "目標" : "自己"})` +
            `${e.bankAs !== undefined ? `，存進「${e.bankAs.statusId}」${e.bankAs.durationSec} 秒` : ""}`,
          perRank,
        });
        break;
      }
      // 07-00 獸化心靈 / 08-00 龍紋記憶 —— 三圍發放 (sim/effects/grantAttribute.ts)。
      case "grantAttribute":
        out.push({
          depth,
          kind: e.kind,
          summary:
            `三圍 ${e.attr} ${e.mode === "pctOfCurrent" ? `×${1 + e.amount} (現有的 +${Math.round(e.amount * 100)}%)` : `+${e.amount}`}` +
            `${e.everyNth && e.everyNth > 1 ? ` · 每 ${e.everyNth} 次才發一次` : ""}` +
            `${e.maxAttribute !== undefined ? ` · 上限 ${e.maxAttribute}` : ""}` +
            // 疊層 (甘豆腐之袍) —— 記在「來源」上的存款,賣掉道具就跟著走。
            // 這一段必須跟 maxAttribute 分開講:兩個都叫「上限」,封的卻是不同的東西。
            `${e.store === "source" ? " · 記在這件裝備上（賣掉就沒）" : ""}` +
            `${e.maxSourceTotal !== undefined ? ` · 這件最多發 ${e.maxSourceTotal}` : ""}` +
            `${e.durationSec !== undefined ? ` · 持續 ${e.durationSec}s` : " · 永久"}`,
        });
        break;
      // 復活 (天生牙 godie-i031) —— 「我方所有英雄」是 hook 的 target: "allies",
      // 不是這一行;這一行只講「站起來的時候是什麼狀態」。
      case "revive":
        out.push({
          depth,
          kind: e.kind,
          summary:
            `復活` +
            ` · HP ${e.hpPct !== undefined ? `${Math.round(e.hpPct * 100)}%` : "依復活圈設定"}` +
            ` · MP ${e.manaPct !== undefined ? `${Math.round(e.manaPct * 100)}%` : "依復活圈設定"}` +
            `${e.side === "any" ? " · 不限敵我" : " · 限我方"}` +
            `${e.teamCharge === "requireAndSpend" ? " · 花掉本回合的復活額度" : " · 不佔復活額度"}`,
        });
        break;
      // 嘲弄 (鍊金術之盾 godie-i06q) —— 強迫敵人優先攻擊施法者 (sim/taunt.ts)。
      // 「每秒」不在這裡:節奏是 hook 自己的 internalCooldown,這一行只講一發。
      case "taunt":
        out.push({
          depth,
          kind: e.kind,
          summary:
            `嘲弄 ${e.durationSec}s` +
            `${e.radius !== undefined ? ` · 範圍 ${e.radius}（吃 abilityRange）` : " · 單體"}` +
            `${e.radius !== undefined && e.maxTargets !== undefined ? ` · 最多 ${e.maxTargets} 人（由近到遠）` : ""}`,
        });
        break;
      // 發放金幣 —— 「黃金數量為敵方等級」= perTargetLevel 1 (effects/grantGold.ts)。
      case "grantGold":
        out.push({
          depth,
          kind: e.kind,
          summary:
            `發放金幣` +
            `${e.flat ? ` ${e.flat}` : ""}` +
            `${e.perTargetLevel ? ` + 目標等級 ×${e.perTargetLevel}` : ""}` +
            ` (${e.to === "target" ? "給目標" : "給自己"})`,
        });
        break;
      // 【淨化】/【驅散】(A4b, #278)。⚠️ 這一格是 EXHAUSTIVENESS TRIPWIRE
      // 逼出來的 —— 它做的正是下面那段註解說的事：新 kind 沒有在這裡處理，
      // 編譯就過不去，而不是安靜地預覽成一行空白。
      case "dispel": {
        const pools = e.pools
          ? (["status", "dot", "shields", "buffs"] as const)
              .filter((k) => e.pools?.[k])
              .join(" + ")
          : "後台預設的池子";
        out.push({
          depth,
          kind: e.kind,
          summary:
            `淨化 ${e.polarity === "buff" ? "增益" : e.polarity === "any" ? "增益與減益" : "減益"}` +
            ` · ${pools}` +
            `${e.shape === "circle" ? ` · 圓形 ${e.radius ?? "?"}（吃 abilityRange）` : " · 單體"}` +
            `${e.shape === "circle" ? `／${e.side === "enemies" ? "敵方" : "友方"}` : ""}` +
            `${e.maxTargets !== undefined ? ` · 最多 ${e.maxTargets} 人` : ""}` +
            `${e.count !== undefined ? ` · 每人最多 ${e.count} 層` : " · 層數用後台上限"}`,
        });
        break;
      }
      case "shieldBreak": {
        // ⚠️ 這一行刻意講明「只打護盾」—— 破盾與淨化在卡片上長得很像,
        // 而它們的差別（止血閥、不看 dispellable）在預覽上看不到。
        out.push({
          depth,
          kind: e.kind,
          summary:
            "破盾（只打護盾,狀態一格不動）" +
            `${e.shape === "circle" ? ` · 圓形 ${e.radius ?? "?"}（吃 abilityRange）` : " · 單體"}` +
            `${e.shape === "circle" ? `／${e.side === "allies" ? "友方" : "敵方"}` : ""}` +
            `${e.maxTargets !== undefined ? ` · 最多 ${e.maxTargets} 人` : ""}` +
            `${e.count !== undefined ? ` · 每人最多 ${e.count} 片` : " · 整池打掉"}`,
        });
        break;
      }
      case "devour": {
        // ⚠️ 一定要把「處決線」與「回多少」都印出來 —— 這個 kind 的兩個數字
        // 分別是它的門檻與它的報酬,只印一個的話卡片看起來像另一支技能。
        const line = e.thresholdPctOfMax.map((p) => `${(p * 100).toFixed(0)}%`).join("/");
        out.push({
          depth,
          kind: e.kind,
          summary:
            `吞噬（處決）：目標生命剩 ${line} 以下時即死` +
            `${e.victim === "any" ? "（含殭屍）" : "（只吞英雄）"}` +
            ` · 回復吞下去的 ${((e.healPct ?? 1) * 100).toFixed(0)}%` +
            `${e.throughShields === false ? " · ⚠️ 不穿盾（帶盾時吞不死）" : " · 穿盾"}` +
            `${e.shape === "circle" ? ` · 圓形 ${e.radius ?? "?"}（吃 abilityRange）` : " · 單體"}`,
        });
        break;
      }
      // ── Lane 1（2026-08-08）的四個新 kind ──────────────────────────────
      case "modifyCooldown": {
        // ⚠️ **一定要印出「哪一支」** —— 這個 kind 與全域 cdr 的差別全部在那裡，
        // 少了它，卡片上「冷卻縮短 50%」看起來就是一件完全不同的東西。
        const which =
          `${e.slot !== undefined ? `[${e.slot}]` : ""}` +
          `${e.abilityId !== undefined ? `《${e.abilityId}》` : ""}`;
        const how =
          e.mode === "reset"
            ? "冷卻立刻重置"
            : e.mode === "reduceFlat"
              ? `冷卻 ${e.amount ?? 0} 秒`
              : `冷卻 ${((e.amount ?? 0) * 100).toFixed(0)}%（${
                  e.basis === "base" ? "基礎冷卻的比例" : "剩餘量的比例"
                }）`;
        out.push({
          depth,
          kind: e.kind,
          summary: `${e.who === "target" ? "目標" : "自己"}的 ${which} ${how}`,
        });
        break;
      }
      case "weightedBranch": {
        // 權重是相對的，所以印**百分比**才看得懂；分母是總權重。
        const total = e.branches.reduce((s, b) => s + Math.max(0, b.weight), 0);
        out.push({
          depth,
          kind: e.kind,
          summary: `加權抽一支（整段只抽一次）：${e.branches.length} 個分支`,
        });
        e.branches.forEach((b, i) => {
          const pct = total > 0 ? ((Math.max(0, b.weight) / total) * 100).toFixed(1) : "0.0";
          out.push({
            depth: depth + 1,
            kind: e.kind,
            summary: `分支 ${i + 1}：${pct}%（weight ${b.weight}）${b.weight <= 0 ? " ⚠️ 抽不到" : ""}`,
          });
          effectLines(b.effects, finalStats, attrs, maxRank, depth + 2, out);
        });
        break;
      }
      case "swapResource": {
        out.push({
          depth,
          kind: e.kind,
          summary:
            `與目標交換${(e.resource ?? "health") === "mana" ? "法力" : "生命"}` +
            ` · 下限 ${e.clampMin ?? 1}${(e.clampMin ?? 1) <= 0 ? "（⚠️ 可能交換到死）" : "（不會交換到死）"}` +
            ` · 目標失效時${(e.onInvalidTarget ?? "abort") === "abort" ? "整招失敗" : "跳過那一個"}` +
            `${e.shape === "circle" ? ` · 圓形 ${e.radius ?? "?"}（吃 abilityRange）` : " · 單體"}`,
        });
        break;
      }
      case "eventValueConversion": {
        const src =
          (e.source ?? "incomingDamage") === "incomingDamage"
            ? `這一發傷害的 ${e.basis ?? "mitigated"}（⚠️ 基數待 owner freeze）`
            : "目標當下的剩餘生命";
        out.push({
          depth,
          kind: e.kind,
          summary:
            `把${src} × ${e.ratio} 轉成${(e.to ?? "mana") === "mana" ? "法力" : "生命"}` +
            ` → ${e.who === "target" ? "目標" : "自己"}` +
            `${e.buff ? ` · 另外 ${e.buff.durationSec}s 內 ${e.buff.stat} +（同一個數值 × ${e.buff.ratio ?? e.ratio}）` : ""}`,
        });
        break;
      }
      // ── Lane 2（2026-08-08）三個新 kind ────────────────────────────────
      case "randomArea": {
        out.push({
          depth,
          kind: e.kind,
          summary:
            `以${e.who === "target" ? "目標" : "自己"}為中心，半徑 ${e.scatterRadius} 內隨機落點` +
            ` · 每 ${e.intervalSec}s 一發，共 ${e.count.join("/")} 發` +
            `${(e.firstAtCast ?? true) ? "（第一發在施法當下）" : "（第一發等一個間隔）"}` +
            ` · 抽 ${2 * Math.max(...e.count)} 次亂數（施法時一次抽完）` +
            `${e.stopOnCasterDeath === true ? " · 施法者陣亡即停" : ""}`,
        });
        effectLines(e.effects, finalStats, attrs, maxRank, depth + 1, out);
        break;
      }
      case "manaBarrier": {
        out.push({
          depth,
          kind: e.kind,
          summary:
            // GH#307：`durationSec` 選填 —— 省略 = 常駐。⛔ 不可以印 `undefined s`。
            `魔力屏障 ${e.durationSec === undefined ? "常駐" : `${e.durationSec}s`}` +
            `：每 1 點魔力抵 ${e.perMana} 點傷害` +
            ` · 擋 ${e.damageTypes.join("/")}` +
            `${e.minManaReserve ? ` · 抵到剩 ${e.minManaReserve} 魔力就停` : "（抵到見底）"}` +
            " · ⛔ 魔力耗盡一律強制停止（有沒有填秒數都一樣）" +
            " · ⛔ 在扣血之前把傷害換成扣魔（不是受傷後補護盾）",
        });
        break;
      }
      case "extendBuff": {
        const per =
          e.perDamagePctOfMaxHealth !== undefined
            ? `自身最大生命 ${(e.perDamagePctOfMaxHealth * 100).toFixed(1)}%`
            : `${e.perDamageFlat ?? "?"} 點`;
        out.push({
          depth,
          kind: e.kind,
          summary:
            `每承受 ${per} 的傷害（讀 ${e.basis ?? "hpLost"}），把「${e.stackKey}」延長 ${e.addSec}s` +
            ` · 剩餘時間上限 ${e.maxRemainingSec}s（⚠️ 這條是正回饋，上限是安全閥）`,
        });
        break;
      }
      // ── 契約層（2026-08-09，GH#301-2）真瞬移 ───────────────────────────
      case "blink": {
        const dest =
          e.to === "point" ? "指定地點" : e.to === "caster" ? "施法者身邊" : "目標身上";
        out.push({
          depth,
          kind: e.kind,
          summary:
            `瞬移${e.applyTo === "target" ? "目標" : "自己"}到${dest}` +
            `${e.shape === "circle" ? `（半徑 ${e.radius ?? "?"} 內${e.side === "enemies" ? "敵人" : "隊友"}一起）` : ""}` +
            `${e.stopShortUnits ? ` · 落在前方 ${e.stopShortUnits} 單位處` : ""}` +
            " · ⛔ 真瞬移：沒有中間位置（與 leap 的差別就在這裡）" +
            " · ⚠️ 引擎側尚未實作（GH#301-2），現在放出來會丟例外",
        });
        effectLines(e.onArrive ?? [], finalStats, attrs, maxRank, depth + 1, out);
        break;
      }
      // ── Lane 3（2026-08-10）—— schema 與型別先行，引擎 handler 是下一階段。
      //    ⚠️ 兩條 summary 都**明說**「引擎側尚未實作」，形狀抄上面 `blink`
      //    當年那一句：一個看起來能用、放出去卻丟例外的預覽比空白更糟。
      case "delayed": {
        const shots = e.count ?? 1;
        out.push({
          depth,
          kind: e.kind,
          summary:
            `延遲 ${e.delaySec}s 後${shots > 1 ? `連續 ${shots} 下（每 ${e.intervalSec ?? "?"}s 一下）` : "打出一下"}` +
            `${e.targetMode === "reresolve" ? " · 每一下重新選目標（走開就打空）" : " · 目標在施放那一刻鎖定"}` +
            `${e.shape === "circle" ? `（半徑 ${e.radius ?? "?"} 內${e.side === "allies" ? "隊友" : "敵人"}）` : ""}` +
            " · ⚠️ 引擎側尚未實作（Lane 3），現在放出來會丟例外",
        });
        effectLines(e.effects, finalStats, attrs, maxRank, depth + 1, out);
        if (e.finalEffects) {
          out.push({ depth: depth + 1, kind: e.kind, summary: "↑ 最後一下額外追加：" });
          effectLines(e.finalEffects, finalStats, attrs, maxRank, depth + 2, out);
        }
        break;
      }
      case "proxyCast": {
        out.push({
          depth,
          kind: e.kind,
          summary:
            `代放 ${e.abilityId ?? `自己的 ${e.slot} 格`}` +
            ` · ${e.payCosts === undefined || e.payCosts === "none" ? "不付代價" : e.payCosts === "mana" ? "扣魔" : "扣魔並進冷卻"}` +
            `${e.respectCooldown ? " · 冷卻中不代放" : ""}` +
            `${e.rankMode === "fixed" ? ` · 固定第 ${e.fixedRank} 階` : " · 用玩家點的等級"}` +
            " · ⚠️ 引擎側尚未實作（Lane 3），現在放出來會丟例外",
        });
        break;
      }
      // ── [EX∅ 根源]（2026-08-18）—— 詞彙包先落地，引擎 handler 是 L4 / L5。
      //    ⚠️ 兩條 summary 都**明說**「引擎側尚未實作」，形狀抄上面 Lane 3 那兩條：
      //    一個看起來能用、放出去什麼都不發生的預覽比空白更糟（失敗形態②）。
      //    ⛔ 這兩個 case 不是裝飾 —— 下面那個 `never` 會拒絕編譯，直到它們在這裡
      //    被處理過（那正是這個 tripwire 存在的理由）。
      case "carry": {
        out.push({
          depth,
          kind: e.kind,
          summary:
            `背負${e.shape === "circle" ? `半徑 ${e.radius ?? "?"} 內` : ""}` +
            `${e.side === "enemies" ? "敵人" : "隊友"} ${e.maxTargets ?? 1} 名，${e.durationSec}s` +
            `${e.untargetable?.abilityAoe ? " · 連 AoE 都打不到" : " · 不可被選取（但 AoE 仍打得到）"}` +
            `${e.onCarrierDeath === "drop" ? " · 載具死了乘客跟著倒" : " · 載具死了就放下"}` +
            " · ⚠️ 引擎側尚未實作（[EX∅ 根源] L4），現在放出來什麼都不會發生",
        });
        effectLines(e.onHitTargets ?? [], finalStats, attrs, maxRank, depth + 1, out);
        break;
      }
      case "convertTeam": {
        out.push({
          depth,
          kind: e.kind,
          summary:
            `暫時奪取${e.shape === "circle" ? `半徑 ${e.radius ?? "?"} 內` : ""}單位的陣營` +
            `（同時最多 ${e.maxHeld ?? 2} 隻）` +
            `${e.until === "duration" ? ` · ${e.durationSec ?? "?"}s 後歸位` : e.until === "roundEnd" ? " · 回合結束歸位" : " · 打死才歸位"}` +
            `${e.oncePerRoundPerVictim === false ? " · 同一隻可重複捕捉" : " · 同一隻一回合只能捕一次"}` +
            " · ⚠️ 引擎側尚未實作（[EX∅ 根源] L5），現在放出來什麼都不會發生",
        });
        break;
      }
      case "chainLightning": {
        out.push({
          depth,
          kind: e.kind,
          summary:
            `連鎖閃電：${
              e.shape === "circle"
                ? `半徑 ${e.radius ?? "?"} 內**每一個**敵人各觸發一條`
                : "從指定目標起一條"
            }` +
            ` · 每條最多 ${e.jumps} 跳（跳躍距離 ${e.jumpRange}）` +
            ` · 每跳傷害 ×${e.decay}` +
            `${e.revisit === true ? " · 同一條可重複跳到同一人" : ""}` +
            ` · 這次施放總跳數上限 ${e.maxTotalJumps ?? "（未設，吃引擎硬上限）"}`,
        });
        effectLines(e.onHitTargets ?? [], finalStats, attrs, maxRank, depth + 1, out);
        break;
      }
      default: {
        // EXHAUSTIVENESS TRIPWIRE (task #247 follow-up). This switch used to
        // fall through silently, which is how `restore`, `spawnVfx` and then
        // `leap` each shipped previewing as a BLANK line. `never` makes the
        // compiler refuse the next EffectDef kind until it is handled here —
        // the same job walk.test.ts's tag list does for the form, done at
        // build time instead of test time.
        const unhandled: never = e;
        throw new Error(`preview: unhandled effect kind ${(unhandled as EffectDef).kind}`);
      }
    }
  }
  return out;
}

const ranks = (maxRank: number): number[] => Array.from({ length: maxRank }, (_, i) => i + 1);

export function createSimPreviewController(): PreviewController {
  let world: SimWorld | null = null;
  const vfxLog: string[] = [];

  return {
    mount(_canvas) {
      /* 資料版沒有畫面 —— 要畫面請用 `createBabylonPreviewController()`。 */
    },
    dispose() {
      world = null;
      vfxLog.length = 0;
    },

    previewChampion(def, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(def, level);
      world = sb.world;
      const stats = sb.world.stats.get(sb.id)!;
      const hp = sb.world.health.get(sb.id)!;
      return { level, finalStats: { ...stats.final }, hp: hp.hp, mana: hp.mana };
    },

    previewAbility(champion, slot, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(champion, level);
      world = sb.world;
      const finalStats = { ...sb.world.stats.get(sb.id)!.final };
      const ability = champion.abilities[slot];
      // REAL attribute lookup off the sandbox body — the same `liveAttribute`
      // the sim calls, so a 「等同總力量」 card previews the number it will
      // actually deal instead of 0.
      const attrs: AttrLookup = (attr, basis) =>
        liveAttribute(sb.world, sb.id, attr, basis) ?? 0;
      return {
        ability,
        casterStats: finalStats,
        lines: effectLines(ability.effects, finalStats, attrs, ability.maxRank),
      };
    },

    previewItem(item, on, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(on, level);
      world = sb.world;
      const before = { ...sb.world.stats.get(sb.id)!.final };
      // THE SHARED BUILDER, never a literal — `attachItemSource` is the one
      // place an item becomes a ModifierSource (economy/itemSource.ts), and the
      // whole contract of this panel is 「表單看到的 == 遊戲跑的」.
      //
      // A hand-built literal here shipped a preview that LIED: it copied
      // `item.modifiers` raw, so the 職業限定閘 was never resolved and 貫雷槍
      // (godie-i01g, 近戰+4／遠戰+2) reported +6 — on BOTH bodies, a number no
      // champion in the game can receive. TypeScript could not see it:
      // `ItemStatModifier extends StatModifier`, so the un-resolved array is
      // structurally assignable to the resolved field. Slot 0 because a preview
      // holds one item and the slot only ever disambiguates stackables.
      attachItemSource(sb.world, sb.id, item.id, 0, item);
      recomputeStats(sb.world, sb.id);
      const after = sb.world.stats.get(sb.id)!.final;
      return ALL_STATS.filter((s) => before[s] !== after[s]).map((s) => ({
        stat: s,
        before: before[s],
        after: after[s],
      }));
    },

    previewAugment(aug, on, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(on, level);
      world = sb.world;
      const before = { ...sb.world.stats.get(sb.id)!.final };
      attachSource(sb.world, sb.id, {
        id: `preview:aug:${aug.id}`,
        kind: "augment",
        modifiers: aug.modifiers,
        hooks: aug.hooks,
      });
      recomputeStats(sb.world, sb.id);
      const after = sb.world.stats.get(sb.id)!.final;
      return ALL_STATS.filter((s) => before[s] !== after[s]).map((s) => ({
        stat: s,
        before: before[s],
        after: after[s],
      }));
    },

    /**
     * 玩家那條路，一步不省：點階（`rankUpAbility`，真的那一支）→ 包一個
     * `IntentFrame` → `world.step()` → 從 `world.events` 讀回答案。
     *
     * ⚠️ `world.events` **每個 tick 都會被 `step()` 清空**（SimWorld.ts:1517
     * 第一行就是 `this.events.length = 0`），所以每跑一 tick 就要當場抄走。
     * 抄晚一格 = 事件消失，而「沒有事件」跟「技能沒放出去」在畫面上一模一樣。
     */
    castAbility(champion, slot, opts) {
      const level = opts?.level ?? 1;
      const sb = sandbox(champion, level, { dummy: true });
      world = sb.world;
      const seat = asSeatId(0);
      const hp = sb.world.health.get(sb.id)!;
      const ab = sb.world.abilities.get(sb.id)!;

      // 點階。⛔ 不直接寫 `inst.rank` —— 那會跳過 `rankUpAbility` 自己的規則
      // （上限、EX 的解鎖、技能點）。這裡補的是**技能點**，因為預覽要試的是
      // 「這一發放不放得出去」，不是「這個等級買不買得起」。
      const wantRank = Math.max(1, opts?.rank ?? 1);
      if (slot === "Q" || slot === "W" || slot === "E" || slot === "R") {
        const inst = ab.slots[slot];
        while (inst.rank < wantRank) {
          ab.unspentPoints = Math.max(ab.unspentPoints, 1);
          if (!rankUpAbility(sb.world, sb.id, slot)) break;
        }
      }

      const manaBefore = hp.mana;
      const selfPos = sb.world.transform.get(sb.id)!;
      const dummyPos = sb.dummyId === null ? null : (sb.world.transform.get(sb.dummyId) ?? null);
      // ⚠️ EX 與 PASSIVE **不在** `champion.abilities` 裡（那格只有 Q/W/E/R），
      // 所以它們的 `castType` 要從 spawn 出來的實例回頭問登錄表 —— ⛔ 少了這一段，
      // 一支 `targeted` 的 EX 會被當成 `self` 打出去，然後「成功」。
      const inst0 =
        slot === "EX" ? ab.exSlot : slot === "PASSIVE" ? ab.passiveSlot : ab.slots[slot];
      const abilityDef =
        slot === "Q" || slot === "W" || slot === "E" || slot === "R"
          ? champion.abilities[slot]
          : inst0
            ? Abilities.tryGet(inst0.abilityId)
            : undefined;
      const target = castTargetFor(
        abilityDef,
        { x: selfPos.pos.x, z: selfPos.pos.z },
        dummyPos ? { x: dummyPos.pos.x, z: dummyPos.pos.z } : null,
        sb.dummyId,
        opts?.point,
      );
      const intents = new Map<ReturnType<typeof asSeatId>, IntentFrame>([
        [seat, { commands: [{ kind: "castAbility", slot, target }] }],
      ]);

      const events: { type: string; tick: number; data: Record<string, unknown> }[] = [];
      const drain = (): void => {
        for (const e of sb.world.events) {
          events.push({ type: e.type, tick: e.tick, data: e.data });
        }
      };

      sb.world.step(intents);
      drain();
      // ⚠️ 冷卻要在**指令落地的那一格**抄走，⛔ 不是跑完 30 tick 之後 ——
      // `tickCooldowns` 每一格都在扣，晚抄就會報一個少了一秒的數字，
      // 而一支 1 秒冷卻的技能會被報成 0（＝看起來像「這支沒有冷卻」）。
      const cooldownTicks = inst0?.cooldownRemainingTicks ?? 0;
      const empty = new Map<ReturnType<typeof asSeatId>, IntentFrame>();
      const ticks = Math.max(0, opts?.ticks ?? CAST_PREVIEW_TICKS);
      for (let i = 0; i < ticks; i++) {
        sb.world.step(empty);
        drain();
      }

      const rejected = events.find((e) => e.type === "castRejected");
      return {
        // ⭐ 判準是 **sim 自己喊的那一聲**（`abilityCast`），⛔ 不是「我送出去了」。
        //    前者是「CommandSystem 的每一道閘都放行了」，後者只是我有打字。
        accepted: events.some((e) => e.type === "abilityCast"),
        ...(rejected ? { reason: String(rejected.data["reason"] ?? "unknown") } : {}),
        manaBefore,
        manaAfter: hp.mana,
        cooldownTicks,
        events,
      };
    },

    spawnVfx(vfxKey) {
      vfxLog.push(vfxKey);
    },

    stepFixed(ticks) {
      if (!world) return;
      const empty = new Map();
      for (let i = 0; i < ticks; i++) world.step(empty);
    },
  };
}

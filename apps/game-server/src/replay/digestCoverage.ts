/**
 * digestCoverage.ts — GH#351 / GH#353 的**通用解**。
 *
 * 兩張票長得一模一樣：`ChampionComp.itemAcq` 是 SIM state，但沒有進 replay
 * digest。⛔ 把它補進去然後等下一個漏掉的，是把同一張票再開一次 —— 因為
 * **digest 是手寫的清單**：
 *
 *   `SimWorld.digest()`               packages/shared/src/sim/SimWorld.ts:1755
 *   `hostDigest(ctl)`                 apps/game-server/src/replay/digest.ts:70
 *
 * 兩支都是逐欄手打的 `mix(...)`。所以「新增一格狀態」與「這格狀態被 hash」之間
 * **沒有任何連結** —— 漏掉的那天不會有東西紅，而症狀（replay 重播到某一格突然
 * 分岔）要等好幾個月才會有人踩到。
 *
 * 這一支把那個連結補上，做法是**兩個普查**，兩個都跑真的出貨程式碼：
 *
 * ① **SimWorld 的每一格欄位** —— 用一層 read-tracking Proxy 把兩支 digest 真的
 *    跑一遍，記下它們讀了哪些 own property。沒被讀到的欄位必須落在下面兩張表
 *    其中一張（{@link SIM_WORLD_DIGEST_EXEMPT} 有理由的豁免 /
 *    {@link SIM_WORLD_DIGEST_GAPS} 已知缺口）。新增一格而不分類 → **紅**。
 *
 * ② **ChampionComp 的每一格欄位** —— ①抓不到這一層（`world.champion` 這格
 *    「有被讀到」，而 `itemAcq` 就是在它裡面漏掉的）。所以這一層走**突變**而不是
 *    讀取追蹤：把那一格換成一個不同的值，兩支 digest 之中至少要有一支跟著變。
 *    ⭐ 突變比讀取追蹤強一級 —— 「讀了但忘了 mix」在這一層也會紅。
 *    欄位清單來自 {@link PROBE_CHAMPION} 的 `Required<ChampionComp>` 型別，
 *    所以**新增一格 = typecheck 紅**，⛔ 不必有人記得回來改這支。
 *
 * ⚠️ ①的已知限制（刻意的，寫在這裡以免下一個人以為它比實際更強）：讀取追蹤證明
 * 的是「digest **碰過**這一格」，不是「digest **hash 了**這一格」。`hostDigest`
 * 呼叫 `currentFireRingRadius(w)`，那支會讀 `w.arena` 與 `w.fireRingRules`，
 * 所以那兩格算「被涵蓋」。兩格都是開場灌入的設定，本來就會落在 EXEMPT 的
 * CONFIG 桶，結論一樣。真正需要「有沒有被 hash」這種強度的那一層是 ②，而 ②
 * 用的是突變。
 */
import { asEntityId, type AugmentId, type ChampionId, type ItemId } from "@ggd/shared/ids";
import type { ChampionComp } from "@ggd/shared/sim/components";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import type { MatchController } from "../match/MatchController";
import { hostDigest } from "./digest";

/* -------------------------------------------------------------------------- */
/* 豁免理由（分桶，一句話講清楚「為什麼漏了它 replay 也不會說謊」）            */
/* -------------------------------------------------------------------------- */

/**
 * 設定值：開場由 host 一次灌進來，⛔ 系統從不改它，所以它不是**演化中的**狀態。
 * 兩個 replica 的差異只可能來自載入了不同的內容/設定，而那由 replay header
 * （`format.ts` 的 contentVersion / registryFingerprint / combatEnv / baseBonus /
 * arenaRules）加上 `checkCompatibility` 在**播放開始之前**擋掉 —— 那是比 digest
 * 更早、而且訊息更準的一道閘。
 */
const CONFIG = "設定值：host 開場灌入、系統不改；replica 差異由 replay header + checkCompatibility 擋";

/** 每 tick 從已被 hash 的輸入重算出來的東西 —— 它不可能自己分岔。 */
const DERIVED = "純推導：每 tick 由已被 hash 的輸入重算，自己不帶記憶";

/** 在同一個 tick 內被填滿又被排乾，tick 邊界上永遠是空的。 */
const TRANSIENT = "單 tick 暫存：填它與排乾它在同一個 tick 內，tick 邊界上恆空";

/**
 * 只是帳本：它自己不改變任何世界狀態，唯一的可觀測效果**在它發生的那一 tick**
 * 就已經被別的欄位 hash 住了。這是 SimWorld.ts 自己對 `bossDamage` /
 * `killTracking` / `killCombo` / `bountyPaid` 寫下的先例，逐字沿用。
 */
const LEDGER = "帳本：唯一可觀測效果（金錢/生成/事件）在發生的那一 tick 已被別的欄位 hash";

/* -------------------------------------------------------------------------- */
/* ① SimWorld 層                                                               */
/* -------------------------------------------------------------------------- */

/**
 * SimWorld 的欄位裡，**刻意**不進 digest 的那些，以及為什麼。
 *
 * ⚠️ 這張表是**契約**不是備忘錄：`digestCoverage.test.ts` 兩個方向都驗 ——
 * 列在這裡但其實有被 hash → 紅（表過期了）；沒列而且沒被 hash → 紅（有人新增了
 * 一格狀態卻沒有想過 replay）。
 */
export const SIM_WORLD_DIGEST_EXEMPT: Readonly<Record<string, string>> = {
  // ── 設定 / 規則 ──────────────────────────────────────────────────────────
  // ⚠️ `arena` 與 `fireRingRules` **不在這張表上**，而它們也是 CONFIG ——
  // 它們被 `hostDigest` 呼叫的 `currentFireRingRadius(w)` 讀到，所以普查把它們
  // 算成「已涵蓋」。⛔ 不要為了整齊把它們補進來：反方向的守衛會紅（它會說
  // 「豁免表過期了」），⭐ 而那個紅是對的 —— 這張表只裝**沒有被碰過**的欄位。
  dt: "常數（TICK_MS/1000），不是狀態",
  gateSchedule: CONFIG,
  itemEligible: CONFIG,
  offerExcludedCraftRoles: CONFIG,
  weaponShelfOpen: CONFIG,
  legendaryShelf: CONFIG,
  ultGateOverride: CONFIG,
  flowerRules: CONFIG,
  wallBlock: CONFIG,
  reviveRules: CONFIG,
  guardianRules: CONFIG,
  coinRules: CONFIG,
  mobRules: CONFIG,
  combatEnv: CONFIG,
  baseBonus: CONFIG,
  perLevelBonus: CONFIG,
  statCaps: CONFIG,
  bodyScaleRules: CONFIG,
  regenRules: CONFIG,
  // 回魔地板（GH#446）—— 和 `regenRules` 完全同一條路：`MatchController` 在
  // tick 0 之前定格，比賽中途不會變，所以每個 replica 讀到的是同一份。
  manaEconomy: CONFIG,
  combatFeel: CONFIG,
  shieldRules: CONFIG,
  blockRules: CONFIG,
  critRules: CONFIG,
  augmentEnemyFilter: CONFIG,
  tauntRules: CONFIG,
  dispelRules: CONFIG,
  cooldownRules: CONFIG,
  grailDraft: CONFIG,
  castTimeRules: CONFIG,
  woundRules: CONFIG,
  weaknessRules: CONFIG,
  damageRules: CONFIG,
  // AP 傷害加成（owner 2026-08-21）—— 和 `damageRules` 完全同一條路：
  // `MatchController` 在 tick 0 之前定格，比賽中途不會變，所以每個 replica 讀到同一份。
  apDamageScaling: CONFIG,
  mitigationRules: CONFIG,
  stealthRules: CONFIG,
  // ⭐ GH#606 —— 視野規則。和 `stealthRules` 完全同一格：它是**開場灌進來的設定**，
  // ⛔ 不是每 tick 演化的狀態 ⇒ 不進 digest（重播用它自己那一份 config 重建）。
  visionRules: CONFIG,
  // 下架清單 —— host 在開場灌一次的設定,整場不變（同 visionRules）。
  retiredChampionIds: CONFIG,
  berserkRules: CONFIG,
  flowerZones: CONFIG + "（開場由該回合的 pairings 決定，每個 replica 一樣）",
  mobZones: CONFIG + "（同 flowerZones，SimWorld.ts 自己的註解就是這樣寫的）",

  // ── 推導 ────────────────────────────────────────────────────────────────
  stats: DERIVED + "：statRecomputeSystem 從 champion/裝備/modifier 重算",
  grid: DERIVED + "：SpatialHash 每 tick 由 transform 重建",

  // ── 單 tick 暫存 ────────────────────────────────────────────────────────
  damageQueue: TRANSIENT + "（combatResolveSystem 當 tick 排乾）",
  events: TRANSIENT + "（host 每 tick 取走做 fanout）",
  pendingStunHooks: TRANSIENT,
  pendingReflectHooks: TRANSIENT,
  pendingDestroy: TRANSIENT + "（GH#296 的延後銷毀佇列，`drainPendingDestroy` 在同一個 `step()` 裡排乾，刻意不跨 tick）",

  // ── 帳本（觀測效果已被別處 hash）────────────────────────────────────────
  bossDamage: LEDGER + "；SimWorld.ts 該欄位的註解逐字寫了這個裁決",
  bossSpawnsThisRound: LEDGER + "：唯一效果是「王有沒有出現」，王的 transform/hp 已被 hash",
  killTracking: LEDGER,
  killCombo: LEDGER + "；純表演計數器，SimWorld.ts 該欄位註解逐字寫了這個裁決",
  bountyPaid: LEDGER + "：效果是 goldEarned，而 goldEarned 在 matchStats 裡被 hash",
  capturedThisRound: LEDGER + "：一回合一次的捕獲閘，效果是 mindControl，而 mindControl 已被 hash",
  spawnHaltedZones: LEDGER + "：唯一效果是「這一 tick 有沒有生出殭屍」，生出來的身體立刻被 hash",
  flowerNextSpawn: LEDGER + "：唯一效果是「這一 tick 有沒有長出花」，花的 transform/health 立刻被 hash",
  flower: LEDGER + "：花的可觀測效果是它治療的 hp，而 hp 被 hash",
  projectile: LEDGER + "：飛彈的位置被 hash（它是有 transform 的實體），酬載的差異在命中那一 tick 變成 hp 差異",

  // ── 其他（各自一個理由）────────────────────────────────────────────────
  nextId: "下一個實體 id：它分岔的第一個後果就是下一次 spawn 拿到不同的 id，而 `id` 本身被 mix 進每一格",
  team: "只在 spawn 寫入（spawnChampion / mobs / auraCarrier），之後不再變；臨時換隊走 `mindControl`，而它已被 hash",
  roundResolving: "相位旗標：與 `phase.phase` 同步設/清，而 hostDigest 已經 hash 了 `ctl.phase.phase`",
  facingLock: "面向鎖：它唯一的效果就是 `Transform.facing`，而 facing 每 tick 被 hash —— 分岔當 tick 就說話",
  aimTick: "同 facingLock：效果落在 facing 上，而 facing 被 hash",
  walkStall: "卡住計數：效果是「要不要自動接敵」，而接敵的結果（nav.attackTarget + 位置）被 hash",
  moveOrderNoAggroUntil:
    "打帶跑窗口的到期 tick（GH#637）：與 `walkStall` 逐字同型 —— 它決定的是「要不要自動接敵」，" +
    "而接敵的**結果**（nav.attackTarget ＋ 位置）已經被 hash。⇒ 分岔在下一 tick 就從已被 hash 的欄位說出來。",
  lastMoveOrderTick:
    "上一次移動指令的 tick（GH#637 的搖桿流判準）：純粹的去抖動輔助，它唯一的效果是決定 " +
    "`moveOrderNoAggroUntil` 要不要被重寫 —— 同上一格的理由。",
  autoEngaging: "同 walkStall：效果是 nav.attackTarget 與位置，兩個都被 hash",
  suspendedOrder: "被暫存的指令：它生效的那一刻就變成 nav 的內容，而 nav.attackTarget 與位置被 hash",
};

/**
 * ⚠️ **已知缺口** —— 這些是真的 authoritative sim state，真的沒有進 digest，而且
 * 上面那四個豁免理由**沒有一個套得上**。它們留在這裡是為了讓它們**被看見**：
 * 一格沒有分類的欄位會讓守衛紅，一格分到這裡的欄位會出現在這張清單上，
 * ⛔ 而不是消失在一支 2,000 行的方法裡。
 *
 * 值是「分岔了會長成什麼樣子」，⛔ 不是「為什麼不用管」。
 * 這一批是 GH#351 / GH#353 的普查跑出來的，交給 owner 排序（第零守則⑧）。
 */
export const SIM_WORLD_DIGEST_GAPS: Readonly<Record<string, string>> = {
  stealth: "隱身：決定誰選得到誰。分岔 = 兩邊打不同的目標，症狀是幾秒後莫名的 hp 落差",
  trueSight: "真視：同 stealth，決定隱身還算不算數",
  flight: "飛行：決定誰打得到、走得過哪裡",
  taunt: "嘲諷：直接覆寫「打誰」，與已經被 hash 的 attackTarget 是同一級的東西",
  auraCarrier: "光環載體：持續改別人的 stat，分岔要等傷害數字才看得出來",
  deathWard: "死亡守衛：決定「該死的那一下死不死」，與已被 hash 的 marks 同一族",
  randomArea: "延遲隨機區域波：帶絕對 tick 的待發傷害，一邊發了一邊沒發",
  delayed: "延遲波：同上",
  chainLightning: "連鎖閃電施法中狀態：跳躍序列分岔 = 打到不同的人",
  dashOnEnd: "結束時衝刺：待發位移，一邊動了一邊沒動",
  combatTicks: "戰鬥經過 tick（花的生成節拍）：⚠️ 與它同型的 `mobTicks` **有**被 hash（「排程分岔要當 tick 說話」），這一格是同一個理由下的漏網",
};

/**
 * 跑真的兩支 digest，回報它們**碰過** SimWorld 的哪些 own property。
 *
 * ⚠️ 世界裡至少要有一個 `transform` 實體，否則 `SimWorld.digest()` 的逐實體迴圈
 * 一次都不跑，於是 health/hitstop/marks/dot/… 全部會被誤判成「沒被讀」。
 * 呼叫端負責（`digestCoverage.test.ts` 把控制器跑進 combat 才做普查）。
 */
export function simWorldFieldsReadByDigests(ctl: MatchController): ReadonlySet<string> {
  const world = ctl.world;
  const own = new Set(Object.keys(world));
  const read = new Set<string>();
  const worldSpy = new Proxy(world, {
    get(t, p) {
      if (typeof p === "string" && own.has(p)) read.add(p);
      // receiver = t：讓 class 上的 getter/method 拿到真的實例，
      // 而 `worldSpy.digest()` 的 `this` 仍然是 proxy（呼叫點決定的），
      // 所以 digest 內部每一次 `this.X` 照樣經過這個 trap。
      return Reflect.get(t, p, t) as unknown;
    },
  });
  const ctlSpy = new Proxy(ctl, {
    get(t, p) {
      return p === "world" ? worldSpy : (Reflect.get(t, p, t) as unknown);
    },
  });
  (worldSpy as SimWorld).digest();
  hostDigest(ctlSpy as MatchController);
  return read;
}

/* -------------------------------------------------------------------------- */
/* ② ChampionComp 層                                                           */
/* -------------------------------------------------------------------------- */

/**
 * 突變普查的樣本。⭐ 型別是 `Required<ChampionComp>`，所以它**就是**欄位清單：
 * 有人往 `ChampionComp` 加一格 → 這個物件字面值少一個屬性 → **typecheck 紅**，
 * ⛔ 不需要任何人記得回來改這支。
 */
export const PROBE_CHAMPION: Required<ChampionComp> = {
  championId: "godie-probe-a" as ChampionId,
  level: 3,
  xp: 40,
  gold: 500,
  items: ["item-a" as ItemId, null, null, null, null, null],
  itemAcq: [{ paid: 900, random: false }, null, null, null, null, null],
  augments: ["aug-a" as AugmentId],
  statStacks: 4,
  attrBonus: { str: 1, agi: 2, int: 3 },
  statCapstonePct: 10,
  pendingOrbSlots: 1,
  shopPriceMult: 1,
  undoStack: [
    { kind: "buy", itemId: "item-a" as ItemId, slot: 0, goldDelta: -900, statStacksBefore: 4 },
  ],
  attrGrantProgress: { "ab-1|str": 1 },
  attrGrantTimed: [{ attr: "str", amount: 2, expiresAtTick: 900, origin: "ab-1" }],
};

/**
 * 每一格都與 {@link PROBE_CHAMPION} 不同的對照樣本 —— 突變就是「把這一格抄過去」。
 *
 * ⚠️ `undoStack` 刻意**長度相同、內容不同**：hostDigest 曾經只 hash
 * `undoStack.length`，而一個內容不同的 undo 堆疊在下一次 undo 就會退回不同的金額。
 * 長度一樣的對照組是唯一問得出這件事的問法。
 */
export const PROBE_CHAMPION_ALT: Required<ChampionComp> = {
  championId: "godie-probe-b" as ChampionId,
  level: 4,
  xp: 41,
  gold: 501,
  items: ["item-b" as ItemId, null, null, null, null, null],
  itemAcq: [{ paid: 901, random: true }, null, null, null, null, null],
  augments: ["aug-b" as AugmentId],
  statStacks: 5,
  attrBonus: { str: 2, agi: 3, int: 4 },
  statCapstonePct: 20,
  pendingOrbSlots: 2,
  shopPriceMult: 0.5,
  undoStack: [
    { kind: "sell", itemId: "item-b" as ItemId, slot: 1, goldDelta: 360, statStacksBefore: 5 },
  ],
  attrGrantProgress: { "ab-1|str": 2 },
  attrGrantTimed: [{ attr: "agi", amount: 3, expiresAtTick: 901, origin: "ab-2" }],
};

/** 兩支 digest 合起來的一個值 —— 「至少有一支會動」就是這一層的判準。 */
function bothDigests(ctl: MatchController): string {
  return `${ctl.world.digest()}|${hostDigest(ctl)}`;
}

/**
 * 逐格突變 {@link PROBE_CHAMPION}，回報**哪些格子換了值兩支 digest 都不動**。
 * 那些就是「是 sim state 但不在 replay digest 裡」的欄位（GH#351 / GH#353）。
 */
export function championFieldsMissedByDigests(ctl: MatchController): string[] {
  // 一個合成的 entity id：`hostDigest` 走的是 `w.champion` 這張表，不需要身體。
  const probeId = asEntityId(9_000_001);
  const missed: string[] = [];
  for (const key of Object.keys(PROBE_CHAMPION)) {
    const probe = { ...PROBE_CHAMPION } as unknown as Record<string, unknown>;
    ctl.world.champion.set(probeId, probe as unknown as ChampionComp);
    const before = bothDigests(ctl);
    probe[key] = (PROBE_CHAMPION_ALT as unknown as Record<string, unknown>)[key];
    if (bothDigests(ctl) === before) missed.push(key);
  }
  ctl.world.champion.delete(probeId);
  return missed;
}

/**
 * `ChampionComp` 上刻意不進 digest 的格子。**空的**，而且應該保持空的：
 * 這一族欄位（金錢、進度、裝備、取得紀錄）每一格都會直接改變一場比賽的結果。
 */
export const CHAMPION_DIGEST_EXEMPT: Readonly<Record<string, string>> = {};

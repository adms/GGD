/**
 * 鍊金術之盾 (godie-i06q) ON THE SHIPPED DOC —— the anti-「被測的不是出貨的那個」
 * half of `sim/taunt.test.ts`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS SEPARATELY
 *
 * `taunt.test.ts` proves the MECHANISM on synthetic fixtures, so a content
 * rebalance cannot make it red for the wrong reason. This one proves the
 * mechanism is actually WIRED TO THE CARD: it reads
 * `content/items/godie-i06q.json` off disk, registers it, and grants it through
 * the SHIPPED `grantItemFree` path (the 三選一 / gacha site, one of the three
 * `attachSource` call sites shop.ts's own comment warns about).
 *
 * That is failure shape ⑤ verbatim: a guard that hand-writes its own
 * `passive: [...]` fixture stays green forever after somebody deletes the hooks
 * from the doc, and the card goes back to being an empty tier-5 promise.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE TWO HALVES OF THE CARD
 *
 *   「[嘲弄] 每秒吸引周圍敵人優先攻擊自己，持續 0.5秒」
 *   「[煉金術] 受敵人攻擊時，有 10%機率將直接將 HP 低於 5% 的敵人變成黃金
 *     (敵方單位直接死亡，黃金數量為敵方等級)」
 *
 * ⚠️ ON `chance: 0.1`. The alchemy tests below do NOT fight the seeded rng by
 * looping until it happens — that would be a flaky guard whose failure message
 * is 「unlucky」. They arm exactly one attack per attempt and step until the
 * shipped 10 % roll lands, capped; if the cap is reached the test FAILS with a
 * message that says so, which is a real signal (the proc no longer fires at
 * all) rather than noise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Items } from "./content/registry";
import { registerSkeletonContent, THORNE } from "./content/skeleton";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { grantItemFree } from "./economy/shop";
import { asSeatId, asTeamId, type AbilityId, type EntityId, type ItemId, type SeatId } from "../ids";
import { Stat, zeroStats } from "./stats/statTypes";
import { zeroAttrBonus } from "./stats/attributes";
import type { AbilitiesComp } from "./stats/statsComp";
import type { IntentFrame } from "./intents";
import { tauntedBy } from "./taunt";
import { MONSTER_TEAM, mobRulesFromConfig, type MobWavesConfigLike } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import {
  COMBAT_ENV_DEFAULTS,
  normalizeCombatEnv,
  type CombatEnvMultipliers,
} from "./combatEnv";
import * as V from "./math/vec2";

const TAG = "taunt-forced-targeting";
const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const SHIELD = "godie-i06q" as ItemId;
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

beforeAll(() => {
  // Registered doc-BY-PATH rather than through the bundle, the same choice
  // auraCarrierContent.test.ts makes: `_index.json` is a derived artifact that
  // only `pnpm content:build` refreshes, and this suite must be green on both
  // sides of that.
  const store = new ContentStore();
  for (const c of ["items", "status-effects", "projectiles"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
  // …plus the two skeleton champions, because the fighters below carry a
  // ChampionComp and `statRecomputeSystem` looks its `championId` up the moment
  // `attachSource` (the item grant) marks the sheet dirty. Registered AFTER
  // `registerAll`, which only ADDS — it never clears — so the shipped item docs
  // this suite is actually about are untouched.
  registerSkeletonContent();
});

function at(dx: number): V.Vec2 {
  return { x: Z0.center.x + dx, z: Z0.center.z + 12 };
}

let seat = 0;
function fighter(
  world: SimWorld,
  team: number,
  pos: V.Vec2,
  opts: { hp?: number; maxHp?: number; level?: number } = {},
): EntityId {
  const id = world.spawn();
  const maxHp = opts.maxHp ?? 5000;
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, {
    hp: opts.hp ?? maxHp,
    maxHp,
    mana: 100,
    maxMana: 100,
    alive: true,
    shields: [],
  });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat++) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 1e-9; // immobile: every distance here must stay put
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 1;
  final[Stat.AttackDamage] = 3;
  world.stats.set(id, { championId: THORNE.id, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.champion.set(id, {
    championId: THORNE.id,
    level: opts.level ?? 1,
    xp: 0,
    gold: 0,
    items: [null, null, null, null, null, null],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

/** 一個 #215 形狀的殭屍：MONSTER 隊、有 MobComp、**刻意沒有** ChampionComp。 */
function mobBody(
  world: SimWorld,
  pos: V.Vec2,
  opts: { hp?: number; maxHp?: number } = {},
): EntityId {
  const id = world.spawn();
  const maxHp = opts.maxHp ?? 100;
  world.transform.set(id, {
    pos: { ...pos },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.health.set(id, {
    hp: opts.hp ?? maxHp,
    maxHp,
    mana: 0,
    maxMana: 0,
    alive: true,
    shields: [],
  });
  world.team.set(id, { teamId: MONSTER_TEAM, seatId: asSeatId(seat++) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.mob.set(id, {
    zone: 0,
    team: MONSTER_TEAM,
    target: -1 as EntityId,
    attackCdTicks: 0,
    spawnTick: 0,
    kind: "normal",
  });
  return id;
}

/** 一份不會自己生怪的 mobWaves 設定 —— 這一支自己擺殭屍。 */
const SILENT_WAVES: MobWavesConfigLike = {
  fromRound: 1,
  firstWaveSec: 9999,
  waveIntervalSec: 9999,
  mobsPerWaveCap: 0,
  maxAlivePerZone: 50,
  mob: {
    maxHp: 100,
    attackDamage: 10,
    moveSpeed: 3,
    attackRange: 1.6,
    attackCdSec: 1,
    radius: 0.5,
  },
  reward: { gold: 0, xp: 0, killsPerLevel: 30 },
};

function combatWorld(seed = 7): SimWorld {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  return world;
}

describe("出貨文件本身", () => {
  it("godie-i06q 真的帶著兩條 passive，而且不是空卡", () => {
    cover(TAG);
    const def = Items.get(SHIELD);
    // 這一條擋的是「有人把 hooks 從文件刪掉」——下面每一條行為測試都會跟著紅，
    // 但它們的訊息會是「嘲弄沒生效」，而不是「卡片是空的」。
    expect(def.passive ?? []).toHaveLength(2);
    const kinds = (def.passive ?? []).map((h) => h.on);
    expect(kinds).toContain("onInterval");
    expect(kinds).toContain("onDamageTaken");
    // ⚠️ 描述是**規格**（owner 親筆），不可以被這條 lane 改動。
    // 讀的是**磁碟上那份 JSON**，不是 `ItemDef` —— sim 的執行期型別根本不帶
    // `description`（它是給編輯器/UI 看的欄位），所以從 registry 讀不到它。
    const raw = JSON.parse(
      readFileSync(join(CONTENT_DIR, "items", `${SHIELD}.json`), "utf-8"),
    ) as { description?: string };
    expect(raw.description ?? "").toContain("[嘲弄] 每秒吸引周圍敵人優先攻擊自己，持續 0.5秒");
    expect(raw.description ?? "").toContain("[煉金術] 受敵人攻擊時，有 10%機率");
  });
});

describe("[嘲弄] 每秒吸引周圍敵人優先攻擊自己", () => {
  it("拿著這面盾站著不動，一秒之內周圍的敵人就被拉住了", () => {
    cover(TAG);
    const world = combatWorld();
    const holder = fighter(world, 0, at(0));
    const foe = fighter(world, 1, at(3));
    world.rebuildGrid();

    expect(grantItemFree(world, holder, SHIELD)).toBeGreaterThanOrEqual(0);

    // 對照組：還沒跑到 `internalCooldown: 1` 的第一拍，沒有人被拉住。
    expect(tauntedBy(world, foe)).toBeNull();

    // `onInterval` 每 tick 發射，節奏由 hook 自己的 internalCooldown 表達。
    // ⚠️ `world.events` 在**每一 tick 開頭**被清空，所以事件要邊跑邊收 ——
    // 跑完再看只看得到最後一 tick 的那幾筆。
    let tauntEvents = 0;
    for (let i = 0; i < 40; i++) {
      world.step(NO_INTENTS);
      tauntEvents += world.events.filter((e) => e.type === "taunt").length;
    }
    expect(tauntedBy(world, foe)).toBe(holder);
    // ② 玩家看得見它發生過。
    expect(tauntEvents).toBeGreaterThan(0);
  });

  it("被拉住的敵人真的改打盾主，而不只是一筆狀態", () => {
    cover(TAG);
    // 誘餌貼在敵人臉上、血量幾乎見底、而且正在打他 —— 索敵比較器的每一把 key
    // 都站在誘餌那邊。盾主站在 8 單位外（近戰索敵地板 6 之外）。
    const world = combatWorld();
    const decoy = fighter(world, 0, at(0.1), { hp: 60 });
    const foe = fighter(world, 1, at(1.5));
    const holder = fighter(world, 0, at(8));
    world.rebuildGrid();
    grantItemFree(world, holder, SHIELD);

    let pulledAt = -1;
    for (let i = 0; i < 120; i++) {
      world.step(NO_INTENTS);
      if (world.nav.get(foe)!.attackTarget === holder) {
        pulledAt = i;
        break;
      }
    }
    expect(pulledAt, "敵人整整 4 秒都沒有被拉到盾主身上").toBeGreaterThanOrEqual(0);
    // 對照組寫在斷言裡：誘餌在那一刻還活著，所以「改打盾主」不是因為誘餌死了。
    expect(world.health.get(decoy)!.alive).toBe(true);
  });

  it("盾主**在**敵人的索敵半徑之內時也拉得動（釘的是比較器，不是半徑外那條救援）", () => {
    cover(TAG);
    // ════════════════════════════════════════════════════════════════════
    // 這一條為什麼必須存在（複驗實測，2026-08-01）
    // ════════════════════════════════════════════════════════════════════
    // 上面那一條把盾主放在 8 單位外 —— 近戰索敵地板是 6，所以盾主**進不了候選
    // 集合**，唯一能讓他贏的是 `acquireTarget` 尾巴那條「半徑外救援」。也就是
    // 說：把 `sim/targeting.ts` 的 `beats()` 裡那一行 `forced` key 整個刪掉，
    // 這個檔案**五條測試全綠**（實測 EXIT=0）—— 嘲弄的比較器那一半在出貨文件
    // 這一側完全沒有守衛（失敗形態 ③ + ⑤）。
    //
    // 所以這一條把盾主放進半徑**之內**：`sawForced` 為真，救援那條路一個字都
    // 沒跑到，贏家由 `beats()` / `beatsForSwap()` 的 forced key 決定。
    //
    // 牌照樣是反著發的：誘餌貼在敵人臉上、血量見底、而且也在打他。
    const world = combatWorld();
    const decoy = fighter(world, 0, at(0.1), { hp: 60 });
    const foe = fighter(world, 1, at(1.5));
    const holder = fighter(world, 0, at(4)); // 近戰索敵地板 6 之**內**
    world.rebuildGrid();
    grantItemFree(world, holder, SHIELD);

    // 對照組：第一拍還沒到，他握著的是誘餌 —— 這證明比較器本來偏向誘餌。
    world.step(NO_INTENTS);
    expect(world.nav.get(foe)!.attackTarget).toBe(decoy);
    expect(V.dist(world.transform.get(foe)!.pos, world.transform.get(holder)!.pos)).toBeLessThan(6);

    let pulledAt = -1;
    for (let i = 0; i < 120; i++) {
      world.step(NO_INTENTS);
      if (world.nav.get(foe)!.attackTarget === holder) {
        pulledAt = i;
        break;
      }
    }
    expect(pulledAt, "盾主就在索敵半徑之內，敵人卻整整 4 秒都沒有被拉過去").toBeGreaterThanOrEqual(0);
    expect(world.health.get(decoy)!.alive).toBe(true);
  });
});

describe("[煉金術] HP 低於 5% 的敵人變成黃金", () => {
  /** 每一 tick 收一次 `goldGrant`（`world.events` 每 tick 開頭會被清空）。 */
  function run(world: SimWorld, ticks: number): { target: EntityId; amount: number }[] {
    const paid: { target: EntityId; amount: number }[] = [];
    for (let i = 0; i < ticks; i++) {
      world.step(NO_INTENTS);
      for (const e of world.events) {
        if (e.type === "goldGrant" && typeof e.data.origin === "string" && e.data.origin.startsWith(`hook:item:${SHIELD}`)) {
          paid.push({ target: e.data.target as EntityId, amount: e.data.amount as number });
        }
      }
    }
    return paid;
  }

  it("低於 5% 的攻擊者被直接轉化，盾主拿到等於對方等級的金幣", () => {
    cover(TAG);
    const world = combatWorld(3);
    const holder = fighter(world, 0, at(0));
    // 攻擊者 7 級、最大生命 100,000、現在 4,000 血（4%，在門檻底下）。
    // 用大數字是為了讓盾主自己的普攻（3 點）在整段測試裡都不足以把他打死或
    // 打到門檻上下抖動 —— 這條測的是**轉化**，不是誰先砍死誰。
    const attacker = fighter(world, 1, at(1.2), { maxHp: 100_000, hp: 4_000, level: 7 });
    world.rebuildGrid();
    grantItemFree(world, holder, SHIELD);

    const paid = run(world, 900);
    expect(paid.length, "30 秒之內出貨的 10% 轉化一次都沒有觸發").toBeGreaterThan(0);
    // 「敵方單位直接死亡」：0.35 × 100,000 的真實傷害打在 4,000 血上。
    expect(world.health.get(attacker)!.alive).toBe(false);
    // 「黃金數量為敵方等級」—— 7 級 = 7 金。
    //
    // ⚠️ 讀的是**事件**不是 `champ.gold` 的差額，而且這不是偷懶:那個差額還包含
    // #90 的擊殺賞金（實測 250），把兩筆加起來斷言等於某個常數，會在賞金被調整
    // 的那一天變成一條沒有人看得懂為什麼紅的測試。
    expect(paid[0]!.target).toBe(holder);
    expect(paid[0]!.amount).toBe(7);
  });

  it("轉化一隻**殭屍**也付得出錢 —— 波次等級，不是 0", () => {
    cover(TAG);
    // ════════════════════════════════════════════════════════════════════
    // 第三守則：`effects/grantGold.ts` 的檔頭曾寫「reading `rules.mob.level`
    // here would mean this file needs the round's rules, which the effect
    // context does not carry」。那句話是假的 —— `EffectContext.world` 就是
    // `SimWorld`，而 `SimWorld.mobRules`（帶著 `level`）從 #215 起就掛在上面。
    // 相信那句註解的代價是失敗形態 ②：「黃金數量為敵方等級」對場上**每一隻
    // 殭屍**都付 0，而卡片寫著另一回事、轉化的傷害照樣結算。
    // ════════════════════════════════════════════════════════════════════
    const world = combatWorld(3);
    // 第 5 場武裝波次 → mobRules.level 是 #217 的曲線算出來的那個數字。
    beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 5), [0]);
    const waveLevel = world.mobRules!.level;
    expect(waveLevel).toBeGreaterThan(0);

    const holder = fighter(world, 0, at(0));
    // 殭屍：MONSTER 隊、有 MobComp、**沒有** ChampionComp —— 也就是舊實作
    // 的 `levelOfTarget` 回 0 的那一種身體。4% 血，在 5% 門檻底下。
    const zombie = mobBody(world, at(1.2), { maxHp: 100_000, hp: 4_000 });
    world.rebuildGrid();
    grantItemFree(world, holder, SHIELD);

    const paid = run(world, 900);
    expect(paid.length, "30 秒之內出貨的 10% 轉化一次都沒有觸發").toBeGreaterThan(0);
    // ⚠️ 死掉的殭屍會被 MobSystem 回收掉整個 entity，所以這裡不能寫
    // `health.get(id)!.alive` —— 那一行會在**成功**的情況下丟 undefined。
    expect(world.health.get(zombie)?.alive ?? false, "殭屍沒有被轉化掉").toBe(false);
    expect(paid[0]!.target).toBe(holder);
    // ⭐ 這一行就是修好的那個缺陷：0 是舊行為，波次等級才是卡片承諾的東西。
    expect(paid[0]!.amount).toBe(waveLevel);
  });

  it("血量在門檻**之上**的攻擊者一次都不會被轉化（condition 真的在擋）", () => {
    cover(TAG);
    const world = combatWorld(3);
    const holder = fighter(world, 0, at(0));
    // 同樣的 100,000 最大生命，但 30,000 血（30%）—— 遠在 5% 之上。
    const attacker = fighter(world, 1, at(1.2), { maxHp: 100_000, hp: 30_000, level: 7 });
    world.rebuildGrid();
    grantItemFree(world, holder, SHIELD);

    expect(run(world, 900)).toHaveLength(0);
    expect(world.health.get(attacker)!.alive).toBe(true);
  });

  /* ══════════════════════════════════════════════════════════════════════
   * 發放倍率：這一筆錢算在哪一格 —— **由屍體是誰決定**，不是由卡片決定
   * ══════════════════════════════════════════════════════════════════════
   * `effects/grantGold.ts` 的
   *
   *   victim !== undefined && world.champion.has(victim) ? "hero" : "mob"
   *
   * 是一個三元式，而三元式有**兩個方向**。複驗實測（2026-08-04）：把它塌成常數
   * `"hero"` 或常數 `"mob"`，**兩邊都是 9,058 條全綠** —— 這條線在出貨那一天
   * 完全沒有守衛（失敗形態 ③）。
   *
   * 為什麼這件事會被玩家看到：鍊金術之盾在傳說寶玉池裡，它的 passive[1] 掛
   * `onDamageTaken`，而攻擊盾主的可能是**英雄**也可能是**殭屍** —— 實戰兩個
   * 分支都會走到。接錯格子的症狀是「我把打殭屍調成 0.1，轉化殭屍還是給滿額」，
   * 或者反過來「我沒動英雄那格，殺人卻只拿到一折」。
   *
   * ⚠️ 兩條測試都刻意各自關掉**兩個**格子：「關掉自己那格 → 歸零」單獨一條
   * 只能抓到一個方向（塌成另一個常數時它照樣紅或照樣綠），要「關掉別人那格 →
   * 原封不動」補上另一半，才蓋得住兩個方向。
   *
   * ⚠️ 一個字面金額都沒有：`neutral` 跑同一個情境當對照組，倍率 0 的期望值是
   * 0（那是「不發」的定義，不是一個出貨數值）。
   */
  describe("發放倍率：轉化英雄走「擊敗英雄」那格，轉化殭屍走「打一般殭屍」那格", () => {
    /** 轉化一個**英雄**：回傳事件上的金額與盾主錢包裡真的有的錢。 */
    function transmuteChampion(m: CombatEnvMultipliers): { amount: number; wallet: number } {
      const world = combatWorld(3);
      world.combatEnv = m;
      const holder = fighter(world, 0, at(0));
      const attacker = fighter(world, 1, at(1.2), { maxHp: 100_000, hp: 4_000, level: 7 });
      world.rebuildGrid();
      grantItemFree(world, holder, SHIELD);
      const paid = run(world, 900);
      expect(paid.length, "30 秒之內轉化一次都沒有觸發 —— 這條守衛失去主體").toBeGreaterThan(0);
      expect(world.health.get(attacker)!.alive, "被轉化的英雄還活著").toBe(false);
      // 錢包從 0 起跳（`fighter` 建的），所以餘額就是差額。
      return { amount: paid[0]!.amount, wallet: world.champion.get(holder)!.gold };
    }

    /** 轉化一隻**殭屍**：同上。SILENT_WAVES 的 `reward.gold` 是 0，所以錢包裡
     *  只會有轉化這一筆 —— 補刀獎勵不會混進來。 */
    function transmuteZombie(m: CombatEnvMultipliers): { amount: number; wallet: number } {
      const world = combatWorld(3);
      world.combatEnv = m;
      beginCombatMobs(world, mobRulesFromConfig(SILENT_WAVES, world.dt, 5), [0]);
      const holder = fighter(world, 0, at(0));
      const zombie = mobBody(world, at(1.2), { maxHp: 100_000, hp: 4_000 });
      world.rebuildGrid();
      grantItemFree(world, holder, SHIELD);
      const paid = run(world, 900);
      expect(paid.length, "30 秒之內轉化一次都沒有觸發 —— 這條守衛失去主體").toBeGreaterThan(0);
      expect(world.health.get(zombie)?.alive ?? false, "殭屍沒有被轉化掉").toBe(false);
      return { amount: paid[0]!.amount, wallet: world.champion.get(holder)!.gold };
    }

    it("★ 轉化**英雄**：關掉擊敗英雄那格 → 一毛都沒有；關掉打殭屍那格 → 原封不動", () => {
      cover(TAG);
      const neutral = transmuteChampion(COMBAT_ENV_DEFAULTS);
      expect(neutral.amount, "中性表下就沒發錢 —— 下面兩條會變成在比較 0 和 0").toBeGreaterThan(0);

      const heroOff = transmuteChampion(normalizeCombatEnv({ goldHeroKill: 0 }));
      expect(
        heroOff.wallet,
        "把「擊敗英雄發放倍率」關到 0，轉化英雄還是進了錢 —— 這筆錢沒走英雄那格",
      ).toBe(0);
      // 事件上的數字＝**實付**。這一行同時是「+N 金」浮動字的守衛：報請求值的
      // 話畫面會寫 +7 而錢包一毛沒動（失敗形態 ②）。
      expect(heroOff.amount, "面板/浮動字報的是請求值，不是真的進袋的錢").toBe(0);

      const mobOff = transmuteChampion(normalizeCombatEnv({ goldMobKill: 0 }));
      expect(
        mobOff.amount,
        "轉化英雄卻讀到了「打一般殭屍」那格 —— 三元式塌成常數的典型症狀",
      ).toBe(neutral.amount);
    });

    it("★ 轉化**殭屍**：關掉打殭屍那格 → 一毛都沒有；關掉擊敗英雄那格 → 原封不動", () => {
      cover(TAG);
      const neutral = transmuteZombie(COMBAT_ENV_DEFAULTS);
      expect(neutral.amount, "中性表下就沒發錢 —— 下面兩條會變成在比較 0 和 0").toBeGreaterThan(0);

      const mobOff = transmuteZombie(normalizeCombatEnv({ goldMobKill: 0 }));
      expect(
        mobOff.wallet,
        "把「打一般殭屍發放倍率」關到 0，轉化殭屍還是進了錢 —— 這筆錢沒走殭屍那格",
      ).toBe(0);
      expect(mobOff.amount, "面板/浮動字報的是請求值，不是真的進袋的錢").toBe(0);

      const heroOff = transmuteZombie(normalizeCombatEnv({ goldHeroKill: 0 }));
      expect(
        heroOff.amount,
        "轉化殭屍卻讀到了「擊敗英雄」那格 —— 三元式塌成常數的另一個方向",
      ).toBe(neutral.amount);
    });
  });
});

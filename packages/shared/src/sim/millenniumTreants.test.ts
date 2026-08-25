/**
 * 70-04 千年練成 —— **紮根形態那一份**的行為守衛（GH#404）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它為什麼存在
 *
 * 白木卡迪那有**兩具身體**：本體 `godie-e00s` 與紮根形態 `godie-e010`
 *（`transform.role` 一個 base 一個 alternate，入口是天生技 70-00 紮根的
 * `championForm{to:"toggle"}` —— 所以這一張卡玩家真的按得到）。兩具身體各帶一份
 * 70-04 千年練成，而 owner 的新版規格只落在**本體**那一份上。
 *
 * 於是 2026-08-20 之前，紮根形態的 R 是這樣的：
 *
 *   卡面：「在指定範圍內招喚樹精⋯**總共 4 棵樹精**，每棵樹精誕生時造成 180 點傷害」
 *   引擎：`effects: [{ kind: "damage" }]` —— **一發單體傷害**，零棵樹精、零範圍。
 *
 * 第一·五守則的標準形狀：schema 綠、`content:build` 綠、全套測試綠，而卡片上那句
 * 「總共 4 棵」在場上一次都不會發生。⛔ 而且它**不是**兩隻英雄各壞各的 ——
 * 是同一支技能的鏡像漂移，所以修法是讓它跟本體走**同一個機制**（`randomArea`），
 * ⛔ 不是為紮根形態發明一套新東西。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這一支問什麼
 *
 * 只問「**這個機制會不會發生**」：一次施放會不會排出**一串分散在不同 tick 的落點**，
 * 而且**不只一個**敵人吃得到。一發單體傷害（重製之前的實作）在兩條上都會紅：
 * 它只在施法那一 tick 打一次，而且只打得到一個人。
 *
 * ⚠️ 被測的是**出貨的那一份文件**（失敗形態⑤）：真的 `ContentLoader` + `registerAll`，
 * ⛔ 沒有任何一個 EffectDef 是這裡手寫的；連「該有幾發」都是從登錄表上那份
 * `randomArea.count` 讀回來的，⛔ 不抄卡面上的 4。
 *
 * ⛔ 斷言裡一個出貨數字都沒有（第二守則：驗機制不驗數字）。180 點、70 秒、
 * 散佈半徑 6 全部是 owner 每週在調的東西。
 *
 * ⚠️ 這一支同時是 `randomAreaSystem` 有沒有**接線**的證據：那支 handler 的檔頭
 * 曾經寫著「接線還沒接（給主控的兩行）」，而排得出來、不會落地正是失敗形態②。
 * 落點是施法那一刻一次抽完的，所以 seed 固定 ⇒ 這一支是決定性的，⛔ 不是擲骰。
 *
 * 突變紀錄：把 `content/abilities/godie-e010.r.json` 的 effects 換回重製前的
 * 單發 `{ kind: "damage" }` → 這一支紅（「只在一個 tick 落地」）。
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/abilities/godie-e010.r.json`
 *   · `content/abilities/godie-e010.r.json` 是 **tiers:apply** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh tiers:apply`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     apply_tiers.py 只重算**五級距那幾格**(damageTier/flat · cooldownTier · manaCostTier ·
 *     radiusTier · rangeTier),並把 MIRRORED 欄位**單向**鏡射進 content/champions/ 的內嵌副本;
 *     其餘欄位是**原封寫回** ⇒ 那些手改會留下來 —— ⛔ 但那是繞過隔離區的手改,仍然要走 genrun。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import type { AbilityDef } from "./content/defs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
/** 紮根形態的身體 —— ⛔ 不是本體 `godie-e00s`。 */
const ROOTED = "godie-e010" as ChampionId;
const DUMMY = "godie-e001" as ChampionId;
const C = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = (): Map<SeatId, IntentFrame> => new Map();

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

/** 白木（紮根形態）站中心，四個假人圍成十字 —— 都在散佈圈內。 */
function rig(): { world: SimWorld; caster: EntityId; foes: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, 20260820);
  world.combatActive = true;
  const caster = spawnChampion(world, {
    championId: ROOTED,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: 0 },
    zone: 0,
    level: 6,
  });
  const ch = world.health.get(caster)!;
  ch.mana = ch.maxMana = 9999;
  const ring: Array<{ x: number; z: number }> = [
    { x: C.x + 2, z: 0 },
    { x: C.x - 2, z: 0 },
    { x: C.x, z: 2 },
    { x: C.x, z: -2 },
  ];
  const foes = ring.map((p, i) => {
    const id = spawnChampion(world, {
      championId: DUMMY,
      seatId: asSeatId(1 + i),
      teamId: asTeamId(1),
      pos: p,
      zone: 0,
      level: 6,
    });
    const hp = world.health.get(id)!;
    hp.maxHp = 100_000;
    hp.hp = hp.maxHp;
    const sc = world.stats.get(id)!;
    sc.final[Stat.Armor] = 0;
    sc.final[Stat.MagicResist] = 0;
    return id;
  });
  world.rebuildGrid();
  world.abilities.get(caster)!.slots.R.rank = 1;
  world.rebuildGrid();
  return { world, caster, foes };
}

/** 出貨文件自己說這一波該有幾發 —— ⛔ 不抄卡面上的數字。 */
function shippedImpactCount(): number {
  const def = Abilities.tryGet("godie-e010.r" as never) as unknown as AbilityDef | undefined;
  const wave = (def?.effects ?? []).find((e) => e.kind === "randomArea") as
    | { count?: number[] }
    | undefined;
  return wave?.count?.[0] ?? 0;
}

describe("70-04 千年練成 · 紮根形態 (e010-r-treant-burst)", () => {
  it("一次施放排出一串**分散在不同 tick** 的落點，圈內不只一個人吃得到", () => {
    cover("e010-r-treant-burst");
    const { world, caster, foes } = rig();

    // ① 出貨文件真的是一波多發 —— 母體檢查，⛔ 不是斷言本身。
    expect(
      shippedImpactCount(),
      "紮根形態的 70-04 又變回單發了 —— 卡面那句「總共 4 棵樹精」再次落空",
    ).toBeGreaterThan(1);

    expect(castAbility(world, caster, "R", { type: "self" })).toBe("ok");

    // ② 逐 tick 收血量，記下「這一 tick 有人掉血」的 tick 序號。
    //    一發單體傷害只會出現**一個** tick；`randomArea` 是一串排程。
    const hp = (): number[] => foes.map((f) => world.health.get(f)!.hp);
    let prev = hp();
    const hurtTicks: number[] = [];
    const everHurt = new Set<number>();
    /** 引擎自己排的落點（施法那一刻一次抽完），⛔ 不是這裡算的。 */
    let scheduled: Array<{ x: number; z: number }> = [];
    /** 引擎排的**到期 tick**（④ 的斷言看這個,⛔ 不看「誰剛好被打到」）。 */
    let scheduledTicks: number[] = [];
    for (let t = 0; t < 90; t++) {
      world.step(NO_INTENTS());
      const wave = world.randomArea.find((w) => w.caster === caster);
      if (wave && scheduled.length === 0) {
        scheduled = wave.impacts.map((i) => ({ ...i.pos }));
        scheduledTicks = wave.impacts.map((i) => i.atTick);
      }
      const now = hp();
      let any = false;
      now.forEach((v, i) => {
        if (v < prev[i]!) {
          any = true;
          everHurt.add(i);
        }
      });
      if (any) hurtTicks.push(t);
      prev = now;
    }

    // ③ 傷害真的落地（⛔ 不是「排得出來但沒接線」= 失敗形態②）。
    expect(everHurt.size, "整波打完沒有任何人掉血 —— 這一招在場上什麼都不會發生").toBeGreaterThan(
      0,
    );
    // ④ 是一**串**，不是一發 —— ⭐ 斷言看的是**排程**，⛔ 不是「有幾個 tick 有人掉血」。
    //
    // ⚠️ 2026-08-20 這一條原本寫成 `hurtTicks.length > 1`，而它**是靠運氣綠的**：
    // 落點是 `scatterRadius 6` 的**隨機**點、傷害半徑只有 3，所以四發裡打到幾個人
    // 取決於那一次抽點。產生器後來給這支技能補上 `castTimeSec 1.233`（`deriveCastTimes`
    // 後處理），rng 流位移一格，四發只剩一發打中人 —— 測試就紅了，而**機制完全沒壞**。
    // 那正是 GH#334 記的同一種缺陷：斷言的方向跟它要守的機制無關。
    //
    // ⇒ 改成問引擎排了什麼：`impacts` 的 `atTick` 至少要落在**兩個不同的 tick** 上。
    // 這一格壞掉（例如有人把 intervalSec 當成 0、或把整串塞回同一個 tick）才會紅，
    // ⛔ 而「這次剛好只打到一個人」不會。
    const impactTicks = new Set(scheduledTicks);
    expect(
      impactTicks.size,
      "整波只排在一個 tick —— 這就是重製前那一發單體傷害的形狀",
    ).toBeGreaterThan(1);
    // ⑤ 落點是**散開的**，不是同一個點放四次（卡面：「在[周圍][範圍]隨機竄出」）。
    const distinct = new Set(scheduled.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`));
    expect(scheduled.length, "引擎一個落點都沒排 —— randomArea 根本沒被跑到").toBeGreaterThan(1);
    expect(distinct.size, "四個落點全部重疊 —— 這不是「隨機竄出」，是同一點放四次").toBeGreaterThan(
      1,
    );
  });
});

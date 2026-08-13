/**
 * 20-01 風王結界 的法球 · 08-002 龍魔人 · 11-002 武裝色霸氣 —— 行為守衛。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這一組量的是**出貨路徑**，不是效果物件長什麼樣子
 *
 * 每一條都跑真的 `SimWorld.step()`：真的 `spawnChampion`、真的 `castAbility`、
 * 真的 `basicAttackSystem` 自動選取＋揮劍（#221）、真的 `combatResolveSystem`
 * 排乾傷害佇列。斷言讀的是 `world.health.get(x).hp` / `.mana` 與
 * `world.stats.get(x).final[...]` —— 也就是 snapshot 每 tick 送上線、玩家血條
 * 與屬性面板讀的那一份（#125）。
 *
 * ⚠️ 沒有一條斷言是「effects 陣列裡有一個 kind === 'spendMana'」。那是屬性掃描
 * （CLAUDE.md 失敗形態 ⑦），把 `spendMana` 的 handler 整個換成空函式它照樣綠。
 *
 * ⚠️ 也沒有一條是 `it.each(從磁碟掃出來的清單)` + `toBeGreaterThan(0)`：那種守衛
 * 「刪內容 = 刪測試」。這裡三支英雄的 id 是**寫死的常數**，文件不見就直接紅。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼「法球傷害」用**比值**而不是絕對值來釘公式
 *
 * 法球是魔法傷害，所以落地的數字已經被受害者的魔抗、`combatEnv.damageDealt`
 * 乘過。要在測試裡寫出絕對值，就得把 `mitigate()` 在測試裡再實作一次 —— 那條
 * 斷言會跟著實作一起錯（失敗形態 ④）。
 *
 * 減傷對「同一個受害者、同一種傷害型別」是一個**常數乘數**，所以改變施法者的
 * 攻擊力、量兩次法球傷害的比值，就能在完全不知道那個常數的情況下釘死
 * 「10 + 攻擊力×0.5」這條公式的兩個係數：
 *
 *     orb(ad + Δ) / orb(ad) === (10 + (ad + Δ)×0.5) / (10 + ad×0.5)
 *
 * 把 flat 從 10 改成別的數，或把 coeff 從 0.5 改成別的數，這個比值就對不上。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility, learnEx } from "./abilities/abilitySystem";
import { Abilities, Champions } from "./content/registry";
import { TICK_HZ } from "../constants";
import { syncAbilityPassives } from "./abilities/abilityPassives";
import { attachSource } from "./stats/statPipeline";
import { championFormIndex } from "./systems/ChampionFormSystem";
import { ModOp } from "./stats/modifiers";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ZC = SKELETON_ARENA.zones[0]!.center;

/** 亞瑟王 - Saber #20. `E002` ⇄ `E00L`, toggle `A0DZ` on the W slot. */
const SABER = "godie-e002" as ChampionId;
const SABER_WIND = "godie-e00l" as ChampionId;
/** `fireHooks` 用 `hook:${src.id}` 當 origin，而 src.id 是 abilityPassiveSourceId。 */
const ORB_ORIGIN = "hook:abilityPassive:godie-e002.w";
/** 法球的兩個係數 —— 描述上印的就是這兩個數字。 */
const ORB_FLAT = 10;
const ORB_AD_COEFF = 0.5;
const ORB_MANA_COST = 30;

/** 傳說的龍騎士 - 勇者小呆 #08. `NBBC` → `N01C`, EX `A0T1`, 20 秒。 */
const DOZY = "godie-nbbc" as ChampionId;
const DRAGONOID = "godie-n01c" as ChampionId;
/**
 * ⛔【已刪除】`EX_FORM_WINDUP_TICKS = 11` —— 一個**抄下來的前搖**，而它在
 * 2026-08-13 讓兩條守衛用**錯誤的訊息**紅。
 *
 * 它原本的註解自己寫著「前搖改了這裡就要跟著改 —— 而那正是我們希望有人被迫看一眼
 * 的時刻」。⚠️ 那是一條**判準**，而判準擋不住：owner 當天把吟唱規則改成
 * 「所有技能 0.06~4.00 秒」，前搖 11 → 31，沒有任何人被迫看一眼，
 * 兩條斷言直接說「龍魔人必須整整持有 20 秒 …… 改短 durationSec 這裡就紅」——
 * 而 durationSec 一個字都沒動。
 *
 * ⭐ 取代它的是**量出來的閉區間** `[firstInForm, lastInForm]`（見下面兩條斷言）：
 * 從形態真的上身那一 tick 算起，所以這份檔案**再也不需要知道前搖是多少**。
 * owner 2026-08-13：「吟唱不代表施展成功，而且被攻擊會被打斷吟唱，
 * 所以不能算變身時間。」—— 引擎本來就是這樣做的（實測：按下 tick 2 →
 * 形態 tick 33 上身 → tick 633 退場 = 整整 600 tick），壞的一直是這個常數。
 */

const DRAGON_SEC = 20;
/** 三刀流劍士 - 索隆 #11. `UDRE` → `U01U`, EX `A10N`, 15 秒。 */
const ZORO = "godie-udre" as ChampionId;
const ZORO_HAKI = "godie-u01u" as ChampionId;
const HAKI_SEC = 15;

/** 讀磁碟上的 JSON，不經 `_index.json` —— 這樣不依賴 `pnpm content:build`。 */
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
  const store = new ContentStore();
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
  ] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

function newWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 20260731);
  w.combatActive = true;
  return w;
}

function spawn(
  w: SimWorld,
  championId: ChampionId,
  seat: number,
  team: number,
  dx: number,
): EntityId {
  return spawnChampion(w, {
    championId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: ZC.x + dx, z: ZC.z },
    zone: 0,
  });
}

/**
 * Top both bodies back up to full at the top of every tick.
 *
 * ⚠️ NOT `hp.maxHp = 1e9`: `recomputeStats` rewrites `maxHp`/`hp` from the stat
 * table the next time the entity is dirty (a buff, a transform, a level), so a
 * one-shot immortality silently evaporates exactly where these tests need it —
 * and the punching bag then dies mid-run and the swings stop. Re-filling every
 * tick touches only `hp.hp`, which nothing recomputes.
 */
function keepAlive(w: SimWorld, ids: readonly EntityId[]): void {
  for (const id of ids) {
    const hp = w.health.get(id);
    if (hp) hp.hp = hp.maxHp;
  }
}

/** 把等級與法力推高到足以施放 EX（390 法力）。等級不是這組測試要驗的東西。 */
function levelUpAndFillMana(w: SimWorld, id: EntityId, level: number): void {
  w.champion.get(id)!.level = level;
  w.stats.get(id)!.dirty = true;
  w.step(NO_INTENTS);
  const hp = w.health.get(id)!;
  hp.mana = hp.maxMana;
}

interface Run {
  /** 這一輪 `attacker` 揮了幾刀（`basicAttack` 事件） */
  swings: number;
  /** 這一輪法球實際扣血的次數（`origin` 是法球那條 hook 的 `damage` 事件） */
  orbHits: number;
  /** 每一次法球實際扣掉的血 */
  orbAmounts: number[];
  /** 這一輪**打中**的普攻次數（`origin === "basic"` 的 `damage` 事件） */
  basicHits: number;
  /** 這一輪普攻本身實際扣掉的血總和 */
  otherDamage: number;
  /** 每一個「有揮刀」的 tick 上，attacker 法力的變化量（含自然回魔） */
  manaDeltaOnSwingTicks: number[];
  /** 每一個「法球有觸發」的 tick 上，attacker 法力的變化量（含自然回魔） */
  manaDeltaOnOrbTicks: number[];
}

/**
 * 跑 `ticks` 個 tick，把 `attacker` 的揮刀數、法球命中數與揮刀那一 tick 的法力
 * 變化收起來。
 *
 * ⚠️ 刻意**不做**「這一發傷害屬於哪一刀」的配對。傷害封包由
 * `combatResolveSystem` 排乾，落地的 tick 不保證等於揮刀的 tick，一旦配對錯了
 * 斷言就會變成在量測試自己的簿記邏輯（失敗形態 ④）。「每一刀都附加法球」用
 * `orbHits === swings` 表達就夠精確，而且完全不依賴排程順序。
 *
 * 法力則必須看 tick：`spendMana` 是 `fireHooks` 在 `BasicAttackSystem` 裡同步
 * 執行的，就在 `basicAttack` 事件的同一 tick。
 */
function runSwings(
  w: SimWorld,
  attacker: EntityId,
  alive: readonly EntityId[],
  ticks: number,
  beforeStep?: (w: SimWorld) => void,
): Run {
  const out: Run = {
    swings: 0,
    orbHits: 0,
    orbAmounts: [],
    basicHits: 0,
    otherDamage: 0,
    manaDeltaOnSwingTicks: [],
    manaDeltaOnOrbTicks: [],
  };
  for (let i = 0; i < ticks; i++) {
    keepAlive(w, alive);
    if (beforeStep) beforeStep(w);
    const manaBefore = w.health.get(attacker)!.mana;
    w.step(NO_INTENTS);
    const manaAfter = w.health.get(attacker)!.mana;
    let swung = false;
    let orbThisTick = 0;
    // ⚠️ 事件的欄位在 `e.data` 底下，不是攤平在 `e` 上（`{type, tick, data}`）。
    // 讀成 `e.source` 永遠是 undefined —— 一個「條件永遠不成立」的假綠燈。
    for (const e of w.events) {
      if (e.type === "basicAttack") {
        const d = (e as unknown as { data: { source: EntityId } }).data;
        if (d.source === attacker) swung = true;
        continue;
      }
      if (e.type !== "damage") continue;
      const d = (e as unknown as { data: { source: EntityId; amount: number; origin?: string } })
        .data;
      if (d.source !== attacker) continue;
      if (d.origin === ORB_ORIGIN) {
        out.orbHits++;
        orbThisTick++;
        out.orbAmounts.push(d.amount);
      } else {
        if (d.origin === "basic") out.basicHits++;
        out.otherDamage += d.amount;
      }
    }
    if (swung) {
      out.swings++;
      out.manaDeltaOnSwingTicks.push(manaAfter - manaBefore);
    }
    if (orbThisTick > 0) out.manaDeltaOnOrbTicks.push(manaAfter - manaBefore);
  }
  return out;
}

/** 學會 W（rank 1）並跑一次出貨的 passive 同步。 */
function learnW(w: SimWorld, id: EntityId): void {
  w.abilities.get(id)!.slots.W.rank = 1;
  syncAbilityPassives(w, id);
}

/**
 * 按下 W，等到**結界真的開起來**（形態換過去）為止。
 *
 * ⛔ 這裡以前是 `for (let i = 0; i < 20; i++)`，註解寫「讓 0.3 秒的前搖跑完」——
 *    那個 20 是 2026-07-31 抄下來的。owner 2026-08-13 把吟唱改成 0.06~4.00 秒
 *    之後那個常數會再壞一次，而且用錯誤的訊息紅（「法球沒扣到血」看起來像
 *    法球壞了，其實是結界還沒開）。
 * ⭐ 改成**盯著要等的那件事**：形態一換過去就停手。
 */
function pressW(w: SimWorld, id: EntityId): void {
  // ⚠️ 等的是「形態**變了**」，⛔ 不是「形態 !== 0」—— 這支是切換技，
  //    第二次按下是**關閉**（形態換回 0），寫成 `!== 0` 會在關閉那一次等到天荒地老。
  const before = championFormIndex(w, id);
  expect(castAbility(w, id, "W", { type: "self" }), "W 按得下去").toBe("ok");
  for (let i = 0; i < 90; i++) {
    if (championFormIndex(w, id) !== before) return;
    w.step(NO_INTENTS);
  }
  expect.fail(`按了 W 但形態一直沒換（90 tick 內停在 ${before}）`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ① 20-01 風王結界 —— 法球（開關型 on-attack）
// ═══════════════════════════════════════════════════════════════════════════
describe("20-01 風王結界 —— 法球只在結界開著的時候刮風 (#249)", () => {
  function saberVsDummy(): { w: SimWorld; saber: EntityId; dummy: EntityId } {
    const w = newWorld();
    const saber = spawn(w, SABER, 0, 0, -0.6);
    const dummy = spawn(w, SABER, 1, 1, 0.6);
    w.step(NO_INTENTS);
    // 拔掉沙包身上所有會「吃掉一發法球」的來源。沙包也是 Saber，所以它自己身上有
    // 20-00 銀色甲胄 —— 那個減免會把一發法球整個吃掉，讓「這一發扣了多少血」變成 0，
    // 公式比值就會變成 0/0。
    // 這是把量測噪音拿掉，不是把被測的東西拿掉：法球掛在 SABER 身上，一條都沒動。
    //
    // ⛔ 這裡以前只濾 `hooks`，而那在 2026-08-13 之後就漏掉了銀色甲胄：
    //    重製稿把它從「受擊時 hook 給護盾」改成 **`passive.ranks[].block`**
    //    （30% 機率格擋 100% 魔法傷害）——**一格授權，不是 hook**，
    //    所以舊的濾網看不到它，30% 的法球被格掉、`every(a => a > 0)` 當場 false。
    //    ⚠️ 症狀長得像「法球壞了」，其實是**沙包變強了**（GH#311 第 2 類）。
    const dsc = w.stats.get(dummy)!;
    dsc.sources = dsc.sources.filter((src) => !src.hooks?.length && src.block === undefined);
    dsc.dirty = true;
    learnW(w, saber);
    return { w, saber, dummy };
  }

  it("結界沒開的時候，普攻就只是普攻 —— 一滴法力都不扣", () => {
    cover("wind-orb-off");
    const { w, saber, dummy } = saberVsDummy();
    const hp = w.health.get(saber)!;
    hp.mana = hp.maxMana * 0.5;
    const run = runSwings(w, saber, [saber, dummy], 300);

    expect(run.swings, "300 tick 內至少揮了兩刀").toBeGreaterThanOrEqual(2);
    expect(run.otherDamage, "普攻本身有打到人（否則後面的比較沒有意義）").toBeGreaterThan(0);
    expect(run.orbHits, "本體形態下法球一次都不該出現").toBe(0);
    // 法力只會回、不會掉：本體形態下沒有任何一次扣 30。
    expect(
      run.manaDeltaOnSwingTicks.every((d) => d >= 0),
      "沒開結界就不該扣魔",
    ).toBe(true);
  });

  it("開啟後每一刀都附加法球，而且每一刀正好扣 30 法力", () => {
    cover("wind-orb-on");
    const { w, saber, dummy } = saberVsDummy();
    const hp = w.health.get(saber)!;
    hp.mana = hp.maxMana * 0.9;

    pressW(w, saber);
    expect(championFormIndex(w, saber), "W 是切換型變身，按下去就換身體").toBe(1);
    expect(w.champion.get(saber)!.championId, "換成 E00L 這具身體").toBe(SABER_WIND);

    // 先量一 tick 的自然回魔（沒揮刀的那些 tick），當作扣魔量測的基準線。
    const quietBefore = hp.mana;
    w.step(NO_INTENTS);
    const regenPerTick = hp.mana - quietBefore;

    const run = runSwings(w, saber, [saber, dummy], 300);
    expect(run.swings, "至少兩刀，才看得出「每一刀」").toBeGreaterThanOrEqual(2);
    expect(run.basicHits, "普攻本身有打中（比較的分母）").toBeGreaterThanOrEqual(2);
    expect(run.orbHits, "每一次打中的普攻都附加一發法球 —— 不是偶爾，是每一次").toBe(
      run.basicHits,
    );
    expect(
      run.orbAmounts.every((a) => a > 0),
      "每一發法球都真的扣到血",
    ).toBe(true);
    for (const d of run.manaDeltaOnOrbTicks) {
      expect(regenPerTick - d, `那一刀正好花了 ${ORB_MANA_COST} 點法力`).toBeCloseTo(
        ORB_MANA_COST,
        6,
      );
    }
  });

  it("法力不足 30 時法球不觸發 —— 但普攻照樣打出去", () => {
    cover("wind-orb-dry");
    const { w, saber, dummy } = saberVsDummy();
    pressW(w, saber);
    expect(championFormIndex(w, saber)).toBe(1);

    // 每一 tick 開頭都把法力壓到 0：條件 `法力 >= 30` 永遠不成立。
    const run = runSwings(w, saber, [saber, dummy], 300, (world) => {
      world.health.get(saber)!.mana = 0;
    });

    expect(run.swings, "揮刀本身沒有被擋住").toBeGreaterThanOrEqual(2);
    expect(run.otherDamage, "沒錢買風，劍還是照樣砍下去").toBeGreaterThan(0);
    expect(run.orbHits, "法力不足就一次都不觸發").toBe(0);
  });

  it("法球傷害真的是 10 + 攻擊力×0.5（用比值釘死兩個係數）", () => {
    cover("wind-orb-formula");
    const BONUS_AD = 100;

    function firstOrb(extraAd: number): { orb: number; ad: number } {
      const { w, saber, dummy } = saberVsDummy();
      const hp = w.health.get(saber)!;
      hp.mana = hp.maxMana;
      if (extraAd > 0) {
        attachSource(w, saber, {
          id: "test:ad",
          kind: "buff",
          modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: extraAd }],
        });
      }
      pressW(w, saber);
      const ad = w.stats.get(saber)!.final[Stat.AttackDamage];
      const run = runSwings(w, saber, [saber, dummy], 300);
      expect(run.orbHits, `攻擊力 +${extraAd} 的那一輪有打出法球`).toBeGreaterThan(0);
      return { orb: run.orbAmounts[0]!, ad };
    }

    const lo = firstOrb(0);
    const hi = firstOrb(BONUS_AD);
    expect(hi.ad - lo.ad, "測試自己加的攻擊力有真的進到 final").toBeCloseTo(BONUS_AD, 6);

    const expected =
      (ORB_FLAT + hi.ad * ORB_AD_COEFF) / (ORB_FLAT + lo.ad * ORB_AD_COEFF);
    expect(hi.orb / lo.orb, "法球隨攻擊力成長的比值 = 公式的比值").toBeCloseTo(expected, 6);
  });

  it("再按一次 W 收工 —— 法球跟著結界一起消失", () => {
    cover("wind-orb-toggle-off");
    const { w, saber, dummy } = saberVsDummy();
    const hp = w.health.get(saber)!;
    hp.mana = hp.maxMana;

    pressW(w, saber);
    expect(championFormIndex(w, saber)).toBe(1);
    const on = runSwings(w, saber, [saber, dummy], 400);
    expect(on.orbHits, "開著的時候有法球").toBeGreaterThan(0);

    // W 的冷卻是 12 秒 = 360 tick；上面 400 tick 已經跑過了。
    pressW(w, saber);
    expect(championFormIndex(w, saber), "第二次按下去回到本體").toBe(0);
    expect(w.champion.get(saber)!.championId).toBe(SABER);

    hp.mana = hp.maxMana;
    const off = runSwings(w, saber, [saber, dummy], 300);
    expect(off.swings, "收工之後還是照樣揮刀").toBeGreaterThanOrEqual(2);
    expect(off.orbHits, "收工之後一次都不該再刮風").toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ②③ 變身 EX —— 防禦 / 魔抗 / 攻擊力真的動了，時間到真的變回去
// ═══════════════════════════════════════════════════════════════════════════
/**
 * 對照組：把「變身形態」當成一個獨立英雄直接生出來，量它**沒有加成**時的屬性。
 * 這樣「防禦 ×2」「攻擊力 ×1.5」就能寫成精確的等式，而不必在測試裡重跑一次
 * `championStatBase` + `finalizeStat`（那會變成把實作抄兩份）。
 */
function altFormSheet(championId: ChampionId, level: number): Record<string, number> {
  const w = newWorld();
  const id = spawn(w, championId, 0, 0, 0);
  w.champion.get(id)!.level = level;
  w.stats.get(id)!.dirty = true;
  w.step(NO_INTENTS);
  return { ...w.stats.get(id)!.final };
}

/**
 * ⚠️ 等待長度**從技能自己的吟唱秒數推**，⛔ 不是一個寫死的 30。
 *
 * 2026-08-13：owner 把吟唱規則改成「所有技能 0.06~4.00 秒」
 *（`config.cast-time@1`），08-002 龍魔人從 0.4 → **1.033 秒 = 31 tick**，
 * 而這裡等 30 tick ⇒ 變身在窗口關掉的**下一格**才發生，測試回報
 *「身體換成龍魔人: expected +0 to be 1」—— 技能是好的，**是等的人先走了**。
 * 同一天 `castabilitySweep.test.ts` 的 `WINDOW = 26` 用一模一樣的方式壞掉 120 格。
 *
 * ⛔ 不要把 30 改成 40 了事：下一次 owner 調吟唱倍率它會再壞一次，
 *    而且**用錯誤的訊息紅**（看起來像變身壞了）。
 */
function castExAndSettle(w: SimWorld, id: EntityId): void {
  expect(learnEx(w, id), "EX 解鎖").toBe(true);
  const exId = Champions.tryGet(w.champion.get(id)!.championId)?.exAbility;
  const sec = (exId ? Abilities.tryGet(exId)?.castTimeSec : undefined) ?? 0;
  expect(castAbility(w, id, "EX", { type: "self" }), "EX 按得下去").toBe("ok");
  // ⛔ **不可以固定跑滿**：下面兩條測試量的是「第一次到最後一次在形態上」的
  //    閉區間，而 `firstInForm` 是從**呼叫端的迴圈**裡記的 —— 這裡多跑一 tick，
  //    那個區間就短一 tick。所以一看到形態上身就**立刻停手**，把第一格留給呼叫端。
  const cap = Math.round(sec * TICK_HZ) + 31;
  for (let i = 0; i < cap; i++) {
    if (championFormIndex(w, id) !== 0) return;
    w.step(NO_INTENTS);
  }
}

describe("08-002 龍魔人 —— 全能力 +15 / 防禦 ×2 / 魔抗 50%，20 秒 (#249)", () => {
  const LEVEL = 12;

  it("變身後防禦正好是龍魔人本身防禦的兩倍，20 秒後全部退回小呆", () => {
    cover("dragonoid-ex");
    const w = newWorld();
    const dozy = spawn(w, DOZY, 0, 0, 0);
    w.step(NO_INTENTS);
    levelUpAndFillMana(w, dozy, LEVEL);

    const before = { ...w.stats.get(dozy)!.final };
    const preCastD = w.tick;
    castExAndSettle(w, dozy);

    expect(championFormIndex(w, dozy), "身體換成龍魔人").toBe(1);
    expect(w.champion.get(dozy)!.championId).toBe(DRAGONOID);

    const after = { ...w.stats.get(dozy)!.final };
    const alt = altFormSheet(DRAGONOID, LEVEL);

    // 防禦 ×2 —— 乘的是「龍魔人這具身體的防禦」，不是加一個常數。
    expect(after[Stat.Armor], "防禦 = 龍魔人身體防禦 ×2").toBeCloseTo(alt[Stat.Armor]! * 2, 6);
    expect(after[Stat.Armor]!, "而且比小呆本體高").toBeGreaterThan(before[Stat.Armor]!);

    // 魔抗 50%：來自變身後那份 baseStats.mr，不是 buff。
    expect(after[Stat.MagicResist], "魔抗照龍魔人那份").toBeCloseTo(alt[Stat.MagicResist]!, 6);
    expect(after[Stat.MagicResist]!).toBeGreaterThan(before[Stat.MagicResist]!);

    // 全能力 +15 的可觀測後果：三圍推動的四條屬性一起漲。
    for (const s of [Stat.MaxHealth, Stat.AttackDamage, Stat.MaxMana, Stat.AbilityPower]) {
      expect(after[s]!, `${s} 跟著三圍一起漲`).toBeGreaterThan(before[s]!);
    }

    // ⭐ 下界先驗：到期【前一刻】必須還在龍魔人身上。
    //
    // ⚠️ 2026-07-31：這一條是駁斥者量出來補的。原本只有下面那個上界（跑滿
    // 20 秒後已變回本體），而那個斷言對「文件寫 8 秒」也會過 —— 跑 20 秒之後
    // 8 秒的形態當然也退了。實測把 `durationSec` 20→8，**7/7 全綠**。
    // 標題掛著的「20 秒」是 owner 的規格，沒有下界就等於沒有人在守它。
    // ⚠️ 基準必須是「變身生效的那一 tick」,不是 0 —— `castExAndSettle` 已經
    // 跑掉了施法前搖與結算的若干 tick,從 0 起算會直接跨過到期點。
    const dragonTicks = Math.round(DRAGON_SEC / w.dt);
    // ⭐ 持有【總長】—— 駁斥者 2026-07-31 量出來補的。
    //
    // ⚠️ 原本只有下面那個上界（跑滿 20 秒後已變回本體），而那個斷言對
    // 「文件寫 8 秒」也會過 —— 跑 20 秒之後 8 秒的形態當然也退了。
    // 實測把 durationSec 20→8，7/7 全綠。標題掛著的 20 秒是 owner 的規格，
    // 沒有這一條就等於沒有人在守它。
    //
    // ⚠️ 基準點不可以取 castExAndSettle 之後的 w.tick：變身在 settle **內部**
    // 就生效（實測 tick 13 生效、tick 32 才 settle 完），從 32 起算會短算 19 tick。
    // 所以這裡量的是「第一次到最後一次在形態上」的閉區間長度。
    let firstInForm = -1;
    let lastInForm = -1;
    for (let i = 0; i < dragonTicks + 60; i++) {
      if (championFormIndex(w, dozy) === 1) {
        if (firstInForm < 0) firstInForm = w.tick;
        lastInForm = w.tick;
      }
      w.step(NO_INTENTS);
    }
    expect(firstInForm, "變身確實發生過").toBeGreaterThanOrEqual(0);
    // ⭐ owner 2026-08-13：「**吟唱不代表施展成功**，而且**被攻擊會被打斷吟唱**，
    //    所以**不能算變身時間**。」⇒ 時長要從**形態真的上身的那一 tick**量起。
    //
    // ⛔ 這一行以前是 `lastInForm - preCastD - EX_FORM_WINDUP_TICKS`，也就是
    //    「按下的 tick + 一個**寫死的前搖 11**」。那個 11 是 2026-07-31 吟唱 0.4 秒
    //    時抄下來的，而 owner 當天把吟唱改成 0.06~4.00 秒之後前搖變成 31 ——
    //    於是這一條用 **619 vs 600** 紅，訊息說「改短 durationSec 這裡就紅」，
    //    而 durationSec 一個字都沒動。**它指著錯的地方**。
    //    （實測：按下 tick 2 → 形態 tick 33 上身 → tick 633 退場 ⇒ 引擎給的是
    //      整整 600 tick，吟唱**本來就沒有**被算進去。壞的一直是這條斷言。）
    //
    // ⭐ 改成量閉區間 `[firstInForm, lastInForm]` 之後，這一條**再也不必知道前搖**
    //    —— 前搖、吟唱倍率、後台改設定都不會再讓它說謊，而「durationSec 改短就紅」
    //    這句話從此是真的。
    expect(
      lastInForm - firstInForm + 1,
      `龍魔人必須整整持有 ${DRAGON_SEC} 秒（${dragonTicks} tick）—— 改短 durationSec 這裡就紅`,
    ).toBe(dragonTicks);

    // 到期後：形態與 buff 同一個 tick 一起失效（上面的迴圈已經跑過頭了）。
    expect(championFormIndex(w, dozy), `${DRAGON_SEC} 秒後變回小呆`).toBe(0);
    const back = { ...w.stats.get(dozy)!.final };
    expect(back[Stat.Armor], "防禦倍率跟著形態一起走").toBeCloseTo(before[Stat.Armor]!, 6);
    expect(back[Stat.MagicResist]).toBeCloseTo(before[Stat.MagicResist]!, 6);
    expect(back[Stat.AttackDamage]).toBeCloseTo(before[Stat.AttackDamage]!, 6);
  });
});

describe("11-002 武裝色霸氣 —— 防禦 +15 / 魔抗 50% / AD ×1.5，15 秒 (#249)", () => {
  const LEVEL = 12;

  it("變身後攻擊力正好是霸氣形態攻擊力的 1.5 倍，15 秒後全部退回索隆", () => {
    cover("haki-ex");
    const w = newWorld();
    const zoro = spawn(w, ZORO, 0, 0, 0);
    w.step(NO_INTENTS);
    levelUpAndFillMana(w, zoro, LEVEL);

    const before = { ...w.stats.get(zoro)!.final };
    const preCastH = w.tick;
    castExAndSettle(w, zoro);

    expect(championFormIndex(w, zoro), "身體換成武裝色形態").toBe(1);
    expect(w.champion.get(zoro)!.championId).toBe(ZORO_HAKI);

    const after = { ...w.stats.get(zoro)!.final };
    const alt = altFormSheet(ZORO_HAKI, LEVEL);

    expect(after[Stat.AttackDamage], "攻擊力 = 霸氣形態攻擊力 ×1.5").toBeCloseTo(
      alt[Stat.AttackDamage]! * 1.5,
      6,
    );
    expect(after[Stat.AttackDamage]!, "而且比本體高").toBeGreaterThan(before[Stat.AttackDamage]!);

    expect(after[Stat.Armor], "防禦照霸氣形態那份（基礎 0 → 15）").toBeCloseTo(
      alt[Stat.Armor]!,
      6,
    );
    expect(after[Stat.Armor]!).toBeGreaterThan(before[Stat.Armor]!);
    expect(after[Stat.MagicResist], "魔抗照霸氣形態那份").toBeCloseTo(alt[Stat.MagicResist]!, 6);
    expect(after[Stat.MagicResist]!).toBeGreaterThan(before[Stat.MagicResist]!);

    // ⭐ 下界（同 08-002 的理由：只有上界時 15→5 也會全綠）
    // ⭐ 持有總長（同 08-002 的理由與同一個基準點陷阱）
    const hakiTicks = Math.round(HAKI_SEC / w.dt);
    let hakiFirst = -1;
    let hakiLast = -1;
    for (let i = 0; i < hakiTicks + 60; i++) {
      if (championFormIndex(w, zoro) === 1) {
        if (hakiFirst < 0) hakiFirst = w.tick;
        hakiLast = w.tick;
      }
      w.step(NO_INTENTS);
    }
    expect(hakiFirst, "變身確實發生過").toBeGreaterThanOrEqual(0);
    expect(
      // 同上（owner 2026-08-13「吟唱不能算變身時間」）—— 從形態上身那一 tick 量起，
      // ⛔ 不再減一個寫死的前搖。
      hakiLast - hakiFirst + 1,
      `霸氣形態必須整整持有 ${HAKI_SEC} 秒（${hakiTicks} tick）—— 改短 durationSec 這裡就紅`,
    ).toBe(hakiTicks);
    expect(championFormIndex(w, zoro), `${HAKI_SEC} 秒後變回索隆`).toBe(0);
    const back = { ...w.stats.get(zoro)!.final };
    expect(back[Stat.AttackDamage], "AD 倍率跟著形態一起走").toBeCloseTo(
      before[Stat.AttackDamage]!,
      6,
    );
    expect(back[Stat.Armor]).toBeCloseTo(before[Stat.Armor]!, 6);
    expect(back[Stat.MagicResist]).toBeCloseTo(before[Stat.MagicResist]!, 6);
  });
});


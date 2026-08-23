/**
 * ⭐ M5 —— 【紮根】與【主屬性覆寫】兩格授予，**不必換一整份英雄卡**就拿得到。
 * owner 2026-08-13：「應該是**狀態改變，類似定身**（可攻擊跟施展技能但不能移動）」
 * ⇒ ⛔ 不可以借【定身】(`root`)：那一個是 CC（可淨化／被免控擋／計進 CC 帳）。
 * ⚠️ 量的是**位移**與**最終屬性**，⛔ 不是 `rooted` 布林或「來源掛上了沒有」（失敗形態⑦）。
 * 突變紀錄：`movementHold.ts` 的 `src.immobile` 那一行改成永遠 continue → 第一條紅
 *（量到身體真的走了 7.8）。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 誠實揭露：`primaryAttribute` 那一條**沒有**驗到出貨設定
 * ---------------------------------------------------------------------------
 * `attributes.primary` 在整個引擎裡的**唯一**消費端是 `perLevelBonusFor` 的
 * `appliesTo:"primary"`，而出貨 `content/config/per-level-bonus.json` 是
 * **`"all"`**（誰都給）⇒ ⭐ 今天這一格覆寫**改不動任何一個數字**。
 *
 * 所以那一條用夾具把 `w.perLevelBonus` 切成 `"primary"`，它驗的是
 * 「**這個機制接對了**」，⛔ 不是「出貨的玩家看得到」。兩件事要分開講：
 *
 *   · ⛔ 這**不是缺陷** —— 是「這一格今天還沒有人需要」。
 *   · ⛔ 也**不可以**為了讓它有採用而去改 `per-level-bonus.json` 的 `appliesTo`：
 *     那一格是 owner 的旋鈕，而且它會改到**每一位英雄**的每級成長。
 *   · ⭐ 哪天 owner 把出貨切到 `"primary"`，這一條**不必改**（它已經在驗機制），
 *     而那一天才會多出一條「出貨採用」的斷言。
 *
 * ⇒ 對照組：`immobile` 那兩條是**真的**出貨行為（`movementHold` 不看任何設定），
 *   所以同一個檔案裡兩條線的證據強度不同，⛔ 不要把它們讀成同一件事。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { attachSource } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { dist } from "./math/vec2";
import type { ModifierSource } from "./stats/modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ZC = SKELETON_ARENA.zones[0]!.center;
/** 白木老樹精的**行走**本體 —— 70-00 紮根今天靠換成 `godie-e010` 才不能動。 */
const WALKING = "godie-e00s" as ChampionId;

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects"] as const) {
    for (const f of readdirSync(join(CONTENT, c)).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(CONTENT, c, f), "utf-8")) as { id: string };
      store.add(c, doc.id, doc);
    }
  }
  registerAll(store);
});

const spawn = (w: SimWorld): EntityId =>
  spawnChampion(w, {
    championId: WALKING, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: ZC.x, z: ZC.z }, zone: 0,
  });

/** 叫他走去 12 單位外，回報 40 tick 之後真的走了多遠。 */
function walked(grant?: Partial<ModifierSource>): number {
  const w = new SimWorld(SKELETON_ARENA, 20260823);
  w.combatActive = true;
  const id = spawn(w);
  if (grant) attachSource(w, id, { id: "test:grant", kind: "buff", ...grant });
  w.step(NO_INTENTS);
  const from = { ...w.transform.get(id)!.pos };
  for (let i = 0; i < 40; i++) {
    w.nav.get(id)!.moveTarget = { x: ZC.x + 12, z: ZC.z };
    w.step(NO_INTENTS);
  }
  return dist(from, w.transform.get(id)!.pos);
}

describe("M5 紮根 / 主屬性覆寫（來源授予，⛔ 不換英雄卡）", () => {
  it("⭐ 掛著 immobile 的來源就走不動，而同一具身體沒掛它就走得動", () => {
    expect(walked(), "對照組：本體必須走得動").toBeGreaterThan(1);
    expect(walked({ immobile: true }), "掛著紮根授予就不可以移動").toBeLessThan(0.05);
  });

  /**
   * ⭐ owner 那句話的**另一半**，而它在 2026-08-23 之前一條斷言都沒有：
   * 「可攻擊跟施展技能但不能移動」。只驗「走不動」的話，把 `immobile` 接到
   * `stun`（或 `root`）上也會全綠 —— 而那正是這一格**不可以**做的事。
   *
   * ⚠️ 量的是**打到人**與**技能真的落地**，⛔ 不是 `castAbility` 的回傳字串
   *（失敗形態⑦：掃屬性代替掃行為）。70-03 木束縛之術是自我中心 AOE、耗魔 0，
   * 它落地的證據是敵人身上多出一格【定身】。
   */
  it("⭐ 被 immobile 按住的人仍然**打得到人、放得出技能**（⛔ 不是 stun 的別名）", () => {
    const w = new SimWorld(SKELETON_ARENA, 20260823);
    w.combatActive = true;
    const me = spawn(w);
    const foe = spawnChampion(w, {
      championId: WALKING, seatId: asSeatId(1), teamId: asTeamId(1),
      pos: { x: ZC.x + 2, z: ZC.z }, zone: 0,
    });
    attachSource(w, me, { id: "test:grant", kind: "buff", immobile: true });
    w.step(NO_INTENTS);

    // ① 普攻 —— 站著不能動,但打得到站在面前的人。
    const hpBefore = w.health.get(foe)!.hp;
    for (let i = 0; i < 60; i++) {
      w.nav.get(me)!.attackTarget = foe;
      w.step(NO_INTENTS);
    }
    expect(w.health.get(foe)!.hp, "紮根的人應該仍然打得到人").toBeLessThan(hpBefore);

    // ② 施法 —— 技能真的落地(敵人身上多出那一格【定身】)。
    w.abilities.get(me)!.slots.E.rank = 1;
    expect(castAbility(w, me, "E", { type: "self" })).toBe("ok");
    for (let i = 0; i < 40; i++) w.step(NO_INTENTS);
    const rooted = (w.status.get(foe)?.effects ?? []).some(
      (e) => e.statusId === "root" && e.expiresAtTick > w.tick,
    );
    expect(rooted, "紮根的人施放的 70-03 應該真的把敵人綁住").toBe(true);
  });

  it("⭐ primaryAttribute 覆寫掉英雄卡上的主屬性（每級加成因此換邊）", () => {
    const w = new SimWorld(SKELETON_ARENA, 20260823);
    // 出貨的每級加成是 `appliesTo:"all"`（誰都給），那一格讀不到主屬性 ——
    // 所以夾具把它切到 `primary`，也就是這一格**唯一**的消費端。
    w.perLevelBonus = { [Stat.AbilityPower]: { amount: 5, appliesTo: "primary" } };
    const id = spawn(w);
    w.champion.get(id)!.level = 5;
    w.stats.get(id)!.dirty = true;
    w.step(NO_INTENTS);
    const asStr = w.stats.get(id)!.final[Stat.AbilityPower];
    attachSource(w, id, { id: "test:primary", kind: "buff", primaryAttribute: "INT" });
    w.step(NO_INTENTS);
    const asInt = w.stats.get(id)!.final[Stat.AbilityPower];
    expect(asInt, "主屬性改成智力之後，每級智力加成要真的加到法強上").toBeGreaterThan(asStr);
  });
});

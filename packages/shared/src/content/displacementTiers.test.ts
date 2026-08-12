/**
 * 位移級距 + 速度天花板（GH#318）。
 *
 * ⚠️ 驗的是**機制**不是數字（第二守則）：斷言不抄 16 / 5.5 / 11，全部從
 * `DEFAULT_DISPLACEMENT_TIERS` 與出貨 config 推導。那些數字已經有三個住處
 * （content/config + Zod DEFAULT + 後台）在守，抄進來就是第四個。
 *
 * ⛔ `sim/collision/collision.test.ts` 的 `dash stops at wall`(col-10) **不是**
 * 這一批的回歸守衛：複驗者實測 speed=151 乾淨穿過柱子，那兩條斷言照樣全綠
 * （失敗形態④，斷言方向與缺陷無關）。所以下面驗的是**速度到不了那個區間**，
 * 而不是「撞牆會停」。
 *
 * 突變紀錄（整批唯一的一條，挑最承重的線）：
 *   · `registries.ts` 的 `withTiers(...)` 從 `expandStandalone` 拆掉
 *     → 「三條註冊路徑都被夾」那條紅（收到 30，期望 ≤ maxSpeed）。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { TICK_HZ } from "../constants";
import {
  DEFAULT_DISPLACEMENT_TIERS,
  DISPLACEMENT_TIER_NAMES,
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
  resolveDisplacementTier,
} from "./displacementTiers";
import { Abilities, Champions, Items } from "../sim/content/registry";
import { registerAll } from "./registries";
import type { ContentStore } from "./store";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf-8")) as unknown;

/** 一個**沒填級別**、速度遠高於天花板的衝刺 —— #318 今天的樣子。 */
const FAST_DASH = { kind: "dash", mode: "forward", speed: 30, maxDistance: 11 } as const;
/** 一個**只填級別**的擊退 —— owner 要的寫法。 */
const TIERED_PUSH = { kind: "knockback", distanceTier: "大", distance: 99, speed: 99 } as const;

const ability = (id: string, effects: readonly unknown[]): unknown => ({
  id,
  schema: "ability@1",
  name: id,
  slot: "Q",
  castType: "ground",
  maxRank: 1,
  cooldown: [10],
  manaCost: [10],
  range: 5,
  effects,
});
const storeOf = (docs: Record<string, unknown[]>): ContentStore =>
  ({ all: (c: string) => docs[c] ?? [] }) as unknown as ContentStore;

/** 走訪任何文件，收集每一個 dash/knockback 的速度。 */
function speedsIn(node: unknown, out: number[] = []): number[] {
  if (Array.isArray(node)) node.forEach((v) => speedsIn(v, out));
  else if (node !== null && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if ((rec["kind"] === "dash" || rec["kind"] === "knockback") && typeof rec["speed"] === "number")
      out.push(rec["speed"]);
    Object.values(rec).forEach((v) => speedsIn(v, out));
  }
  return out;
}

describe("位移級距 + 速度天花板 (GH#318)", () => {
  it("⭐ 三條註冊路徑都被夾 —— standalone / 英雄內嵌 / 道具，而且不用填級別", () => {
    cover("displacement-tiers");
    Abilities.clear();
    Items.clear();
    Champions.clear();
    const solo = ability("t.solo", [FAST_DASH]);
    registerAll(
      storeOf({
        abilities: [solo],
        champions: [
          {
            id: "t.champ",
            schema: "champion@1",
            name: "夾夾",
            abilities: {
              Q: ability("t.emb", [FAST_DASH]),
              W: ability("t.emb.w", []),
              E: ability("t.emb.e", []),
              R: ability("t.emb.r", []),
            },
          },
        ],
        items: [{ id: "t.item", schema: "item@1", passive: [{ effects: [FAST_DASH] }] }],
      }),
    );
    const ceiling = DEFAULT_DISPLACEMENT_TIERS.maxSpeed;
    // ⚠️ 內嵌那一條**不是**模板技 —— 接縫以前只包模板展開，所以這條路一次都沒跑過。
    for (const got of [
      speedsIn(Abilities.tryGet("t.solo" as never)),
      speedsIn(Champions.tryGet("t.champ" as never)?.abilities.Q),
      speedsIn(Items.tryGet("t.item" as never)),
    ]) {
      expect(got).toHaveLength(1);
      expect(got[0]).toBeLessThanOrEqual(ceiling);
    }
    expect(FAST_DASH.speed).toBeGreaterThan(ceiling); // 夾之前真的超標，否則上面是廢話
  });

  it("級別贏過手寫值，兩張梯子各查各的 —— 反過來的話這個機制會靜默失效", () => {
    cover("displacement-tiers");
    Abilities.clear();
    registerAll(storeOf({ abilities: [ability("t.tier", [TIERED_PUSH])] }));
    const kb = (Abilities.tryGet("t.tier" as never)?.effects as { distance: number }[])[0];
    expect(kb?.distance).toBe(DEFAULT_DISPLACEMENT_TIERS.push["大"].distance);
  });

  it("兩個開關各自只關掉自己那一半 —— 不想用級距 ≠ 想讓人穿牆", () => {
    cover("displacement-tiers");
    const doc = { id: "d", schema: "config.displacement-tiers@1" };
    const noTier = displacementTiersFromDoc({ ...doc, enabled: false });
    const noClamp = displacementTiersFromDoc({ ...doc, clampSpeed: false });
    // 級距關掉：距離不解析（留著手寫值），但速度照樣被夾
    const a = resolveDisplacementTier({ ...TIERED_PUSH }, noTier);
    expect(a.distance).toBe(TIERED_PUSH.distance);
    expect(a.speed).toBe(noTier.maxSpeed);
    // 天花板關掉：級距照樣解析，而作者寫的高速回來 —— 這就是 owner 的一鍵 rollback
    expect(resolveDisplacementTier({ ...TIERED_PUSH }, noClamp).distance).toBe(
      DEFAULT_DISPLACEMENT_TIERS.push["大"].distance,
    );
    expect(resolveDisplacementTier({ ...FAST_DASH }, noClamp).speed).toBe(FAST_DASH.speed);
  });

  it("兩張梯子由小到大 —— 一把尺的刻度不可以亂序", () => {
    cover("displacement-tiers");
    for (const ladder of [DEFAULT_DISPLACEMENT_TIERS.travel, DEFAULT_DISPLACEMENT_TIERS.push]) {
      const d = DISPLACEMENT_TIER_NAMES.map((n) => ladder[n].distance);
      expect(d).toEqual([...d].sort((a, b) => a - b));
      expect(new Set(d).size).toBe(d.length);
      for (const n of DISPLACEMENT_TIER_NAMES)
        expect(ladder[n].speed).toBeLessThanOrEqual(DEFAULT_DISPLACEMENT_TIERS.maxSpeed);
    }
  });

  it("⭐ 配對式：天花板下每 tick 走的距離**嚴格小於**出貨最小身體半徑", () => {
    cover("displacement-tiers");
    // 驗「速度上限是 16」是一個名詞；驗「速度上限 vs 身體半徑的關係」才抓得到
    // 「有人把 mob 半徑調小」這一類故障（ggd-pairwise-postconditions）。
    const configs = readdirSync(join(CONTENT_DIR, "config"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => readJson(join(CONTENT_DIR, "config", f)));
    const minRadius = minBodyRadiusFromConfigs(configs);
    const tiers = displacementTiersFromDoc(
      configs.find((c) => (c as { schema?: string }).schema === "config.displacement-tiers@1"),
      minRadius,
    );
    expect(tiers.maxSpeed / TICK_HZ).toBeLessThan(minRadius);
  });

  it("出貨內容零筆位移速度超過天花板 —— 級距是選填的，天花板不是", () => {
    cover("displacement-tiers");
    const ceiling = DEFAULT_DISPLACEMENT_TIERS.maxSpeed;
    const over: string[] = [];
    for (const coll of ["abilities", "champions", "items"]) {
      for (const f of readdirSync(join(CONTENT_DIR, coll))) {
        if (!f.endsWith(".json") || f.startsWith("_")) continue;
        for (const s of speedsIn(readJson(join(CONTENT_DIR, coll, f))))
          if (s > ceiling) over.push(`${coll}/${f} speed=${s}`);
      }
    }
    expect(over).toEqual([]);
  });
});

/**
 * geometrySnapWired.test.ts —— 沒標級別的距離／範圍**真的在載入時吸格**（GH#1260 B3）。
 *
 * owner 2026-09-02「所有技能傷害…距離、範圍…這些全部都五級距化標籤化」。
 * ⭐ 載入出貨內容、跑真的 `registerAll`、讀**註冊表**（⛔ 不是呼叫 `snapUntieredGeometry`）——
 *    函式在、開關在、後台頁在而沒有人叫，正是失敗形態⑧。
 *
 * ⭐ 兩個方向（一把只驗過單邊的尺不算自證過）：
 *   ① 出貨：每一支技能的射程、命中半徑（含 `leap.landRadius`）、位移距離都落在自己那條梯子的某一格上；
 *   ② 三張表的 `snapUntiered` 關掉（＝rollback）：同一把尺量得到離格的 ⇒ ① 不是瞎的。
 * 梯子從出貨 config 推導（⛔ 不寫死 3 / 4.5 / 6…）。靈魂層 ⇒ 一次突變，記在 commit 訊息。
 */
import { describe, it, expect } from "vitest";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { registerAll } from "./registries";
import { Abilities } from "../sim/content/registry";
import { aoeTiersFromDoc, radiusFieldOf } from "./aoeTiers";
import { rangeTiersFromDoc } from "./rangeTiers";
import { displacementFieldsOf, displacementTiersFromDoc } from "./displacementTiers";
import { DUEL_ZONE_RADIUS_REF } from "./skillTiers";
import { SKELETON_CHAMPION_IDS } from "./skillNormalize";
import { zEffectDefUnion } from "./schema/effects/index";

const SNAP_SCHEMAS = ["config.aoe-tiers@1", "config.range-tiers@1", "config.displacement-tiers@1"];

describe("沒標級別的距離／範圍在載入時吸到最近一格（GH#1260 B3）", () => {
  it("① 出貨：註冊表的幾何全部在梯子上；② snapUntiered 關掉：同一把尺量得到離格的", async () => {
    const store = (await new ContentLoader(shippedContentSource()).load()).store;
    const configs = store.all<{ schema?: string }>("config");
    const cfg = (s: string) => configs.find((c) => c.schema === s);
    const rungs = (o: Record<string, number>) => new Set(Object.values(o));
    const disp = displacementTiersFromDoc(cfg("config.displacement-tiers@1"));
    const ladder = {
      range: rungs(rangeTiersFromDoc(cfg("config.range-tiers@1")).range),
      radius: rungs(aoeTiersFromDoc(cfg("config.aoe-tiers@1")).radius),
      travel: new Set(Object.values(disp.travel).map((r) => r.distance)),
      push: new Set(Object.values(disp.push).map((r) => r.distance)),
    };
    const radiusKinds = new Set(
      zEffectDefUnion.options
        .map((o) => o.shape as Record<string, { value?: unknown } | undefined>)
        .filter((s) => s["radiusTier"] !== undefined)
        .map((s) => String(s["kind"]?.value)),
    );
    const offLadder = (): string[] => {
      const out: string[] = [];
      const check = (id: string, key: string, v: unknown, set: Set<number>) => {
        if (typeof v === "number" && v > 0 && v < DUEL_ZONE_RADIUS_REF && !set.has(v)) out.push(`${id}|${key}=${v}`);
      };
      const walk = (id: string, n: unknown): void => {
        if (Array.isArray(n)) return n.forEach((x) => walk(id, x));
        if (n === null || typeof n !== "object") return;
        const rec = n as Record<string, unknown>;
        const kind = rec["kind"];
        if (typeof kind === "string" && radiusKinds.has(kind)) check(id, `${kind}.${radiusFieldOf(kind)}`, rec[radiusFieldOf(kind)], ladder.radius);
        const f = displacementFieldsOf(rec);
        if (f && rec["launchDistance"] === undefined) check(id, `${String(kind)}.${f.distanceField}`, rec[f.distanceField], ladder[f.ladder]);
        for (const [k, v] of Object.entries(rec)) if (k !== "template") walk(id, v);
      };
      for (const def of Abilities.all()) {
        const d = def as unknown as Record<string, unknown>;
        const id = String(d["id"]);
        if (SKELETON_CHAMPION_IDS.has(id.split(".")[0]!)) continue;
        check(id, "range", d["range"], ladder.range);
        check(id, "radius", d["radius"], ladder.radius);
        walk(id, d["effects"]);
        walk(id, d["passive"]);
      }
      return out;
    };

    registerAll(store);
    expect(Abilities.all().length, "夾具前提：註冊表有技能").toBeGreaterThan(0);
    expect(offLadder(), "⛔ ① 出貨設定下註冊表還有離格的距離／範圍 ⇒ 吸格沒接上（失敗形態⑧）").toEqual([]);

    const off = configs.map((c) => (SNAP_SCHEMAS.includes(String(c.schema)) ? { ...c, snapUntiered: false } : c));
    const rolled = { ...store, all: <U>(c: string) => (c === "config" ? (off as U[]) : store.all<U>(c as never)) };
    registerAll(rolled as never);
    expect(offLadder().length, "⛔ ② rollback（三格 snapUntiered 關掉）下一條離格的都量不到 ⇒ ① 那把尺是瞎的").toBeGreaterThan(0);
  });
});

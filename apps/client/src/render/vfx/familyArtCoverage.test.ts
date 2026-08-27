/**
 * THE COVERAGE GUARD — asserted through a REAL `ContentDb.vfxFor`, never off a
 * doc field.
 *
 * ⚠️ The mistake this file is shaped around was made in this very batch: a
 * coverage number derived by scanning ability docs' `spawnVfx` field, which is
 * not the field the renderer resolves. It produced a dramatic, confident and
 * entirely false "99% of abilities have no VFX". Failure ⑦ — scanning a
 * PROPERTY instead of the BEHAVIOUR.
 *
 * So every number below travels the shipping path:
 *      abilityId → w3xArtFor()  → art.primary → ContentDb.vfxFor() → VfxDoc
 * with a ContentDb boot-loaded from the REAL `content/` tree on disk through
 * the same `HttpContentSource` the browser uses (fetch stubbed over the file
 * system, exactly as `ContentDb.test.ts` does it). If `pnpm content:build` was
 * not run, or a generated doc is missing, or `w3xArtFor` stops answering, the
 * numbers move and this file goes red.
 *
 * MUTATION LOG for this file (run before landing):
 *   · `w3xArtFor` → `return w3xAbilityArtRows()[abilityId]` (drop the family
 *     fall-through) → "reaches the screen" + the 34→270 pin both fail
 *   · delete `applyArtParams(...)` in `buildFamilyDocWith` → "two abilities on
 *     ONE prototype resolve to docs with different size AND colour" fails
 *   · `resolveFamilyArt` → ignore `evidence.tint` → the tint half of the same
 *     assertion fails
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpContentSource, Arenas, Configs, Models, VfxDefs } from "@ggd/shared/content";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { ContentDb } from "../../content/ContentDb";
import { ensureContentLoaded, __resetContentBoot } from "../../content/bootContent";
import { w3xAbilityArtRows, w3xArtFor, primitiveFallbackFor } from "./w3xAbilityArt";
import { w3xFamilyArtRows } from "./w3xFamilyArt";
import {
  resolveFamilyArt,
  resolveAllFamilyArt,
  requiredFamilyDocs,
  familyCoverage,
} from "./familyTuning";
import { isFamilyVfxKey, W3X_ART_FAMILY_IDS, W3X_ART_FAMILIES } from "./w3xArtFamilies";

const CONTENT = fileURLToPath(new URL("../../../../../content/", import.meta.url));

/** fetch over the REAL content tree on disk (the browser's own URL shapes). */
function diskFetch(): typeof fetch {
  return ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    if (!url.startsWith("/content/")) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    const file = join(CONTENT, url.slice("/content/".length));
    if (!existsSync(file)) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    const body = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }) as unknown as typeof fetch;
}

let db: ContentDb;

beforeAll(async () => {
  for (const r of [Champions, Abilities]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs]) r.clear();
  __resetContentBoot();
  const fn = diskFetch();
  vi.stubGlobal("fetch", fn);
  await ensureContentLoaded({ source: new HttpContentSource({ baseUrl: "/content", fetchFn: fn }) });
  db = new ContentDb();
  await db.load("arena.skeleton");
}, 60_000);

afterAll(() => {
  vi.unstubAllGlobals();
  __resetContentBoot();
});

/** The one and only way this file is allowed to look at art. */
const docFor = (abilityId: string) => {
  const art = w3xArtFor(abilityId);
  return art ? db.vfxFor(art.primary) : null;
};
const peak = (d: { sizeStops?: [number, number][]; size: { start: number } }): number =>
  d.sizeStops ? Math.max(...d.sizeStops.map(([, s]) => s)) : d.size.start;
const tint = (d: { colorStops?: [number, [number, number, number, number]][] }): [number, number, number, number] =>
  d.colorStops![1]![1];

describe("family art reaches the screen", () => {
  it("the ContentDb really loaded (sanity — an empty db would make every count 0)", () => {
    expect(db.ready).toBe(true);
    expect(db.vfxFor("fx.ember-bolt-cast")).not.toBeNull();
  });

  it("EVERY family-bound ability resolves to a real doc through vfxFor", () => {
    const dead: string[] = [];
    for (const abilityId of Object.keys(w3xFamilyArtRows())) {
      const art = w3xArtFor(abilityId);
      if (!art) {
        dead.push(`${abilityId}: w3xArtFor answered nothing`);
        continue;
      }
      if (!db.vfxFor(art.primary)) dead.push(`${abilityId}: vfxFor("${art.primary}") is null`);
    }
    expect(dead, `${dead.length} bound ability(ies) would draw NOTHING`).toEqual([]);
  });

  it("two abilities on ONE prototype resolve to docs with different SIZE and different COLOUR", () => {
    // Both of these are `shockwaveRing` (WarStompCaster/ThunderClapCaster) by
    // evidence. Pick the pair the resolver itself produces rather than naming
    // two ids by hand, so the assertion cannot rot when the table moves.
    const ring = resolveAllFamilyArt(null).filter((r) => r.family === "shockwaveRing");
    expect(ring.length).toBeGreaterThan(5);
    const keys = new Set(ring.map((r) => r.vfxKey));
    expect(keys.size, "one prototype collapsed to ONE doc — the params are not applied").toBeGreaterThan(1);

    const docs = [...keys].map((k) => db.vfxFor(k)!).filter(Boolean);
    expect(docs.length).toBe(keys.size);
    const sizes = new Set(docs.map((d) => peak(d)));
    const tints = new Set(docs.map((d) => JSON.stringify(tint(d).slice(0, 3))));
    expect(sizes.size, "every shockwaveRing doc is the SAME size").toBeGreaterThan(1);
    expect(tints.size, "every shockwaveRing doc is the SAME colour").toBeGreaterThan(1);
  });

  it("the map's own vertex tint really lands on the doc (not the name-classified element)", () => {
    const withTint = Object.entries(w3xFamilyArtRows()).filter(([, r]) => r.tint);
    expect(withTint.length).toBeGreaterThan(50);
    const mismatched: string[] = [];
    for (const [abilityId, row] of withTint) {
      const r = resolveFamilyArt(abilityId, null)!;
      if (r.colour.kind !== "w3x") {
        mismatched.push(`${abilityId}: tint ${JSON.stringify(row.tint)} was dropped`);
        continue;
      }
      const doc = db.vfxFor(r.vfxKey);
      if (!doc) {
        mismatched.push(`${abilityId}: ${r.vfxKey} missing`);
        continue;
      }
      // the ramp's tint stop must trend the same way as the w3x rgb: the
      // dominant w3x channel must be the dominant doc channel
      const w = row.tint!;
      const d = tint(doc);
      const wMax = w.indexOf(Math.max(...w));
      const dMax = [d[0], d[1], d[2]].indexOf(Math.max(d[0], d[1], d[2]));
      if (w[0] !== w[1] || w[1] !== w[2]) {
        if (wMax !== dMax) mismatched.push(`${abilityId}: w3x ch${wMax} != doc ch${dMax}`);
      }
    }
    expect(mismatched, `${mismatched.length} tint(s) never reached the doc`).toEqual([]);
  });

  it("the map's own SCALE really lands on the doc (a bigger usca → a bigger doc)", () => {
    // Pick every family that has TWO call sites with DIFFERENT authored scales
    // and assert the ordering survives all the way to the rendered doc. Four
    // families qualify today (resurrect 0.9/3.0, burst 1.1/3.0, tornado 2.0/3.0,
    // lightColumn 4.0/5.0); the search is generic so the test does not rot when
    // the evidence moves.
    const byFamily = new Map<string, { scale: number; size: number }[]>();
    for (const [abilityId, row] of Object.entries(w3xFamilyArtRows())) {
      if (row.scale === undefined) continue;
      const doc = docFor(abilityId);
      if (!doc) continue;
      const a = byFamily.get(row.family) ?? [];
      a.push({ scale: row.scale, size: peak(doc) });
      byFamily.set(row.family, a);
    }
    const comparable = [...byFamily.entries()].filter(
      ([, rows]) => new Set(rows.map((r) => r.scale)).size > 1,
    );
    expect(comparable.length, "no family has two differently-scaled call sites").toBeGreaterThanOrEqual(3);
    for (const [family, rows] of comparable) {
      const sorted = [...rows].sort((a, b) => a.scale - b.scale);
      const lo = sorted[0]!;
      const hi = sorted[sorted.length - 1]!;
      expect(hi.size, `${family}: usca ${hi.scale} is not bigger than usca ${lo.scale}`).toBeGreaterThan(
        lo.size,
      );
    }
  });

  it("rung 3 still exists: every family row has an fx.prim.* fallback or is off-roster", () => {
    let withFallback = 0;
    for (const abilityId of Object.keys(w3xFamilyArtRows())) {
      const fb = primitiveFallbackFor(abilityId);
      if (fb) {
        expect(fb.startsWith("fx.prim."), `${abilityId}: fallback ${fb} is not a primitive`).toBe(true);
        expect(db.vfxFor(fb), `${abilityId}: fallback ${fb} does not resolve`).not.toBeNull();
        withFallback += 1;
      }
    }
    // the roster-classified subset; off-roster ids legitimately have none
    expect(withFallback).toBeGreaterThan(80);
  });

  it("bindings.ts is UNTOUCHED as the fallback — an unproven ability still gets its primitive", () => {
    const unproven = "godie-e001.q"; // no evidence row, no promotion
    expect(w3xFamilyArtRows()[unproven]).toBeUndefined();
    expect(w3xAbilityArtRows()[unproven]).toBeUndefined();
    expect(w3xArtFor(unproven)).toBeUndefined();
    const doc = JSON.parse(readFileSync(join(CONTENT, "abilities", `${unproven}.json`), "utf8")) as {
      vfxKey: string;
    };
    expect(doc.vfxKey.startsWith("fx.prim.")).toBe(true);
    expect(db.vfxFor(doc.vfxKey)).not.toBeNull();
  });
});

describe("the honest coverage numbers (pins — a silent regression moves them)", () => {
  /**
   * THE HEADLINE. Before this lane: 34 abilities drew what the original map
   * really drew (`w3xAbilityArtRows()`, real extracted emitters). After: those 34
   * plus every ability the import PROVES onto one of the 21 prioritised
   * families. The two sets overlap — an ability with shipped emitter art can
   * also have priority-family evidence — and the promotion wins, so the union
   * is what counts.
   *
   * These are FLOORS in the direction of more evidence and EXACT on the
   * promoted count, because losing a promotion is always a regression while
   * gaining evidence is the point.
   */
  it("promoted + evidence-family: 三個集合的算術自洽，counted through w3xArtFor", () => {
    // ⚠️ 2026-08-27：這裡原本釘死 `34` / `22` / `270` 三個**出貨數量**。
    //    GH#529 移除 7 列**死技能的空宣稱**（34 → 27）並補 2 列鏡射對（→ 29）
    //    ⇒ 這一條就用「34 變成 29」紅了，⛔ 而那是**修好了**（少了 7 句謊話）。
    // ⭐ 出貨數量住在測試裡＝CLAUDE.md 說的「第四個住處」：它必然過期，
    //    而且會用**與真相相反**的訊息紅（「promoted 少了」讀起來像退步）。
    // ⇒ 改成驗**關係**：算術自洽 ＋ 母體非空 ＋ 每一個 promoted 真的答得出來。
    const promoted = Object.keys(w3xAbilityArtRows());
    const family = Object.keys(w3xFamilyArtRows());
    const union = new Set([...promoted, ...family]);
    const overlap = promoted.filter((id) => w3xFamilyArtRows()[id]);

    expect(union.size, "聯集算術不自洽 —— 三個集合有一個算錯了").toBe(
      promoted.length + family.length - overlap.length,
    );
    expect(promoted.length, "promoted 是空的 —— 母體壞了").toBeGreaterThan(20);
    expect(family.length, "evidence-family 是空的 —— 母體壞了").toBeGreaterThan(200);
    // and every one of them actually answers
    const answering = [...union].filter((id) => w3xArtFor(id) !== undefined);
    expect(answering).toHaveLength(270);
    // the promotion really does win on the overlap (a prototype would be a
    // DOWNGRADE for these 22 — they have the map's own emitters)
    for (const id of overlap) expect(w3xArtFor(id)!.primary).toBe(w3xAbilityArtRows()[id]!.primary);
  });

  it("the shipped fx.fam.* doc set is exactly what the resolver asks for", () => {
    const wanted = new Set(resolveAllFamilyArt(null).map((r) => r.vfxKey));
    const onDisk = new Set(
      readdirSync(join(CONTENT, "vfx"))
        .filter((f) => f.startsWith("fx.fam.") && f.endsWith(".json"))
        .map((f) => f.slice(0, -".json".length)),
    );
    const missing = [...wanted].filter((k) => !onDisk.has(k)).sort();
    const orphan = [...onDisk].filter((k) => !wanted.has(k)).sort();
    expect(missing, "generator not run / content:build stale").toEqual([]);
    expect(orphan, "dead fx.fam docs left behind").toEqual([]);
    // 78 → 79（GH#431）：天譴 `godie-udea.r` 的 owner 覆寫把它從 shockwaveRing
    // 搬到 lightColumn，於是多要一份 `fx.fam.light-column.w3x-00ffff.s150`。
    // 舊的 shockwave 那一份沒有變孤兒 —— 另外 90 支還在用它。
    expect(wanted.size).toBe(79);
  });

  /**
   * THE ONE THAT TIES THE CODE TO THE BYTES. The check above only compares
   * NAMES, so a builder change (or a deleted `applyArtParams` call) leaves it
   * green while every shipped doc is stale — the docs on disk are what the
   * player downloads, and nothing else was comparing them to the code that
   * claims to produce them.
   */
  it("every shipped fx.fam doc is byte-identical to what the generator produces now", () => {
    const built = requiredFamilyDocs(null);
    const stale: string[] = [];
    for (const [id, doc] of built) {
      const file = join(CONTENT, "vfx", `${id}.json`);
      if (!existsSync(file)) {
        stale.push(`${id}: not on disk`);
        continue;
      }
      const onDisk = JSON.stringify(JSON.parse(readFileSync(file, "utf8")));
      if (onDisk !== JSON.stringify(doc)) stale.push(`${id}: on disk != generator output`);
    }
    expect(stale, `${stale.length} shipped doc(s) drifted — re-run the generator + content:build`).toEqual(
      [],
    );
  });

  it("19 of the 21 families carry abilities; blood + starfall carry none, and that is stated", () => {
    const cov = familyCoverage(null);
    const empty = W3X_ART_FAMILY_IDS.filter((f) => cov[f] === 0).sort();
    // Not a bug: `HeroBloodElfBlood` and `StarfallTarget` are referenced by the
    // map (9 refs each) but never through a CONFIRMED ability link — they hang
    // off units and triggers. Their prototypes exist and are console-bindable.
    expect(empty).toEqual(["blood", "starfall"]);
    expect(Object.values(cov).reduce((a, b) => a + b, 0)).toBe(Object.keys(w3xFamilyArtRows()).length);
    // 91 → 90：天譴被 owner 覆寫搬走一支（GH#431）。⚠️ 這裡數的是**解析後**的
    // 家族，而證據那張表仍然說 shockwaveRing —— 兩者不一樣正是覆寫層在做事。
    expect(cov.shockwaveRing).toBe(90); // the big one, by a factor of 2.7
  });

  it("every family key the resolver emits is an fx.fam key of a REAL family", () => {
    for (const r of resolveAllFamilyArt(null)) {
      expect(isFamilyVfxKey(r.vfxKey)).toBe(true);
      expect(r.vfxKey).toContain(W3X_ART_FAMILIES[r.family].slug);
    }
  });
});

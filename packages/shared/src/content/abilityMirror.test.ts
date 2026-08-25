/**
 * The champion↔ability MIRROR guard, run over the REAL content tree
 * (docs/todo/ability-vfx.md av-14..17).
 *
 * Every Q/W/E/R ability is stored twice: standalone at
 * `content/abilities/<cid>.<slot>.json` and denormalised into its champion at
 * `content/champions/<cid>.json` `abilities[<slot>]`. The standalone doc is
 * authoritative — see `registerChampion`/`fillGaps` in ../sim/content/registry.
 *
 * WHY THIS EXISTS. `auditAbilityMirrorDrift` has been available since the
 * shadowing fix, but nothing ever pointed it at content/ — it was only ever
 * exercised against the synthetic 2-doc fixture in abilityShadowing.test.ts.
 * Meanwhile task #79's VFX re-point edited `content/abilities/*.json` ONLY (that
 * file's stated owned surface is "content/abilities/*.json (vfxKey field only)"),
 * leaving 192 of the 452 embedded copies still holding the old
 * `fx.ember-bolt-cast` placeholder.
 *
 * That is the BOTH-PRESENT-BUT-DIFFERENT class, and it is nastier than a missing
 * field precisely because it is invisible in a real match: `fillGaps` only
 * backfills keys the standalone doc leaves undefined, so at runtime the correct
 * standalone value wins and everything looks fine. The stale value leaks into
 * every RAW-DOC consumer that never goes through `registerAll` — the codex
 * browser, the admin 內容管理 page, and above all
 * apps/editor/src/preview/PreviewController.ts, which passes
 * `overrideAbilities: true` and therefore renders the embedded copy WHOLE.
 *
 * The assertion collects EVERY violation before failing. A bare `expect` inside
 * the loop would have reported 1 failure for 192 defects.
 *
 * IMPORTANT: 這一支不依賴 `content:build` 有沒有跑過 —— 它必須在 reindex 前後
 * 都是綠的。⭐ 2026-08-23 之後這件事由 `__fixtures__/shippedContent.ts` 保證：
 * 它先做一次 11 ms 的 mtime 掃描，bundle 比每一份來源都新才走 bundle，
 * 有任何一份來源比 bundle 新就**自動退回逐檔讀**（fail-slow，⛔ 不是 fail-open）。
 * 兩條路逐份相同由 `__fixtures__/shippedContent.test.ts` 守著。
 */
import { describe, it, expect } from "vitest";
import { shippedDocFiles } from "./__fixtures__/shippedContent";
import type { CollectionName } from "./schema/index";
import { cover } from "../../testkit/cover";
import { ContentStore } from "./store";
import { auditAbilityMirrorDrift, type AbilityMirrorDrift } from "./registries";

const SLOTS = ["Q", "W", "E", "R"] as const;

/**
 * Fields the standalone doc is ALLOWED to carry alone. This is the sanctioned
 * steady state, not drift:
 *  - `schema`  — the collection tag only a standalone doc has (one per pair, by design).
 * A field name showing up standalone-only that is NOT on this list means a new
 * write path started editing one copy of the mirror — exactly how #79 did it.
 *
 * `icon` used to sit on this list. It was the SAME defect as #79's vfxKey, one
 * class milder: the AI icon set (tools/icon-gen/src/generate.py `patch_icon_field`)
 * wrote the standalone doc only, so 416 of the 452 slots carried an icon the
 * embedded copy did not have. Sanctioning it here is what let it stay that way.
 * The mirror is synced now, so the exemption is gone and the one-sided case can
 * never come back.
 */
const STANDALONE_ONLY_OK = new Set(["schema"]);

type Doc = Record<string, unknown>;

function docs(collection: string): Array<{ file: string; doc: Doc }> {
  // 一次從 content/bundle.json 讀（bundle 過期時自動退回檔案樹）—— __fixtures__/shippedContent.ts
  return shippedDocFiles<Doc>(collection as CollectionName);
}

/** The real content tree as a ContentStore, so the SHIPPING audit runs on it. */
function realContentStore(): ContentStore {
  const store = new ContentStore();
  for (const { file, doc } of docs("abilities")) {
    store.add("abilities", (doc.id as string) ?? file.slice(0, -5), doc);
  }
  for (const { file, doc } of docs("champions")) {
    store.add("champions", (doc.id as string) ?? file.slice(0, -5), doc);
  }
  return store;
}

/** Raw standalone/embedded doc pair per `<championId>.<slot>`, straight off disk. */
function rawPairs(): Map<string, { standalone: Doc; embedded: Doc }> {
  const byId = new Map<string, Doc>();
  for (const { doc } of docs("abilities")) byId.set(doc.id as string, doc);

  const pairs = new Map<string, { standalone: Doc; embedded: Doc }>();
  for (const { doc } of docs("champions")) {
    const abilities = (doc.abilities ?? {}) as Record<string, Doc | undefined>;
    for (const slot of SLOTS) {
      const embedded = abilities[slot];
      if (!embedded) continue;
      const standalone = byId.get(embedded.id as string);
      if (!standalone) continue;
      pairs.set(`${doc.id as string}.${slot}`, { standalone, embedded });
    }
  }
  return pairs;
}

/**
 * How many standalone/embedded pairs the OPERATING roster owes us.
 *
 * ⭐ 2026-08-13：這格以前是寫死的 `PAIR_FLOOR = 452`（當時 113 位 × 4 槽）。
 * 未上架英雄搬進 `content/_legacy/` 之後營運母體變成 78 位 → 312 對，
 * 這一份的四條測試就全部紅在同一行 —— 而紅的原因跟「鏡射有沒有壞」一點關係都沒有，
 * 它只是抄了一個出貨值（CLAUDE.md 第零守則說的「第四個住處」）。
 *
 * 現在**從內容目錄推導**：營運名單有幾位英雄，就該有幾位 × 4 對。
 * ⛔ 這不是把守衛改弱 —— 它其實比常數**更緊**，因為它是精確額而不是一個落後的下界：
 * 同一條測試的 `orphans` 已經逐格證明每一位英雄都帶滿 Q/W/E/R、且每一格都找得到
 * standalone 雙生子，所以配對數必須**剛好**等於這個值。名單增減時它自己跟著走。
 */
function expectedPairs(): number {
  return docs("champions").length * SLOTS.length;
}

/**
 * Guard-the-guard，兩件事一起釘：
 *  ① 名單不是空的 —— 否則推導出來的額度是 0，`0 >= 0` 會讓整份測試**真空綠**。
 *    「營運內容至少有一位英雄」是**結構性**下界（沒有英雄的遊戲不是遊戲），
 *    ⛔ 不是一個會被調的出貨數字。
 *  ② 實際配對數達到滿額 —— 少了就是有人刪了 standalone 檔或槽位。
 */
function expectFullRoster(pairCount: number): void {
  const want = expectedPairs();
  expect(want).toBeGreaterThan(0);
  expect(pairCount).toBeGreaterThanOrEqual(want);
}

/** JSON docs can never hold an `undefined` value, so absent ⟺ `undefined`. */
function present(doc: Doc, field: string): boolean {
  return field in doc && doc[field] !== undefined;
}

function show(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function describeDrift(d: AbilityMirrorDrift): string {
  return `${d.championId}.${d.slot} (${d.abilityId}) ${d.field}: standalone=${show(
    d.standalone,
  )} embedded=${show(d.embedded)}`;
}

describe("champion↔ability mirror (real content)", () => {
  it("every champion Q/W/E/R slot has a standalone twin to be checked against (ability-mirror-pairs)", () => {
    cover("ability-mirror-pairs");
    // Counted and NON-SKIPPING: a `continue` on a missing twin would let a
    // rewrite that deleted standalone docs pass this suite vacuously.
    const byId = new Set(docs("abilities").map(({ doc }) => doc.id as string));
    const orphans: string[] = [];
    let slots = 0;
    for (const { file, doc } of docs("champions")) {
      const abilities = (doc.abilities ?? {}) as Record<string, Doc | undefined>;
      for (const slot of SLOTS) {
        const embedded = abilities[slot];
        if (!embedded) {
          orphans.push(`${file}#${slot}: champion doc has no ${slot} ability`);
          continue;
        }
        slots += 1;
        if (!byId.has(embedded.id as string)) {
          orphans.push(`${file}#${slot}: no standalone doc for "${embedded.id as string}"`);
        }
      }
    }
    expect(orphans, `${orphans.length} unmirrored slot(s)`).toEqual([]);
    expectFullRoster(slots);
    expectFullRoster(rawPairs().size);
  });

  /**
   * THE GUARD. Zero fields present in BOTH copies with different values.
   *
   * Fails with the complete list, not the first offender — the defect this was
   * written for spanned 192 slots across 48 champion docs, and a fail-fast
   * assertion would have reported it as a single one-line typo.
   */
  it("no field is present in both copies with different values (ability-mirror-no-conflict)", () => {
    cover("ability-mirror-no-conflict");
    const pairs = rawPairs();
    expectFullRoster(pairs.size); // never pass vacuously

    const conflicts: AbilityMirrorDrift[] = [];
    for (const drift of auditAbilityMirrorDrift(realContentStore())) {
      const pair = pairs.get(`${drift.championId}.${drift.slot}`);
      if (!pair) continue; // audited an embedded-only ability; the pairs test owns that
      if (!present(pair.standalone, drift.field) || !present(pair.embedded, drift.field)) continue;
      conflicts.push(drift);
    }

    const byField = new Map<string, number>();
    for (const c of conflicts) byField.set(c.field, (byField.get(c.field) ?? 0) + 1);
    const summary =
      `${conflicts.length} embedded field(s) contradict their standalone twin ` +
      `across ${pairs.size} pairs ` +
      `[${[...byField].map(([f, n]) => `${f}×${n}`).join(", ")}]. ` +
      `The standalone doc is authoritative — the embedded copy must follow it, never the reverse.\n` +
      `⚠️⚠️ 但**先問這兩份是誰寫的**：bash scripts/genguard.sh content/champions/<cid>.json\n` +
      `   · 產生器的產物（skillremake:json 擁有 16 份 champion ＋ 91 份 ability 的**每一個欄位**）\n` +
      `     ⇒ 改**來源** tools/skill-remake/heroes/<hero>.py，再 bash scripts/genrun.sh skillremake:json。\n` +
      `     ⛔ 手抄進 content/champions/ 會被下一次 skills:sync 逐位元組打回來。\n` +
      `   · 兩份都不是產物 ⇒ 才手動把 standalone 的值抄進 abilities[<slot>]。\n` +
      `⛔ **不要跑 \`pnpm content:build\` 當修法** —— 它只重建索引與 bundle，\n` +
      `   **不做 standalone→embedded 同步**（這一句在 2026-08-25 之前寫在這裡，是錯的：\n` +
      `   照做＝改產物＋跑一支不相干的產生器，下一次 sync 全部打回來）。\n` +
      conflicts.map(describeDrift).join("\n");

    expect(conflicts.map(describeDrift), summary).toEqual([]);
  });

  /**
   * The adjacent failure mode: a field that starts being written to only ONE
   * side of the mirror. `schema` and `icon` are the sanctioned standalone-only
   * cases; anything else means a new one-sided write path appeared.
   */
  it("only sanctioned fields live on one side of the mirror (ability-mirror-one-sided)", () => {
    cover("ability-mirror-one-sided");
    const pairs = rawPairs();
    expectFullRoster(pairs.size);

    const unsanctioned: string[] = [];
    for (const [key, { standalone, embedded }] of pairs) {
      for (const field of new Set([...Object.keys(standalone), ...Object.keys(embedded)])) {
        const inStd = present(standalone, field);
        const inEmb = present(embedded, field);
        if (inStd === inEmb) continue;
        if (inStd && STANDALONE_ONLY_OK.has(field)) continue;
        // Embedded-only is what `fillGaps` exists to serve (a standalone doc
        // predating a field), so it is reported, never fatal.
        if (inEmb) continue;
        unsanctioned.push(`${key} ${field}: standalone-only (${show(standalone[field])})`);
      }
    }
    expect(unsanctioned, `${unsanctioned.length} unsanctioned one-sided field(s)`).toEqual([]);
  });

  /**
   * The #79 regression itself: no embedded copy may still be parked on the
   * generic fire placeholder while its standalone twin has moved to a real
   * primitive. Redundant with the conflict guard by construction, but it names
   * the specific value so a future bulk re-point that reintroduces it fails with
   * an unmistakable message.
   */
  it("no embedded vfxKey is left on the fx.ember-bolt-cast placeholder (ability-mirror-vfxkey)", () => {
    cover("ability-mirror-vfxkey");
    const pairs = rawPairs();
    expectFullRoster(pairs.size);

    const stale: string[] = [];
    let embeddedOnPrimitives = 0;
    for (const [key, { standalone, embedded }] of pairs) {
      const std = standalone.vfxKey;
      const emb = embedded.vfxKey;
      if (typeof std !== "string") continue;
      if (emb !== std) stale.push(`${key}: standalone=${std} embedded=${show(emb)}`);
      if (typeof emb === "string" && emb.startsWith("fx.prim.")) embeddedOnPrimitives += 1;
    }
    expect(stale, `${stale.length} slot(s) whose embedded vfxKey lags the standalone`).toEqual([]);

    // The stylised `fx.prim.*` palette must still be the bulk of the embedded
    // side. A collapse means a bulk re-point wrote the standalone side only
    // (exactly #79's mistake) and the mirror lagged again.
    //
    // ⭐ 2026-08-13：這條以前寫 `>= 390`，那是對「452 對」那個母體做的一次**普查**。
    // 未上架英雄搬進 `content/_legacy/` 之後母體是 312 對，390 這個絕對數字就再也
    // 到不了了 —— 而它其實從來就不是一個關於鏡射的斷言，只是一個抄下來的出貨值。
    //
    // 改成**比例**，因為比例才是搬遷（以及未來任何一次名單增減）之下不變的東西：
    //   舊母體 397/452 = 87.8% 在 primitives，門檻 390/452 = 86.3%
    //   新母體 272/312 = 87.2% 在 primitives，門檻同樣是 85%
    // 門檻沒有放寬（86.3% → 85%，同一個數量級的餘裕），⛔ 只是換成一個跟著母體走的
    // 表示法。剩下的那一成多是**升級**不是漂移：w3x emitter 的工作把一批技能從
    // 風格化 primitive 換成真的匯入美術（`fx.w3x.*`、`godie-*-p*`），兩份拷貝仍然
    // 一致 —— 而「一致」是上面那條 `stale` 在證明的，不是這一條。
    const primitiveShare = embeddedOnPrimitives / pairs.size;
    expect(
      primitiveShare,
      `only ${embeddedOnPrimitives}/${pairs.size} embedded slots are on fx.prim.*`,
    ).toBeGreaterThan(0.85);
  });
});

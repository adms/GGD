/**
 * w3x icon extraction (docs/todo/icons.md, task #33 EXTRACTION half).
 *
 * `tools/w3x-import/extract_icons.py` re-reads raw/war3map.{w3u,w3a,w3t}
 * (`uico`/`aart`/`iico` — fields the parsed inventory had dropped), converts
 * every icon whose path exists INSIDE GoDieEX22s.w3x (membership test, not
 * path prefix) from BLP to PNG under `content/assets/icons/…`, and additively
 * patches `icon` into champion docs (top-level + embedded Q/W/E/R), standalone
 * ability docs (incl. .ex) and item docs. STOCK Blizzard art gets NO field —
 * the client keeps its fallback rendering.
 *
 * IMPORTANT: this suite reads docs by DIRECT file path (not via
 * FsContentSource/ContentLoader) because the content indexes are only rebuilt
 * by `content:build` in the main session — same convention as
 * standinRoster.test.ts. It must stay green before AND after the reindex.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zChampionDoc, type ChampionDoc } from "./schema/champion";
import { zAbilityDoc } from "./schema/ability";
import { zItemDoc } from "./schema/item";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const ICON_DIR = join(CONTENT_DIR, "assets", "icons");

/** Coverage floors from the extraction run (ICONS.md); regeneration may only grow them. */
const FLOOR = { champions: 85, abilities: 13, items: 15 } as const;

/**
 * Pruned duplicate champions — must never get icon PNGs resurrected.
 *
 * `godie-o02n` LEFT this list at task #249. It was never a duplicate: the w3x
 * `Eme1`/`Emeu` fields show O02N is 曹操孟德's BASE unit and the shipped
 * `godie-o02o` is its 87-03 天下號令 TRANSFORM, so pruning the base left the hero
 * existing only in his transformed state. It is imported now and carries the
 * same (mis-assigned 皮卡丘) portrait bytes as its alternate form, which the
 * marquee's SHARED_PORTRAIT_GROUPS records.
 *
 * The four that remain really are un-imported alternate bodies with no docs.
 */
const PRUNED_IDS = ["godie-e010", "godie-h00w", "godie-n01b", "godie-o030"];

const ICON_RE = /^assets\/icons\/(champions|abilities|items)\/[a-z0-9.-]+\.(png|webp)$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Extensions an icon may ship as: legacy w3x extracts are 64² PNG, the
 *  AI-generated set is 128² WebP (tools/icon-gen/convert-webp.mjs). */
const ICON_EXTS = [".png", ".webp"] as const;

/** True when `file` really is the image format its extension claims. */
function magicOk(file: string, buf: Buffer): boolean {
  if (file.endsWith(".png")) return buf.subarray(0, 4).equals(PNG_MAGIC);
  // WebP is a RIFF container: "RIFF" <u32 size> "WEBP".
  return (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  );
}

function docs(collection: string): Array<{ file: string; doc: Record<string, unknown> }> {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({
      file: f,
      doc: JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
        string,
        unknown
      >,
    }));
}

/** On-disk icon files for a kind as `{ id, file }` (file = basename with ext). */
function iconFiles(kind: string): Array<{ id: string; file: string }> {
  const dir = join(ICON_DIR, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => ICON_EXTS.some((e) => f.endsWith(e)))
    .map((f) => ({ id: f.slice(0, f.lastIndexOf(".")), file: f }));
}

/** Every `icon` value found anywhere in the content tree (value -> referrers). */
function allIconRefs(): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const add = (icon: unknown, from: string) => {
    if (typeof icon !== "string") return;
    refs.set(icon, [...(refs.get(icon) ?? []), from]);
  };
  for (const { file, doc } of docs("champions")) {
    add(doc.icon, `champions/${file}`);
    const abilities = (doc.abilities ?? {}) as Record<string, { icon?: unknown }>;
    for (const slot of ["Q", "W", "E", "R"]) add(abilities[slot]?.icon, `champions/${file}#${slot}`);
  }
  for (const { file, doc } of docs("abilities")) add(doc.icon, `abilities/${file}`);
  for (const { file, doc } of docs("items")) add(doc.icon, `items/${file}`);
  return refs;
}

describe("w3x original icons (icons)", () => {
  it("every doc carrying an icon still parses as its strict schema (icon-schema-valid)", () => {
    cover("icon-schema-valid");
    for (const { file, doc } of docs("champions")) {
      const parsed = zChampionDoc.parse(doc); // throws on drift
      if (parsed.icon !== undefined) expect(parsed.icon, file).toMatch(ICON_RE);
      for (const slot of ["Q", "W", "E", "R"] as const) {
        const icon = (parsed as ChampionDoc).abilities[slot].icon;
        if (icon !== undefined) expect(icon, `${file}#${slot}`).toMatch(ICON_RE);
      }
    }
    for (const { file, doc } of docs("abilities")) {
      const parsed = zAbilityDoc.parse(doc);
      if (parsed.icon !== undefined) expect(parsed.icon, file).toMatch(ICON_RE);
    }
    for (const { file, doc } of docs("items")) {
      const parsed = zItemDoc.parse(doc);
      if (parsed.icon !== undefined) expect(parsed.icon, file).toMatch(ICON_RE);
    }
  });

  it("every icon ref resolves to a real image on disk (icon-refs-resolve)", () => {
    cover("icon-refs-resolve");
    const refs = allIconRefs();
    expect(refs.size).toBeGreaterThan(0);
    for (const [icon, from] of refs) {
      const abs = join(CONTENT_DIR, icon);
      expect(existsSync(abs), `${icon} (from ${from[0]})`).toBe(true);
      expect(magicOk(icon, readFileSync(abs)), `${icon} magic bytes`).toBe(true);
    }
  });

  /**
   * The whole-set 404 guard (task: AI icons -> WebP). The rename that moved 169
   * icons from .png to .webp lived entirely in string literals inside content
   * docs, so nothing in the type system could have caught a half-finished
   * migration — every icon would simply have 404'd at runtime. This pins the
   * round trip the client actually performs: doc `icon` field -> the URL
   * contentAssetUrl() builds -> a file that exists under content/.
   *
   * It asserts the count too: a rewrite that silently dropped icon fields would
   * otherwise pass an "all refs resolve" check vacuously.
   */
  it("every doc icon id resolves through the client's URL rule to a file (icon-url-roundtrip)", () => {
    cover("icon-url-roundtrip");
    // Mirrors apps/client/src/content/ContentDb.ts contentAssetUrl() and the
    // independent copy in apps/admin/src/content.ts: prefix check, no suffix logic.
    const contentAssetUrl = (p: string): string | null =>
      p.startsWith("assets/") ? `/content/${p}` : null;

    const refs = allIconRefs();
    expect(refs.size).toBeGreaterThanOrEqual(279);

    const byExt: Record<string, number> = {};
    for (const [icon, from] of refs) {
      const url = contentAssetUrl(icon);
      expect(url, `${icon} (from ${from[0]}) must resolve to a URL`).not.toBeNull();
      // Strip the /content/ mount back to a repo path — what nginx and the vite
      // ggd-serve-content middleware both do to find the file.
      const abs = join(CONTENT_DIR, url!.slice("/content/".length));
      expect(existsSync(abs), `${icon} -> ${url} is a 404 (from ${from[0]})`).toBe(true);
      const ext = icon.slice(icon.lastIndexOf("."));
      expect(ICON_EXTS, `${icon} unknown icon extension`).toContain(ext);
      byExt[ext] = (byExt[ext] ?? 0) + 1;
    }
    // The AI set is WebP and must stay that way — a regenerated batch that
    // silently reverted to PNG would blow the 16 MB back into the tree.
    expect(byExt[".webp"] ?? 0).toBeGreaterThanOrEqual(166);
  });

  it("extraction coverage floors hold per kind (icon-coverage-floor)", () => {
    cover("icon-coverage-floor");
    expect(iconFiles("champions").length).toBeGreaterThanOrEqual(FLOOR.champions);
    expect(iconFiles("abilities").length).toBeGreaterThanOrEqual(FLOOR.abilities);
    expect(iconFiles("items").length).toBeGreaterThanOrEqual(FLOOR.items);
  });

  /**
   * Every Q/W/E/R ability is stored TWICE: standalone at
   * `content/abilities/<cid>.<slot>.json` and denormalised into the champion at
   * `abilities[<slot>]`. The standalone doc is the source of truth
   * (packages/shared/src/sim/content/registry.ts) — but the embedded copy is
   * what raw-doc consumers read: the editor preview registers champions with
   * `overrideAbilities: true` (apps/editor/src/preview/PreviewController.ts),
   * which bypasses the gap-filling heal entirely, so an embedded slot with no
   * `icon` renders a BLANK ability tile there.
   *
   * WHY THIS TEST IS SHAPED THE WAY IT IS. It used to `continue` past a slot
   * whose standalone twin was absent, and it compared with a bare `expect`
   * inside the loop. Both hid breadth: `expect` throws on the FIRST mismatch,
   * so 424 desynced slots were reported to CI as a single failure on
   * `godie-e001.Q`, and a vanished twin would have been reported as nothing at
   * all. So: collect every discrepancy, assert the whole list at once, and make
   * an absent twin a COUNTED, ASSERTED outcome rather than a silent skip.
   */
  it("embedded Q/W/E/R icons agree with their standalone twins (icon-embed-standalone-agree)", () => {
    cover("icon-embed-standalone-agree");
    const champions = docs("champions");
    const missingTwin: string[] = [];
    const idMismatch: string[] = [];
    const disagree: string[] = [];
    let compared = 0;

    for (const { file, doc } of champions) {
      const cid = file.slice(0, -5);
      const abilities = (doc.abilities ?? {}) as Record<string, { id?: string; icon?: string }>;
      for (const slot of ["Q", "W", "E", "R"]) {
        const twinName = `${cid}.${slot.toLowerCase()}.json`;
        const twin = join(CONTENT_DIR, "abilities", twinName);
        // NOT a skip. A champion slot with no standalone doc means the loader's
        // `Abilities.tryGet(embedded.id)` misses and the embedded copy silently
        // becomes the source of truth — the exact shadowing the registry exists
        // to prevent. Record it and fail on it below.
        if (!existsSync(twin)) {
          missingTwin.push(`${cid}.${slot} -> abilities/${twinName}`);
          continue;
        }
        const standalone = JSON.parse(readFileSync(twin, "utf-8")) as { id?: string; icon?: string };
        compared += 1;
        // This suite pairs the two copies by FILENAME, but the loader pairs them
        // by `embedded.id`. If those ever diverge the comparison below silently
        // checks the wrong pair, so pin the assumption instead of trusting it.
        if (standalone.id !== abilities[slot]?.id) {
          idMismatch.push(`${cid}.${slot}: embedded id=${abilities[slot]?.id} twin id=${standalone.id}`);
        }
        // AUTHORITY MODEL, not strict equality. The standalone doc is the
        // source of truth (sim/content/registry.ts: "THE STANDALONE DOC IS THE
        // SOURCE OF TRUTH … an embedded copy may only fill in fields the
        // standalone doc omits"), and the AI icon pipeline's three writers
        // (tools/icon-gen/{local/batch.py,src/generate.py,local/wire_icon_fields.py})
        // all patch the TOP-LEVEL `icon` only. So 424 champion slots carrying
        // no embedded icon while their twin has one is the DESIGNED steady
        // state, not a defect — the loader's fillGaps supplies it at boot and
        // the HUD reads the healed object.
        //
        // Demanding equality would mean back-filling all 424 and teaching every
        // future writer to maintain a second copy. I tried exactly that: it
        // broke loader.test.ts and fieldAdoption.test.ts, and it re-creates the
        // shadow the registry doc-comment says has already cost this project
        // five separate bugs.
        //
        // What must never happen is an embedded icon that CONTRADICTS its twin,
        // because that one the heal cannot fix — fillGaps only fills gaps, so a
        // wrong-but-present value wins and ships stale art. That is the
        // invariant, and it is 0 violations today.
        const embeddedIcon = abilities[slot]?.icon;
        if (embeddedIcon !== undefined && standalone.icon !== embeddedIcon) {
          disagree.push(
            `${cid}.${slot}: standalone=${standalone.icon ?? "(none)"} embedded=${embeddedIcon}`,
          );
        }
      }
    }

    const sample = (xs: string[]) =>
      `${xs.length} case(s):\n${xs.slice(0, 20).join("\n")}${xs.length > 20 ? `\n…and ${xs.length - 20} more` : ""}`;

    expect(missingTwin, `champion slots with NO standalone twin doc — ${sample(missingTwin)}`).toEqual(
      [],
    );
    expect(idMismatch, `embedded/twin id pairing broken — ${sample(idMismatch)}`).toEqual([]);
    expect(disagree, `embedded/standalone icon desync — ${sample(disagree)}`).toEqual([]);
    // Vacuity guard: with no skips left, every champion MUST contribute exactly
    // four compared slots. Derived from the roster, so adding a champion never
    // breaks it — but a comparison loop that quietly stops running does.
    expect(champions.length).toBeGreaterThan(0);
    expect(compared).toBe(champions.length * 4);
  });

  it("EX docs carry an icon IFF their PNG exists — regen-safe (icon-ex-consistency)", () => {
    cover("icon-ex-consistency");
    let exWithIcon = 0;
    for (const { doc } of docs("champions")) {
      const ex = doc.exAbility as string | undefined;
      if (ex === undefined) continue;
      const exDocPath = join(CONTENT_DIR, "abilities", `${ex}.json`);
      expect(existsSync(exDocPath), `${ex} doc`).toBe(true);
      const exDoc = JSON.parse(readFileSync(exDocPath, "utf-8")) as { icon?: string };
      const ext = ICON_EXTS.find((e) => existsSync(join(ICON_DIR, "abilities", `${ex}${e}`)));
      if (ext !== undefined) {
        expect(exDoc.icon, `${ex} icon field`).toBe(`assets/icons/abilities/${ex}${ext}`);
        exWithIcon += 1;
      } else {
        expect(exDoc.icon, `${ex} must not fabricate an icon`).toBeUndefined();
      }
    }
    expect(exWithIcon).toBeGreaterThanOrEqual(1);
  });

  it("no orphan or resurrected PNGs on disk (icon-no-orphans)", () => {
    cover("icon-no-orphans");
    const referenced = new Set(allIconRefs().keys());
    for (const kind of ["champions", "abilities", "items"] as const) {
      for (const { id, file } of iconFiles(kind)) {
        expect(referenced.has(`assets/icons/${kind}/${file}`), `${kind}/${file}`).toBe(true);
        for (const pruned of PRUNED_IDS) {
          expect(id === pruned || id.startsWith(`${pruned}.`), `${id} pruned champion`).toBe(false);
        }
      }
    }
  });
});

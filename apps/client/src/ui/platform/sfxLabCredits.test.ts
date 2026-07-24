/**
 * sfxLabCredits — the 効果音ラボ per-clip listing must stay TRUE, not merely present.
 *
 * The owner authorised these downloads on one condition:
 * 「只要好好列出附記在授權頁面就好」 — every clip properly listed on the licence
 * page. A listing that silently drifts from what actually ships would break that
 * condition without anyone noticing, so these assertions pin it to the two files
 * that are the ground truth:
 *   - content/assets/audio/sfx/lab/ + audio/voice-jp/ (what is ON DISK)
 *   - content/config/audio-map.json                   (what is actually BOUND)
 * Both belong to other lanes. If one of them changes, the fix is to regenerate
 * this listing to match — never to relax the test.
 *
 * The second thing pinned here is licence SHAPE: 効果音ラボ's terms make credit
 * OPTIONAL (商用可・報告不要・クレジット任意), so none of this may be promoted
 * into the mandatory-attribution bucket; the CC-BY login dragon stays the one
 * mandatory in-game credit (asserted in creditsData.test.ts).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  SFX_LAB_CLIPS,
  SFX_LAB_GROUPS,
  SFX_LAB_BOUND_COUNT,
  SFX_LAB_MAPPED_BUT_SILENT,
} from "./sfxLabCredits";
import { isPlayableSfxKey } from "../../audio/sfxReachability";
import { CREDITS } from "./creditsData";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const LAB_DIR = join(REPO, "content/assets/audio/sfx/lab");
const VOICE_DIR = join(REPO, "content/assets/audio/voice-jp");

/** lab/voice file → the audio-map sfx keys that resolve to it, sorted. */
function mapKeysByFile(): Map<string, string[]> {
  const map = JSON.parse(readFileSync(join(REPO, "content/config/audio-map.json"), "utf8")) as {
    sfx: Record<string, { files?: string[] }>;
  };
  const out = new Map<string, string[]>();
  for (const [event, entry] of Object.entries(map.sfx)) {
    for (const f of entry.files ?? []) {
      const m = /assets\/audio\/(sfx\/lab\/.+|voice-jp\/.+)$/.exec(f);
      if (m) out.set(m[1]!, [...(out.get(m[1]!) ?? []), event].sort());
    }
  }
  return out;
}

function audioFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...audioFiles(join(dir, e.name), `${prefix}${e.name}/`));
    else if (/\.(mp3|wav|ogg)$/i.test(e.name)) out.push(prefix + e.name);
  }
  return out;
}

describe("sfxLabCredits", () => {
  it("lists EVERY 効果音ラボ file that ships — nothing on disk is missing from the page", () => {
    cover("credits-data");
    const listed = new Set(SFX_LAB_CLIPS.map((c) => c.file));
    const onDisk = [
      ...audioFiles(LAB_DIR).map((f) => `sfx/lab/${f}`),
      ...audioFiles(VOICE_DIR).map((f) => `voice-jp/${f}`),
    ];
    expect(onDisk.length).toBeGreaterThan(0);
    for (const f of onDisk) expect(listed, `not credited: ${f}`).toContain(f);
    // and nothing listed that no longer ships — a stale row is a false claim too.
    expect([...listed].sort()).toEqual([...onDisk].sort());
  });

  it("transcribes mapKeys exactly as content/config/audio-map.json binds them", () => {
    cover("credits-data");
    for (const c of SFX_LAB_CLIPS) {
      expect([...c.mapKeys].sort(), `binding drift for ${c.file}`).toEqual(mapKeysByFile().get(c.file) ?? []);
    }
  });

  /**
   * THE CLAIM THE PAGE ACTUALLY MAKES. 「使用中」 says the game will PLAY the clip,
   * which an audio-map entry alone never proved — the map is written by the same
   * lane as the ledger, so measuring the ledger against it measured nothing. The
   * verdict is now `mapKeys ∩ PLAYABLE_SFX_KEYS`, and every member of that set is
   * anchored to an emit site and to the fan-out whitelist by
   * audio/sfxReachability.test.ts. These assertions pin the derivation itself:
   * the ledger may only ever weaken the map's claim, never strengthen it.
   */
  it("only calls a clip 使用中 when code can actually play it", () => {
    cover("credits-data");
    for (const c of SFX_LAB_CLIPS) {
      // boundKeys ⊆ mapKeys: the page can never claim a binding the map lacks.
      for (const k of c.boundKeys) expect(c.mapKeys, `${c.file} claims unmapped key ${k}`).toContain(k);
      // and every bound key is genuinely reachable
      for (const k of c.boundKeys) {
        expect(isPlayableSfxKey(k), `${c.file} calls ${k} 使用中 but nothing plays it`).toBe(true);
      }
      // the split is exhaustive — no mapped key is quietly dropped from both sides
      expect([...c.boundKeys, ...c.silentKeys].sort()).toEqual([...c.mapKeys].sort());
      expect(c.silentReasons.length).toBe(c.silentKeys.length);
      for (const r of c.silentReasons) expect(r.length).toBeGreaterThan(0);
    }
    expect(SFX_LAB_BOUND_COUNT).toBe(SFX_LAB_CLIPS.filter((c) => c.boundKeys.length > 0).length);
  });

  /**
   * The three archery / 魔法陣 clips are the ones that exposed the defect: they
   * had a map entry and no emit site, so the old definition badged them 使用中
   * while nothing in the client could reach them. They are wired now, and this
   * pins that — if a lane removes their trigger, the page must stop claiming them
   * rather than silently keep the badge.
   */
  it("holds the line on the clips that exposed the map-only defect", () => {
    cover("credits-data");
    for (const file of ["sfx/lab/arrow-release.mp3", "sfx/lab/arrow-pierce.mp3", "sfx/lab/cast-circle.mp3"]) {
      const clip = SFX_LAB_CLIPS.find((c) => c.file === file)!;
      expect(clip, `missing ${file}`).toBeDefined();
      expect(clip.boundKeys.length, `${file} is no longer reachable — fix the trigger or the badge`).toBe(1);
      expect(clip.silentKeys).toEqual([]);
    }
    // and the three that genuinely ship unused stay unused, with a note saying so
    for (const file of ["sfx/lab/block-clash.mp3", "sfx/lab/block-shield.mp3", "sfx/lab/impact-heavy.mp3"]) {
      const clip = SFX_LAB_CLIPS.find((c) => c.file === file)!;
      expect(clip.mapKeys, `${file} gained a map entry — recheck the ledger note`).toEqual([]);
      expect(clip.boundKeys).toEqual([]);
      expect(clip.use).toContain("備而未用");
    }
  });

  /**
   * A clip the audio map binds but no code can reach is exactly what the old
   * definition mis-reported as 使用中. It is a WIRING regression, not a credits
   * bug — but the credits page is where it becomes a false public claim, so this
   * is the alarm. If this ever goes red, wire the cue or drop the map entry; do
   * NOT relax it.
   */
  it("has no clip that is mapped but silent", () => {
    cover("credits-data");
    const offenders = SFX_LAB_MAPPED_BUT_SILENT.map((c) => `${c.file} (${c.silentKeys.join(", ")})`);
    expect(offenders, `mapped but nothing plays them: ${offenders.join("; ")}`).toEqual([]);
  });

  /**
   * The ledger's OTHER claim is provenance, and it has the same shape of risk as
   * the binding claim did: the header promises every title/file/URL is copied
   * from the acquisition manifests, and nothing checked it. Two of the manifests'
   * three waves record provenance as structured fields; the backfilled wave
   * records it as prose with the URL inline. So structured rows are compared
   * field-for-field, and the rest must at least appear VERBATIM in the manifest
   * text — which is the difference between transcribed and invented.
   *
   * (This is what caught the eight voice-jp rows shipping with no `url` at all
   * while voice-jp/MANIFEST.json had recorded a direct one for each.)
   */
  it("transcribes provenance from the acquisition manifests, and invents nothing", () => {
    cover("credits-data");
    const labRaw = readFileSync(join(REPO, "content/assets/audio/sfx/lab/MANIFEST.json"), "utf8");
    const voiceRaw = readFileSync(join(REPO, "content/assets/audio/voice-jp/MANIFEST.json"), "utf8");
    const structured = new Map<string, Record<string, string>>();
    const collect = (raw: string): void => {
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        const o = node as Record<string, unknown>;
        const f = o.file;
        if (typeof f === "string" && f.endsWith(".mp3") && typeof o.sourceTitle === "string") {
          structured.set(f.split("/").pop()!, o as Record<string, string>);
        }
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(raw));
    };
    collect(labRaw);
    collect(voiceRaw);

    let checkedStructured = 0;
    for (const c of SFX_LAB_CLIPS) {
      const entry = structured.get(c.file.split("/").pop()!);
      if (entry) {
        checkedStructured++;
        expect(c.title, `title drift for ${c.file}`).toBe(entry.sourceTitle);
        expect(c.sourceFile, `sourceFile drift for ${c.file}`).toBe(entry.sourceFile);
        expect(c.url, `url drift for ${c.file}`).toBe(entry.sourceUrl);
        expect(c.page, `page drift for ${c.file}`).toBe(entry.sourcePage);
        continue;
      }
      // Backfilled wave: provenance lives in prose, so require verbatim presence.
      if (c.url) expect(labRaw, `url not found in the manifest for ${c.file}`).toContain(c.url);
      if (c.sourceFile) {
        expect(labRaw, `sourceFile not found in the manifest for ${c.file}`).toContain(c.sourceFile);
      }
      expect(labRaw, `title not found in the manifest for ${c.file}`).toContain(c.title);
    }
    expect(checkedStructured, "the structured-manifest join broke").toBeGreaterThan(30);
  });

  it("never fabricates provenance — every URL is soundeffect-lab.info, and page-only stays page-only", () => {
    cover("credits-data");
    for (const c of SFX_LAB_CLIPS) {
      expect(c.title, `no source title for ${c.file}`).toBeTruthy();
      for (const u of [c.url, c.page].filter(Boolean) as string[]) {
        expect(u.startsWith("https://soundeffect-lab.info/"), `foreign source: ${u}`).toBe(true);
      }
      // Every row must let a reader reach the source somehow.
      expect(c.url ?? c.page, `no source link for ${c.file}`).toBeTruthy();
    }
    // arenaAmbience is the one clip whose exact source FILE was never recorded.
    // It is listed honestly with page-level provenance; do not invent a sourceUrl.
    const arena = SFX_LAB_CLIPS.find((c) => c.file.endsWith("arenaAmbience.mp3"))!;
    expect(arena.url).toBeUndefined();
    expect(arena.sourceFile).toBeUndefined();
    expect(arena.page).toContain("soundeffect-lab.info");
    // and it is the ONLY one, as the header claims. The eight voice-jp rows used
    // to be silently page-only too, while their manifest recorded a direct URL —
    // an understated row is still a row that does not say what the record says.
    expect(SFX_LAB_CLIPS.filter((c) => !c.url).map((c) => c.file)).toEqual([
      "sfx/lab/arenaAmbience.mp3",
    ]);
  });

  it("every clip carries a usage line and a real group", () => {
    cover("credits-data");
    const ids = new Set(SFX_LAB_GROUPS.map((g) => g.id));
    for (const c of SFX_LAB_CLIPS) {
      expect(c.use.length, `no usage text for ${c.file}`).toBeGreaterThan(0);
      expect(ids, `unknown group on ${c.file}`).toContain(c.group);
    }
    // no empty group headings on the page
    for (const g of SFX_LAB_GROUPS) {
      expect(SFX_LAB_CLIPS.some((c) => c.group === g.id), `empty group ${g.id}`).toBe(true);
    }
  });

  it("stays in the COURTESY bucket — credit is optional under the pack's own licence", () => {
    cover("credits-data");
    const lab = CREDITS.find((c) => c.title.includes("効果音ラボ"))!;
    expect(lab.mandatory).toBe(false);
    expect(lab.license).toContain("クレジット任意");
    // The page must say plainly that attribution is optional and listed by choice.
    expect(lab.terms).toContain("任意");
    // The live prohibitions still have to be restated (creditsData.test.ts pins these too).
    expect(lab.terms).toContain("AI");
    expect(lab.terms).toContain("裁切");
  });
});

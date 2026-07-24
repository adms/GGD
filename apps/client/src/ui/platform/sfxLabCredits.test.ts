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
import { SFX_LAB_CLIPS, SFX_LAB_GROUPS, SFX_LAB_BOUND_COUNT } from "./sfxLabCredits";
import { CREDITS } from "./creditsData";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const LAB_DIR = join(REPO, "content/assets/audio/sfx/lab");
const VOICE_DIR = join(REPO, "content/assets/audio/voice-jp");

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

  it("marks bound/unbound exactly as content/config/audio-map.json does", () => {
    cover("credits-data");
    const map = JSON.parse(readFileSync(join(REPO, "content/config/audio-map.json"), "utf8")) as {
      sfx: Record<string, { files?: string[] }>;
    };
    const actual = new Map<string, string[]>();
    for (const [event, entry] of Object.entries(map.sfx)) {
      for (const f of entry.files ?? []) {
        const m = /assets\/audio\/(sfx\/lab\/.+|voice-jp\/.+)$/.exec(f);
        if (m) actual.set(m[1]!, [...(actual.get(m[1]!) ?? []), event].sort());
      }
    }
    for (const c of SFX_LAB_CLIPS) {
      expect([...c.boundKeys].sort(), `binding drift for ${c.file}`).toEqual(actual.get(c.file) ?? []);
    }
    expect(SFX_LAB_BOUND_COUNT).toBe(actual.size);
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

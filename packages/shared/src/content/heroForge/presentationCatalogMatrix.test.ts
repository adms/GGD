import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zConfigAudioMapDoc } from "../schema/config";
import { zModelDoc } from "../schema/model";
import { zVfxCollectionDoc } from "../schema/vfx";
import {
  HERO_DISTRIBUTABLE_ABILITY_SFX_KEYS,
  buildHeroAssetLocks,
  defaultHeroPresentation,
  validateHeroPresentation,
  type HeroAssetEvidence,
  type HeroPresentationCatalog,
} from "./presentation";

const ROOT = join(import.meta.dirname, "../../../../..");
const docs = (folder: string): unknown[] => {
  const index = JSON.parse(readFileSync(join(ROOT, "content", folder, "_index.json"), "utf8")) as { entries: Array<{ path: string }> };
  return index.entries.map((entry) => JSON.parse(readFileSync(join(ROOT, "content", entry.path), "utf8")));
};
const evidence = (path: string): HeroAssetEvidence => ({ path, byteSize: 1, mediaType: path.endsWith(".glb") ? "model/gltf-binary" : path.endsWith(".mp3") ? "audio/mpeg" : "image/png", sha256: "a".repeat(64) });

describe("hero presentation live catalog matrix", () => {
  it("classifies every model as shippable or an explicit non-distributable block", () => {
    const failures: string[] = [];
    let cases = 0;
    for (const raw of docs("models")) {
      const parsed = zModelDoc.safeParse(raw);
      if (!parsed.success) { failures.push("invalid model schema"); continue; }
      cases += 1;
      const model = parsed.data;
      const presentation = defaultHeroPresentation();
      presentation.modelKey = model.id;
      const catalog: HeroPresentationCatalog = { models: { [model.id]: model }, vfx: {}, audioSfx: {}, assets: { [model.glbPath]: evidence(model.glbPath) } };
      presentation.assetLocks = buildHeroAssetLocks(presentation, catalog);
      const report = validateHeroPresentation(presentation, catalog);
      const blockedOverlay = model.glbPath.startsWith("assets/blizzard-local/");
      if (blockedOverlay !== report.issues.some((issue) => issue.code === "NON_DISTRIBUTABLE_ASSET")) failures.push(model.id);
      if (!blockedOverlay && report.status !== "pass") failures.push(`${model.id}:${report.issues.map((issue) => issue.code).join(",")}`);
    }
    expect(cases).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });

  it("classifies every VFX registry document without treating preview-only channels as shippable", () => {
    const model = zModelDoc.parse(docs("models").find((raw) => (raw as { id?: string }).id === "champ.thorne"));
    const failures: string[] = [];
    let shippable = 0;
    let blocked = 0;
    for (const raw of docs("vfx")) {
      const parsed = zVfxCollectionDoc.safeParse(raw);
      if (!parsed.success) { failures.push(`${(raw as { id?: string }).id ?? "unknown"}:schema`); continue; }
      const vfx = parsed.data;
      const presentation = defaultHeroPresentation();
      presentation.modelKey = model.id;
      presentation.slots.Q.vfxLayers = [{ vfxKey: vfx.id }];
      const assets = { [model.glbPath]: evidence(model.glbPath), ...(vfx.schema === "vfx@1" && vfx.texture ? { [vfx.texture]: evidence(vfx.texture) } : {}) };
      const catalog: HeroPresentationCatalog = { models: { [model.id]: model }, vfx: { [vfx.id]: vfx }, audioSfx: {}, assets };
      presentation.assetLocks = buildHeroAssetLocks(presentation, catalog);
      const report = validateHeroPresentation(presentation, catalog);
      const previewOnly = vfx.schema === "ribbon@1" || vfx.schema === "attachment@1" || (vfx.schema === "vfx@1" && (vfx.ambient === true || vfx.anchorBone !== undefined));
      if (previewOnly) {
        blocked += 1;
        if (report.status !== "fail") failures.push(`${vfx.id}:preview accepted`);
      } else {
        shippable += 1;
        if (report.status !== "pass") failures.push(`${vfx.id}:${report.issues.map((issue) => issue.code).join(",")}`);
      }
    }
    expect(shippable).toBeGreaterThan(100);
    expect(blocked).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });

  it("keeps every public ability cue in the actual audio registry", () => {
    const audio = zConfigAudioMapDoc.parse(JSON.parse(readFileSync(join(ROOT, "content/config/audio-map.json"), "utf8")));
    for (const key of HERO_DISTRIBUTABLE_ABILITY_SFX_KEYS) {
      expect(audio.sfx[key]?.files.length, key).toBeGreaterThan(0);
      expect(audio.sfx[key]!.files.every((path) => path.startsWith("assets/"))).toBe(true);
    }
  });
});

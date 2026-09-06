import {
  parseInlineVfxScriptDoc,
  type VfxScriptDoc,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";
import hjaiE from "./acceptance-fixtures/godie-hjai.e.json";
import hjaiR from "./acceptance-fixtures/godie-hjai.r.json";
import hartR from "./acceptance-fixtures/godie-hart.r.json";
import nbbcR from "./acceptance-fixtures/godie-nbbc.r.json";
import nbbcE from "./acceptance-fixtures/godie-nbbc.e.json";
import ogrhR from "./acceptance-fixtures/godie-ogrh.r.json";
import e002Ex from "./acceptance-fixtures/godie-e002.ex.json";
import hvshR from "./acceptance-fixtures/godie-hvsh.r.json";
import { buildVfxForgeRecipe } from "./recipes";
export { acceptanceFixtureVisualGaps } from "./acceptanceVisualGaps";
import {
  completeActionAnimations,
  type ActionTimelineCue,
} from "./actionAnimationPrinciples";

/**
 * These eight scripts test whether VFX Forge can express the requested scenes.
 * They are deliberately bundled with the Editor, outside content/, and every
 * server-side promotion path independently knows the same IDs are fixtures.
 */
const FIXTURES: Readonly<Record<string, unknown>> = {
  "godie-hjai.e": hjaiE,
  "godie-hjai.r": hjaiR,
  "godie-hart.r": hartR,
  "godie-nbbc.r": nbbcR,
  "godie-nbbc.e": nbbcE,
  "godie-ogrh.r": ogrhR,
  "godie-e002.ex": e002Ex,
  "godie-hvsh.r": hvshR,
};

const FIXTURE_ALIASES: Readonly<Record<string, string>> = {
  "godie-h020.e": "godie-hjai.e",
  "godie-o00x.r": "godie-ogrh.r",
  "godie-e00l.ex": "godie-e002.ex",
};

const GENERATED_FIXTURES = new Set([
  "godie-e00l.r",
  "godie-udea.r",
  "godie-h01n.r",
  "godie-h00l.r",
]);

export const VFX_FORGE_REFERENCE_SCENES = [
  ["godie-hjai.e", "04-03 龍破斬"],
  ["godie-hjai.r", "04-04 神滅斬"],
  ["godie-hart.r", "01-04 超究武神霸斬"],
  ["godie-nbbc.r", "08-04 阿邦快速劍X"],
  ["godie-nbbc.e", "08-03 龍鬥氣砲咒文"],
  ["godie-ogrh.r", "09-04 龜派氣功"],
  ["godie-e002.ex", "20-002 理想鄉EX"],
  ["godie-hvsh.r", "48-04 騎英之手綱"],
] as const;

/** Historical eight video-reference scenes and their existing proof artifacts. */
export const VFX_FORGE_ACCEPTANCE = VFX_FORGE_REFERENCE_SCENES;

/** All reusable Editor fixtures: original references plus Main's strict 11 docs. */
export const VFX_FORGE_FIXTURE_SCENES = [
  ...VFX_FORGE_REFERENCE_SCENES,
  ["godie-h020.e", "04-03 龍破斬（鏡像）"],
  ["godie-o00x.r", "09-04 龜派氣功（鏡像）"],
  ["godie-e00l.r", "20-04 Avalon 防禦窗"],
  ["godie-e00l.ex", "20-002 理想鄉EX（新版）"],
  ["godie-udea.r", "65-04 天譴"],
  ["godie-h01n.r", "79-04 卍解"],
  ["godie-h00l.r", "60-04 完美盾反"],
] as const;

export function acceptanceFixtureFor(
  abilityId: string,
  requiredTimelineCues: readonly ActionTimelineCue[] = [],
): VfxScriptDoc | null {
  const sourceId = FIXTURE_ALIASES[abilityId] ?? abilityId;
  const raw = FIXTURES[sourceId];
  if (raw === undefined && !GENERATED_FIXTURES.has(abilityId)) return null;
  const base = raw === undefined
    ? parseInlineVfxScriptDoc({
        id: `editor-fixture.${abilityId}`,
        schema: "vfx-script@1",
        abilityId,
        segments: [{ kind: "sound", on: "castEffect", soundKey: "ability.cast" }],
      })
    : parseInlineVfxScriptDoc({
        ...(structuredClone(raw) as VfxScriptDoc),
        id: `editor-fixture.${abilityId}`,
        abilityId,
      });
  // Fixtures deliberately expand the same reusable recipe helpers exposed by
  // the Forge UI. This proves the scenes are composed from bricks rather than
  // maintained as eight unrelated, hand-written effects.
  const segments = compose(abilityId, base.segments);
  return parseInlineVfxScriptDoc({
    ...base,
    segments: completeActionAnimations(segments, {
      activationMode: abilityId === "godie-e002.ex" || abilityId === "godie-e00l.ex" ? "passive" : "active",
      requiredTimelineCues,
    }),
  });
}

function withoutKinds(
  segments: readonly VfxScriptSegment[],
  kinds: readonly VfxScriptSegment["kind"][],
): VfxScriptSegment[] {
  return segments.filter((segment) => !kinds.includes(segment.kind));
}

function compose(abilityId: string, base: readonly VfxScriptSegment[]): VfxScriptSegment[] {
  switch (abilityId) {
    case "godie-hjai.e":
    case "godie-h020.e":
      return [...withoutKinds(base, ["modelFx", "vfx", "screenShake"]), ...buildVfxForgeRecipe("line-blast-fire", { activationMode: "active" })];
    case "godie-hjai.r":
      return [
        ...base.filter((segment) => segment.on === "castStart"),
        ...buildVfxForgeRecipe("dash-slash-void", { activationMode: "active" }),
      ];
    case "godie-nbbc.r":
      return [
        ...base.filter((segment) => segment.on === "castStart"),
        ...buildVfxForgeRecipe("shockwave-dash-light", { activationMode: "active" }),
      ];
    case "godie-hart.r":
      return [...withoutKinds(base, ["anim", "vfx", "modelFx"]), ...buildVfxForgeRecipe("combo-slash-holy", { activationMode: "active" })];
    case "godie-nbbc.e":
    case "godie-ogrh.r":
    case "godie-o00x.r": {
      const recipe = abilityId === "godie-ogrh.r" || abilityId === "godie-o00x.r" ? "classic-beam-fire" : "classic-beam-blue";
      return [...withoutKinds(base, ["anim", "modelFx", "vfx"]), ...buildVfxForgeRecipe(recipe, { activationMode: "active" })];
    }
    case "godie-hvsh.r":
      return buildVfxForgeRecipe("rider-dash-beam-blue", { activationMode: "active" });
    case "godie-e002.ex":
    case "godie-e00l.ex":
      return buildVfxForgeRecipe("avalon-counter-chain", { activationMode: "passive" });
    case "godie-e00l.r":
      return buildVfxForgeRecipe("avalon-guard-window", { activationMode: "active" });
    case "godie-udea.r":
      return buildVfxForgeRecipe("chain-lightning-storm", { activationMode: "active" });
    case "godie-h01n.r":
      return buildVfxForgeRecipe("bankai-transform", { activationMode: "active" });
    case "godie-h00l.r":
      return buildVfxForgeRecipe("perfect-parry", { activationMode: "active" });
    default:
      return [...base];
  }
}

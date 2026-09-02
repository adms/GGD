import {
  zVfxScriptDoc,
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

export const VFX_FORGE_ACCEPTANCE = [
  ["godie-hjai.e", "04-03 龍破斬"],
  ["godie-hjai.r", "04-04 神滅斬"],
  ["godie-hart.r", "01-04 超究武神霸斬"],
  ["godie-nbbc.r", "08-04 阿邦快速劍X"],
  ["godie-nbbc.e", "08-03 龍鬥氣砲咒文"],
  ["godie-ogrh.r", "09-04 龜派氣功"],
  ["godie-e002.ex", "20-002 理想鄉EX"],
  ["godie-hvsh.r", "48-04 騎英之手綱"],
] as const;

export function acceptanceFixtureFor(
  abilityId: string,
  requiredTimelineCues: readonly ActionTimelineCue[] = [],
): VfxScriptDoc | null {
  const raw = FIXTURES[abilityId];
  if (raw === undefined) return null;
  const base = zVfxScriptDoc.parse(structuredClone(raw));
  // Fixtures deliberately expand the same reusable recipe helpers exposed by
  // the Forge UI. This proves the scenes are composed from bricks rather than
  // maintained as eight unrelated, hand-written effects.
  const segments = compose(abilityId, base.segments);
  return zVfxScriptDoc.parse({
    ...base,
    segments: completeActionAnimations(segments, {
      activationMode: abilityId === "godie-e002.ex" ? "passive" : "active",
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
    case "godie-ogrh.r": {
      const recipe = abilityId === "godie-ogrh.r" ? "classic-beam-fire" : "classic-beam-blue";
      return [...withoutKinds(base, ["modelFx", "vfx"]), ...buildVfxForgeRecipe(recipe, { activationMode: "active" })];
    }
    case "godie-hvsh.r":
      return buildVfxForgeRecipe("rider-dash-beam-blue", { activationMode: "active" });
    case "godie-e002.ex":
      return buildVfxForgeRecipe("avalon-counter-chain", { activationMode: "passive" });
    default:
      return [...base];
  }
}

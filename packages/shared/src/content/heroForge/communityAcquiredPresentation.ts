import type { CommunityHeroExample, Move } from "./communityExamples";
import { HERO_SLOTS } from "./constants";
import type { VfxScriptEntry, VfxScriptSegment } from "../schema/vfxScript";

type Theme = "arcane" | "ice" | "fire" | "physical" | "holy" | "void" | "nature" | "lightning" | "earth";
const themes: Record<string, Theme> = {
  "acquired-jetragon": "arcane", "acquired-astralym": "void", "acquired-cattiva": "physical", "acquired-dio": "holy",
  "acquired-morgiana": "fire", "acquired-zero": "lightning", "acquired-emilia": "ice", "acquired-ram": "nature", "acquired-beatrice": "arcane",
  "acquired-mario": "fire", "acquired-mewtwo": "arcane", "acquired-pokemon-trainer": "nature", "acquired-ryu": "physical", "acquired-minecraft": "earth",
  "acquired-kita-kita": "holy", "acquired-wargreymon": "fire", "acquired-saya": "void", "acquired-naruto": "arcane",
  "acquired-lord-nightmares": "holy", "acquired-rim": "fire", "acquired-xiaodangjia": "holy", "acquired-inuyasha": "physical",
  "acquired-asuna": "holy", "acquired-alice": "holy", "acquired-leafa": "nature", "acquired-kuroyukihime": "void",
  "godie-hlgr": "lightning", "godie-eevi": "physical", "godie-e00q": "void", "godie-usyl": "void", "godie-nbst": "holy",
  "godie-nman": "arcane", "godie-e00t": "void", "godie-h021": "lightning",
};
const colors: Record<Theme, [number, number, number]> = {
  arcane: [170, 125, 255], ice: [110, 210, 255], fire: [255, 140, 70], physical: [225, 215, 195], holy: [255, 215, 110],
  void: [170, 80, 185], nature: [130, 225, 155], lightning: [115, 205, 250], earth: [200, 150, 95],
};
// These existing audio-map entries all have distributable local files. This is
// GGD sound design, not a claim to have restored each franchise's original SFX.
const sound: Record<Theme, string> = {
  arcane: "hitMagic", ice: "hitMagic", fire: "hitMagic", physical: "hit", holy: "block", void: "hitMagic", nature: "block", lightning: "hitMagic", earth: "hit",
};
const findKinds = (value: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach((v) => findKinds(v, out));
  else if (value && typeof value === "object") {
    if (typeof (value as { kind?: unknown }).kind === "string") out.add((value as { kind: string }).kind);
    Object.values(value).forEach((v) => findKinds(v, out));
  }
  return out;
};
function cue(move: Move, theme: Theme): Extract<VfxScriptSegment, { kind: "vfx" }> {
  const kinds = findKinds(move.params);
  const ref = move.ref;
  const self = move.params.castType === "self" || /buff-self|instant-blast|orbit-array/.test(ref);
  const ground = move.params.castType === "ground" || /ground-nova|periodic-field|apply-status|random-barrage/.test(ref);
  const friendly = /ally-shield|heal/.test(ref);
  const at = self || (friendly && move.params.target === "self") ? "self" : ground || move.params.target === "area" ? "point" : "target";
  const projectile = kinds.has("spawnProjectile") || ref === "tpl-projectile-strike";
  const line = /line-|traveling-wave/.test(ref);
  return {
    kind: "vfx", on: projectile ? "projectileHit" : "castEffect", at: line ? "self" : at,
    vfxId: line ? `fx.prim.${theme}.beam` : `fx.prim.${theme}.${theme === "ice" || theme === "earth" ? "pulse-sm" : "pulse"}`,
    tint: colors[theme], w3xScale: 0.7,
    ...(line ? { offsetForwardU: 0.35, flyHeight: 55 } : {}),
  };
}
export function withAcquiredPresentation(recipe: CommunityHeroExample): CommunityHeroExample {
  const theme = themes[recipe.id] ?? "arcane";
  const authoredPresentation = { ...recipe.authoredPresentation };
  for (const slot of HERO_SLOTS) {
    if (slot === "PASSIVE" || authoredPresentation[slot]) continue;
    const move = recipe.moves[slot];
    // Learned passives in active slots have no cast event; retain that fact.
    if (/event-passive|on-attack|on-hit-react|growth-charge|mark-stacks/.test(move.ref) || move.abilityOverrides?.isPassiveOnly === true) continue;
    const segments: VfxScriptEntry[] = [
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast", replaces: "caster.action" },
      cue(move, theme), { kind: "sound", on: "castEffect", soundKey: sound[theme] },
    ];
    authoredPresentation[slot] = { yields: ["caster.castFx"], segments,
      notes: "採用已出貨 GGD 特效與音效。施法提示不代表傷害或資源消耗成功；判定依技能資料。非原作特效與語音還原。" };
  }
  return { ...recipe, authoredPresentation };
}

import type { AbilityDef, EffectDef } from "@ggd/shared/sim";

/**
 * A preview-only receipt for one cosmetic brick inserted beside a real
 * EffectDef node.  The path points into the cloned runtime definition; it is
 * evidence for the 42/46 audit and is never a content write instruction.
 */
export interface MechanicVisualAddition {
  readonly path: string;
  readonly afterKind: EffectDef["kind"];
  readonly vfxId: string;
  readonly at: "self" | "target" | "point";
}

export interface MechanicVisualPreview {
  /** null means the structured graph already had all of the selected cues. */
  readonly definition: AbilityDef | null;
  readonly additions: readonly MechanicVisualAddition[];
}

type VisualFamily =
  | "arcane"
  | "fire"
  | "holy"
  | "ice"
  | "ki"
  | "lightning"
  | "nature"
  | "physical"
  | "void"
  | "wind";

type SpawnVfxEffect = Extract<EffectDef, { kind: "spawnVfx" }>;

const EFFECT_LIST_KEYS = new Set([
  "effects",
  "finalEffects",
  "finisher",
  "onArrive",
  "onDevour",
  "onEnd",
  "onHit",
  "onHitTargets",
  "onLand",
  "onTouch",
  "perStrike",
]);

const STRUCTURED_FAMILY_KEYS = new Set([
  "buffId",
  "damageType",
  "formId",
  "projectileId",
  "resource",
  "stat",
  "statusId",
  "vfxId",
  "vfxKey",
]);

const FAMILY_RULES: readonly [VisualFamily, RegExp][] = [
  ["fire", /(?:burn|fire|flame|inferno|magma|ignite)/i],
  ["lightning", /(?:chain|electric|lightning|shock|thunder)/i],
  ["ice", /(?:cold|freeze|frost|ice)/i],
  ["nature", /(?:heal|leaf|nature|plant|poison|seed|treant|wood)/i],
  ["holy", /(?:divine|gold|holy|light|revive|shield)/i],
  ["void", /(?:curse|dark|death|shadow|void)/i],
  ["wind", /(?:air|cyclone|storm|tornado|wind)/i],
  ["ki", /(?:beam|energy|ki|qigong)/i],
  ["physical", /(?:ad|armor|bleed|physical|slash|stun)/i],
];

const PRESENTATION_KINDS = new Set<EffectDef["kind"]>([
  "floatingText",
  "screenFlash",
  "screenShake",
  "spawnModelFx",
  "spawnVfx",
]);

/**
 * Add reusable, shipped presentation bricks at the exact runtime mechanic
 * nodes that already decide timing, target and conditions.
 *
 * Invariants:
 * - only structured fields are inspected; name/description/dialogue are never
 *   inputs to mechanism or visual-family inference;
 * - only `spawnVfx` nodes are inserted;
 * - the caller's definition is never mutated;
 * - delayed, random, branch and combo timing remains owned by the real effect
 *   graph rather than a second Editor timer.
 */
export function buildMechanicVisualPreview(ability: AbilityDef): MechanicVisualPreview {
  const cloned = structuredClone(ability);
  const additions: MechanicVisualAddition[] = [];
  augmentRecord(cloned as unknown as Record<string, unknown>, "$", additions);
  return {
    definition: additions.length > 0 ? cloned : null,
    additions,
  };
}

/**
 * Deterministic projection used by tests and audit tools: removing spawnVfx
 * from the original and preview copy must yield byte-for-byte equal mechanic
 * graphs.  Existing model/timing containers stay visible in the comparison.
 */
export function mechanicProjectionWithoutVfx(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((child) => !isEffectKind(child, "spawnVfx"))
      .map(mechanicProjectionWithoutVfx);
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    mechanicProjectionWithoutVfx(child),
  ]));
}

function augmentRecord(
  record: Record<string, unknown>,
  path: string,
  additions: MechanicVisualAddition[],
): void {
  for (const [key, value] of Object.entries(record)) {
    if (EFFECT_LIST_KEYS.has(key) && Array.isArray(value)) {
      record[key] = augmentEffectList(value, `${path}.${key}`, additions);
      continue;
    }
    if (key === "branches" && Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        const branch = value[index];
        if (isRecord(branch)) augmentRecord(branch, `${path}.branches[${index}]`, additions);
      }
      continue;
    }
    if (isRecord(value)) augmentRecord(value, `${path}.${key}`, additions);
    else if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        const child = value[index];
        if (isRecord(child)) augmentRecord(child, `${path}.${key}[${index}]`, additions);
      }
    }
  }
}

function augmentEffectList(
  source: readonly unknown[],
  path: string,
  additions: MechanicVisualAddition[],
): unknown[] {
  const output: unknown[] = [];
  for (let index = 0; index < source.length; index++) {
    const effect = source[index];
    if (!isRecord(effect) || typeof effect.kind !== "string") {
      output.push(effect);
      continue;
    }

    augmentRecord(effect, `${path}[${index}]`, additions);

    if (effect.kind === "devour") {
      const visual = spawnFor(effect, "void", "fx.prim.void.explosion", "target", false);
      const onDevour = Array.isArray(effect.onDevour) ? effect.onDevour : [];
      if (!containsEquivalentSpawn(onDevour, visual)) {
        effect.onDevour = [...onDevour, visual];
        additions.push(receipt(`${path}[${index}].onDevour[${onDevour.length}]`, effect.kind, visual));
      }
      output.push(effect);
      continue;
    }

    output.push(effect);
    const visuals = visualsFor(effect);
    for (const visual of visuals) {
      if (containsEquivalentSpawn(source, visual) || containsEquivalentSpawn(output, visual)) continue;
      output.push(visual);
      additions.push(receipt(`${path}[${index}]+`, effect.kind, visual));
    }
  }
  return output;
}

function visualsFor(effect: Record<string, unknown>): SpawnVfxEffect[] {
  const kind = effect.kind as EffectDef["kind"];
  if (PRESENTATION_KINDS.has(kind) || kind === "proxyCast" || kind === "devour") return [];

  const family = familyFor(effect);
  switch (kind) {
    case "damage":
      return [spawnFor(effect, family, pulseFor(family), targetFor(effect))];
    case "damageArea":
      // The runtime centre is victim → cast point → caster. `at:"target"`
      // follows that same fallback chain; `point` alone would put passive
      // on-hit/evade circles back on the caster.
      return [spawnFor(effect, family, novaFor(family), "target")];
    case "damageLine":
      return [spawnFor(effect, family, waveFor(family), "point")];
    case "chainLightning":
      return [spawnFor(effect, "lightning", "fx.prim.lightning.arc", "target")];
    case "heal":
    case "restore":
      return [spawnFor(effect, "nature", "fx.prim.nature.pulse-lg", targetFor(effect))];
    case "shield":
    case "manaBarrier":
    case "invulnerable":
      return [spawnFor(effect, "holy", "fx.prim.holy.nova-lg", targetFor(effect))];
    case "applyStatus":
      return [spawnFor(effect, family, pulseFor(family), "target")];
    case "applyBuff":
    case "championForm":
    case "cycleBuff":
    case "extendBuff":
    case "grantAttribute":
      return [spawnFor(effect, family, pulseFor(family, true), targetFor(effect))];
    case "dash":
    case "blink":
      return [spawnFor(effect, family, dashFor(family), "self")];
    case "leap":
    case "knockback":
    case "pull":
      return [spawnFor(effect, "physical", "fx.prim.physical.shockwave", targetFor(effect))];
    case "summon":
      return [spawnFor(effect, family, summonFor(family), targetFor(effect))];
    case "evasion":
      return [spawnFor(effect, "wind", "fx.prim.wind.pulse-lg", targetFor(effect))];
    case "dispel":
      return [spawnFor(effect, "holy", "fx.prim.holy.pulse", targetFor(effect))];
    case "shieldBreak":
      return [spawnFor(effect, "physical", "fx.prim.physical.shockwave", "target")];
    case "revive":
      return [spawnFor(effect, "holy", "fx.prim.holy.nova-lg", "target")];
    case "taunt":
      return [spawnFor(effect, "physical", "fx.prim.physical.pulse", "target")];
    case "spendMana":
      return [spawnFor(effect, "void", "fx.prim.void.pulse", targetFor(effect))];
    case "grantGold":
    case "grantXp":
      return [spawnFor(effect, "holy", "fx.prim.holy.pulse-lg", targetFor(effect))];
    case "swapResource":
      return [
        spawnFor(effect, "arcane", "fx.prim.arcane.pulse", "self"),
        spawnFor(effect, "arcane", "fx.prim.arcane.pulse", "target"),
      ];
    case "modifyCooldown":
    case "eventValueConversion":
      return [spawnFor(effect, "arcane", "fx.prim.arcane.pulse", targetFor(effect))];
    case "carry":
    case "convertTeam":
      return [spawnFor(effect, "arcane", "fx.prim.arcane.pulse", targetFor(effect))];
    case "dot":
      // Dot owns its own tick scheduler and exposes no child-effect hook.  This
      // cue marks truthful application only; it does not invent parallel ticks.
      return [spawnFor(effect, family, pulseFor(family), "target")];
    case "randomArea":
    case "delayed":
    case "weightedBranch":
    case "comboStrikes":
    case "spawnProjectile":
      // Their child arrays already run at the real impact/branch/strike time.
      return [];
    default:
      return [];
  }
}

function spawnFor(
  source: Record<string, unknown>,
  _family: VisualFamily,
  vfxId: string,
  at: "self" | "target" | "point",
  copyCondition = true,
): SpawnVfxEffect {
  return {
    kind: "spawnVfx",
    vfxId: vfxId as SpawnVfxEffect["vfxId"],
    at,
    ...(copyCondition && source.condition !== undefined
      ? { condition: structuredClone(source.condition) as SpawnVfxEffect["condition"] }
      : {}),
  };
}

function receipt(
  path: string,
  afterKind: string,
  visual: SpawnVfxEffect,
): MechanicVisualAddition {
  return {
    path,
    afterKind: afterKind as EffectDef["kind"],
    vfxId: visual.vfxId,
    at: visual.at === "self" || visual.at === "target" || visual.at === "point"
      ? visual.at
      : "self",
  };
}

function targetFor(effect: Record<string, unknown>): "self" | "target" | "point" {
  if (effect.applyTo === "self" || effect.who === "self" || effect.at === "self") return "self";
  if (effect.applyTo === "point" || effect.who === "point" || effect.at === "point") return "point";
  return "target";
}

function familyFor(effect: Record<string, unknown>): VisualFamily {
  if (effect.damageType === "physical") return "physical";
  const tokens: string[] = [];
  const visit = (value: unknown): void => {
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (STRUCTURED_FAMILY_KEYS.has(key) && typeof child === "string") tokens.push(child);
    }
  };
  visit(effect);
  const joined = tokens.join(" ");
  for (const [family, pattern] of FAMILY_RULES) if (pattern.test(joined)) return family;
  return effect.damageType === "true" ? "ki" : "arcane";
}

function waveFor(family: VisualFamily): string {
  return ["arcane", "fire", "ice", "ki", "lightning", "physical", "void"].includes(family)
    ? `fx.wave.${family}`
    : "fx.wave.arcane";
}

function pulseFor(family: VisualFamily, large = false): string {
  if (large) {
    // Fire currently ships no pulse-lg; use its readable middle size rather
    // than inventing a missing brick. Every other family has a large pulse.
    return family === "fire" ? "fx.prim.fire.pulse" : `fx.prim.${family}.pulse-lg`;
  }
  // Ice currently ships only small and large pulses. A single damage/status
  // cue must not become the same full-body accent used for buffs.
  return family === "ice" ? "fx.prim.ice.pulse-sm" : `fx.prim.${family}.pulse`;
}

function novaFor(family: VisualFamily): string {
  // Fire/ice/wind currently have no nova-lg. Their regular nova is the largest
  // safe shipped area brick, so keep the resolver honest and deterministic.
  return ["fire", "ice", "wind"].includes(family)
    ? `fx.prim.${family}.nova`
    : `fx.prim.${family}.nova-lg`;
}

function dashFor(family: VisualFamily): string {
  return ["arcane", "holy", "lightning", "void"].includes(family)
    ? `fx.prim.${family}.dash`
    : "fx.prim.arcane.dash";
}

function summonFor(family: VisualFamily): string {
  if (family === "void") return "fx.prim.void.summon";
  if (family === "wind") return "fx.prim.wind.summon-lg";
  return "fx.prim.arcane.summon";
}

function containsEquivalentSpawn(source: readonly unknown[], visual: SpawnVfxEffect): boolean {
  return source.some((candidate) => isRecord(candidate) &&
    candidate.kind === "spawnVfx" && candidate.vfxId === visual.vfxId &&
    (candidate.at ?? "self") === (visual.at ?? "self"));
}

function isEffectKind(value: unknown, kind: EffectDef["kind"]): boolean {
  return isRecord(value) && value.kind === kind;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

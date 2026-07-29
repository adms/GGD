/**
 * Referential integrity. The REFERENCES table knows, per collection, how to
 * extract every cross-collection reference from a parsed doc. HARD refs
 * (items, projectiles, models, abilities) produce DanglingRefError; SOFT refs
 * (vfx, status-effects — content that may not be authored yet) only warn.
 */
import type { CoreAbilitySlot } from "../sim/intents";
import type { EffectDef } from "../sim/effects/effect";
import type { HookDef } from "../sim/stats/modifiers";
import { DanglingRefError } from "./errors";
import type { ContentStore } from "./store";
import type { CollectionName } from "./schema/index";
import type { AbilityDoc } from "./schema/ability";
import type { ChampionDoc } from "./schema/champion";
import type { ItemDoc } from "./schema/item";
import type { AugmentDoc } from "./schema/augment";
import type { ProjectileDoc } from "./schema/projectile";
import type { LootTableDoc } from "./schema/lootTable";
import type { SkinDoc } from "./schema/skin";
import type { AnyConfigDoc } from "./schema/config";

export interface RefEdge {
  /** dot path of the referencing field inside the doc */
  field: string;
  targetCollection: CollectionName;
  targetId: string;
  /** soft = warn only when dangling */
  soft?: boolean;
}

const SLOTS: readonly CoreAbilitySlot[] = ["Q", "W", "E", "R"];

function effectRefs(effects: readonly EffectDef[] | undefined, base: string, out: RefEdge[]): void {
  if (!effects) return;
  effects.forEach((e, i) => {
    const p = `${base}.${i}`;
    if (e.kind === "spawnProjectile") {
      out.push({ field: `${p}.projectileId`, targetCollection: "projectiles", targetId: e.projectileId });
      effectRefs(e.onHit, `${p}.onHit`, out);
    } else if (e.kind === "applyStatus") {
      out.push({ field: `${p}.statusId`, targetCollection: "status-effects", targetId: e.statusId, soft: true });
    } else if (e.kind === "spawnVfx") {
      out.push({ field: `${p}.vfxId`, targetCollection: "vfx", targetId: e.vfxId, soft: true });
    }
  });
}

function hookRefs(hooks: readonly HookDef[] | undefined, base: string, out: RefEdge[]): void {
  if (!hooks) return;
  hooks.forEach((h, i) => effectRefs(h.effects, `${base}.${i}.effects`, out));
}

function abilityRefs(a: Omit<AbilityDoc, "schema">, base: string, out: RefEdge[]): void {
  effectRefs(a.effects, base ? `${base}.effects` : "effects", out);
  if (a.vfxKey !== undefined) {
    out.push({
      field: base ? `${base}.vfxKey` : "vfxKey",
      targetCollection: "vfx",
      targetId: a.vfxKey,
      soft: true,
    });
  }
}

/** REFERENCES: per-collection reference extractors. */
export const REFERENCES: Partial<Record<CollectionName, (doc: never) => RefEdge[]>> = {
  champions: (doc: ChampionDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    for (const slot of SLOTS) {
      // implicit: the embedded ability must also exist as a standalone doc
      out.push({
        field: `abilities.${slot}.id`,
        targetCollection: "abilities",
        targetId: doc.abilities[slot].id,
      });
      abilityRefs(doc.abilities[slot], `abilities.${slot}`, out);
    }
    // the per-hero EX ability must exist as a standalone ability doc
    if (doc.exAbility) {
      out.push({ field: "exAbility", targetCollection: "abilities", targetId: doc.exAbility });
    }
    // the per-hero 天生技 (slot "PASSIVE", the level-1 6th slot) likewise
    if (doc.passiveAbility) {
      out.push({
        field: "passiveAbility",
        targetCollection: "abilities",
        targetId: doc.passiveAbility,
      });
    }
    hookRefs(doc.passive?.hooks, "passive.hooks", out);
    doc.buildPriority.forEach((itemId, i) =>
      out.push({ field: `buildPriority.${i}`, targetCollection: "items", targetId: itemId }),
    );
    out.push({ field: "modelKey", targetCollection: "models", targetId: doc.modelKey });
    return out;
  },
  abilities: (doc: AbilityDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    abilityRefs(doc, "", out);
    return out;
  },
  items: (doc: ItemDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    hookRefs(doc.passive, "passive", out);
    return out;
  },
  augments: (doc: AugmentDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    hookRefs(doc.hooks, "hooks", out);
    return out;
  },
  projectiles: (doc: ProjectileDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    if (doc.vfxKey !== undefined) {
      out.push({ field: "vfxKey", targetCollection: "vfx", targetId: doc.vfxKey, soft: true });
    }
    return out;
  },
  "loot-tables": (doc: LootTableDoc): RefEdge[] =>
    doc.entries.map((e, i) => ({
      field: `entries.${i}.itemId`,
      targetCollection: "items",
      targetId: e.itemId,
    })),
  skins: (doc: SkinDoc): RefEdge[] => [
    { field: "championId", targetCollection: "champions", targetId: doc.championId },
    { field: "modelKey", targetCollection: "models", targetId: doc.modelKey },
  ],
  // config docs are mostly parameter tables; only the w3x tint ledger names
  // other documents, and its champion ids must resolve (task #49).
  config: (doc: AnyConfigDoc): RefEdge[] => {
    // #249 GH#288 — 變身外觀表 names BOTH a champion and a model doc per entry.
    // Both are HARD: a typo'd `attachModelKey` would mean 悟空 transforms into
    // an identical body with no head change and nothing anywhere would say so.
    if (doc.schema === "config.form-visuals@1") {
      const out: RefEdge[] = [];
      for (const [championId, entry] of Object.entries(doc.forms)) {
        out.push({
          field: `forms.${championId}`,
          targetCollection: "champions",
          targetId: championId,
        });
        if (entry.attachModelKey !== undefined) {
          out.push({
            field: `forms.${championId}.attachModelKey`,
            targetCollection: "models",
            targetId: entry.attachModelKey,
          });
        }
      }
      return out;
    }
    if (doc.schema !== "config.unit-tints@1") return [];
    const out: RefEdge[] = [];
    for (const [rawcode, entry] of Object.entries(doc.units)) {
      if (entry.championId === undefined) continue;
      out.push({
        field: `units.${rawcode}.championId`,
        targetCollection: "champions",
        targetId: entry.championId,
      });
    }
    doc.transient.forEach((s, i) =>
      out.push({
        field: `transient.${i}.championId`,
        targetCollection: "champions",
        targetId: s.championId,
      }),
    );
    return out;
  },
};

/** Extract every ref edge from one parsed doc. */
export function extractRefs(collection: CollectionName, doc: unknown): RefEdge[] {
  const fn = REFERENCES[collection] as ((d: unknown) => RefEdge[]) | undefined;
  return fn ? fn(doc) : [];
}

export interface RefReport {
  errors: DanglingRefError[];
  /** soft refs that dangle (vfx / status-effects not authored yet) */
  warnings: DanglingRefError[];
}

/** Check every reference in the store. Hard dangles -> errors, soft -> warnings. */
export function validateReferences(store: ContentStore): RefReport {
  const errors: DanglingRefError[] = [];
  const warnings: DanglingRefError[] = [];
  for (const collection of Object.keys(REFERENCES) as CollectionName[]) {
    for (const doc of store.all<{ id: string }>(collection)) {
      for (const edge of extractRefs(collection, doc)) {
        if (store.has(edge.targetCollection, edge.targetId)) continue;
        const err = new DanglingRefError(
          collection,
          doc.id,
          edge.field,
          edge.targetCollection,
          edge.targetId,
        );
        (edge.soft ? warnings : errors).push(err);
      }
    }
  }
  return { errors, warnings };
}

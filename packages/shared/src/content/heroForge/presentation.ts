import { z } from "zod";
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  ABILITY_VFX_LAYER_OVERRIDE_FIELDS,
  zAbilityVfxLayer,
  type AbilityVfxLayer,
} from "../schema/abilityVfx";
import { zModelDoc, type ModelDoc } from "../schema/model";
import { zVfxCollectionDoc, type AnyVfxDoc } from "../schema/vfx";
import { zVfxScriptDoc } from "../schema/vfxScript";
import { HERO_PRESENTATION_SCHEMA, HERO_SLOTS, type HeroSlot } from "./constants";
import { zUploadedHeroModel } from "../modelUpload/heroModelSchema";
import { zHeroModelProvenance } from "../modelUpload/provenance";

/**
 * The only per-ability cast cues whose bytes are shipped with every public
 * build. Client playback and Hero Forge selection import this same allowlist,
 * so an audio-map entry cannot masquerade as an abilityCast-capable cue.
 */
export const HERO_DISTRIBUTABLE_ABILITY_SFX_KEYS = [
  "wc3.moongo",
  "wc3.moonjump",
  "wc3.nocute",
] as const;

export const zHeroAssetPath = z
  .string()
  .min(1)
  .max(512)
  .regex(/^assets\/(?:[A-Za-z0-9._@-]+\/)*[A-Za-z0-9._@-]+$/, "asset path must stay below assets/");

export const zHeroAssetEvidence = z
  .object({
    path: zHeroAssetPath,
    byteSize: z.number().int().nonnegative().max(256 * 1024 * 1024),
    mediaType: z.string().min(1).max(128),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type HeroAssetEvidence = z.infer<typeof zHeroAssetEvidence>;

export const zHeroAssetLock = zHeroAssetEvidence
  .extend({
    kind: z.enum(["model", "texture", "icon", "audio"]),
    registry: z.enum(["shipping-content", "normalized-upload"]),
    consumers: z.array(z.string().min(1).max(160)).min(1).max(64),
  })
  .strict();
export type HeroAssetLock = z.infer<typeof zHeroAssetLock>;

const zSlotPresentation = (slot: HeroSlot) =>
  z
    .object({
      slot: z.literal(slot),
      /** The only cast presentation event currently emitted with abilityId. */
      gameplayEvent: z.literal("abilityCast"),
      vfxLayers: z.array(zAbilityVfxLayer).max(ABILITY_VFX_LAYER_HARD_CAP),
      /** Main's presentation script, retaining its event and channel contract. */
      script: zVfxScriptDoc.nullable().default(null),
      sfxKey: z.enum(HERO_DISTRIBUTABLE_ABILITY_SFX_KEYS).nullable(),
      icon: zHeroAssetPath.nullable(),
      fallback: z
        .object({
          pointWithoutTarget: z.literal("caster"),
          missingSfx: z.literal("generic-cast"),
          missingVfx: z.literal("block-package"),
        })
        .strict(),
    })
    .strict();

const exactSlots = z
  .object({
    PASSIVE: zSlotPresentation("PASSIVE"),
    Q: zSlotPresentation("Q"),
    W: zSlotPresentation("W"),
    E: zSlotPresentation("E"),
    R: zSlotPresentation("R"),
    EX: zSlotPresentation("EX"),
  })
  .strict();

export const zHeroPresentation = z
  .object({
    schema: z.literal(HERO_PRESENTATION_SCHEMA),
    modelKey: z.string().min(1).max(128),
    /** A work-scoped uploaded body; Main revalidates its bytes before compilation. */
    uploadedModel: zUploadedHeroModel.optional(),
    modelProvenance: zHeroModelProvenance.optional(),
    championIcon: zHeroAssetPath.nullable(),
    slots: exactSlots,
    assetLocks: z.array(zHeroAssetLock).max(256),
  })
  .strict();
export type HeroPresentation = z.infer<typeof zHeroPresentation>;
export type HeroSlotPresentation = HeroPresentation["slots"][HeroSlot];

const fallback = () => ({
  pointWithoutTarget: "caster" as const,
  missingSfx: "generic-cast" as const,
  missingVfx: "block-package" as const,
});

export function defaultHeroPresentation(): HeroPresentation {
  return zHeroPresentation.parse({
    schema: HERO_PRESENTATION_SCHEMA,
    modelKey: "champ.thorne",
    championIcon: null,
    slots: Object.fromEntries(HERO_SLOTS.map((slot) => [slot, {
      slot,
      gameplayEvent: "abilityCast",
      vfxLayers: [],
      sfxKey: null,
      icon: null,
      fallback: fallback(),
    }])),
    assetLocks: [],
  });
}

/** Convert the separate presentation binding into fields the real ability@1 runtime consumes. */
export function abilityPresentationFields(binding: HeroSlotPresentation): {
  vfxKey?: string;
  vfxLayers?: readonly AbilityVfxLayer[];
  sfxKey?: string;
  icon?: string;
} {
  const layers = binding.vfxLayers;
  const first = layers[0];
  const soloPlain = first !== undefined
    && layers.length === 1
    && first.attachTo === undefined
    && first.delayMs === undefined
    && first.enabled === undefined
    && ABILITY_VFX_LAYER_OVERRIDE_FIELDS.every((field) => first[field] === undefined);
  return {
    ...(first ? { vfxKey: first.vfxKey } : {}),
    ...(first && !soloPlain ? { vfxLayers: layers } : {}),
    ...(binding.sfxKey ? { sfxKey: binding.sfxKey } : {}),
    ...(binding.icon ? { icon: binding.icon } : {}),
  };
}

export interface HeroPresentationCatalog {
  readonly models: Readonly<Record<string, unknown>>;
  readonly vfx: Readonly<Record<string, unknown>>;
  readonly audioSfx: Readonly<Record<string, { readonly files: readonly string[] }>>;
  readonly assets: Readonly<Record<string, HeroAssetEvidence>>;
}

export type HeroPresentationIssueStatus = "warning" | "fail";
export interface HeroPresentationIssue {
  readonly code: string;
  readonly status: HeroPresentationIssueStatus;
  readonly detail: string;
  readonly slot?: HeroSlot;
  readonly path?: string;
}

export interface HeroAssetDependency {
  readonly path: string;
  readonly kind: HeroAssetLock["kind"];
  readonly consumers: readonly string[];
}

export interface HeroPresentationReport {
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly HeroPresentationIssue[];
  readonly dependencies: readonly HeroAssetDependency[];
}

export interface HeroPresentationValidationOptions {
  readonly castTypeBySlot?: Partial<Record<HeroSlot, string>>;
  readonly observedEventsBySlot?: Partial<Record<HeroSlot, readonly string[]>>;
}

function addDependency(
  map: Map<string, { kind: HeroAssetLock["kind"]; consumers: Set<string> }>,
  path: string,
  kind: HeroAssetLock["kind"],
  consumer: string,
): void {
  const current = map.get(path);
  if (current) {
    current.consumers.add(consumer);
    return;
  }
  map.set(path, { kind, consumers: new Set([consumer]) });
}

function statusOf(issues: readonly HeroPresentationIssue[]): HeroPresentationReport["status"] {
  if (issues.some((issue) => issue.status === "fail")) return "fail";
  return issues.length > 0 ? "warning" : "pass";
}

function analyze(
  presentationInput: unknown,
  catalog: HeroPresentationCatalog,
  options: HeroPresentationValidationOptions = {},
  checkLocks: boolean,
): HeroPresentationReport {
  const parsed = zHeroPresentation.safeParse(presentationInput);
  if (!parsed.success) {
    return {
      status: "fail",
      issues: [{ code: "PRESENTATION_SCHEMA_INVALID", status: "fail", detail: parsed.error.message }],
      dependencies: [],
    };
  }
  const presentation = parsed.data;
  const issues: HeroPresentationIssue[] = [];
  const deps = new Map<string, { kind: HeroAssetLock["kind"]; consumers: Set<string> }>();
  const modelResult = zModelDoc.safeParse(catalog.models[presentation.modelKey]);
  let model: ModelDoc | null = null;
  if (!modelResult.success) {
    issues.push({ code: "MODEL_REFERENCE_MISSING", status: "fail", detail: `找不到可用的 model@1：${presentation.modelKey}` });
  } else {
    model = modelResult.data;
    addDependency(deps, model.glbPath, "model", "champion:model");
  }
  if (presentation.championIcon) addDependency(deps, presentation.championIcon, "icon", "champion:icon");

  for (const slot of HERO_SLOTS) {
    const binding = presentation.slots[slot];
    if (binding.icon) addDependency(deps, binding.icon, "icon", `${slot}:icon`);
    if (binding.sfxKey) {
      const sfx = catalog.audioSfx[binding.sfxKey];
      if (!sfx) {
        issues.push({ code: "SFX_FALLBACK_GENERIC", status: "warning", slot, detail: `${binding.sfxKey} 不在 audio-map，出貨時明示降級為 generic-cast。` });
      } else {
        for (const path of sfx.files) addDependency(deps, path, "audio", `${slot}:sfx:${binding.sfxKey}`);
      }
    }
    binding.vfxLayers.forEach((layer, index) => {
      const vfxResult = zVfxCollectionDoc.safeParse(catalog.vfx[layer.vfxKey]);
      if (!vfxResult.success) {
        issues.push({ code: "VFX_REFERENCE_MISSING", status: "fail", slot, detail: `第 ${index + 1} 層 ${layer.vfxKey} 無法解析；missingVfx=block-package。` });
        return;
      }
      const vfx: AnyVfxDoc = vfxResult.data;
      if (vfx.schema === "ribbon@1") {
        issues.push({ code: "CAST_RIBBON_UNSUPPORTED", status: "fail", slot, detail: `${vfx.id} 是骨骼 ribbon，現行 abilityCast one-shot 不會消費，不得以預覽冒充。` });
      } else if (vfx.schema === "attachment@1" || vfx.ambient === true || vfx.anchorBone !== undefined) {
        issues.push({ code: "CAST_ANCHOR_UNSUPPORTED", status: "fail", slot, detail: `${vfx.id} 需要 ambient／anchorBone 通道，現行 abilityCast 只支援 caster／point。` });
      }
      if ("texture" in vfx && vfx.texture) addDependency(deps, vfx.texture, "texture", `${slot}:vfx:${index}:${vfx.id}`);
      if (layer.attachTo === "point" && ["self", "dash"].includes(options.castTypeBySlot?.[slot] ?? "")) {
        issues.push({ code: "POINT_FALLBACK_CASTER", status: "warning", slot, detail: `${slot} 的 ${options.castTypeBySlot?.[slot]} 事件沒有 point，會依契約降級到 caster。` });
      }
    });
    if ((binding.vfxLayers.length > 0 || binding.sfxKey !== null) && options.observedEventsBySlot) {
      if (!(options.observedEventsBySlot[slot] ?? []).includes(binding.gameplayEvent)) {
        issues.push({ code: "PRESENTATION_EVENT_UNOBSERVED", status: "fail", slot, detail: `${slot} 的演出綁定 ${binding.gameplayEvent}，但 SimWorld trace 未觀測到該事件。` });
      }
    }
  }

  const dependencies = [...deps.entries()]
    .map(([path, value]) => ({ path, kind: value.kind, consumers: [...value.consumers].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));

  if (checkLocks) {
    const locks = new Map(presentation.assetLocks.map((lock) => [lock.path, lock]));
    for (const dependency of dependencies) {
      if (dependency.path.startsWith("assets/blizzard-local/")) {
        issues.push({ code: "NON_DISTRIBUTABLE_ASSET", status: "fail", path: dependency.path, detail: `${dependency.path} 是本機 overlay，不得進社群封包。` });
        continue;
      }
      const evidence = catalog.assets[dependency.path];
      const lock = locks.get(dependency.path);
      if (!evidence) {
        issues.push({ code: "ASSET_BYTES_MISSING", status: "fail", path: dependency.path, detail: `找不到資產 bytes：${dependency.path}` });
      } else if (!lock) {
        issues.push({ code: "ASSET_NOT_LOCKED", status: "fail", path: dependency.path, detail: `資產尚未鎖定 SHA-256：${dependency.path}` });
      } else if (lock.sha256 !== evidence.sha256 || lock.byteSize !== evidence.byteSize || lock.mediaType !== evidence.mediaType) {
        issues.push({ code: "ASSET_LOCK_STALE", status: "fail", path: dependency.path, detail: `資產 bytes 已變更，需重新鎖定：${dependency.path}` });
      }
    }
    for (const lock of presentation.assetLocks) {
      if (!deps.has(lock.path)) issues.push({ code: "ASSET_LOCK_UNUSED", status: "warning", path: lock.path, detail: `已鎖定但目前沒有消費者：${lock.path}` });
    }
  }

  if (model && Object.values(model.clipMap).some((clip) => clip.trim() === "")) {
    issues.push({ code: "MODEL_CLIP_MAP_INVALID", status: "fail", detail: `${model.id} 的六個必要動畫映射不完整。` });
  }
  return { status: statusOf(issues), issues, dependencies };
}

export function validateHeroPresentation(
  presentation: unknown,
  catalog: HeroPresentationCatalog,
  options: HeroPresentationValidationOptions = {},
): HeroPresentationReport {
  return analyze(presentation, catalog, options, true);
}

/** Trusted local metadata is copied into the project only after an explicit user action. */
export function buildHeroAssetLocks(
  presentation: unknown,
  catalog: HeroPresentationCatalog,
): HeroAssetLock[] {
  const report = analyze(presentation, catalog, {}, false);
  return report.dependencies.flatMap((dependency) => {
    const evidence = catalog.assets[dependency.path];
    if (!evidence || dependency.path.startsWith("assets/blizzard-local/")) return [];
    return [zHeroAssetLock.parse({
      ...evidence,
      kind: dependency.kind,
      registry: "shipping-content",
      consumers: dependency.consumers,
    })];
  });
}

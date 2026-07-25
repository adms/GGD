/**
 * studioModel — the PURE half of 鑄形工坊 (Project Voxel Forge, task #229).
 *
 * The admin's vitest runs in a plain node env with no DOM, so everything that
 * can be a function rather than a component IS one and lives here: id minting,
 * the save-plan shape, the validity summary, the post-save bake instruction.
 * `VoxelStudioPage.tsx` is then thin enough to be reviewed by reading it.
 *
 * Nothing here talks to the network, and nothing here decides whether editing
 * is ALLOWED — that is `contentApi.ts`'s dev gate plus the content-api's
 * loopback socket check, exactly as for every other content page. A pure
 * function is never a lock.
 */
import type { EditCollection, WritePlanStep } from "@ggd/shared/content/editModel";
import {
  toModelDoc,
  voxelGlbPath,
  VOXEL_ID_PREFIX,
  buildFigure,
  type VoxelLook,
} from "@ggd/shared/voxel";

/** The collection a generated figure is saved into. */
export const STUDIO_COLLECTION: EditCollection = "models";

/** The command that turns saved PARAMETERS into a playable .glb. */
export const BAKE_COMMAND = "pnpm voxel:gen && pnpm content:build";

/**
 * Slugify a display name into the id suffix. Deliberately narrow — ASCII
 * lowercase, digits and single hyphens — because the id becomes a FILENAME and
 * a URL path segment. `docUrl` percent-encodes anyway, but an id an operator
 * cannot type into a shell is a support call waiting to happen.
 */
export function studioSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** `voxel.<slug>` — the id the doc is written under. Empty slug ⇒ empty id. */
export function studioDocId(raw: string): string {
  const slug = studioSlug(raw);
  return slug === "" ? "" : `${VOXEL_ID_PREFIX}${slug}`;
}

export function isStudioDocId(id: string): boolean {
  return /^voxel\.[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

/** The path the bake will write. Derived, never typed (see doc.ts's header). */
export function studioGlbPath(id: string): string {
  return voxelGlbPath(id);
}

/**
 * The single write this page performs. Spelled out as a function so the test
 * can assert the shape without a browser: ONE step, collection `models`,
 * reason `edit`. A model mirrors nowhere, so anything longer than one step
 * would mean the studio had grown a second write target.
 */
export function studioWritePlan(id: string, look: VoxelLook): WritePlanStep[] {
  return [
    {
      collection: STUDIO_COLLECTION,
      id,
      doc: toModelDoc(id, look) as unknown as Record<string, unknown>,
      reason: "edit",
    },
  ];
}

export interface StudioReadout {
  /** measured silhouette height BEFORE #150 normalisation, world units */
  readonly height: number;
  /** what goes into `model@1.scale` */
  readonly docScale: number;
  readonly triCount: number;
  readonly boxCount: number;
  readonly halfWidth: number;
  /** true when the authored collision radius no longer contains the silhouette */
  readonly collisionTooSmall: boolean;
  /**
   * The figure has collapsed to (near) nothing — every body joint scaled to 0.
   * `buildFigure` floors the measured height so `docScale` stays finite, which
   * means the normalisation would happily blow a 0.00006 u figure up to 1.8 u
   * and render a smear. Catching it here is the difference between an error and
   * a champion nobody can see.
   */
  readonly degenerate: boolean;
}

/** Below this measured height a figure is not a silhouette, it is a point. */
const DEGENERATE_HEIGHT = 0.05;

/**
 * The numbers the studio shows under the sliders. `collisionTooSmall` is the
 * one judgement here: the sim's planar radius is authored, never derived (a
 * silently-derived radius would change hitboxes the moment someone widened a
 * shoulder pad), so the page WARNS instead of correcting.
 */
export function studioReadout(look: VoxelLook): StudioReadout {
  const f = buildFigure(look);
  return {
    height: f.height,
    docScale: f.docScale,
    triCount: f.triCount,
    boxCount: f.boxes.length,
    halfWidth: f.halfWidth,
    collisionTooSmall: look.collisionRadius < f.halfWidth * f.docScale * 0.75,
    degenerate: f.boxes.length === 0 || f.height < DEGENERATE_HEIGHT,
  };
}

export type StudioIssueLevel = "ok" | "warn" | "error";

export interface StudioIssue {
  readonly level: StudioIssueLevel;
  readonly text: string;
}

/**
 * Everything the page can tell the operator BEFORE the server dry-run. This is
 * convenience, not authority: the content-api validates with the same zod
 * schemas the game loader uses, and its FieldIssues are what a save reports.
 */
export function studioIssues(idRaw: string, look: VoxelLook): StudioIssue[] {
  const out: StudioIssue[] = [];
  const id = studioDocId(idRaw);
  if (id === "") out.push({ level: "error", text: "請先取一個名字（英數字，會變成 id）" });
  else if (!isStudioDocId(id)) out.push({ level: "error", text: `id「${id}」不合法` });

  const r = studioReadout(look);
  if (r.degenerate) {
    out.push({ level: "error", text: "身形已被縮成一個點——請把體型滑桿拉回來" });
  }
  if (r.collisionTooSmall) {
    out.push({
      level: "warn",
      text: `碰撞半徑 ${look.collisionRadius} 明顯小於身形寬度 ${(r.halfWidth * r.docScale).toFixed(2)}u`,
    });
  }
  if (r.docScale < 0.5 || r.docScale > 2) {
    out.push({
      level: "warn",
      text: `身高換算倍率 ${r.docScale.toFixed(2)}×——比例拉太極端，遊戲內仍會是 1.8u，但細節會被壓扁`,
    });
  }
  return out;
}

/** True when nothing blocks a save attempt. */
export function canSave(idRaw: string, look: VoxelLook): boolean {
  return !studioIssues(idRaw, look).some((i) => i.level === "error");
}

/**
 * The banner shown after a successful save. The studio writes PARAMETERS; the
 * geometry is baked offline. Saying so out loud — with the exact command — is
 * the difference between a two-phase pipeline and a page that appears broken
 * because the champion did not change in game.
 */
export function bakeNotice(id: string, contentVersion: string | null): string {
  const cv = contentVersion === null ? "" : `（contentVersion ${contentVersion}）`;
  return `參數已寫入 ${id}${cv}。請執行 ${BAKE_COMMAND} 產生 ${studioGlbPath(id)} 並重建索引。`;
}

/**
 * voxelFoundry — the PURE half of 體素鑄造廠 (task #229's production page).
 *
 * ── WHY A SECOND VOXEL PAGE EXISTS, AND WHY IT IS NOT THE STUDIO ────────────
 * 鑄形工坊 (`ui/voxel/VoxelStudioPage.tsx`) is an excellent authoring tool that
 * the owner cannot open. It lives in the dev content chunk behind App.tsx's
 * `import.meta.env.DEV` guard, it constructs the loopback `contentApi` writer,
 * and it lazily imports ~1 MB of Babylon for its live preview. All three are
 * correct for a dev editor and all three are fatal for a page whose whole point
 * is to work on ggd.adms.ai from a phone. `contentGate.test.ts` does not merely
 * allow that absence, it ENFORCES it: a production bundle containing 鑄形工坊,
 * 體素角色生成器 or `ArcRotateCamera` fails the build gate.
 *
 * So this page does not "un-gate" the studio. It is a different, deliberately
 * smaller tool built on the same shared generator, obeying the three rules the
 * production bundle imposes:
 *
 *   1. NO BABYLON. The preview is an orthographic painter over the shared
 *      `buildFigure()` boxes on a 2D canvas — a few hundred lines, no engine.
 *   2. NO LOOPBACK WRITE. It saves through `putOverlayDoc` (#189): the
 *      platform's admin-JWT, audited, durable `data/` overlay — the same writer
 *      內容覆蓋層 uses, safe in production BY AUTHORISATION rather than by
 *      absence. It never names `/content-api`, so contentGate's "one mutating
 *      module" walk stays green.
 *   3. IT ACTUALLY PRODUCES THE FILE. `bakeLook()` now runs in the browser
 *      (see `@ggd/shared/voxel/bake`), so the page emits real .glb bytes, shows
 *      their sha256, and downloads them. A "generator page" that printed a
 *      terminal command would be the same dead end in a nicer colour.
 *
 * ── BUDGET IS THE PRODUCT, NOT A FOOTNOTE ───────────────────────────────────
 * #226 was raised because four CC0 characters were too heavy. Every bake here
 * is reported against what it replaces, in triangles and in bytes, using the
 * measured sizes of the retired files. `budgetVerdict` is the function that
 * turns that into a pass/fail an operator can read at a glance — and it FAILS
 * on a generated model that is heavier than the one it replaces, because that
 * outcome is the task's own definition of failure.
 *
 * Everything in this file is pure so the admin's node-env vitest can assert the
 * page's behaviour without a DOM.
 */
import {
  ARCHETYPE_KEYS,
  DEFAULT_LOOK,
  bakeLook,
  isVoxelModelId,
  lookForChampion,
  lookFromArchetype,
  toModelDoc,
  voxelGlbPath,
  VOXEL_ID_PREFIX,
  type BakeStats,
  type VoxelLook,
} from "@ggd/shared/voxel";

/** The collection a forged figure is written into. */
export const FOUNDRY_COLLECTION = "models";

/**
 * The four retired KayKit Adventurers characters, with the numbers that got
 * them retired. MEASURED, not remembered: these are the triangle counts and
 * file sizes `tools/model-budget` recorded before the deletion, and they are
 * the baseline every forged model is priced against.
 */
export interface RetiredModel {
  readonly key: string;
  readonly label: string;
  readonly triangles: number;
  readonly bytes: number;
}

export const RETIRED_MODELS: readonly RetiredModel[] = Object.freeze([
  Object.freeze({ key: "mage", label: "KayKit mage.glb", triangles: 6952, bytes: 1_622_000 }),
  Object.freeze({ key: "knight", label: "KayKit knight.glb", triangles: 6448, bytes: 1_486_000 }),
  Object.freeze({
    key: "barbarian",
    label: "KayKit barbarian.glb",
    triangles: 5683,
    bytes: 1_284_000,
  }),
  Object.freeze({ key: "rogue", label: "KayKit rogue.glb", triangles: 5978, bytes: 1_357_000 }),
]);

/** The lightest retired character — the strictest honest baseline to beat. */
export function baselineModel(): RetiredModel {
  return RETIRED_MODELS.reduce((a, b) => (a.triangles <= b.triangles ? a : b));
}

export interface BudgetRow {
  readonly label: string;
  readonly generated: number;
  readonly replaced: number;
  /** generated ÷ replaced, e.g. 0.03 = 3 % of what it replaced */
  readonly ratio: number;
  readonly ok: boolean;
}

export interface BudgetVerdict {
  readonly rows: readonly BudgetRow[];
  /** false when ANY axis got heavier — #226's own definition of failure */
  readonly ok: boolean;
  readonly summary: string;
}

/** Format a byte count the way the model-budget page does. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Price a bake against the model it replaces.
 *
 * The comparison is against the LIGHTEST retired character on purpose. Beating
 * the heaviest is easy and says nothing; a generated figure that is under the
 * lightest thing it replaced is under all four.
 */
export function budgetVerdict(stats: BakeStats, baseline: RetiredModel = baselineModel()): BudgetVerdict {
  const rows: BudgetRow[] = [
    {
      label: "三角面",
      generated: stats.triangles,
      replaced: baseline.triangles,
      ratio: stats.triangles / baseline.triangles,
      ok: stats.triangles < baseline.triangles,
    },
    {
      label: "檔案大小",
      generated: stats.bytes,
      replaced: baseline.bytes,
      ratio: stats.bytes / baseline.bytes,
      ok: stats.bytes < baseline.bytes,
    },
  ];
  const ok = rows.every((r) => r.ok);
  const worst = rows.reduce((a, b) => (a.ratio >= b.ratio ? a : b));
  return {
    rows,
    ok,
    summary: ok
      ? `比 ${baseline.label} 輕：三角面 ${(rows[0]!.ratio * 100).toFixed(1)}%、檔案 ${(rows[1]!.ratio * 100).toFixed(1)}%`
      : `⚠ ${worst.label}比 ${baseline.label} 還重（${(worst.ratio * 100).toFixed(0)}%）——這就是 #226 要消滅的情況`,
  };
}

/**
 * Slugify a display name into the id suffix. Deliberately narrow — ASCII
 * lowercase, digits and single hyphens — because the id becomes a FILENAME and
 * a URL path segment.
 */
export function foundrySlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** `voxel.<slug>` — the id the doc is written under. Empty slug ⇒ empty id. */
export function foundryDocId(raw: string): string {
  const slug = foundrySlug(raw);
  return slug === "" ? "" : `${VOXEL_ID_PREFIX}${slug}`;
}

/** The .glb path the doc will point at. Derived, never typed. */
export function foundryGlbPath(id: string): string {
  return voxelGlbPath(id);
}

/**
 * The name the browser download is offered under — the BASENAME OF THE PATH the
 * doc points at, never a prettier variant.
 *
 * This started out stripping the `voxel.` prefix, which reads nicer and is
 * wrong: `voxelGlbPath()` does not strip it, so the operator would have
 * downloaded `blocky-bob.glb` while the doc asked the loader for
 * `voxel.blocky-bob.glb`, and the champion would silently fail to load on the
 * host. Deriving from `voxelGlbPath` makes the two incapable of disagreeing.
 */
export function foundryFileName(id: string): string {
  const path = voxelGlbPath(id);
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The source a look came from — shown on the page so an operator always knows
 * whether he is looking at a champion's derived look or something he authored.
 */
export type LookSource =
  | { kind: "archetype"; key: string }
  | { kind: "champion"; championId: string; modelKey: string; archetype: string };

/**
 * The champion → look resolution, in one place. `archetypeKey` comes from the
 * MODEL doc's archetype mapping, never from the champion, exactly as the client
 * and the bake do it.
 */
export function lookForSource(source: LookSource): VoxelLook {
  if (source.kind === "champion") return lookForChampion(source.championId, source.archetype);
  return ARCHETYPE_LOOKS[source.key] ?? DEFAULT_LOOK;
}

/**
 * The five shipped presets, keyed for the picker. Built from
 * `lookFromArchetype` and NOT from `lookForChampion("", key)` — the latter
 * would apply the per-champion seed jitter, so opening a preset would show
 * something subtly different from the character that actually ships, which is
 * the one thing a preview must never do.
 */
export const ARCHETYPE_LOOKS: Readonly<Record<string, VoxelLook>> = Object.freeze(
  Object.fromEntries(ARCHETYPE_KEYS.map((key) => [key, lookFromArchetype(key)])),
);

export interface ForgeResult {
  readonly id: string;
  readonly bytes: Uint8Array;
  readonly stats: BakeStats;
  readonly budget: BudgetVerdict;
  readonly glbPath: string;
  readonly fileName: string;
  readonly doc: Record<string, unknown>;
}

/**
 * THE whole operation, as one pure function: id + look → the bytes, the budget
 * verdict and the `model@1` document that points at them.
 *
 * Returning the doc from here (rather than assembling it in the component) is
 * what lets the test assert that a save can never write a doc describing a
 * different file than the one the operator downloaded.
 */
export function forge(idRaw: string, look: VoxelLook): ForgeResult | null {
  const id = foundryDocId(idRaw);
  if (id === "" || !isVoxelModelId(id)) return null;
  const { bytes, stats } = bakeLook(id, look);
  return {
    id,
    bytes,
    stats,
    budget: budgetVerdict(stats),
    glbPath: foundryGlbPath(id),
    fileName: foundryFileName(id),
    doc: toModelDoc(id, look) as unknown as Record<string, unknown>,
  };
}

export type IssueLevel = "error" | "warn";

export interface FoundryIssue {
  readonly level: IssueLevel;
  readonly text: string;
}

/**
 * Everything the page can tell the operator BEFORE it writes. Convenience, not
 * authority: the platform validates the doc with the same zod schema the game
 * loader uses, and its answer is what a save reports.
 */
export function foundryIssues(idRaw: string, result: ForgeResult | null): FoundryIssue[] {
  const out: FoundryIssue[] = [];
  const id = foundryDocId(idRaw);
  if (id === "") {
    out.push({ level: "error", text: "請先取一個名字（英數字，會變成 id）" });
    return out;
  }
  if (!isVoxelModelId(id)) {
    out.push({ level: "error", text: `id「${id}」不合法` });
    return out;
  }
  if (result === null) {
    out.push({ level: "error", text: "無法產生模型" });
    return out;
  }
  if (!result.budget.ok) {
    out.push({ level: "error", text: result.budget.summary });
  }
  if (result.stats.triangles === 0) {
    out.push({ level: "error", text: "身形已被縮成一個點——請把體型滑桿拉回來" });
  }
  return out;
}

/** True when nothing blocks a save. */
export function canForge(idRaw: string, result: ForgeResult | null): boolean {
  return !foundryIssues(idRaw, result).some((i) => i.level === "error");
}

/**
 * The banner shown after a successful save. The overlay stores the DOCUMENT;
 * the .glb has to reach `content/assets/...` on the host. Saying that out loud,
 * with the exact path, is the difference between a two-part operation and a
 * page that appears broken because the champion did not change in game.
 */
export function saveNotice(r: ForgeResult): string {
  return (
    `已寫入覆蓋層 ${FOUNDRY_COLLECTION}/${r.id}。` +
    `模型檔請放到 ${r.glbPath}（${fmtBytes(r.stats.bytes)}，sha256 ${r.stats.sha256.slice(0, 12)}）。`
  );
}

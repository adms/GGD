/** Thin fetch wrapper over the dev content-api (same-origin via Vite proxy / nginx). */
import type { CollectionIndex, CollectionName, FieldIssue, Manifest } from "@ggd/shared/content";
import type { EditorSourceDescriptor } from "../sourcePolicy";
import type { EditorDesktopSourceInfo } from "@ggd/shared/editorDesktop";

const BASE = "/content-api";

/**
 * Vite dev flag, guarded so plain node (vitest) never throws on `import.meta`.
 * Mirrors apps/admin/src/contentApi.ts — the admin console has had this gate
 * since #96; the editor never did, which was a live hole: apps/editor/dist is
 * baked into docker/edge.Dockerfile and served at `/editor/` in PRODUCTION,
 * while `/content-api/` only exists in nginx/dev/content-api.conf (mounted
 * under the `dev.enabled` profile). So a prod build shipped save buttons
 * pointing at a route that does not exist — live-looking write UI, publicly.
 *
 * This does NOT relax anything server-side: content-api still refuses to boot
 * under NODE_ENV=production and still enforces loopback-peer + Origin in
 * guard.ts. This is the second lock, on the client, so the UI never even offers
 * a write it cannot perform.
 */
function isDevBuild(): boolean {
  try {
    const env = (import.meta as unknown as { env?: { DEV?: boolean; VITE_DESKTOP?: string } }).env;
    return Boolean(env?.DEV || env?.VITE_DESKTOP === "1");
  } catch {
    return false;
  }
}

/** Dead-folds to `false` in a production build; every WRITER below checks it. */
export const WRITES_ENABLED = isDevBuild();

/** Thrown when a writer is called in a build where writes are compiled out. */
export class WritesDisabledError extends Error {
  constructor() {
    super("content writes are DEV-only — this build has no content-api");
  }
}

function assertWritable(): void {
  if (!WRITES_ENABLED) throw new WritesDisabledError();
}

export class ApiValidationError extends Error {
  constructor(readonly issues: FieldIssue[]) {
    super("validation failed");
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  if (res.status === 422) {
    const body = (await res.json()) as { errors?: FieldIssue[] };
    throw new ApiValidationError(body.errors ?? []);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${url} -> ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function requestOptional<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function requestBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

export interface WriteResult {
  id: string;
  hash: string;
  collectionHash: string;
  contentVersion: string;
}

export interface AiProposalResult {
  proposal: {
    key: string;
    candidateHash: string;
    reviewHash: string;
    purpose: "production-candidate" | "editor-capability-fixture";
    promotable: boolean;
  };
  status: "pending-review" | "fixture-pending";
}

export interface AiVisualEvidence {
  label: string;
  dataUrl: string;
  atMs: number;
  view: "side" | "top";
}

export interface AiVisualAuditReceipt {
  schema: "ggd-vfx-visual-audit@1";
  safe: true;
  autoVisualScore: number;
  sampledFrames: number;
  peakParticleCount: number;
  peakSystemCount: number;
  worstAtMs: number;
  worst: {
    litShare: number;
    highlightShare: number;
    brightShare: number;
    nearWhiteShare: number;
    dominantBrightShare: number;
    dominantNonBackgroundShare: number;
    localWhiteCardShare: number;
    unsafe: false;
    reason?: string;
  };
  suspects: string[];
}

export const api = {
  manifest: () => request<Manifest>(`${BASE}/manifest`),
  /** Present only in the packaged desktop shell; ordinary web/dev Editor returns null. */
  desktopSource: () => requestOptional<EditorDesktopSourceInfo>(`${BASE}/desktop-source`),
  /** Verified immutable profile pinned by the packaged remote-workspace shell. */
  desktopTargetProfile: () => requestOptional<Record<string, unknown>>(`${BASE}/desktop-target-profile`),
  index: (collection: CollectionName) =>
    request<CollectionIndex>(`${BASE}/${collection}/_index`),
  doc: <T = unknown>(collection: CollectionName, id: string) =>
    request<T>(`${BASE}/${collection}/${id}`),
  /** Raw content asset used by preview and the blend-mode-aware backdrop gate. */
  assetBytes: (contentPath: string) => {
    if (!contentPath.startsWith("assets/")) {
      return Promise.reject(new Error(`asset path must start with "assets/": ${contentPath}`));
    }
    return requestBytes(`${BASE}/${contentPath}`);
  },
  externalTargetProfile: (url: string) =>
    request<Record<string, unknown>>(
      `${BASE}/external-target-profile?url=${encodeURIComponent(url)}`,
    ),
  /** Bounded, allow-listed bridge for the Main-owned machine contract registry. */
  externalContractIndex: (profileUrl: string, href: string) =>
    request<Record<string, unknown>>(
      `${BASE}/external-contract-index?profileUrl=${encodeURIComponent(profileUrl)}` +
        `&href=${encodeURIComponent(href)}`,
    ),
  /**
   * Main-owned source lookup. `null` is the compatibility state while an older
   * content-api has not shipped the route; policy then fails safe from the
   * document provenance instead of guessing generator paths.
   */
  editorSource: (collection: CollectionName, id: string) =>
    requestOptional<EditorSourceDescriptor>(
      `${BASE}/editor-source?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`,
    ),
  put: (collection: CollectionName, id: string, doc: unknown) => {
    assertWritable();
    return request<WriteResult>(`${BASE}/${collection}/${id}`, {
      method: "PUT",
      body: JSON.stringify(doc),
    });
  },
  create: (collection: CollectionName, id: string, doc: unknown) => {
    assertWritable();
    return request<WriteResult>(`${BASE}/${collection}/${id}`, {
      method: "POST",
      body: JSON.stringify(doc),
    });
  },
  remove: (collection: CollectionName, id: string) => {
    assertWritable();
    return request<{ id: string; deleted: boolean }>(`${BASE}/${collection}/${id}`, {
      method: "DELETE",
    });
  },

  /**
   * 鑄技工坊 mirror writeback, standalone half. A MEMBER PATCH: the body is a
   * partial doc and the server splices ONLY those members into the file's text,
   * so the diff shows the fields that actually changed rather than every `60.0`
   * the Python exporter wrote being renormalised to `60` by a JSON round-trip
   * (#78, and the project memory rule 「never JSON round-trip content docs」).
   */
  patchAbility: (id: string, patch: Record<string, unknown>) => {
    assertWritable();
    return request<WriteResult>(`${BASE}/abilities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  /**
   * 鑄技工坊 mirror writeback, embedded half. Replaces exactly the champion
   * doc's `abilities.<slot>` span via a brace-matched line edit; every other
   * byte of the champion file (all the sibling slots' floats) is preserved.
   */
  patchChampionSlot: (championId: string, slot: string, embedded: unknown) => {
    assertWritable();
    return request<WriteResult>(`${BASE}/champions/${championId}/abilities/${slot}`, {
      method: "PATCH",
      body: JSON.stringify(embedded),
    });
  },

  /**
   * Rebuild `_index.json` / `manifest.json` / the content bundle — the API-side
   * equivalent of `pnpm content:build`, so the editor never shells out to pnpm
   * to finish a save (design §2.3 step 4).
   */
  rebuild: () => {
    assertWritable();
    return request<{ collections: number; contentVersion: string }>(`${BASE}/rebuild`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  validate: (collection: CollectionName, id: string, doc: unknown) =>
    request<{ ok: boolean; hash: string }>(`${BASE}/${collection}/${id}/validate`, {
      method: "POST",
      body: JSON.stringify(doc),
    }),
  /**
   * Submit an AI-authored candidate to the local human-review ledger.  This
   * writes no game content; only the admin review page can approve and Promote
   * the exact candidate hash later.
   */
  submitAiProposal: (input: {
    target: { collection: CollectionName; id: string };
    purpose: "production-candidate" | "editor-capability-fixture";
    candidate: unknown;
    summary?: string;
    evidence?: string[];
    visualEvidence?: AiVisualEvidence[];
    visualAudit?: AiVisualAuditReceipt;
    autoVisualScore?: number;
  }) => {
    assertWritable();
    return request<AiProposalResult>(`${BASE}/ai-review/proposals`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  /**
   * Write a binary asset (base64) to content/<contentPath>. Used by the AI-icon
   * Accept flow to store the generated PNG under assets/icons/<kind>/<id>.png.
   * `contentPath` must be under "assets/".
   */
  putAsset: (contentPath: string, base64: string) => {
    assertWritable();
    return request<{ path: string; bytes: number }>(`${BASE}/${contentPath}`, {
      method: "PUT",
      body: JSON.stringify({ base64 }),
    });
  },
};

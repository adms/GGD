/**
 * 內容覆蓋層 (task #189) — the PRODUCTION-BUILD content write path.
 *
 * ── WHY THIS EXISTS NEXT TO contentApi.ts, RATHER THAN INSTEAD OF IT ─────────
 * `contentApi.ts` is the DEV editor's write module: it PUTs to
 * `/content-api/{collection}/{id}`, the loopback-only Fastify service, and its
 * whole surface is folded away by `import.meta.env.DEV` in a production build.
 * That is correct and must not change — `/content-api` has no route in the
 * production edge and never will (contentGate.test.ts pins that, and it is a
 * standing owner rule).
 *
 * The consequence, though, was that on ggd.adms.ai there was NO way to change
 * content at all: the editor is not in the bundle, and the only writer it had
 * targeted a service that is not deployed. #189's durable `data/` overlay
 * shipped a store with no producer.
 *
 * This module is that producer, and it is a DIFFERENT one on purpose:
 *
 *   • it writes to `/api/v1/content-overlay/...` — the PLATFORM, through the
 *     normal /api proxy, with an admin JWT, audited server-side;
 *   • it has no dev gate, because it is safe in production BY AUTHORISATION
 *     (argon2id + JWT + AdminOnly) rather than by absence;
 *   • it never mentions `/content-api`, so the loopback posture is untouched.
 *
 * ── WHAT IT WRITES, AND WHERE IT LANDS ──────────────────────────────────────
 * An edit becomes an entry in `DATA_DIR/content-overlay/overlay.json`, which on
 * the host is `<repo>/data/content-overlay/overlay.json` via the `../data:/data`
 * bind mount — outside the image and gitignored, so it survives both
 * `docker compose build && up -d` and a `git pull`.
 *
 * Everything here is a pure function over plain data so the page's behaviour
 * (state labels, JSON validation, sorting, the flagged summary) is unit-tested
 * without React or a browser. The network wrappers live in api.ts with every
 * other platform call.
 */

import { COLLECTIONS, COLLECTION_NAMES, isCollectionName } from "@ggd/shared/content";

// ------------------------------------------------------------ the states ----

/**
 * The precedence verdict the platform computes per overlaid key
 * (apps/platform/internal/contentoverlay/precedence.go). The console never
 * decides these — it renders them.
 */
export type OverlayState =
  | "clean"
  | "stale"
  | "orphan"
  | "added"
  | "shadow"
  | "unknown-base"
  | "tombstone"
  | "tombstone-moot";

export const OVERLAY_STATES: readonly OverlayState[] = [
  "clean",
  "stale",
  "orphan",
  "added",
  "shadow",
  "unknown-base",
  "tombstone",
  "tombstone-moot",
] as const;

/** Row tone. `warn` rows are the ones the owner has to look at. */
export type StateTone = "ok" | "warn" | "info";

export const STATE_LABEL: Record<OverlayState, string> = {
  clean: "一致",
  stale: "出貨版已更新",
  orphan: "出貨版已刪除",
  added: "新增",
  shadow: "撞名出貨版",
  "unknown-base": "無法判定",
  tombstone: "已隱藏",
  "tombstone-moot": "已隱藏(出貨版已無)",
};

export const STATE_TONE: Record<OverlayState, StateTone> = {
  clean: "ok",
  stale: "warn",
  orphan: "warn",
  added: "ok",
  shadow: "warn",
  "unknown-base": "warn",
  tombstone: "info",
  "tombstone-moot": "info",
};

/**
 * One sentence per state, saying WHAT IS LIVE — because the surprising part of
 * the precedence rule is that a flagged entry still wins. A red badge that did
 * not say so would read as "this edit is not applied", which is the opposite of
 * the truth.
 */
export const STATE_HINT: Record<OverlayState, string> = {
  clean: "覆蓋層生效中；出貨版自編輯後沒有變動。",
  stale: "出貨版（repo）在你編輯之後被改過了。你的覆蓋仍然生效並蓋掉新版本 — 想改用 repo 版本請按「還原」。",
  orphan: "這份文件已從出貨版（repo）移除。你的覆蓋仍然生效，而且現在是這個 id 唯一的來源 — 按「還原」它就會整份消失。",
  added: "出貨版沒有這個 id，這是你新增的文件。",
  shadow: "出貨版後來也有了同樣的 id。你的覆蓋仍然生效並蓋掉那份從未比對過的出貨文件。",
  "unknown-base": "沒有可用的比對基準（舊版覆蓋層，或編輯當下讀不到 content/）。無法判斷是否過期 — 一律視為需要檢查。",
  tombstone: "這個 id 被覆蓋層隱藏，合併後的內容樹不會有它。",
  "tombstone-moot": "隱藏標記還在，但出貨版已經沒有這個 id 了 — 可以清掉。",
};

export function isOverlayState(v: string): v is OverlayState {
  return (OVERLAY_STATES as readonly string[]).includes(v);
}

/** Flagged = the platform wants a human to look. Mirrors `flagged` on the wire. */
export const FLAGGED_STATES: readonly OverlayState[] = OVERLAY_STATES.filter(
  (s) => STATE_TONE[s] === "warn",
);

// --------------------------------------------------------------- the doc ----

export interface OverlayStatusEntry {
  key: string;
  collection: string;
  id: string;
  state: OverlayState;
  flagged: boolean;
  tombstone: boolean;
  baseHash: string;
  shippedHash: string;
  bytes: number;
  editedAt: string;
  editedBy: string;
}

export interface OverlayDegraded {
  at: string;
  reason: string;
  bytes: number;
  quarantine: string;
}

export interface OverlayShippedInfo {
  dir: string;
  available: boolean;
  detail: string;
}

export interface OverlayStatus {
  schemaVersion: number;
  generation: number;
  fingerprint: string;
  updatedAt: string;
  updatedBy: string;
  degraded: OverlayDegraded | null;
  shipped: OverlayShippedInfo;
  entries: OverlayStatusEntry[];
  counts: Record<string, number>;
  flaggedCount: number;
  dataPath: string;
}

/**
 * What a mutation returns: the cheap probe document. `degraded` is true when the
 * durable file on disk could not be parsed — it is on the response so a write
 * that had to step over a corrupt file cannot pass unnoticed.
 */
export interface OverlayHead {
  schemaVersion: number;
  generation: number;
  fingerprint: string;
  docCount: number;
  deletedCount: number;
  updatedAt: string;
  updatedBy: string;
  degraded: boolean;
}

export interface OverlayLogLine {
  generation: number;
  at: string;
  by: string;
  op: string;
  key: string;
}

export function emptyStatus(): OverlayStatus {
  return {
    schemaVersion: 1,
    generation: 0,
    fingerprint: "",
    updatedAt: "",
    updatedBy: "",
    degraded: null,
    shipped: { dir: "", available: false, detail: "" },
    entries: [],
    counts: {},
    flaggedCount: 0,
    dataPath: "",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function bool(v: unknown): boolean {
  return v === true;
}

/**
 * Defensive normalisation of the platform payload.
 *
 * The one judgement call: an UNRECOGNISED state maps to "unknown-base", not to
 * "clean". A console built against an older platform must not paint a row green
 * because it did not understand the verdict — the whole point of the state is
 * that "cannot tell" is louder than "fine".
 */
export function normalizeStatus(raw: unknown): OverlayStatus {
  const out = emptyStatus();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;

  out.schemaVersion = num(r.schemaVersion) || 1;
  out.generation = num(r.generation);
  out.fingerprint = str(r.fingerprint);
  out.updatedAt = str(r.updatedAt);
  out.updatedBy = str(r.updatedBy);
  out.flaggedCount = num(r.flaggedCount);
  out.dataPath = str(r.dataPath);

  const d = r.degraded;
  if (typeof d === "object" && d !== null) {
    const dd = d as Record<string, unknown>;
    out.degraded = {
      at: str(dd.at),
      reason: str(dd.reason),
      bytes: num(dd.bytes),
      quarantine: str(dd.quarantine),
    };
  }

  const s = r.shipped;
  if (typeof s === "object" && s !== null) {
    const ss = s as Record<string, unknown>;
    out.shipped = {
      dir: str(ss.dir),
      available: bool(ss.available),
      detail: str(ss.detail),
    };
  }

  if (typeof r.counts === "object" && r.counts !== null) {
    for (const [k, v] of Object.entries(r.counts as Record<string, unknown>)) {
      out.counts[k] = num(v);
    }
  }

  if (Array.isArray(r.entries)) {
    for (const e of r.entries) {
      if (typeof e !== "object" || e === null) continue;
      const ee = e as Record<string, unknown>;
      const rawState = str(ee.state);
      const state: OverlayState = isOverlayState(rawState) ? rawState : "unknown-base";
      out.entries.push({
        key: str(ee.key),
        collection: str(ee.collection),
        id: str(ee.id),
        state,
        // trust the server's own flag, but never let a row the console could not
        // classify pass as unflagged
        flagged: bool(ee.flagged) || STATE_TONE[state] === "warn",
        tombstone: bool(ee.tombstone),
        baseHash: str(ee.baseHash),
        shippedHash: str(ee.shippedHash),
        bytes: num(ee.bytes),
        editedAt: str(ee.editedAt),
        editedBy: str(ee.editedBy),
      });
    }
  }
  return out;
}

export function normalizeLog(raw: unknown): OverlayLogLine[] {
  const src =
    typeof raw === "object" && raw !== null && Array.isArray((raw as { entries?: unknown }).entries)
      ? ((raw as { entries: unknown[] }).entries)
      : [];
  const out: OverlayLogLine[] = [];
  for (const e of src) {
    if (typeof e !== "object" || e === null) continue;
    const ee = e as Record<string, unknown>;
    out.push({
      generation: num(ee.generation),
      at: str(ee.at),
      by: str(ee.by),
      op: str(ee.op),
      key: str(ee.key),
    });
  }
  return out;
}

// ------------------------------------------------------------- behaviour ----

/**
 * Sort for display: flagged rows FIRST (they are the reason to open the page),
 * then by key. Stable and total, so the table never jitters between polls.
 */
export function sortEntries(entries: readonly OverlayStatusEntry[]): OverlayStatusEntry[] {
  return [...entries].sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/** Substring filter over key / editor / state label. Empty query keeps all. */
export function filterEntries(
  entries: readonly OverlayStatusEntry[],
  query: string,
): OverlayStatusEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...entries];
  return entries.filter(
    (e) =>
      e.key.toLowerCase().includes(q) ||
      e.editedBy.toLowerCase().includes(q) ||
      e.state.includes(q) ||
      STATE_LABEL[e.state].includes(query.trim()),
  );
}

/** One-line headline for the top of the page. */
export function summaryLine(st: OverlayStatus): string {
  if (st.degraded) return "覆蓋層檔案損毀 — 目前只提供出貨版內容";
  if (st.entries.length === 0) return "目前沒有任何覆蓋 — 玩家看到的就是 repo 出貨版內容";
  const n = st.entries.length;
  if (st.flaggedCount === 0) return `${n} 筆覆蓋，全部與出貨版一致`;
  return `${n} 筆覆蓋，其中 ${st.flaggedCount} 筆需要檢查`;
}

export type ParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validate the editor textarea before it can be sent.
 *
 * The platform rejects a non-object body with a 400 anyway; doing it here too is
 * not duplication for its own sake — it is the difference between "看不懂的
 * 400" and a message that names the problem while the text is still on screen.
 * It deliberately does NOT validate against the content schemas: those are the
 * game loader's Zod schemas, they are not bundled here, and the overlay store is
 * explicitly not the schema authority.
 */
export function parseDocInput(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "內容不能是空的" };
  if (!trimmed.startsWith("{")) return { ok: false, error: "內容必須是一個 JSON 物件 {...}" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, error: `JSON 格式錯誤：${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "內容必須是一個 JSON 物件 {...}，不能是陣列或純值" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

// ------------------------------------------------------- schema validation ---
/**
 * 覆蓋層寫入前的 Zod 驗證 (task #283).
 *
 * ── 這段程式碼補的是一句**假話** ────────────────────────────────────────────
 * `packages/shared/src/content/overlay.ts` 的檔頭寫著:
 *
 *     NOT the schema authority: overlay docs are validated by the game loader's
 *     Zod schemas on ingest … and BY THE ADMIN CONSOLE BEFORE IT EVER WRITES.
 *
 * 後半句不成立。`putOverlayDoc` 直接 PUT,平台端也不驗;`parseDocInput`(上面)
 * 只檢查「是不是一個 JSON 物件」,而且它自己的註解就明說**刻意不驗 schema**。
 * 於是一份壞文件會直接落進 `data/content-overlay/overlay.json`,而那份檔案
 * 現在同時餵給 shard **和每一個瀏覽器**(client 也讀 overlay)。兩邊各自有
 * 退路,但退路是保險,不是驗證 —— 保險的意思是「壞了以後不要一起死」,而
 * 操作者要的是「一開始就不要壞」。
 *
 * ── 誰驗得到、誰驗不到(不要假裝全部都驗了) ─────────────────────────────────
 * 有 schema 的是 `COLLECTIONS` 表裡的那些 collection —— champions / abilities /
 * items / augments / projectiles / status-effects / loot-tables / arenas /
 * config / models / vfx / skins / ability-templates。平台接受**任何**符合正規式
 * 的 collection 名字,所以一個不在表裡的名字(例如手打的 `experiments`)是
 * **驗不到的**:那種情況回傳 `validated: false` 並附上理由,呼叫端要把它顯示
 * 出來,而不是靜靜當成通過。
 */

/** The collections that have a Zod schema (i.e. that this gate can actually check). */
export const VALIDATED_COLLECTIONS: readonly string[] = COLLECTION_NAMES;

export type OverlayValidation =
  /** parsed clean against the collection's schema */
  | { ok: true; validated: true }
  /** no schema exists for this collection — written unchecked, and says so */
  | { ok: true; validated: false; reason: string }
  /** the doc is wrong and must NOT be written */
  | { ok: false; error: string };

/** Compact zh-Hant rendering of the first few Zod issues. */
function issueText(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  const parts = err.issues.slice(0, 4).map((i) => {
    const at = i.path.length > 0 ? i.path.join(".") : "(根)";
    return `${at}: ${i.message}`;
  });
  const more = err.issues.length > parts.length ? `（另有 ${err.issues.length - parts.length} 項）` : "";
  return parts.join("；") + more;
}

/**
 * Validate one doc against its collection's schema. Never throws.
 *
 * The `id` check is deliberate and comes FIRST: the overlay is keyed
 * `collection/id`, but the doc carries its own `id` field, and the merged tree
 * indexes by the KEY while every consumer reads the FIELD. A mismatch is a doc
 * that exists under one name and calls itself another — which no schema can
 * catch, because both halves are individually valid.
 */
export function validateOverlayDoc(
  collection: string,
  id: string,
  doc: unknown,
): OverlayValidation {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return { ok: false, error: "內容必須是一個 JSON 物件 {...}" };
  }
  const docId = (doc as { id?: unknown }).id;
  if (typeof docId === "string" && docId !== id) {
    return { ok: false, error: `文件的 id 是 "${docId}",但要寫到 "${id}" —— 兩者必須一致` };
  }
  if (!isCollectionName(collection)) {
    return {
      ok: true,
      validated: false,
      reason: `collection「${collection}」沒有對應的 schema，這次寫入未經驗證`,
    };
  }
  const spec = COLLECTIONS[collection];
  const parsed = spec.schema.safeParse(doc);
  if (!parsed.success) {
    return { ok: false, error: `不符合 ${collection} 的 schema —— ${issueText(parsed.error)}` };
  }
  return { ok: true, validated: true };
}

/** MIRRORS the platform's collectionRe / idRe so a typo is caught before the PUT. */
const COLLECTION_RE = /^[a-z][a-z0-9-]{0,31}$/;
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function validateKeyInput(collection: string, id: string): string | null {
  if (!COLLECTION_RE.test(collection)) return "collection 格式不正確（小寫英數與 -）";
  if (!ID_RE.test(id)) return "id 格式不正確（英數與 . _ -）";
  return null;
}

/** Pretty-print a doc for the editor textarea. */
export function formatDoc(doc: unknown): string {
  try {
    return JSON.stringify(doc, null, 2);
  } catch {
    return "";
  }
}

/** Short local timestamp; empty for a missing/zero time. */
export function formatWhen(iso: string): string {
  if (!iso || iso.startsWith("0001-01-01")) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/** Short hash for a table cell. */
export function shortHash(h: string): string {
  return h === "" ? "—" : h.slice(0, 8);
}

/**
 * The collections the console offers in the picker. Not a whitelist — the
 * platform accepts any collection matching its regex — just the ones worth
 * one click. Kept in the same order as the content tree.
 */
export const COMMON_COLLECTIONS: readonly string[] = [
  "champions",
  "abilities",
  "items",
  "augments",
  "status-effects",
  "projectiles",
  "vfx",
  "arenas",
  "loot-tables",
  "config",
] as const;

/**
 * Dev-only content-api (Fastify): validated CRUD over the content/ JSON store.
 *
 *   GET    /content-api/manifest
 *   GET    /content-api/:collection/_index
 *   GET    /content-api/:collection/:id
 *   PUT    /content-api/:collection/:id            upsert (Zod validate -> atomic write -> reindex)
 *   POST   /content-api/:collection/:id            create (409 if exists)
 *   DELETE /content-api/:collection/:id
 *   PATCH  /content-api/abilities/:id              member patch (LINE EDIT, no JSON round-trip)
 *   PATCH  /content-api/champions/:id/abilities/:slot  embedded mirror slot (LINE EDIT)
 *   POST   /content-api/rebuild                    `pnpm content:build` as an endpoint
 *   POST   /content-api/:collection/:id/validate   dry-run (writes nothing)
 *   GET    /content-api/:collection/:id/backups    undo history for one doc
 *   POST   /content-api/:collection/:id/restore    restore a snapshot (itself undoable)
 *   GET    /content-api/events                     SSE content:changed (chokidar)
 *   GET    /content-api/assets/*                   binary assets (glb/textures) for editor previews
 *   POST   /content-api/external-target-profile    bounded allow-listed HTTPS profile bridge
 *
 * Every write validates with the SAME Zod schemas the game loader uses, then
 * writes atomically (tmp+rename) and incrementally reindexes (collection
 * _index.json + manifest.json). Path confinement: collection whitelist, id
 * regex ^[a-z0-9][a-z0-9._-]*$, and a resolved-path check inside content/.
 *
 * REFUSES to run in production — prod serves content/ as static files.
 *
 * AUTHORISATION (task #96): every MUTATING verb goes through guard.ts —
 * loopback peer (read off the socket, never a forwarded header) plus a local
 * dev `Origin`. Reads stay open. See guard.ts for the full reasoning.
 *
 * UNDO (task #96, and #65 is still open — this repo has no VCS): every
 * overwrite and delete first snapshots the bytes on disk into the git-ignored
 * undo store (backup.ts), and /restore puts one back.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import {
  COLLECTIONS,
  ID_RE,
  hashDoc,
  isCollectionName,
  validateDoc,
  type CollectionName,
  type FieldIssue,
} from "@ggd/shared/content";
import {
  CORE_SLOTS,
  setAt,
  spliceEmbeddedSlot,
  spliceMembers,
  type CoreSlot,
} from "@ggd/shared/content/editModel";
import {
  deleteContentBundle,
  deleteDocFile,
  docPath,
  rebuildAllIndexes,
  rebuildCollectionIndex,
  rebuildManifest,
  writeDocAtomic,
} from "@ggd/shared/content/node";
import { SseHub } from "./sse";
import { registerDevWriteGuard } from "./guard";
import { listSnapshots, readSnapshot, snapshotFile, snapshotText } from "./backup";
import { registerImportRoutes } from "./importRoutes";
import {
  registerEditorSourceRoutes,
  registerProductWriteGuard,
} from "./editorSourceRoutes";
import {
  ExternalProfileError,
  fetchExternalTargetProfile,
  parseEditorProfileHosts,
} from "./externalProfile";

export interface ContentApiOptions {
  contentDir: string;
  /** attach the chokidar file watcher (off in tests) */
  watch?: boolean;
  logger?: boolean;
  /** test-only escape hatch for the production refusal check */
  allowProduction?: boolean;
  /**
   * Undo store for pre-write snapshots. Defaults to `<contentDir>/../data/
   * content-backups` — the repo's git-ignored runtime store, deliberately
   * OUTSIDE content/ so backups never reach the deployable tree or an image.
   */
  backupDir?: string;
  /** HTTPS hosts the local editor may use as published target-profile bases. */
  externalProfileHosts?: readonly string[];
  /** test seam; production code uses the platform fetch implementation. */
  externalProfileFetch?: typeof fetch;
}

interface Params {
  collection: string;
  id: string;
}

const err = (reply: FastifyReply, code: number, message: string, issues?: FieldIssue[]) =>
  reply.code(code).send({ error: message, ...(issues ? { errors: issues } : {}) });

/** content types for the read-only asset route (editor 3D previews) */
const ASSET_MIME: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ktx2": "image/ktx2",
  ".bin": "application/octet-stream",
};

export function buildServer(opts: ContentApiOptions): FastifyInstance {
  if (process.env.NODE_ENV === "production" && !opts.allowProduction) {
    throw new Error(
      "content-api is a DEV-ONLY service and refuses to run with NODE_ENV=production " +
        "(production serves content/ as static files via nginx)",
    );
  }
  const root = resolve(opts.contentDir);
  if (!existsSync(root)) {
    throw new Error(`content dir not found: ${root} — run \`pnpm content:export\` first`);
  }

  const backupRoot = resolve(opts.backupDir ?? join(root, "..", "data", "content-backups"));

  // `trustProxy` is deliberately LEFT OFF: the write guard must never be able
  // to be talked into believing a forwarded header.
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 2 * 1024 * 1024 });
  // FIRST hook registered, so a refused write never reaches routing or the disk.
  registerDevWriteGuard(app);
  const hub = new SseHub();
  // expose for tests / index.ts
  app.decorate("sseHub", hub);
  app.decorate("backupDir", backupRoot);

  app.post("/content-api/external-target-profile", async (req, reply) => {
    const body = req.body as { url?: unknown } | null;
    try {
      return reply.send(await fetchExternalTargetProfile(body?.url, {
        allowedHosts: opts.externalProfileHosts ?? parseEditorProfileHosts(process.env.GGD_EDITOR_PROFILE_HOSTS),
        ...(opts.externalProfileFetch ? { fetchImpl: opts.externalProfileFetch } : {}),
      }));
    } catch (error) {
      if (error instanceof ExternalProfileError) return err(reply, error.statusCode, error.message);
      req.log.warn({ err: error }, "external target profile fetch failed");
      return err(reply, 502, `target profile 讀取失敗：${String(error)}`);
    }
  });

  const backupWarn = (e: unknown): void => {
    app.log.warn({ err: e }, "content-api: could not write an undo snapshot");
  };

  /** collection whitelist + id regex + resolved-path confinement. */
  function resolveDoc(
    reply: FastifyReply,
    p: Params,
  ): { collection: CollectionName; id: string; file: string } | null {
    if (!isCollectionName(p.collection)) {
      void err(reply, 404, `unknown collection "${p.collection}"`);
      return null;
    }
    if (!ID_RE.test(p.id)) {
      void err(reply, 400, `invalid id "${p.id}" (must match ${ID_RE})`);
      return null;
    }
    let file: string;
    try {
      file = docPath(root, p.collection, p.id); // re-checks confinement
    } catch {
      void err(reply, 400, "path escapes content root");
      return null;
    }
    if (!file.startsWith(root + sep)) {
      void err(reply, 400, "path escapes content root");
      return null;
    }
    return { collection: p.collection, id: p.id, file };
  }

  /**
   * Incremental reindex after a write/delete: one collection + manifest.
   *
   * ALSO DELETES content/bundle.json. The bundle is a whole-tree artifact built
   * by `pnpm content:build`; this endpoint rewrites ONE doc, so any bundle on
   * disk is now stale. A stale bundle is worse than none — the client would
   * hydrate OLD docs (and the old contentVersion, so the mismatch gate would
   * not even fire) while the game-server, which reads the filesystem directly,
   * has the new ones. Deleting it makes the client's FallbackContentSource
   * drop straight back to per-doc fetching, which is always fresh.
   *
   * Rebuilding the whole bundle here is the alternative, and the honest reason
   * not to is NOT cost: measured on this tree, read+parse of all 1,441 docs is
   * 52 ms and stringifying the bundle is 20 ms — ~80 ms, on an endpoint that
   * already re-hashes an entire collection. The real reasons are that (a)
   * `content/bundle.json` is a COMMITTED artifact and a dev CRUD endpoint
   * should not be silently authoring one, and (b) deleting fails safe while
   * rebuilding fails dangerous — a rebuild that goes wrong leaves a
   * confidently-wrong bundle, whereas a missing one just costs requests.
   */
  function reindex(collection: CollectionName): { collectionHash: string; contentVersion: string } {
    const index = rebuildCollectionIndex(root, collection);
    const manifest = rebuildManifest(root, { indexes: { [collection]: index } });
    deleteContentBundle(root);
    return { collectionHash: index.hash, contentVersion: manifest.contentVersion };
  }

  function validateBody(
    reply: FastifyReply,
    collection: CollectionName,
    id: string,
    body: unknown,
  ): { id: string } | null {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      void err(reply, 422, "body must be a JSON object", [
        { path: "", message: "expected an object document", code: "invalid_type" },
      ]);
      return null;
    }
    const doc = body as Record<string, unknown>;
    const issues: FieldIssue[] = [];
    if (doc.id !== id) {
      issues.push({ path: "id", message: `doc id must equal URL id "${id}"`, code: "custom" });
    }
    const expectedTag = COLLECTIONS[collection].schemaTag;
    if (doc.schema !== expectedTag) {
      issues.push({ path: "schema", message: `schema must be "${expectedTag}"`, code: "custom" });
    }
    const res = validateDoc(collection, doc);
    if (!res.ok) issues.push(...res.issues);
    if (issues.length > 0) {
      void err(reply, 422, "validation failed", issues);
      return null;
    }
    return res.ok ? (res.doc as { id: string }) : null;
  }

  // ---------- reads ----------
  app.get("/content-api/manifest", async (_req, reply) => {
    const p = join(root, "manifest.json");
    if (!existsSync(p)) return err(reply, 404, "manifest.json not found — run content:build");
    return reply.type("application/json").send(await readFile(p, "utf8"));
  });

  app.get<{ Params: { collection: string } }>(
    "/content-api/:collection/_index",
    async (req, reply) => {
      if (!isCollectionName(req.params.collection)) {
        return err(reply, 404, `unknown collection "${req.params.collection}"`);
      }
      const p = join(root, req.params.collection, "_index.json");
      if (!existsSync(p)) return err(reply, 404, "_index.json not found — run content:build");
      return reply.type("application/json").send(await readFile(p, "utf8"));
    },
  );

  app.get<{ Params: Params }>("/content-api/:collection/:id", async (req, reply) => {
    const loc = resolveDoc(reply, req.params);
    if (!loc) return;
    if (!existsSync(loc.file)) return err(reply, 404, `${loc.collection}/${loc.id} not found`);
    return reply.type("application/json").send(await readFile(loc.file, "utf8"));
  });

  // ---------- writes ----------
  const upsert = (create: boolean) =>
    async function handler(
      req: { params: Params; body: unknown },
      reply: FastifyReply,
    ): Promise<unknown> {
      const loc = resolveDoc(reply, req.params);
      if (!loc) return;
      const exists = existsSync(loc.file);
      if (create && exists) {
        return err(reply, 409, `${loc.collection}/${loc.id} already exists`);
      }
      const doc = validateBody(reply, loc.collection, loc.id, req.body);
      if (!doc) return;
      // UNDO FIRST: snapshot what is about to be destroyed, before destroying it.
      const backup = snapshotFile(backupRoot, loc.collection, loc.id, loc.file, {
        onError: backupWarn,
      });
      const { hash } = writeDocAtomic(root, loc.collection, doc);
      const { collectionHash, contentVersion } = reindex(loc.collection);
      hub.publish({
        type: "content:changed",
        collection: loc.collection,
        id: loc.id,
        change: exists ? "change" : "add",
      });
      return reply.code(create ? 201 : 200).send({
        id: loc.id,
        hash,
        collectionHash,
        contentVersion,
        backup: backup?.file ?? null,
      });
    };

  app.put<{ Params: Params }>("/content-api/:collection/:id", upsert(false));
  app.post<{ Params: Params }>("/content-api/:collection/:id", upsert(true));

  app.delete<{ Params: Params }>("/content-api/:collection/:id", async (req, reply) => {
    const loc = resolveDoc(reply, req.params);
    if (!loc) return;
    // a delete is the most destructive verb here — snapshot before unlinking,
    // so /restore can bring the document back.
    const backup = snapshotFile(backupRoot, loc.collection, loc.id, loc.file, {
      onError: backupWarn,
    });
    if (!deleteDocFile(root, loc.collection, loc.id)) {
      return err(reply, 404, `${loc.collection}/${loc.id} not found`);
    }
    const { collectionHash, contentVersion } = reindex(loc.collection);
    hub.publish({ type: "content:changed", collection: loc.collection, id: loc.id, change: "unlink" });
    return reply.send({
      id: loc.id,
      deleted: true,
      collectionHash,
      contentVersion,
      backup: backup?.file ?? null,
    });
  });

  // ---------- 鑄技工坊 (Skill Forge, #141/#205): LINE-EDIT member patches ------
  //
  // Why these exist alongside PUT: PUT round-trips the whole doc through
  // `JSON.stringify(v, null, 2)`. The w3x importer is Python and writes whole
  // numbers as `30.0`; Node writes `30`. Measured on content/champions/
  // godie-hart.json, a no-op PUT rewrites 56 of its 359 lines. That is the exact
  // failure #78 and the project's content rules forbid — an edit to ONE ability
  // slot must not restate every float in the champion.
  //
  // So the forge writes through a MEMBER PATCH: validate the whole resulting doc
  // first, then splice only the named members into the file's existing TEXT.
  //
  // SECURITY: nothing new is opened. `registerDevWriteGuard` is an onRequest
  // hook and PATCH is already in its MUTATING set, so both routes inherit the
  // loopback-peer + local-Origin check; buildServer still refuses to boot under
  // NODE_ENV=production. guard.ts and both nginx confs are untouched.

  /** Atomic text write (tmp + rename), the byte-preserving sibling of writeDocAtomic. */
  function writeTextAtomic(file: string, text: string): void {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, file);
  }

  /** PATCH a standalone ability doc's members (the writeback's step 1). */
  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/content-api/abilities/:id",
    async (req, reply) => {
      const loc = resolveDoc(reply, { collection: "abilities", id: req.params.id });
      if (!loc) return;
      if (!existsSync(loc.file)) return err(reply, 404, `abilities/${loc.id} not found`);
      const patch = req.body;
      if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
        return err(reply, 422, "body must be a JSON object of members to patch", [
          { path: "", message: "expected an object", code: "invalid_type" },
        ]);
      }
      const text = await readFile(loc.file, "utf8");
      const current = JSON.parse(text) as Record<string, unknown>;
      // VALIDATE THE WHOLE RESULTING DOC before a single byte moves.
      const merged = { ...current, ...(patch as Record<string, unknown>) };
      const doc = validateBody(reply, "abilities", loc.id, merged);
      if (!doc) return;
      let next: string;
      try {
        next = spliceMembers(text, patch as Record<string, unknown>);
      } catch (e) {
        return err(reply, 422, `cannot splice member: ${String(e)}`);
      }
      const backup = snapshotFile(backupRoot, "abilities", loc.id, loc.file, { onError: backupWarn });
      writeTextAtomic(loc.file, next);
      const { collectionHash, contentVersion } = reindex("abilities");
      hub.publish({ type: "content:changed", collection: "abilities", id: loc.id, change: "change" });
      return reply.send({
        id: loc.id,
        hash: hashDoc(doc),
        collectionHash,
        contentVersion,
        backup: backup?.file ?? null,
      });
    },
  );

  /**
   * PATCH the champion-embedded twin of one ability (the writeback's step 2).
   * Mirror direction is ALWAYS standalone → embedded (the STRICT model): the
   * body is `embeddedForm(abilityDoc)` and it replaces the whole
   * `abilities.<slot>` span, brace-matched, leaving every sibling slot's bytes
   * exactly as they were.
   */
  app.patch<{ Params: { id: string; slot: string }; Body: unknown }>(
    "/content-api/champions/:id/abilities/:slot",
    async (req, reply) => {
      const loc = resolveDoc(reply, { collection: "champions", id: req.params.id });
      if (!loc) return;
      if (!existsSync(loc.file)) return err(reply, 404, `champions/${loc.id} not found`);
      const slot = req.params.slot;
      if (!CORE_SLOTS.includes(slot as CoreSlot)) {
        return err(reply, 404, `unknown ability slot "${slot}" (expected Q/W/E/R)`);
      }
      const embedded = req.body;
      if (typeof embedded !== "object" || embedded === null || Array.isArray(embedded)) {
        return err(reply, 422, "body must be the embedded AbilityDef object", [
          { path: "", message: "expected an object", code: "invalid_type" },
        ]);
      }
      const text = await readFile(loc.file, "utf8");
      const current = JSON.parse(text) as Record<string, unknown>;
      // Validate the WHOLE champion the patch would produce — an embedded slot
      // that is individually well-formed can still break the champion doc.
      const merged = setAt(current, `abilities.${slot}`, embedded);
      const doc = validateBody(reply, "champions", loc.id, merged);
      if (!doc) return;
      let next: string;
      try {
        next = spliceEmbeddedSlot(text, slot as CoreSlot, embedded as Record<string, unknown>);
      } catch (e) {
        return err(reply, 422, `cannot splice abilities.${slot}: ${String(e)}`);
      }
      const backup = snapshotFile(backupRoot, "champions", loc.id, loc.file, { onError: backupWarn });
      writeTextAtomic(loc.file, next);
      const { collectionHash, contentVersion } = reindex("champions");
      hub.publish({ type: "content:changed", collection: "champions", id: loc.id, change: "change" });
      return reply.send({
        id: loc.id,
        hash: hashDoc(doc),
        collectionHash,
        contentVersion,
        backup: backup?.file ?? null,
      });
    },
  );

  /**
   * `pnpm content:build` as an endpoint — every _index.json, manifest.json AND
   * content/bundle.json, which is what `rebuildAllIndexes` does by default. The
   * editor calls this ONCE at the end of a save so the designer never has to
   * shell out to pnpm (design §2.3 step 4), and so the committed bundle stops
   * being stale (bundle.test.ts asserts it matches the docs on disk).
   *
   * This is deliberately NOT what per-doc writes do: `reindex()` above only
   * DELETES the bundle, because a CRUD endpoint quietly authoring a committed
   * artifact on every keystroke-save is a different thing from the designer
   * explicitly pressing 「重建索引」 at the end of an edit.
   */
  app.post("/content-api/rebuild", async (_req, reply) => {
    const manifest = rebuildAllIndexes(root);
    hub.publish({ type: "content:changed", collection: "config", id: "*", change: "change" });
    return reply.send({
      collections: Object.keys(manifest.collections).length,
      contentVersion: manifest.contentVersion,
    });
  });

  // ---------- dry-run validate (never writes) ----------
  app.post<{ Params: Params }>("/content-api/:collection/:id/validate", async (req, reply) => {
    const loc = resolveDoc(reply, req.params);
    if (!loc) return;
    const doc = validateBody(reply, loc.collection, loc.id, req.body);
    if (!doc) return;
    return reply.send({ ok: true, hash: hashDoc(doc) });
  });

  // ---------- undo store (task #96; there is no VCS in this repo yet) ----------
  // GET  …/:id/backups          list the snapshots taken before each overwrite
  // POST …/:id/restore {file}   put one back (snapshotting the current state first)
  app.get<{ Params: Params }>("/content-api/:collection/:id/backups", async (req, reply) => {
    const loc = resolveDoc(reply, req.params);
    if (!loc) return;
    return reply.send({
      id: loc.id,
      collection: loc.collection,
      entries: listSnapshots(backupRoot, loc.collection, loc.id),
    });
  });

  app.post<{ Params: Params; Body: unknown }>(
    "/content-api/:collection/:id/restore",
    async (req, reply) => {
      const loc = resolveDoc(reply, req.params);
      if (!loc) return;
      const body = req.body as { file?: unknown } | null;
      // no `file` = "undo the last save": the newest snapshot.
      const wanted =
        typeof body?.file === "string" && body.file !== ""
          ? body.file
          : (listSnapshots(backupRoot, loc.collection, loc.id)[0]?.file ?? null);
      if (wanted === null) return err(reply, 404, `no backups for ${loc.collection}/${loc.id}`);
      const raw = readSnapshot(backupRoot, loc.collection, loc.id, wanted);
      if (raw === null) return err(reply, 404, `backup "${wanted}" not found`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return err(reply, 422, `backup "${wanted}" is not valid JSON`);
      }
      // a snapshot is only restorable if it still passes the live schemas — a
      // restore must never re-introduce a document the game cannot load.
      const doc = validateBody(reply, loc.collection, loc.id, parsed);
      if (!doc) return;
      // restoring is itself destructive, so it is itself undoable.
      const undo = existsSync(loc.file)
        ? snapshotFile(backupRoot, loc.collection, loc.id, loc.file, { onError: backupWarn })
        : snapshotText(backupRoot, loc.collection, loc.id, "", { onError: backupWarn });
      const { hash } = writeDocAtomic(root, loc.collection, doc);
      const { collectionHash, contentVersion } = reindex(loc.collection);
      hub.publish({ type: "content:changed", collection: loc.collection, id: loc.id, change: "change" });
      return reply.send({
        id: loc.id,
        restored: wanted,
        hash,
        collectionHash,
        contentVersion,
        backup: undo?.file ?? null,
      });
    },
  );

  // ---------- binary assets (dev-only; prod serves content/ via nginx) ----------
  // GET /content-api/assets/<path> -> content/assets/<path>. Read-only, path
  // confined to content/assets. Used by the editor's Babylon preview panels
  // (GLB models, particle textures).
  const assetRoot = join(root, "assets");
  app.get<{ Params: { "*": string } }>("/content-api/assets/*", async (req, reply) => {
    const rel = req.params["*"] ?? "";
    const segments = rel.split("/");
    if (rel === "" || segments.some((s) => s === "" || s === "." || s === ".." || s.includes("\0"))) {
      return err(reply, 400, "invalid asset path");
    }
    const file = resolve(assetRoot, rel);
    if (file !== assetRoot && !file.startsWith(assetRoot + sep)) {
      return err(reply, 400, "path escapes content assets root");
    }
    if (!existsSync(file)) return err(reply, 404, `asset not found: ${rel}`);
    return reply
      .type(ASSET_MIME[rel.slice(rel.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream")
      .header("cache-control", "no-cache")
      .send(await readFile(file));
  });

  // ---------- binary asset writes (dev-only; used by the editor AI-icon flow) ----------
  // PUT /content-api/assets/<path>  { base64 } -> content/assets/<path>. Path
  // confined to content/assets, restricted to image extensions, atomic write
  // (tmp+rename), parent dirs created. The AI-icon Accept flow stores generated
  // PNGs at assets/icons/<kind>/<docId>.png here. Reads go through the GET route
  // above; nginx serves content/ statically in prod (this service is dev-only).
  const IMAGE_EXT = new Set([".png", ".webp", ".jpg", ".jpeg"]);
  app.put<{ Params: { "*": string }; Body: unknown }>(
    "/content-api/assets/*",
    async (req, reply) => {
      const rel = req.params["*"] ?? "";
      const segments = rel.split("/");
      if (
        rel === "" ||
        segments.some((s) => s === "" || s === "." || s === ".." || s.includes("\0"))
      ) {
        return err(reply, 400, "invalid asset path");
      }
      const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
      if (!IMAGE_EXT.has(ext)) {
        return err(reply, 400, `unsupported asset type "${ext}" (png/webp/jpg/jpeg only)`);
      }
      const file = resolve(assetRoot, rel);
      if (file !== assetRoot && !file.startsWith(assetRoot + sep)) {
        return err(reply, 400, "path escapes content assets root");
      }
      const body = req.body as { base64?: unknown } | null;
      const raw = typeof body?.base64 === "string" ? body.base64 : undefined;
      if (raw === undefined) {
        return err(reply, 422, "body must be { base64: string }", [
          { path: "base64", message: "expected a base64 string", code: "invalid_type" },
        ]);
      }
      const marker = "base64,";
      const b64 = raw.includes(marker) ? raw.slice(raw.indexOf(marker) + marker.length) : raw;
      const buf = Buffer.from(b64, "base64");
      if (buf.length === 0) return err(reply, 422, "decoded asset is empty");

      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      writeFileSync(tmp, buf);
      renameSync(tmp, file);
      hub.publish({ type: "content:changed", collection: "assets", id: rel, change: "add" });
      return reply.send({ path: `assets/${rel}`, bytes: buf.length });
    },
  );

  // ---------- Editor package importer (G1 握手層，唯讀；importRoutes.ts) ----------
  registerImportRoutes(app, { contentDir: root, gameVersion: process.env.GGD_BUILD_STAMP ?? null });

  // ⭐⭐ P0-1 —— 產生器來源轉接器（GH: editor seam）。
  //   ⚠️ `registerProductWriteGuard` 是 **onRequest**（比路由早）⇒ 一支 curl 也擋得住，
  //   ⛔ 不是「請編輯器不要直接寫產物」。
  const repoRoot = resolve(root, "..");
  registerProductWriteGuard(app, { repoRoot, contentDir: root });
  registerEditorSourceRoutes(app, { repoRoot, contentDir: root });

  // ---------- SSE ----------
  app.get("/content-api/events", (req, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const unsubscribe = hub.subscribe({ write: (chunk) => reply.raw.write(chunk) });
    const heartbeat = setInterval(() => reply.raw.write(": ping\n\n"), 15000);
    heartbeat.unref?.();
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // ---------- optional chokidar watcher (dev hot-reload) ----------
  if (opts.watch) {
    void attachWatcher(app, root, hub);
  }

  return app;
}

/** chokidar file watch -> SSE. Separate so tests can exercise the hub alone. */
async function attachWatcher(app: FastifyInstance, root: string, hub: SseHub): Promise<void> {
  const { watch } = await import("chokidar");
  const watcher = watch(root, {
    ignored: (path: string) => path.includes("_index.json") || path.endsWith("manifest.json"),
    ignoreInitial: true,
  });
  const emit = (change: "add" | "change" | "unlink") => (path: string) => {
    if (!path.endsWith(".json")) return;
    const rel = path.startsWith(root + sep) ? path.slice(root.length + 1) : path;
    const [collection, file] = rel.split(sep);
    if (!collection || !file || !isCollectionName(collection)) return;
    hub.publish({ type: "content:changed", collection, id: file.replace(/\.json$/, ""), change });
  };
  watcher.on("add", emit("add")).on("change", emit("change")).on("unlink", emit("unlink"));
  app.addHook("onClose", async () => {
    await watcher.close();
  });
}

declare module "fastify" {
  interface FastifyInstance {
    sseHub: SseHub;
    /** resolved undo store (backup.ts) — exposed for tests / index.ts logging */
    backupDir: string;
  }
}

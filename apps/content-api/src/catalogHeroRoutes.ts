import type { FastifyInstance } from "fastify";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { rebuildAllIndexes, deleteContentBundle } from "@ggd/shared/content/node";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { assetMediaType } from "@ggd/shared/content/assetReferences";
import { type HeroCatalogHistory } from "./catalogHistory";
import { HERO_CATALOG_WORK_ID, readHeroCatalog } from "./catalogVersions";
import { catalogHeroes } from "./catalogHero";
import { instantiateCatalogHero } from "./catalogHeroInstance";
import { productOwnershipOf } from "./editorSourceRoutes";

const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }); };
const hash = (bytes: Uint8Array | undefined) => bytes ? "sha256:" + sha256Bytes(bytes) : null;
interface RestoreCommand { heroPath: string; versionId: string; expectedCurrentVersion?: string; planDigest?: string }
interface Journal { id: string; before: string; target: string; heroPath: string; paths: { path: string; afterHash: string }[] }

/** Full-hero restores share the exact catalog archive used by ordinary saves.
 * A durable undo journal is recovered before the service accepts any request. */
export class CatalogHeroRoutes {
  private readonly journalPath: string;
  constructor(private readonly history: HeroCatalogHistory, private readonly repoRoot: string) {
    this.journalPath = join(history.store.directory, "hero-restore.pending.json");
    this.recover();
  }
  private sourcePath(path: string) {
    const rel = path.startsWith("catalog/") ? path.slice(8) : path;
    if (!/^[a-zA-Z0-9._/-]+$/.test(rel) || rel.split("/").some((part) => !part || part === "." || part === "..") || path.startsWith("overlay/")) fail("此版本路徑不能寫入內容目錄。", 422);
    const root = realpathSync(this.history.contentDir), target = resolve(root, rel);
    let ancestor = target; while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    const real = realpathSync(ancestor);
    if (!target.startsWith(root + sep) || (real !== root && !real.startsWith(root + sep))) fail("版本回復路徑越界。", 422);
    return target;
  }
  private durable(path: string, bytes: Uint8Array) {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`, fd = openSync(temp, "wx");
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    try { renameSync(temp, path); const dir = openSync(dirname(path), "r"); try { fsyncSync(dir); } finally { closeSync(dir); } }
    finally { rmSync(temp, { force: true }); }
  }
  private recover() {
    if (!existsSync(this.journalPath)) return;
    const journal = JSON.parse(readFileSync(this.journalPath, "utf8")) as Journal;
    const old = this.history.store.readWorkFiles(HERO_CATALOG_WORK_ID, journal.before);
    if (!old || !Array.isArray(journal.paths)) return fail("回復中斷，找不到完整復原版本。", 503);
    for (const entry of journal.paths) {
      const path = this.sourcePath(entry.path), present = existsSync(path) ? new Uint8Array(readFileSync(path)) : undefined;
      if (hash(present) !== entry.afterHash && hash(present) !== hash(old.get(entry.path))) fail("回復中斷後檔案另有修改，已保留復原紀錄並停止覆寫。", 503);
    }
    for (const entry of journal.paths) {
      const path = this.sourcePath(entry.path), bytes = old.get(entry.path);
      if (bytes) this.durable(path, bytes); else rmSync(path, { force: true });
    }
    rebuildAllIndexes(this.history.contentDir); deleteContentBundle(this.history.contentDir);
    rmSync(this.journalPath);
  }
  private command(body: unknown): RestoreCommand {
    if (!body || typeof body !== "object") return fail("版本要求不完整。", 400);
    const command = body as RestoreCommand;
    if (typeof command.heroPath !== "string" || !/^catalog\/(?:_legacy\/)?champions\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(command.heroPath) || !/^sha256:[a-f0-9]{64}$/.test(command.versionId)) return fail("英雄或版本識別不合法。", 400);
    return command;
  }
  private preview(command: RestoreCommand) {
    const historical = this.history.store.readWorkFiles(HERO_CATALOG_WORK_ID, command.versionId);
    if (!historical) return fail("找不到指定完整版本。", 404);
    const current = readHeroCatalog(this.history.contentDir, { gameRevision: this.history.gameRevision, allowIncomplete: true });
    const comparison = instantiateCatalogHero(current.files, historical, command.heroPath);
    const blockedSources = comparison.changes.flatMap(({ path }) => {
      if (!path.startsWith("catalog/") || path.startsWith("catalog/_legacy/") || !path.endsWith(".json")) return [];
      const [collection, file] = path.slice(8).split("/");
      const ownership = productOwnershipOf(this.repoRoot, collection!, file!.slice(0, -5));
      return ownership?.ownership === "generator-owned" ? [{ path, authors: ownership.authors }] : [];
    });
    const planDigest = contentSha256({ currentVersion: current.versionId, versionId: command.versionId, heroPath: command.heroPath, changes: comparison.changes, affected: comparison.affected, blockedSources });
    return { current, comparison, blockedSources, planDigest };
  }
  mount(app: FastifyInstance, onRestored: () => void) {
    app.get("/content-api/hero-catalog/heroes", async () => {
      const current = readHeroCatalog(this.history.contentDir, { gameRevision: this.history.gameRevision, allowIncomplete: true });
      return { heroes: catalogHeroes(current.files), currentVersion: current.versionId };
    });
    app.post("/content-api/hero-catalog/preview", async (req) => {
      const command = this.command(req.body), plan = this.preview(command), { target, changes, affected } = plan.comparison;
      return { hero: target.hero, versionId: command.versionId, currentVersion: plan.current.versionId, planDigest: plan.planDigest, heroDigest: target.digest,
        changes, affected, issues: target.issues, blockedSources: plan.blockedSources,
        files: target.facts, documents: [...target.files].filter(([path]) => path.startsWith("catalog/") && path.endsWith(".json")).map(([path, bytes]) => ({ path, source: Buffer.from(bytes).toString(), currentSource: plan.current.files.has(path) ? Buffer.from(plan.current.files.get(path)!).toString() : null })) };
    });
    app.post("/content-api/hero-catalog/restore", async (req) => {
      const command = this.command(req.body), plan = this.preview(command);
      if (command.expectedCurrentVersion !== plan.current.versionId || command.planDigest !== plan.planDigest) return fail("內容已更新，請重新比較後再回復。");
      if (plan.blockedSources.length) return fail("此回復包含產生器來源管理的檔案，尚不能直接覆写產物；請先從來源編輯流程處理。");
      if (plan.comparison.target.issues.length && plan.comparison.target.hero.catalog !== "legacy") return fail("此歷史版本有缺件或舊格式，不能直接套用至現行英雄。", 422);
      const writes = new Map(plan.comparison.changes.map(({ path }) => [path, plan.comparison.target.files.get(path)!]));
      const assets = [...writes].filter(([path]) => path.startsWith("assets/"));
      if (assets.length) {
        const manifest = JSON.parse(Buffer.from(plan.current.files.get("catalog/assets-manifest.json") ?? Buffer.from('{"schema":"ggd-assets-manifest@1","entries":[]}')).toString());
        const entries = new Map<string, Record<string, unknown>>(manifest.entries.map((entry: {path: string}) => [entry.path, entry]));
        for (const [path, bytes] of assets) entries.set(path, { ...entries.get(path), path, bytes: bytes.length, sha256: sha256Bytes(bytes), contentType: assetMediaType(path) });
        manifest.entries = [...entries.values()].sort((a, b) => String(a.path).localeCompare(String(b.path), "en"));
        manifest.counts = { entries: entries.size, totalBytes: manifest.entries.reduce((n: number, e: {bytes: number}) => n + e.bytes, 0) };
        writes.set("catalog/assets-manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
      }
      for (const path of writes.keys()) this.sourcePath(path);
      const checkpoint = this.history.capture();
      if (checkpoint.record.versionId !== command.expectedCurrentVersion) return fail("保存前內容已更新，未回復任何資料。");
      const journal: Journal = { id: randomUUID(), before: checkpoint.record.versionId, target: command.versionId, heroPath: command.heroPath, paths: [...writes].map(([path, bytes]) => ({ path, afterHash: hash(bytes)! })) };
      this.durable(this.journalPath, Buffer.from(JSON.stringify(journal)));
      try {
        for (const [path, bytes] of writes) this.durable(this.sourcePath(path), bytes);
        const manifest = rebuildAllIndexes(this.history.contentDir); deleteContentBundle(this.history.contentDir);
        const restored = this.history.capture();
        // The atomic rename is the transaction commit. Until then startup rolls
        // back every written document and asset using the immutable checkpoint.
        const auditPath = join(this.history.store.directory, "hero-restores", journal.id + ".json");
        this.durable(this.journalPath, Buffer.from(JSON.stringify({ ...journal, result: restored.record.versionId, affected: plan.comparison.affected })));
        mkdirSync(dirname(auditPath), { recursive: true }); renameSync(this.journalPath, auditPath);
        for (const path of [dirname(auditPath), dirname(this.journalPath)]) { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
        onRestored();
        return { versionId: restored.record.versionId, restoredFrom: command.versionId, previousVersion: checkpoint.record.versionId, contentVersion: manifest.contentVersion, affected: plan.comparison.affected };
      } catch (error) { this.recover(); throw error; }
    });
  }
}

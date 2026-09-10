import { existsSync, linkSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { zChampionDoc, type ChampionDoc } from "@ggd/shared/content/schema/champion";
import { zModelDoc, type ModelDoc } from "@ggd/shared/content/schema/model";
import {
  MODEL_VERSION_PREFIX, zChampionModelVersion, preferredModelVersion,
  type ChampionModelVersion, type ChampionModelVersionState, type ModelVersionCommand,
} from "@ggd/shared/content/schema/championModelVersions";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { effectiveYawOffsetDeg } from "@ggd/shared/content/glbYaw";
import { MODEL_UPLOAD_LIMITS, parseUploadGlb } from "@ggd/shared/content/modelUpload/glb";
import { inspectModelUpload } from "@ggd/shared/content/modelUpload/inspect";
import { heroModelBudgetIssues } from "@ggd/shared/content/modelUpload/heroModel";
import { docPath, fileJson } from "@ggd/shared/content/node";

export class ModelVersionError extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); }
}

interface FrozenBody { doc: ModelDoc; bytes: Uint8Array; version: ChampionModelVersion }

/** Version files are append-only; only a champion's active pointer changes. */
export class ModelVersions {
  constructor(private readonly root: string) {}

  private assertDocumentPath(file: string): void {
    if (!realpathSync(file).startsWith(realpathSync(this.root) + sep)) throw new ModelVersionError("模型版本文件不可連結到內容目錄外。", 422);
  }

  champion(id: string): ChampionDoc {
    const file = docPath(this.root, "champions", id);
    if (!existsSync(file)) throw new ModelVersionError("找不到英雄。", 404);
    this.assertDocumentPath(file);
    return zChampionDoc.parse(JSON.parse(readFileSync(file, "utf8")));
  }

  state(id: string): ChampionModelVersionState {
    const champion = this.champion(id);
    return { championId: id, expectedHash: contentSha256(champion), activeModelKey: champion.modelKey, versions: champion.modelVersions ?? [], selectionMode: champion.modelSelectionMode ?? "automatic", preferredModelKey: preferredModelVersion(champion.modelVersions ?? [])?.modelKey ?? champion.modelKey };
  }

  /** Generic CRUD/restore cannot erase the history or bypass a stale selection check. */
  guard(collection: string, id: string, body?: Record<string, unknown>): void {
    if (collection === "models" && (id.startsWith(MODEL_VERSION_PREFIX) || body?.bodyVersion !== undefined)) {
      throw new ModelVersionError("已保存的模型版本不能覆寫或刪除；請新增版本。", 409);
    }
    if (collection !== "champions") return;
    const file = docPath(this.root, "champions", id);
    if (existsSync(file)) this.assertDocumentPath(file);
    const current = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> : null;
    if (current?.modelSelectionMode !== body?.modelSelectionMode) throw new ModelVersionError("請使用模型選單切換自動或手動選用。", 409);
    if (current?.modelVersions === undefined && body?.modelVersions === undefined) {
      if (current && body && current.modelKey !== body.modelKey) throw new ModelVersionError("請透過「上線模型版本」保存舊版並套用新模型。", 409);
      return;
    }
    if (!body || contentSha256(current?.modelVersions ?? null) !== contentSha256(body.modelVersions ?? null) || current?.modelKey !== body.modelKey) {
      throw new ModelVersionError("請使用英雄的「上線模型版本」選單新增或切換模型；版本紀錄不可由 JSON 覆蓋或舊備份移除。", 409);
    }
  }

  private asset(path: string): Uint8Array {
    const root = realpathSync(this.root);
    const absolute = resolve(root, path);
    if (!path.startsWith("assets/") || !absolute.startsWith(root + sep) || path.split(/[\\/]/).some((s) => s === ".." || s === "." || s === "")) {
      throw new ModelVersionError("模型路徑必須位於內容素材目錄內。", 422);
    }
    if (!existsSync(absolute)) throw new ModelVersionError(`模型檔尚未匯入：${path}`, 422);
    if (!realpathSync(absolute).startsWith(root + sep)) throw new ModelVersionError("模型連結不可指向內容目錄外。", 422);
    if (statSync(absolute).size > MODEL_UPLOAD_LIMITS.fileBytes) throw new ModelVersionError("模型檔超過 32 MiB。", 422);
    return new Uint8Array(readFileSync(absolute));
  }

  private source(modelKey: string): { doc: ModelDoc; bytes: Uint8Array } {
    const file = docPath(this.root, "models", modelKey);
    if (!existsSync(file)) throw new ModelVersionError(`尚未匯入模型 ${modelKey}。`, 422);
    this.assertDocumentPath(file);
    const raw = readFileSync(file, "utf8");
    let doc: ModelDoc;
    try { doc = zModelDoc.parse(JSON.parse(raw)); }
    catch { throw new ModelVersionError("模型設定格式無效，未建立新版本。", 422); }
    if (doc.id !== modelKey) throw new ModelVersionError("模型 ID 與檔名不符。", 422);
    const bytes = this.asset(doc.glbPath);
    try { parseUploadGlb(bytes); }
    catch (error) { throw new ModelVersionError(error instanceof Error ? error.message : "GLB 格式無效。", 422); }
    return { doc, bytes };
  }

  private freeze(source: { doc: ModelDoc; bytes: Uint8Array }, label: string, provenance: ChampionModelVersion["source"], legacy: boolean, automaticEligible?: boolean): FrozenBody {
    // Keep the asset family prefix: legacy overlay detection depends on it.
    // Drop the live generator knob, since this GLB is already baked and immutable.
    const { voxel: _voxel, bodyVersion: _version, ...binding } = source.doc;
    const binarySha256 = sha256Bytes(source.bytes);
    const glbPath = `${source.doc.glbPath.slice(0, source.doc.glbPath.lastIndexOf("/"))}/versions/${binarySha256}.glb`;
    const appearance = { ...binding, glbPath, yawOffsetDeg: effectiveYawOffsetDeg(source.doc), bodyVersion: { sourceModelKey: source.doc.id, legacyAppearance: legacy } };
    // Identical bytes from different deliveries retain independently selectable provenance.
    const id = MODEL_VERSION_PREFIX + contentSha256({ appearance, label, source: provenance, ...(automaticEligible === undefined ? {} : { automaticEligible }) }).slice(7, 55);
    const doc = zModelDoc.parse({ ...appearance, id });
    const version = zChampionModelVersion.parse({ modelKey: id, label, sourceModelKey: source.doc.id, modelSha256: contentSha256(doc).slice(7), binarySha256, registeredAt: new Date().toISOString(), source: provenance, ...(automaticEligible === undefined ? {} : { automaticEligible }) });
    return { doc, bytes: source.bytes, version };
  }

  verify(version: ChampionModelVersion): void {
    const { doc, bytes } = this.source(version.modelKey);
    if (contentSha256(doc).slice(7) !== version.modelSha256 || sha256Bytes(bytes) !== version.binarySha256) {
      throw new ModelVersionError("保存的模型或動作設定已被外部修改，未切換上線版本。請先還原該版本檔案。", 409);
    }
  }

  async prepare(id: string, command: ModelVersionCommand): Promise<{ champion: ChampionDoc; artifacts: FrozenBody[] }> {
    const champion = this.champion(id);
    this.assertCurrent(champion.id, command.expectedHash);
    if (command.action === "activate" || command.action === "automatic") {
      const version = command.action === "automatic" ? preferredModelVersion(champion.modelVersions ?? []) : champion.modelVersions?.find((v) => v.modelKey === command.modelKey);
      if (!version) throw new ModelVersionError("此英雄沒有該模型版本。", 422);
      this.verify(version);
      return { champion: zChampionDoc.parse({ ...champion, modelKey: version.modelKey, modelSelectionMode: command.action === "automatic" ? "automatic" : "manual" }), artifacts: [] };
    }
    if (command.source.kind === "previous") throw new ModelVersionError("舊版紀錄由系統自動保存。", 422);
    const candidate = this.source(command.sourceModelKey);
    if (candidate.doc.heroBody === false) throw new ModelVersionError("此模型已停用作為英雄身體。", 422);
    const inspected = await inspectModelUpload(candidate.bytes).catch((error: unknown) => { throw new ModelVersionError(error instanceof Error ? error.message : "模型驗證失敗。", 422); });
    const budget = heroModelBudgetIssues(inspected);
    if (budget.errors.length) throw new ModelVersionError(budget.errors.join("\n"), 422);
    const names = (inspected.json.animations ?? []).map((animation) => animation.name);
    if (Object.values(candidate.doc.clipMap).some((name) => !names.includes(name)) || new Set(names).size !== names.length) {
      throw new ModelVersionError("六項動作映射必須對應 GLB 內唯一具名的片段。", 422);
    }
    this.assertCurrent(champion.id, command.expectedHash);
    const artifacts: FrozenBody[] = [];
    const versions = [...(champion.modelVersions ?? [])];
    if (versions.length >= 64) throw new ModelVersionError("此英雄已保存 64 個版本，未移除任何歷史版本。", 422);
    if (!versions.length) {
      const previous = this.freeze(this.source(champion.modelKey), "原上線模型", {
        kind: "previous", character: champion.name, work: "原上線內容", library: "GGD", reference: `models/${champion.modelKey}.json`, tier: /^(imported\.|w3x\.)/.test(champion.modelKey) ? "w3x" : "original",
      }, true);
      artifacts.push(previous); versions.push(previous.version);
    }
    const next = this.freeze(candidate, command.label, command.source, false, command.automaticEligible ?? command.source.kind !== "style-proxy");
    if (versions.some((v) => v.modelKey === next.version.modelKey)) {
      throw new ModelVersionError("相同模型與動作設定已在此英雄的版本清單中，請直接選擇該版本。", 409);
    }
    artifacts.push(next); versions.push(next.version);
    const mode = champion.modelSelectionMode ?? "automatic";
    const selected = mode === "manual" ? versions.find((v) => v.modelKey === champion.modelKey) ?? versions[0]! : preferredModelVersion(versions);
    if (!selected) throw new ModelVersionError("沒有核准自動選用的模型；候選仍保留供手動選用。", 422);
    if (!artifacts.some((artifact) => artifact.version.modelKey === selected.modelKey)) this.verify(selected);
    return { champion: zChampionDoc.parse({ ...champion, modelKey: selected.modelKey, modelVersions: versions, modelSelectionMode: mode }), artifacts };
  }

  assertCurrent(id: string, expectedHash: string): void {
    if (contentSha256(this.champion(id)) !== expectedHash) throw new ModelVersionError("英雄已被其他操作更新，請重新載入後再選擇模型。", 409);
  }

  writeArtifacts(artifacts: readonly FrozenBody[]): void {
    // Preflight every collision before the first write. Never overwrite a previous asset.
    const files = artifacts.flatMap(({ doc, bytes }) => [
      { path: resolve(this.root, doc.glbPath), bytes: Buffer.from(bytes) },
      { path: docPath(this.root, "models", doc.id), bytes: Buffer.from(fileJson(doc)) },
    ]);
    const root = realpathSync(this.root);
    for (const file of files) {
      let ancestor = file.path;
      while (!existsSync(ancestor)) ancestor = dirname(ancestor);
      const real = realpathSync(ancestor);
      if (real !== root && !real.startsWith(root + sep)) throw new ModelVersionError("版本保存路徑超出內容目錄。", 422);
      if (existsSync(file.path) && !readFileSync(file.path).equals(file.bytes)) throw new ModelVersionError("保存路徑已有不同內容，未覆寫任何版本。", 409);
    }
    for (const file of files) if (!existsSync(file.path)) {
      mkdirSync(dirname(file.path), { recursive: true });
      const staging = `${file.path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(staging, file.bytes, { flag: "wx" });
        linkSync(staging, file.path); // Publish complete bytes without overwriting an existing name.
      } finally { rmSync(staging, { force: true }); }
    }
  }
}

/**
 * 🖼 玩家**預設載入**的英雄身體貼圖超過 256 ⇒ 用後台「上線模型版本」同一條路註冊一個 256 版本並切成作用中。
 *
 * owner（逐字）：
 * > 2026-09-10「貼圖降低到 256² 貼圖 這個應該變成上架前 後台＆編輯器的內建 script 吧 避免上架到過大的貼圖」
 * > 2026-09-10「場景也是阿 不應該有貼圖超過 256」
 * > 2026-09-12「我不是有卡 script 在啟動的地方自動轉換256跟過高面數嗎?」
 *
 * ⭐ 不另寫縮圖器：直接走 `ModelVersions.prepare({ action: "register" })` —— 那就是後台下拉「新增版本」那一條，
 *   內建 `normalizeUploadedModel`（合併同畫法網格、丟零長度片段、**貼圖縮到 256**）＋預算閘＋六態動作檢查。
 * ⛔ 不原地換位元組（#1199：凍結版本的 `verify()` 比 binarySha256）：新檔內容定址、舊版本**原封不動留在下拉**
 *   ⇒ 後台切回舊版本就是 rollback。
 * ⛔ 手動模式的英雄（modelSelectionMode=manual）也照樣切到新版本，並在輸出裡明說。
 *
 *   node --import tsx tools/model-fix/register-texture-256.mts [--write] [heroId…]
 *   （不帶 --write 只試算：印出會加什麼版本、貼圖邊長前後，⛔ 一個位元組都不寫）
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModelVersions } from "../../apps/content-api/src/modelVersions";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { spliceMembers } from "../../packages/shared/src/content/editModel";
import { inspectModelUpload } from "../../packages/shared/src/content/modelUpload/inspect";
import { zModelVersionCommand, type ChampionModelVersion } from "../../packages/shared/src/content/schema/championModelVersions";

const DEFAULT_HEROES = [
  "b2-maple-alt-9769eb88b85b", "godie-h01u", "godie-huth", "godie-n003", "godie-n00b",
  "godie-o030", "godie-orkn", "godie-u00n", "godie-u00o",
];
const WRITE = process.argv.includes("--write");
const heroes = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const root = resolve("content");
const SUFFIX = "（貼圖 256 正規化）";

// ⚠️ 量「之前」的貼圖⛔ 不可以用 inspectModelUpload：它先跑嚴格 glTF 驗證，驗不過就擲例外（量不到 ≠ 沒有超標）
const maxEdge = async (bytes: Uint8Array) => {
  try {
    return Math.max(0, ...(await inspectModelUpload(bytes)).textures.flatMap((t: { width: number; height: number }) => [t.width, t.height]));
  } catch {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    const bin = 20 + jsonLength + 8;
    let edge = 0;
    for (const image of json.images ?? []) {
      const bv = json.bufferViews[image.bufferView]; const at = bin + (bv.byteOffset ?? 0);
      const head = bytes.subarray(at, at + 32);
      if (head[0] === 0x89 && head[1] === 0x50) edge = Math.max(edge, new DataView(head.buffer, head.byteOffset).getUint32(16), new DataView(head.buffer, head.byteOffset).getUint32(20));
      else edge = Math.max(edge, 4096); // 非 PNG 讀不到表頭 ⇒ 當成超標，交給正規化那一步判定
    }
    return edge;
  }
};

const results = [];
for (const heroId of heroes.length ? heroes : DEFAULT_HEROES) {
  const service = new ModelVersions(root);
  const before = service.state(heroId);
  for (const version of before.versions) service.verify(version);
  const champion = service.champion(heroId);
  const active = before.versions.find((v: ChampionModelVersion) => v.modelKey === champion.modelKey);
  const activeDoc = JSON.parse(readFileSync(resolve(root, "models", `${champion.modelKey}.json`), "utf8"));
  const beforeEdge = await maxEdge(new Uint8Array(readFileSync(resolve(root, activeDoc.glbPath))));
  if (beforeEdge <= 256) { results.push({ heroId, skipped: `作用中身體貼圖已是 ${beforeEdge}` }); continue; }

  // ⭐ 出處照抄作用中那一列；「previous」（系統自動保存的舊版）不能拿來註冊 ⇒ 改標同角色原檔
  const source = active && active.source.kind !== "previous"
    ? active.source
    : { kind: "exact" as const, character: champion.name, work: "原上線內容", library: "GGD",
        reference: `models/${active?.sourceModelKey ?? champion.modelKey}.json`,
        tier: /^(imported\.|w3x\.)/.test(active?.sourceModelKey ?? champion.modelKey) ? "w3x" as const : "original" as const };
  const label = `${active?.label ?? "原上線模型"}${SUFFIX}`.slice(0, 160);
  // ⭐ 作用中是凍結版本時，從它的**原始來源**重新凍結：凍結路徑是 `<來源目錄>/versions/<sha>.glb`，
  //   從凍結檔再凍結會變成 `versions/versions/`（全 repo 沒有前例）。來源停用（heroBody=false）或不在才退回凍結檔。
  const originKey = active?.sourceModelKey;
  const originDoc = originKey && existsSync(resolve(root, "models", `${originKey}.json`))
    ? JSON.parse(readFileSync(resolve(root, "models", `${originKey}.json`), "utf8")) : null;
  const sourceModelKey = originDoc && originDoc.heroBody !== false && !/\/versions\//.test(originDoc.glbPath) ? originKey! : champion.modelKey;
  // ⭐ 自動模式的英雄：新版本標成可自動選用 ⇒ 同一順位裡新的排在前面，自動模式自己會選到它（⛔ 不改成手動）
  const automatic = (champion.modelSelectionMode ?? "automatic") === "automatic";
  const command = zModelVersionCommand.parse({
    action: "register", expectedHash: before.expectedHash, sourceModelKey, label, source,
    ...(automatic ? { automaticEligible: true } : active?.automaticEligible !== undefined ? { automaticEligible: active.automaticEligible } : {}),
  });
  let prepared;
  try {
    prepared = await service.prepare(heroId, command);
  } catch (error) {
    results.push({ heroId, blocked: error instanceof Error ? error.message : String(error) });
    continue;
  }
  const added = prepared.artifacts.at(-1)!;
  const afterEdge = await maxEdge(added.bytes);
  if (afterEdge > 256) { results.push({ heroId, blocked: `正規化後貼圖仍是 ${afterEdge}（縮圖器沒跑？）` }); continue; }
  // ⭐ 新版本一定要是作用中：自動模式交給排序；沒選到（或手動模式）就明確切過去
  let next = prepared.champion;
  if (next.modelKey !== added.version.modelKey) {
    next = { ...next, modelKey: added.version.modelKey, modelSelectionMode: "manual" };
  }
  results.push({
    heroId, mode: `${champion.modelSelectionMode ?? "automatic"} → ${next.modelSelectionMode}`,
    from: champion.modelKey, to: added.version.modelKey, texEdge: `${beforeEdge} → ${afterEdge}`,
    glb: added.doc.glbPath, label, addedVersions: prepared.artifacts.length,
  });
  if (!WRITE) continue;
  service.assertCurrent(heroId, before.expectedHash);
  service.writeArtifacts(prepared.artifacts);
  for (const artifact of prepared.artifacts) service.verify(artifact.version);
  const championPath = resolve(root, "champions", `${heroId}.json`);
  const raw = readFileSync(championPath, "utf8");
  const temporary = `${championPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, spliceMembers(raw, {
      modelKey: next.modelKey, modelVersions: next.modelVersions, modelSelectionMode: next.modelSelectionMode,
    }), { flag: "wx" });
    service.assertCurrent(heroId, before.expectedHash);
    renameSync(temporary, championPath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  const after = new ModelVersions(root).state(heroId);
  for (const version of after.versions) new ModelVersions(root).verify(version);
  for (const version of before.versions) {
    if (!after.versions.some((candidate: ChampionModelVersion) => contentSha256(candidate) === contentSha256(version))) {
      throw new Error(`⛔ 版本歷史少了一筆：${heroId}/${version.modelKey}`);
    }
  }
}
console.log(JSON.stringify({ write: WRITE, results }, null, 2));

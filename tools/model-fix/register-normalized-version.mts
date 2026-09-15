/**
 * 🧾 玩家**預設載入**的英雄身體要重新正規化 ⇒ 用後台「上線模型版本」同一條路註冊新版本並切成作用中。
 *
 * ⭐ 不另寫修補器：直接走 `ModelVersions.prepare({ action: "register" })` —— 那就是後台下拉「新增版本」那一條，
 *   內建 `normalizeUploadedModel`（合併同畫法網格、丟零長度片段、貼圖縮到 256）＋**嚴格 glTF 驗證**＋預算閘＋六態動作檢查。
 * ⛔ 不原地換位元組（#1199：凍結版本的 `verify()` 比 binarySha256）：新檔內容定址、舊版本**原封不動留在下拉**
 *   ⇒ 後台切回舊版本就是 rollback。
 * ⭐ 作用中是凍結版本時，從它的**原始來源**重新凍結（凍結路徑是 `<來源目錄>/versions/<sha>.glb`，
 *   從凍結檔再凍結會變成 `versions/versions/`，全 repo 沒有前例）。
 *
 * 兩種理由（⭐ N 個同型 = 一個模板 + 參數；在此之前是一支 tex256 專用腳本）：
 *  · `texture-256` —— owner 2026-09-10「貼圖降低到 256² 貼圖 這個應該變成上架前 後台＆編輯器的內建 script 吧」
 *  · `gltf-valid`（GH#1173）—— 作用中 GLB 過不了嚴格 glTF 驗證。2026-09-15 量到的形狀：10 位英雄穿著
 *    09-09 凍結的「原上線模型」，而它們的來源在 09-10 被 `repair_glb_accessors.py` 就地修好了
 *    （修凍結副本得到的位元組與今天的來源**逐位元組相同**）⇒ 從來源重凍就是「修好的位元組」。
 *    ⭐ 事後證明：新舊兩顆的**畫面內容**（每個畫法展開後的三角形頂點位元組、骨架、動作、貼圖、文件外觀欄位）
 *    必須全等，只允許 accessor 界與 primitive 分塊不同 ⇒ ⛔ 不等就擋下（那不是修 metadata，是換了東西）。
 *
 *   node --import tsx tools/model-fix/register-normalized-version.mts --reason gltf-valid [--write] [heroId…]
 *   （不帶 --write 只試算，⛔ 一個位元組都不寫；不帶 heroId 時 gltf-valid 掃全部英雄，texture-256 用它原本的名單）
 */
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModelVersions } from "../../apps/content-api/src/modelVersions";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { spliceMembers } from "../../packages/shared/src/content/editModel";
import { inspectModelUpload, validateModelUploadBytes } from "../../packages/shared/src/content/modelUpload/inspect";
import { canon, primitiveCounts, renderSignature } from "./renderSignature.mts";
import { zModelVersionCommand, type ChampionModelVersion } from "../../packages/shared/src/content/schema/championModelVersions";

type Doc = Record<string, unknown> & { glbPath: string; hiddenPrimitives?: number[] };
interface Reason {
  suffix: string;
  /** 不帶 heroId 掃全部時，不印「不需要轉」的那一大串。 */
  quietSkips?: boolean;
  defaultHeroes: () => string[];
  /** 作用中身體要不要轉；`skip` ⇒ 跳過（附原因字串給輸出）。 */
  needs: (bytes: Uint8Array) => Promise<{ skip: string } | { why: string }>;
  /** 註冊出來的新版本能不能用；回字串 ⇒ 擋下。 */
  check: (before: { doc: Doc; bytes: Uint8Array }, after: { doc: Doc; bytes: Uint8Array }) => Promise<string | null>;
}

// ── texture-256 ────────────────────────────────────────────────────────────
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

/** 模型文件的外觀欄位（去掉版本自己的 id／路徑／血緣）—— 註冊前後必須全等。 */
const appearance = (doc: Doc) => canon(Object.fromEntries(Object.entries(doc).filter(([k]) => !["id", "glbPath", "bodyVersion"].includes(k))));

const allHeroes = () => readdirSync(resolve("content", "champions")).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => f.slice(0, -5)).sort();

const REASONS: Record<string, Reason> = {
  "texture-256": {
    suffix: "（貼圖 256 正規化）",
    defaultHeroes: () => ["b2-maple-alt-9769eb88b85b", "godie-h01u", "godie-huth", "godie-n003", "godie-n00b", "godie-o030", "godie-orkn", "godie-u00n", "godie-u00o"],
    needs: async (bytes) => { const e = await maxEdge(bytes); return e <= 256 ? { skip: `作用中身體貼圖已是 ${e}` } : { why: `貼圖 ${e}` }; },
    check: async (_before, after) => { const e = await maxEdge(after.bytes); return e > 256 ? `正規化後貼圖仍是 ${e}（縮圖器沒跑？）` : null; },
  },
  "gltf-valid": {
    suffix: "（glTF 驗證修正）",
    quietSkips: true,
    defaultHeroes: allHeroes,
    needs: async (bytes) => {
      const r = await validateModelUploadBytes(bytes);
      if (!r.issues.numErrors && !r.issues.truncated) return { skip: "作用中身體已通過嚴格 glTF 驗證" };
      return { why: `glTF 驗證 ${r.issues.numErrors} 個錯（${[...new Set(r.issues.messages.filter((m) => m.severity === 0).map((m) => m.code))].join(",")}）` };
    },
    check: async (before, after) => {
      const r = await validateModelUploadBytes(after.bytes);
      if (r.issues.numErrors || r.issues.truncated) return `新版本仍有 ${r.issues.numErrors} 個 glTF 錯`;
      if (appearance(before.doc) !== appearance(after.doc)) return `模型文件外觀欄位變了：${appearance(before.doc)} → ${appearance(after.doc)}`;
      const same = primitiveCounts(before.bytes) === primitiveCounts(after.bytes);
      if (!same && (before.doc.hiddenPrimitives?.length ?? 0) > 0) return "宣告了 hiddenPrimitives 而 primitive 分塊變了（索引會錯位）";
      const a = renderSignature(before.bytes, same), b = renderSignature(after.bytes, same);
      const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
      return diff.length ? `畫面內容不同（不是只修 metadata）：${diff.map((k) => k.slice(0, 60)).join("；")}` : null;
    },
  },
};

const WRITE = process.argv.includes("--write");
const reasonName = process.argv[process.argv.indexOf("--reason") + 1];
const reason = process.argv.includes("--reason") ? REASONS[reasonName!] : undefined;
if (!reason) { console.error(`⛔ 要 --reason ${Object.keys(REASONS).join("|")}`); process.exit(2); }
const args = process.argv.slice(2);
const heroes = args.filter((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--reason");
const root = resolve("content");

const results = [];
for (const heroId of heroes.length ? heroes : reason.defaultHeroes()) {
  const service = new ModelVersions(root);
  const before = service.state(heroId);
  for (const version of before.versions) service.verify(version);
  const champion = service.champion(heroId);
  const active = before.versions.find((v: ChampionModelVersion) => v.modelKey === champion.modelKey);
  const activeDocPath = resolve(root, "models", `${champion.modelKey}.json`);
  if (!existsSync(activeDocPath)) { results.push({ heroId, skipped: `沒有模型文件 ${champion.modelKey}` }); continue; }
  const activeDoc = JSON.parse(readFileSync(activeDocPath, "utf8")) as Doc;
  if (!existsSync(resolve(root, activeDoc.glbPath))) { results.push({ heroId, skipped: `GLB 不存在 ${activeDoc.glbPath}` }); continue; }
  const activeBytes = new Uint8Array(readFileSync(resolve(root, activeDoc.glbPath)));
  const need = await reason.needs(activeBytes);
  if ("skip" in need) { if (heroes.length || !reason.quietSkips) results.push({ heroId, skipped: need.skip }); continue; }

  // ⭐ 出處照抄作用中那一列；「previous」（系統自動保存的舊版）不能拿來註冊 ⇒ 改標同角色原檔
  const source = active && active.source.kind !== "previous"
    ? active.source
    : { kind: "exact" as const, character: champion.name, work: "原上線內容", library: "GGD",
        reference: `models/${active?.sourceModelKey ?? champion.modelKey}.json`,
        tier: /^(imported\.|w3x\.)/.test(active?.sourceModelKey ?? champion.modelKey) ? "w3x" as const : "original" as const };
  const label = `${active?.label ?? "原上線模型"}${reason.suffix}`.slice(0, 160);
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
    results.push({ heroId, why: need.why, blocked: error instanceof Error ? error.message : String(error) });
    continue;
  }
  const added = prepared.artifacts.at(-1)!;
  const blocked = await reason.check({ doc: activeDoc, bytes: activeBytes }, { doc: added.doc as unknown as Doc, bytes: added.bytes });
  if (blocked) { results.push({ heroId, why: need.why, blocked }); continue; }
  // ⭐ 新版本一定要是作用中：自動模式交給排序；沒選到（或手動模式）就明確切過去
  let next = prepared.champion;
  if (next.modelKey !== added.version.modelKey) {
    next = { ...next, modelKey: added.version.modelKey, modelSelectionMode: "manual" };
  }
  results.push({
    heroId, why: need.why, mode: `${champion.modelSelectionMode ?? "automatic"} → ${next.modelSelectionMode}`,
    from: champion.modelKey, to: added.version.modelKey, glb: added.doc.glbPath, sourceModelKey, label, addedVersions: prepared.artifacts.length,
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
console.log(JSON.stringify({ reason: reasonName, write: WRITE, results }, null, 2));
if (results.some((r) => "blocked" in r)) process.exitCode = 1;

/**
 * ⭐⭐ GH#1022 —— `POST /content-import/digest` 的守衛：**伺服器重算 packageDigest**。
 *
 * ── ⭐ 這是承重的那一條：跨語言 digest 一致性 ─────────────────────────────
 * platform（Go）不算 JCS，它**問這個端點**。⇒ 「Go 重算的 digest 與 TS 的
 * `packageDigest()` 逐位元組相同」這句話在結構上成立的前提只有一個：
 * **這個端點回的就是 `packageDigest()` 算在原始 manifest 上的值**。
 * 這一支就釘那一件事 —— 而且是走真的 HTTP（`app.inject`），⛔ 不是直接呼叫函式：
 * 一條掛錯 prefix、body 沒接到、把 parse 產物當輸入的端點，函式層的測試全綠。
 *
 * ── ⛔ 票文點名的四類夾具（Known risks：跨語言正規化最容易在 Unicode 與浮點上分岔）──
 *   ① 鍵順序打亂（頂層 ＋ 巢狀物件）⇒ 同一個 digest
 *   ② Unicode（星光平面 😂 · 希伯來 דּ · CJK · NFC≠NFD）⇒ 直接算與經過 HTTP 相同
 *   ③ 巢狀陣列（`selectionRoots`／`changes` 順序打亂 ⇒ 同；文件裡的陣列**不排序**⇒ 不同）
 *   ④ 排除鍵（`signature`／`transport`／`archiveSha256`）有無 ⇒ 同一個 digest
 *
 * MUTATION LOG（落地前跑過）：
 *   - `computeDigestReport` 把 `packageDigest(rawManifest)` 改成
 *     `packageDigest(parsed.value.manifest)`（Zod 產物）→ 🔴 誠實夾具 match=false
 *     （⭐ 這正是 2026-09-02 第一版 validate 的缺陷再現）
 *   - 改成 `contentSha256(rawManifest)`（跳過語意投影）→ 🔴 ④ 排除鍵那一條
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";

import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { packageDigest } from "@ggd/shared/content/import/digest";
import {
  DIGEST_RESULT_SCHEMA,
  IMPORTER_ENDPOINTS,
  computeDigestReport,
  registerImportRoutes,
  type DigestReport,
} from "./importRoutes";

const REPO = join(__dirname, "../../..");
const P = "/api/v1/content-import";

let app: FastifyInstance;

beforeEach(async () => {
  const base = mkdtempSync(join(tmpdir(), "ggd-digest-"));
  const contentDir = join(base, "content");
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(
    join(contentDir, "manifest.json"),
    JSON.stringify({ contentVersion: "cv_test", collections: {} }),
    "utf8",
  );
  app = Fastify({ logger: false });
  registerImportRoutes(app, {
    contentDir,
    importDir: join(base, "data", "content-import"),
    repoRoot: REPO,
    gameVersion: null,
  });
  await app.ready();
});
afterEach(async () => {
  await app.close();
});

const DOC = {
  schema: "ability@1",
  id: "hero.q",
  name: "測試技 😂 דּ",
  description: "測試",
  castType: "self",
  maxRank: 1,
  cooldown: [1.5, 60],
  manaCost: [0],
  range: 0,
  effects: [{ kind: "damage", tiers: ["大", "極大"] }],
};
const PATH = "authoring/abilities/hero.q.json";

/** ⭐ 一份誠實的 manifest（⛔ 還沒填 packageDigest）。 */
function manifestOf(doc: unknown): Record<string, unknown> {
  return {
    schema: "ggd-editor-package@1",
    mode: "bootstrap",
    gameId: "ggd",
    packageDigest: "sha256:" + "0".repeat(64),
    base: { gameRevision: "r1", contentVersion: "cv_test", activationDigest: null, authoringDigest: null },
    migrationFingerprint: "mf-1",
    selectionRoots: [
      { kind: "ability", id: "hero.q", revision: 2 },
      { kind: "ability", id: "hero.e", revision: 1 },
    ],
    changes: [
      {
        kind: "ability", id: "hero.q", path: PATH, op: "upsert",
        before: null, after: { contentSha256: contentSha256(doc) }, reason: "selected",
      },
    ],
    authoringProcessor: { kind: "runtime-direct", contractVersion: "runtime-direct@1", fingerprint: "fp-test" },
    requiredCapabilities: [],
    entries: [
      { path: PATH, role: "authoring", contentSha256: contentSha256(doc), contentSize: 100, collection: "abilities", id: "hero.q", op: "upsert" },
    ],
    requires: [],
    expectedDerived: [],
    validationPolicy: {},
    requiredScenarios: [],
    fidelityDecisions: [],
    acceptedWarnings: [],
  };
}

function pkg(manifest: Record<string, unknown>, doc: unknown) {
  return { schema: "ggd-editor-import@1", manifest, documents: [{ path: PATH, document: doc }] };
}

/** 誠實的包：manifest 的 packageDigest 就是 `packageDigest(manifest)`。 */
function honest(doc: unknown = DOC) {
  const m = manifestOf(doc);
  m["packageDigest"] = packageDigest(m);
  return pkg(m, doc);
}

/** 把一個物件的 key 順序反過來（遞迴，陣列元素也處理 —— ⛔ 陣列順序不動）。 */
function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).reverse()) out[k] = reverseKeys((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

const post = async (payload: unknown) => {
  const r = await app.inject({ method: "POST", url: `${P}/digest`, payload: payload as object });
  return { status: r.statusCode, body: r.json() as DigestReport & { code?: string } };
};

describe("POST /content-import/digest（GH#1022）", () => {
  it("★★ ⭐⭐ 誠實的包 ⇒ 200 · match · packageDigest **就是** `packageDigest()` 算在原始 manifest 上的值", async () => {
    const p = honest();
    const { status, body } = await post(p);
    expect(status).toBe(200);
    expect(body.schema).toBe(DIGEST_RESULT_SCHEMA);
    expect(body.match, JSON.stringify(body.mismatches)).toBe(true);
    expect(body.entries, "⛔ 0 份 entry 而 match=true 是量空氣").toBe(1);
    // ⭐ 承重：同一個定義。⛔ 不是「都是 64 個 hex」。
    expect(body.packageDigest).toBe(packageDigest(p.manifest));
    expect(body.packageDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("★★ ⭐ ① 鍵順序打亂（頂層＋巢狀）⇒ 同一個 digest，而且仍然 match", async () => {
    const p = honest();
    const shuffled = reverseKeys(p) as ReturnType<typeof honest>;
    expect(JSON.stringify(shuffled), "儀器：反轉後位元組要真的不同").not.toBe(JSON.stringify(p));
    const a = await post(p);
    const b = await post(shuffled);
    expect(b.body.match).toBe(true);
    expect(b.body.packageDigest).toBe(a.body.packageDigest);
  });

  it("★★ ⭐ ② Unicode：星光平面／希伯來／CJK 經過 HTTP 與直接算相同；NFC≠NFD 是**不同**的內容", async () => {
    const nfc = { ...DOC, name: "é😂דּ測試".normalize("NFC") };
    const nfd = { ...DOC, name: "é😂דּ測試".normalize("NFD") };
    expect(nfc.name, "儀器：NFC 與 NFD 要真的不同").not.toBe(nfd.name);
    const a = await post(honest(nfc));
    const b = await post(honest(nfd));
    expect(a.body.match && b.body.match).toBe(true);
    expect(a.body.packageDigest).toBe(packageDigest(honest(nfc).manifest));
    expect(b.body.packageDigest).toBe(packageDigest(honest(nfd).manifest));
    // ⛔ JCS 不做 Unicode 正規化 —— 兩種拼法是兩份內容（規格如此；靜默合併會讓掉包看不出來）。
    expect(a.body.packageDigest).not.toBe(b.body.packageDigest);
  });

  it("★★ ⭐ ③ 巢狀陣列：manifest 的排序類陣列打亂 ⇒ 同；文件裡的陣列打亂 ⇒ **不同**（並指名那一份）", async () => {
    const p = honest();
    // manifest 層：selectionRoots 反序 —— 語意投影會排序 ⇒ 同一個 digest。
    const m2 = { ...p.manifest, selectionRoots: [...(p.manifest["selectionRoots"] as unknown[])].reverse() };
    const r1 = await post(p);
    const r2 = await post({ ...p, manifest: m2 });
    expect(r2.body.match, JSON.stringify(r2.body.mismatches)).toBe(true);
    expect(r2.body.packageDigest).toBe(r1.body.packageDigest);
    // 文件層：effects[].tiers 反序 —— 陣列順序是內容的語意 ⇒ contentSha256 變 ⇒ 指名文件。
    const evil = { ...DOC, effects: [{ kind: "damage", tiers: ["極大", "大"] }] };
    const r3 = await post({ ...p, documents: [{ path: PATH, document: evil }] });
    expect(r3.status).toBe(200);
    expect(r3.body.match).toBe(false);
    expect(r3.body.mismatches.map((x) => [x.code, x.path])).toEqual([["ENTRY_HASH_MISMATCH", PATH]]);
  });

  it("★★ ⭐ ④ 排除鍵（signature／transport／archiveSha256）有無 ⇒ 同一個 digest", async () => {
    const p = honest();
    const withNoise = {
      ...p,
      manifest: {
        ...p.manifest,
        signature: "sig-xyz",
        transport: { format: "zip", policy: "strict" },
        archiveSha256: "sha256:" + "f".repeat(64),
      },
    };
    const a = await post(p);
    const b = await post(withNoise);
    expect(b.body.match, "⛔ 排除鍵一出現就對不上 ⇒ 語意投影沒有生效").toBe(true);
    expect(b.body.packageDigest).toBe(a.body.packageDigest);
  });

  it("★★ ⭐⭐ AC1 的 TS 半邊：內容改過但 manifest 沿用舊 hash ⇒ match=false 並**指名那一份文件**", async () => {
    const p = honest();
    const swapped = { ...p, documents: [{ path: PATH, document: { ...DOC, description: "EVIL" } }] };
    const { status, body } = await post(swapped);
    expect(status).toBe(200);
    expect(body.match).toBe(false);
    expect(body.mismatches).toHaveLength(1);
    expect(body.mismatches[0]!.code).toBe("ENTRY_HASH_MISMATCH");
    expect(body.mismatches[0]!.path).toBe(PATH);
    expect(body.mismatches[0]!.claimed).toBe(contentSha256(DOC));
    expect(body.mismatches[0]!.actual).toBe(contentSha256({ ...DOC, description: "EVIL" }));
    // ⭐ manifest 本身沒動 ⇒ packageDigest 對得上 —— 只有文件那一層對不上。
    expect(body.packageDigest).toBe(body.claimedDigest);
  });

  it("★ ⭐ manifest 自稱的 packageDigest 過期 ⇒ PACKAGE_DIGEST_MISMATCH（沒有 path）", async () => {
    const p = honest();
    const stale = { ...p, manifest: { ...p.manifest, packageDigest: "sha256:" + "1".repeat(64) } };
    const { body } = await post(stale);
    expect(body.match).toBe(false);
    expect(body.mismatches.map((x) => x.code)).toEqual(["PACKAGE_DIGEST_MISMATCH"]);
    expect(body.mismatches[0]!.path).toBeUndefined();
    expect(body.claimedDigest).toBe("sha256:" + "1".repeat(64));
  });

  it("★ ⭐ 不是一份 package ⇒ 422 ＋ 指名欄位的診斷（⛔ 不是 200 match=false）", async () => {
    const { status, body } = await post({ a: 1 });
    expect(status).toBe(422);
    expect(body.schema).toBe("ggd-content-import-error@1");
    expect(typeof body.code).toBe("string");
  });

  it("★ ⭐ 純函式與端點是同一支（⛔ 不是兩份實作）", () => {
    const p = honest();
    const r = computeDigestReport(p);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.report.packageDigest).toBe(packageDigest(p.manifest));
  });

  it("★★ ⭐ 端點在契約表裡，而且 schema 字面值與 Go 那一側**逐字相同**（跨語言接縫）", () => {
    expect(IMPORTER_ENDPOINTS.map((e) => `${e.method} ${e.path}`)).toContain("POST /digest");
    const go = readFileSync(join(REPO, "apps/platform/internal/submissions/digest.go"), "utf8");
    expect(
      go.includes(`DigestResultSchema = "${DIGEST_RESULT_SCHEMA}"`),
      "⛔⛔ Go 側的 DigestResultSchema 與這裡不同 ⇒ platform 會把每一個回應當成「打錯服務」而 503",
    ).toBe(true);
    expect(go.includes(`"/api/v1/content-import/digest"`), "⛔ Go 打的路徑不是這個端點").toBe(true);
  });
});

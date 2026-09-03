/**
 * ⭐⭐ **六條 G2 route 走真的 HTTP** —— validate / apply / rollback / active /
 * runtime-bundle / operations（規格 §3）。
 *
 * ── ⛔ 為什麼要有這一支（失敗形態⑪）──────────────────────────────────────
 * `validatePackage` 有自己的守衛、`ImportStore` 有自己的守衛 ——
 * ⚠️ ⭐ 而**兩條各自對的守衛，接縫可以是空的**：
 * route 掛錯 prefix、body 沒接到、錯誤碼回錯 —— 兩邊的單元測試全部是綠的。
 * ⇒ ⭐ 這一支只驗**接縫**：真的 inject、真的看狀態碼、真的看 ACTIVE 有沒有動。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hashDoc, hashCollection, contentVersion } from "@ggd/shared/content/hash";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { deflateRawSync } from "node:zlib";

import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { buildAuthoringProcessor } from "@ggd/shared/content/import/authoringProcessor";
import { registerImportRoutes, IMPORTER_ENDPOINTS } from "./importRoutes";

const REPO = join(__dirname, "../../..");
const FP = buildAuthoringProcessor(REPO).fingerprint;
const P = "/api/v1/content-import";

let app: FastifyInstance;
let contentDir: string;
let importDir: string;

beforeEach(async () => {
  const base = mkdtempSync(join(tmpdir(), "ggd-g2-"));
  contentDir = join(base, "content");
  importDir = join(base, "data", "content-import");
  mkdirSync(contentDir, { recursive: true });
  // ⭐ 一份最小的 manifest，讓 `readBaseFacts` 有東西讀。
  writeFileSync(
    join(contentDir, "manifest.json"),
    JSON.stringify({ contentVersion: "cv_test", collections: {} }),
    "utf8",
  );
  app = Fastify({ logger: false });
  registerImportRoutes(app, {
    contentDir,
    importDir,
    repoRoot: REPO,
    gameVersion: null,
  });
  await app.ready();
});
afterEach(async () => {
  await app.close();
});

const ABILITY = {
  schema: "ability@1",
  id: "hero.q",
  name: "測試技",
  description: "測試",
  castType: "self",
  maxRank: 1,
  cooldown: [1],
  manaCost: [0],
  range: 0,
  effects: [],
};

function pkg(id = "hero.q") {
  const doc = { ...ABILITY, id };
  const path = `authoring/abilities/${id}.json`;
  const manifest: Record<string, unknown> = {
    schema: "ggd-editor-package@1",
    mode: "bootstrap",
    gameId: "ggd",
    packageDigest: "sha256:" + "0".repeat(64),
    base: {
      gameRevision: "r1",
      contentVersion: "cv_test",
      activationDigest: null,
      authoringDigest: null,
    },
    migrationFingerprint: "mf-1",
    selectionRoots: [],
    changes: [],
    authoringProcessor: {
      kind: "runtime-direct",
      contractVersion: "runtime-direct@1",
      fingerprint: FP,
    },
    requiredCapabilities: [],
    entries: [
      {
        path,
        role: "authoring",
        contentSha256: contentSha256(doc),
        contentSize: 100,
        collection: "abilities",
        id,
        op: "upsert",
      },
    ],
    requires: [],
    expectedDerived: [],
    validationPolicy: {},
    requiredScenarios: [],
    fidelityDecisions: [],
    acceptedWarnings: [],
  };
  manifest["packageDigest"] = packageDigest(manifest);
  return {
    schema: "ggd-editor-import@1",
    manifest,
    documents: [{ path, document: doc }],
  };
}

/** ⭐ 落點底下的**每一個檔** —— 路徑 ＋ 位元組數。⛔ 不只是目錄名。 */
function treeOf(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
      if (e.isDirectory()) walk(join(d, e.name), rel);
      else out.push(`${rel} ${statSync(join(d, e.name)).size}`);
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out.sort();
}

const post = (url: string, payload: unknown) =>
  app.inject({ method: "POST", url, payload: payload as object });
const get = (url: string) => app.inject({ method: "GET", url });

describe("G2 routes —— 六條走真的 HTTP", () => {
  it("★★ ⭐ `POST /validate` 收下乾淨的包，而且**一個位元組都不寫**", async () => {
    const before = await get(`${P}/active`);
    expect(before.json().active, "儀器：一開始不該有 ACTIVE").toBeNull();
    const baseline = treeOf(importDir);

    const r = await post(`${P}/validate`, pkg());
    expect(r.statusCode, `⛔ 乾淨的包被拒：${r.body.slice(0, 400)}`).toBe(200);
    expect(r.json().status).toBe("validated");
    expect(r.json().changedDocuments).toHaveLength(1);

    // ⭐⭐ 「無狀態變更」要驗的是**整個落點沒有多出東西** ——
    //   ⛔ 只看 `GET /active` 是不夠的：一次 `beginOperation` 會寫進 `operations/`
    //   而 ACTIVE 仍然是 null ⇒ ⭐ 那條斷言對這種洩漏是瞎的（2026-09-02 突變抓到）。
    const after = await get(`${P}/active`);
    expect(after.json().active).toBeNull();
    expect(
      treeOf(importDir),
      "⛔⛔ validate **在落點寫了東西** ⇒ 規格逐字：`validate` MUST 無狀態變更",
    ).toEqual(baseline);
  });

  it("★★ ⭐ `POST /validate` 對壞掉的包回 422 **而且說得出是哪一條**", async () => {
    const bad = pkg();
    (
      bad.manifest["authoringProcessor"] as { fingerprint: string }
    ).fingerprint = "ffffffffffff";
    const r = await post(`${P}/validate`, bad);
    expect(r.statusCode).toBe(422);
    const codes = (r.json().diagnostics as { code: string }[]).map(
      (d) => d.code,
    );
    expect(codes).toContain("PROCESSOR_FINGERPRINT_MISMATCH");
  });

  it("★★ ⭐⭐ `apply` → `active` → `runtime-bundle` → `rollback` 走得通", async () => {
    const a = await post(`${P}/apply`, {
      operationId: "op-1",
      package: pkg("hero.q"),
    });
    expect(a.statusCode, `⛔ apply 失敗：${a.body.slice(0, 500)}`).toBe(200);
    expect(a.json().status).toBe("activated");
    const d1 = a.json().activationDigest as string;
    expect(d1).toMatch(/^sha256:[0-9a-f]{64}$/);

    // ⭐ ACTIVE 真的指到它了。
    const act = await get(`${P}/active`);
    expect(act.json().active.activationDigest).toBe(d1);
    expect(act.json().rollbackAvailable, "⛔ 第一次啟用不該說回捲得了").toBe(
      false,
    );

    // ⭐ runtime-bundle 拿得到**那棵樹的內容**（⛔ 不是 content/bundle.json）。
    const rb = await get(`${P}/active/runtime-bundle`);
    expect(rb.statusCode).toBe(200);
    const bundle = rb.json() as {
      activationDigest: string;
      contentVersion: string;
      collections: Record<
        string,
        { hash: string; count: number; entries: { id: string; hash: string; doc: { id: string } }[] }
      >;
    };
    expect(bundle.activationDigest).toBe(d1);
    const ab = bundle.collections["abilities"];
    expect(ab, "⛔ collections 裡沒有 abilities").toBeDefined();
    expect(ab!.entries.find((e) => e.id === "hero.q")?.doc.id).toBe("hero.q");

    // ⭐⭐ **對面會全部重算後才接受** ⇒ 三樣缺一它就 fail closed（交接文件逐字）。
    //   ⚠️ ⭐ 這裡**真的重算一次**（⛔ 不是斷言「欄位存在」）——
    //     一個回 `hash: ""` 的 route 也會讓「欄位存在」那種斷言通過。
    for (const [name, c] of Object.entries(bundle.collections)) {
      expect(c.count, `⛔ ${name} 的 count 與 entries 數對不上`).toBe(c.entries.length);
      for (const e of c.entries) {
        expect(e.hash, `⛔ ${name}/${e.id} 的逐文件 hash 重算對不上`).toBe(hashDoc(e.doc));
      }
      expect(c.hash, `⛔ ${name} 的 collection hash 重算對不上`).toBe(
        hashCollection(c.entries.map((e) => ({ id: e.id, hash: e.hash }))),
      );
    }
    expect(
      bundle.contentVersion,
      "⛔ contentVersion 重算對不上 ⇒ 對面沒辦法拿它 pin exact Base",
    ).toBe(
      contentVersion(
        Object.fromEntries(Object.entries(bundle.collections).map(([n, c]) => [n, c.hash])),
      ),
    );

    // ⭐ 第二次啟用要帶 CAS。
    const b = await post(`${P}/apply`, {
      operationId: "op-2",
      package: pkg("hero.w"),
      expectedActivationDigest: d1,
    });
    expect(b.statusCode, `⛔ 第二次 apply 失敗：${b.body.slice(0, 500)}`).toBe(
      200,
    );
    const d2 = b.json().activationDigest as string;
    expect(d2).not.toBe(d1);

    // ⭐ 回捲回得去，⛔ 而且要帶對的前提。
    const wrong = await post(`${P}/rollback`, { expectedActivationDigest: d1 });
    expect(wrong.statusCode, "⛔ 用過期的前提回捲成功了").toBe(409);
    const ok = await post(`${P}/rollback`, { expectedActivationDigest: d2 });
    expect(ok.statusCode, `⛔ 回捲失敗：${ok.body.slice(0, 400)}`).toBe(200);
    expect(ok.json().activationDigest).toBe(d1);

    // ⭐ 回捲之後 runtime-bundle 回到第一版（⛔ hero.w 不在了）。
    const rb2 = await get(`${P}/active/runtime-bundle`);
    const ids2 = (
      rb2.json().collections["abilities"] as { entries: { id: string }[] }
    ).entries.map((e) => e.id);
    expect(ids2, "⛔ 回捲之後 hero.q 不見了").toContain("hero.q");
    expect(ids2, "⛔ 回捲之後 hero.w 還在").not.toContain("hero.w");
  });

  it("★★ ⭐ `apply` 的 CAS：帶錯的 expected ⇒ 409，而 ACTIVE **沒動**", async () => {
    const a = await post(`${P}/apply`, {
      operationId: "op-1",
      package: pkg("hero.q"),
    });
    expect(a.statusCode).toBe(200);
    const d1 = a.json().activationDigest as string;

    const bad = await post(`${P}/apply`, {
      operationId: "op-x",
      package: pkg("hero.w"),
      expectedActivationDigest: "sha256:" + "9".repeat(64),
    });
    expect(bad.statusCode).toBe(409);
    expect(bad.json().code).toBe("APPLY_FAILED");
    const act = await get(`${P}/active`);
    expect(
      act.json().active.activationDigest,
      "⛔⛔ CAS 失敗了而 ACTIVE 被換掉 ⇒ ⭐ 那比沒有 CAS 更糟",
    ).toBe(d1);
  });

  it("★★ ⭐ `apply` 是**冪等**的：同一個 operationId 重送回同一個答案", async () => {
    const a = await post(`${P}/apply`, {
      operationId: "op-1",
      package: pkg("hero.q"),
    });
    expect(a.statusCode).toBe(200);
    const again = await post(`${P}/apply`, {
      operationId: "op-1",
      package: pkg("hero.q"),
    });
    expect(again.statusCode, "⛔ 重送同一個 operationId 又跑了一次").toBe(200);
    expect(
      again.json().replayed,
      "⛔ 沒有標成 replay ⇒ 對面分不出「又做了一次」",
    ).toBe(true);
    expect(again.json().status).toBe("activated");
  });

  it("★ ⭐ `apply` 沒帶 operationId ⇒ 400（它是冪等鍵）", async () => {
    const r = await post(`${P}/apply`, { package: pkg() });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe("MISSING_OPERATION_ID");
  });

  it("★ ⭐ `GET /operations/:id` 查得到狀態機；不存在 ⇒ 404", async () => {
    await post(`${P}/apply`, { operationId: "op-1", package: pkg() });
    const r = await get(`${P}/operations/op-1`);
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("activated");
    expect(r.json().changedDocuments).toHaveLength(1);
    expect((await get(`${P}/operations/nope`)).statusCode).toBe(404);
  });

  it("★ ⭐ 還沒 apply 過 ⇒ `runtime-bundle` 回 404，⛔ 而不是回 content/bundle.json", async () => {
    const r = await get(`${P}/active/runtime-bundle`);
    expect(r.statusCode).toBe(404);
    expect(r.json().code).toBe("NO_ACTIVE_SNAPSHOT");
  });

  it("★★ ⭐ `implementedStage` 是**推導**的 —— ⛔ 六條 route 活著不等於 G2", async () => {
    const r = await get(`${P}/health`);
    expect(
      r.json().implementedStage,
      "⛔⛔ 還沒有任何 activation 就宣告 G2 ⇒ ⭐ 對面會打開 full/delta，而 base pin 是 null",
    ).toBe("G1");
    // ⭐ 而 `G1` **要說得出缺哪幾條** —— ⛔ 一個沒有原因的 G1 讓對面只能猜。
    const prof = await get(`${P}/active/target-profile`);
    const blockers = (prof.json().stageBlockers as { id: string }[]).map((b) => b.id);
    expect(blockers, "⛔ 沒有列出缺哪幾條").toContain("active-snapshot");
    // ⭐ 這一組的內容樹**沒有** assets-manifest.json ⇒ 那一條前提必須也在缺的名單上。
    //   ⚠️ 少了這一句，`asset-manifest` 那條前提可以被整個刪掉而測試全綠（突變驗過）。
    expect(
      blockers,
      "⛔ 內容樹沒有 asset manifest 而 G2 的前提沒有指名它 ⇒ ⭐ 那條前提形同不存在",
    ).toContain("asset-manifest");
    expect(prof.json().supportedModes).toEqual(["bootstrap"]);
    expect(prof.json().deltaExportAllowed).toBe(false);
    // ⭐ 而端點表是**交出去的**（規格 §3「machine-readable importer endpoints」）。
    const eps = (prof.json().importerEndpoints as { path: string }[]).map((e) => e.path);
    expect(eps).toContain("/apply");
    expect(eps).toContain("/rollback");
  });

  it("★★ ⭐⭐ **apply 過一次之後**，stage 自己會變 —— ⛔ 不是有人去改一個常數", async () => {
    // ⚠️ ⭐ 這一條是整個 `g2Readiness` 存在的理由：
    //   一個手寫的 `implementedStage` **不會**因為世界變了而變，
    //   ⛔ 它只會在有人覺得「差不多做完了」的那天被改掉。
    const before = await get(`${P}/active/target-profile`);
    expect(before.json().implementedStage).toBe("G1");

    const a = await post(`${P}/apply`, { operationId: "op-1", package: pkg("hero.q") });
    expect(a.statusCode, `⛔ apply 失敗：${a.body.slice(0, 400)}`).toBe(200);

    const after = await get(`${P}/active/target-profile`);
    const blockers = (after.json().stageBlockers as { id: string }[]).map((b) => b.id);
    // ⭐ `active-snapshot` 與 `authoring-digest` 這兩條**自己解掉了**。
    expect(blockers).not.toContain("active-snapshot");
    expect(blockers).not.toContain("authoring-digest");
    expect(after.json().supportedModes, "⛔ 有 base 了而仍然只收 bootstrap").toContain("delta");
    expect(after.json().base.activationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("★★ ⭐ `deltaExportAllowed` **不等於** supportedModes 含 delta", async () => {
    await post(`${P}/apply`, { operationId: "op-1", package: pkg("hero.q") });
    const prof = (await get(`${P}/active/target-profile`)).json() as {
      supportedModes: string[];
      deltaExportAllowed: boolean;
      implementedStage: string;
      stageBlockers: { id: string }[];
    };
    expect(prof.supportedModes).toContain("delta");
    if (prof.implementedStage !== "G2") {
      expect(
        prof.deltaExportAllowed,
        "⛔⛔ stage 還不是 G2 而 deltaExportAllowed 是 true ⇒\n" +
          "⭐ 對面會建出一包 pin 了半組欄位的 delta，而它在 apply 才被拒。\n" +
          "   還缺：" + prof.stageBlockers.map((b) => b.id).join(" · "),
      ).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐ ZIP 傳輸層走真的 HTTP
// ══════════════════════════════════════════════════════════════════════════

const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32b(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1)
    c = CRC_T[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** ⭐ 手工組一份 ZIP（⛔ 不用函式庫 —— 要組得出畸形的）。 */
function makeZip(
  files: { name: string; text: string }[],
  trailing?: Buffer,
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const data = Buffer.from(f.text, "utf8");
    const comp = deflateRawSync(data);
    const useDef = comp.length < data.length;
    const payload = useDef ? comp : data;
    const method = useDef ? 8 : 0;
    const name = Buffer.from(f.name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc32b(data), 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([lh, name, payload]);
    locals.push(local);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc32b(data), 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((0o100644 & 0xffff) << 16) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, name]));
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const parts = [...locals, cd, eocd];
  if (trailing !== undefined) parts.push(trailing);
  return Buffer.concat(parts);
}

/** ⭐ 把 `pkg()` 的物件攤成 ZIP 的檔案表。 */
function zipOf(
  id = "hero.q",
  extra: { name: string; text: string }[] = [],
): Buffer {
  const p = pkg(id);
  return makeZip([
    { name: "manifest.json", text: JSON.stringify(p.manifest) },
    ...p.documents.map((d) => ({
      name: d.path,
      text: JSON.stringify(d.document),
    })),
    ...extra,
  ]);
}

const postZip = (
  url: string,
  body: Buffer,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method: "POST",
    url,
    payload: body,
    headers: { "content-type": "application/zip", ...headers },
  });

describe("G2 ZIP 傳輸層", () => {
  it("★★ ⭐ 一份合法的 ZIP `validate` 得過，而且回得出 `archiveSha256`", async () => {
    const z = zipOf();
    const r = await postZip(`${P}/validate`, z);
    expect(r.statusCode, `⛔ 合法 ZIP 被拒：${r.body.slice(0, 400)}`).toBe(200);
    expect(r.json().status).toBe("validated");
    expect(r.json().transport.archiveSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("★★ ⭐⭐ `apply` 收 ZIP，`operationId` 走 **header**（⛔ 不是包裡）", async () => {
    const z = zipOf("hero.q");
    const r = await postZip(`${P}/apply`, z, {
      "x-ggd-operation-id": "zip-op-1",
    });
    expect(r.statusCode, `⛔ ZIP apply 失敗：${r.body.slice(0, 500)}`).toBe(
      200,
    );
    expect(r.json().status).toBe("activated");
    // ⭐ 真的進了 runtime-bundle。
    const rb = await get(`${P}/active/runtime-bundle`);
    expect(
      (
        rb.json().collections["abilities"] as { entries: { id: string; doc: { id: string } }[] }
      ).entries.find((e) => e.id === "hero.q")?.doc.id,
    ).toBe("hero.q");
    // ⭐ 冪等仍然成立（同一個 header id 重送）。
    const again = await postZip(`${P}/apply`, z, {
      "x-ggd-operation-id": "zip-op-1",
    });
    expect(again.json().replayed).toBe(true);
  });

  it("★★ ⭐ EOCD 之後多出位元組 ⇒ 422 `ZIP_TRAILING_DATA`（⛔ 不是 500）", async () => {
    const z = zipOf("hero.q");
    const r = await postZip(
      `${P}/validate`,
      Buffer.concat([z, Buffer.from("走私")]),
    );
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe("ZIP_TRAILING_DATA");
  });

  it("★★ ⭐⭐ zip-slip（`../` 路徑）⇒ 拒，⭐ 而且**在解壓之前**", async () => {
    const z = zipOf("hero.q", [{ name: "../../etc/passwd", text: "pwned" }]);
    const r = await postZip(`${P}/validate`, z);
    expect(r.statusCode, "⛔ zip-slip 的包被收下了").toBe(422);
    expect(r.json().message).toMatch(/ZIP_SLIP|ZIP_PATH_NOT_ALLOWED/);
  });

  it("★ ⭐ ZIP 裡沒有 manifest.json ⇒ 說得出是哪一條", async () => {
    const z = makeZip([{ name: "authoring/abilities/x.json", text: "{}" }]);
    const r = await postZip(`${P}/validate`, z);
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toMatch(/ZIP_MANIFEST_MISSING/);
  });

  it("★ ⭐ 不是 ZIP 的位元組 ⇒ 422（⛔ 不是 500）", async () => {
    const r = await postZip(`${P}/validate`, Buffer.from("這不是 ZIP"));
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toMatch(/ZIP_/);
  });
});


// ══════════════════════════════════════════════════════════════════════════
// ⭐⭐ G2 **真的到得了嗎** —— ⛔ 「還沒到」與「永遠到不了」是兩件事
// ══════════════════════════════════════════════════════════════════════════

describe("G2 可達性", () => {
  /**
   * ⚠️ ⭐ 這一組刻意用**帶 gameVersion 的**伺服器 ——
   * 上面那些用的是 `gameVersion: null`（＝本機沒有建置戳記），所以它們永遠卡在
   * `game-revision` 那一條。⛔ 而那會讓「G2 到不了」看起來像設計上的死路，
   * ⭐ 實際上只是**這台機器沒有戳記**。
   */
  let app2: FastifyInstance;
  let dir2: string;

  beforeEach(async () => {
    const base = mkdtempSync(join(tmpdir(), "ggd-g2r-"));
    const cd = join(base, "content");
    dir2 = join(base, "data", "content-import");
    mkdirSync(cd, { recursive: true });
    writeFileSync(
      join(cd, "manifest.json"),
      JSON.stringify({ contentVersion: "cv_test", collections: {} }),
      "utf8",
    );
    // ⭐ 一份**最小但真的合法**的 asset manifest —— `asset-manifest` 是 G2 的前提之一。
    //   ⚠️ ⛔ 沒有它的內容樹**本來就不該**是 G2（對面驗不了它引用的 GLB）。
    writeFileSync(
      join(cd, "assets-manifest.json"),
      JSON.stringify({
        schema: "ggd-asset-manifest@1",
        counts: { entries: 1, totalBytes: 4 },
        entries: [
          {
            path: "assets/models/x.glb",
            bytes: 4,
            sha256: "sha256:" + "0".repeat(64),
            contentType: "model/gltf-binary",
          },
        ],
      }),
      "utf8",
    );
    app2 = Fastify({ logger: false });
    registerImportRoutes(app2, {
      contentDir: cd,
      importDir: dir2,
      repoRoot: REPO,
      // ⭐ 出貨時這一格來自 `GGD_BUILD_STAMP`（`git describe --tags --always --dirty`）。
      gameVersion: "v0.34.26-3-gdeadbee",
    });
    await app2.ready();
  });
  afterEach(async () => {
    await app2.close();
  });

  it("★★ ⭐⭐ 有戳記 ＋ bootstrap 過一次 ⇒ stage **真的變成 G2**", async () => {
    const before = (await app2.inject({ method: "GET", url: `${P}/active/target-profile` })).json() as {
      implementedStage: string;
      stageBlockers: { id: string }[];
    };
    // ⭐ 儀器：有戳記之後 `game-revision` 就不在缺的名單上了。
    expect(before.stageBlockers.map((b) => b.id)).not.toContain("game-revision");
    expect(before.implementedStage, "儀器：還沒 bootstrap 就不該是 G2").toBe("G1");

    const a = await app2.inject({
      method: "POST",
      url: `${P}/apply`,
      payload: { operationId: "boot-1", package: pkg("hero.q") } as object,
    });
    expect(a.statusCode, `⛔ bootstrap 失敗：${a.body.slice(0, 400)}`).toBe(200);

    const after = (await app2.inject({ method: "GET", url: `${P}/active/target-profile` })).json() as {
      implementedStage: string;
      stageBlockers: { id: string; why: string }[];
      supportedModes: string[];
      deltaExportAllowed: boolean;
      base: { activationDigest: string | null; authoringDigest: string | null };
      migrationFingerprint?: string;
    };
    expect(
      after.implementedStage,
      "⛔⛔ 每一條前提都成立了而 stage 還是 G1 ⇒ ⭐ 那代表 G2 **永遠到不了**，\n" +
        "   而「還沒到」與「到不了」對面的處置完全相反（等 vs 改路）。\n" +
        "   還缺：" +
        after.stageBlockers.map((b) => `${b.id}（${b.why}）`).join(" · "),
    ).toBe("G2");
    expect(after.stageBlockers, "⭐ G2 時缺口必須是空陣列").toEqual([]);
    expect(after.supportedModes).toEqual(["bootstrap", "full", "delta"]);
    expect(
      after.deltaExportAllowed,
      "⛔ G2 了而仍然不准匯出 delta ⇒ 那一格與 stage 對同一件事說了不同的話",
    ).toBe(true);
    expect(after.base.activationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(after.base.authoringDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(after.migrationFingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it("★★ ⭐⭐ `/capabilities` · `/health` · `/active/target-profile` **三條說同一個 stage**", async () => {
    // ⚠️ ⭐ 失敗形態⑪：三條各自對的 route，接縫是空的 ——
    //   在此之前 `/capabilities` 與 `/health` 回的是**常數** `IMPLEMENTED_STAGE`，
    //   而 `/active/target-profile` 回推導值 ⇒ 一次 apply 之後它們會說 G1 與 G2。
    const read = async (path: string): Promise<string> =>
      (await app2.inject({ method: "GET", url: `${P}${path}` })).json().implementedStage as string;

    const before = [
      await read("/capabilities"),
      await read("/health"),
      await read("/active/target-profile"),
    ];
    expect(new Set(before).size, `⛔ apply 之前三條就不一致：${before.join(" / ")}`).toBe(1);

    await app2.inject({
      method: "POST",
      url: `${P}/apply`,
      payload: { operationId: "boot-1", package: pkg("hero.q") } as object,
    });

    const after = [
      await read("/capabilities"),
      await read("/health"),
      await read("/active/target-profile"),
    ];
    expect(
      new Set(after).size,
      `⛔⛔ apply 之後三條說了不同的 stage：${after.join(" / ")} ⇒\n` +
        "⭐ 對面讀哪一條就得到哪一個答案，而它們無法同時是對的。",
    ).toBe(1);
    expect(after[0], "儀器：apply 之後應該是 G2，⛔ 否則上面那條比的是兩個 G1").toBe("G2");

    // ⭐ 而 `/health` 的三格也不可以再說謊。
    const h = (await app2.inject({ method: "GET", url: `${P}/health` })).json() as {
      status: string;
      authoringStoreState: string;
      activation: { activationDigest: string } | null;
    };
    expect(h.status, "⛔ ACTIVE 明明在，health 還說 not-implemented").not.toBe("not-implemented");
    expect(h.authoringStoreState, "⛔ ACTIVE 明明在，health 還說 absent").not.toBe("absent");
    expect(h.activation?.activationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("★★ ⭐ 而 rollback 回到**第一版之前**是不可能的 ⇒ stage ⛔ 不會退回 G1", async () => {
    // ⚠️ ⭐ 這一條問的是「stage 會不會抖」：一個會在兩個值之間跳的 stage，
    //   對面每次讀到不同答案而內容沒變 ⇒ ⛔ 他只能停下來。
    await app2.inject({
      method: "POST",
      url: `${P}/apply`,
      payload: { operationId: "boot-1", package: pkg("hero.q") } as object,
    });
    const one = (await app2.inject({ method: "GET", url: `${P}/active/target-profile` })).json() as {
      implementedStage: string;
      base: { activationDigest: string };
    };
    expect(one.implementedStage).toBe("G2");
    const r = await app2.inject({
      method: "POST",
      url: `${P}/rollback`,
      payload: { expectedActivationDigest: one.base.activationDigest } as object,
    });
    // ⭐ 第一次啟用沒有上一版可以回捲 ⇒ 409（⛔ 不是靜靜地什麼都不做）。
    expect(r.statusCode).toBe(409);
    const two = (await app2.inject({ method: "GET", url: `${P}/active/target-profile` })).json() as {
      implementedStage: string;
    };
    expect(two.implementedStage, "⛔ 一次失敗的 rollback 把 stage 打回 G1").toBe("G2");
  });
});

/**
 * ⭐⭐ **`POST /validate-single`** —— 後台「載入單檔 JSON」的**安全便道**（GH#931）。
 *
 * ⭐ 它的價值在「**安全**」，⛔ 不是「方便」：由 **server** 用 ACTIVE snapshot
 * 把一份 runtime document 包成 canonical single-root delta package，
 * ⛔ **而不是讓人把 raw JSON 當 package 送進來**。
 *
 * ⚠️ ⭐ 而它與 `/validate` 走**同一支** `validatePackage()` ——
 * ⛔ 這裡沒有第二套驗證（兩份實作必然漂）。
 */
describe("POST /validate-single（GH#931）", () => {
  it("★★ ⭐ 收下一份 runtime document，**server 自己包**成 single-root package", async () => {
    const r = await post(`${P}/validate-single`, {
      collection: "abilities",
      document: { id: "probe-single", schema: "ability@1", name: "探針", slot: "Q" },
    });
    // ⭐ 200 或 422 都可以（內容本身可能不完整）——⭐ 這一條問的是「**它有沒有把 package 建出來**」。
    const body = r.json() as { singleRoot?: { collection: string; id: string; packageDigest: string } };
    expect(
      body.singleRoot,
      "⛔⛔ 沒有回 `singleRoot` ⇒ 對面只知道通過/沒通過，⭐ 卻不知道**它被包成了什麼**",
    ).toBeTruthy();
    expect(body.singleRoot!.collection).toBe("abilities");
    expect(body.singleRoot!.id).toBe("probe-single");
    expect(
      body.singleRoot!.packageDigest.length,
      "⛔ digest 是空的 —— 那代表 server 沒有真的算它",
    ).toBeGreaterThan(16);
  });

  it("★★ ⭐⭐ **一個位元組都不寫**（⛔ 票文逐字：它不得直接寫檔）", async () => {
    const before = treeOf(importDir);
    await post(`${P}/validate-single`, {
      collection: "abilities",
      document: { id: "probe-nowrite", schema: "ability@1", name: "探針", slot: "Q" },
    });
    expect(
      treeOf(importDir),
      "⛔⛔ 這條 route 落地了東西 —— ⭐ 它是**驗證**便道，⛔ 不是 apply",
    ).toEqual(before);
  });

  it("★★ ⭐ 不認得的 collection ⇒ **拒絕並說要走完整 Package**", async () => {
    const r = await post(`${P}/validate-single`, {
      collection: "champions",
      document: { id: "x", schema: "champion@1" },
    });
    expect(r.statusCode, "⛔ 不支援的 collection 竟然收下了").toBe(422);
    expect((r.json() as { code?: string }).code).toBe("SINGLE_COLLECTION_UNSUPPORTED");
  });

  it("⭐ 反方向：缺 `id` 的 document ⇒ 拒絕（⛔ 不可以靜靜當成空包）", async () => {
    const r = await post(`${P}/validate-single`, { collection: "items", document: { schema: "item@1" } });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { code?: string }).code).toBe("SINGLE_DOCUMENT_INVALID");
  });
});

/**
 * ⭐⭐ **「合理性檢查」與「推薦組合」的兩個資料源交得出去**（GH#957）。
 *
 * owner 2026-09-02（逐字，追加的驗收軸）：
 * > 「玩家要能做的出來，並且自動化機制檢查**合理性**及**推薦組合**」
 *
 * ⭐ 照 owner 的角色分工（「Main 只提供⋯**限制 resolver** 與**機器契約**」），
 * Main 側的責任就是**把那兩份交出去** ——
 * ⛔ 而在此之前 `brick-census` **完全沒有端點**（對面 `git show` 得到，
 * ⚠️ 但**跑起來的編輯器讀不到**），
 * ⛔ 而 `authoring-rules` **有 route 卻不在 `IMPORTER_ENDPOINTS` 裡**
 * ⇒ ⭐ 那張表就是 target profile 交出去的那一份 ⇒ **編輯器看不到那條路**
 * （形態⑪：端點在，而契約沒說它在）。
 */
describe("編輯器的兩個唯讀契約（GH#957）", () => {
  it("★★ ⭐ `GET /authoring-rules` —— 合理性檢查的**權威**（⛔ 不是抄一份到編輯器）", async () => {
    const r = await get(`${P}/authoring-rules`);
    expect(r.statusCode, "⛔ 合理性規則拿不到 ⇒ 編輯器只能自己抄一份（＝第二個住處）").toBe(200);
    const body = r.json() as Record<string, unknown>;
    expect(
      Object.keys(body).length,
      "⛔ 回了一個空物件 —— 那與「端點不存在」對編輯器是同一件事",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐ `GET /brick-census` —— 推薦組合要用的**積木清單**", async () => {
    const r = await get(`${P}/brick-census`);
    expect(
      r.statusCode,
      "⛔⛔ 積木清單拿不到 ⇒ ⭐ owner 逐字：「編輯器是**堆積木**的角色，\n" +
        "  要充分了解**有哪些積木**」—— 而它讀不到那份清單。",
    ).toBe(200);
    const body = r.json() as { counts?: Record<string, number> };
    expect(body.counts, "⛔ 沒有 `counts` ⇒ 那不是積木普查").toBeTruthy();
  });

  it("★★ ⭐⭐ 兩條都**在端點表裡**（⛔ 有 route 而契約沒說 = 對面看不到）", () => {
    const paths = new Set(IMPORTER_ENDPOINTS.map((e) => `${e.method} ${e.path}`));
    for (const p of ["GET /authoring-rules", "GET /brick-census"])
      expect(
        paths.has(p),
        `⛔⛔ \`${p}\` 沒有掛進 \`IMPORTER_ENDPOINTS\` ⇒\n` +
          "  ⭐ 那張表是 **target profile 交出去的那一份** ——\n" +
          "  ⛔ route 活著而契約沒說它在，對面就**找不到它**。",
      ).toBe(true);
  });
});

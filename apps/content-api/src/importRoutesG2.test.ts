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
import { registerImportRoutes } from "./importRoutes";

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
    expect(rb.json().docs.abilities["hero.q"].id).toBe("hero.q");
    expect(rb.json().activationDigest).toBe(d1);

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
    expect(rb2.json().docs.abilities["hero.q"]).toBeTruthy();
    expect(rb2.json().docs.abilities["hero.w"]).toBeUndefined();
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
    expect(rb.json().docs.abilities["hero.q"].id).toBe("hero.q");
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

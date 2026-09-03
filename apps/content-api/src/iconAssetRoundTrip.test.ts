/**
 * ⭐⭐ GH#966 —— **一張圖從 zip 進來、轉檔、落地、把文件的 `icon` 指過去**。
 *
 * ── ⛔ 這一支要抓的缺陷，形狀是本 repo 記錄最糟的一種 ──────────────────────
 * 在此之前 `fromZip()` 把**每一個** entry `.toString("utf8")`，然後把不是
 * `authoring/` 的路徑**靜靜跳過** ⇒ ⭐ 症狀是
 * **匯出成功 · 上傳成功 · validate 通過 · ⛔ 而 icon 不見了**，⛔ 沒有一步會說。
 *
 * ── ⭐ 為什麼是「真的 zip → 出貨的 route」，⛔ 不是自己造 payload 餵進去 ────
 * 失敗形態⑤：一份自己造的 payload 量的是一個**虛構通道**。
 * ⇒ 這裡真的組 ZIP 的位元組、真的 `app.inject`、真的跑 `cwebp`、真的看磁碟。
 *
 * ⚠️ ⭐ `cwebp` **不存在時這一支要紅**，⛔ 不是跳過 —— 一條「環境不對就跳過」的閘
 * 等於沒有閘（`composeLogCap.test.ts` 逐字寫過同一個理由）。出貨映像由 GH#967
 * 保證裝了它；本機／CI 缺了就照訊息裝。
 *
 * MUTATION LOG（落地前跑過，見 commit message）：
 *   · 拿掉 `fromZip()` 的 `role:"asset"` 分支（＝回到全部 `.toString("utf8")`）→ 🔴
 *   · 拿掉「zip 有而 manifest 沒宣告 ⇒ 報錯」那一段 → 🔴
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { deflateRawSync, deflateSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";

import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { buildAuthoringProcessor } from "@ggd/shared/content/import/authoringProcessor";
import { checkIconAssets } from "@ggd/shared/content/import/iconAssets";
import { DEFAULT_ICON_UPLOAD, resolveIconUpload } from "@ggd/shared/content/schema/config/iconUpload";
import { ICON_ENCODE } from "@ggd/shared/content/icons/encodeIcon";
import { assetSha256 } from "./iconLanding";
import { registerImportRoutes } from "./importRoutes";

const REPO = join(__dirname, "../../..");
const FP = buildAuthoringProcessor(REPO).fingerprint;
const P = "/api/v1/content-import";
const ID = "hero.q";
const ASSET_PATH = `assets/icon/abilities/${ID}/source.png`;

// ── 儀器：`cwebp` 在不在（⛔ 不跳過，缺了就紅並說怎麼裝）────────────────────
let cwebpOk = false;
try {
  execFileSync("cwebp", ["-version"], { stdio: "pipe" });
  cwebpOk = true;
} catch {
  cwebpOk = false;
}

// ── 造一份**真的** PNG（⛔ 不放一個假位元組進去 —— 要真的轉得動）──────────
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
  for (let i = 0; i < buf.length; i += 1) c = CRC_T[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32b(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** RGBA PNG，`shade` 決定顏色 ⇒ 兩張不同的圖轉出來的 sha 一定不同。 */
function makePng(w: number, h: number, shade: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y += 1) {
    const row = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x += 1) {
      row[1 + x * 4] = (shade + x) & 0xff;
      row[2 + x * 4] = (shade + y) & 0xff;
      row[3 + x * 4] = shade & 0xff;
      row[4 + x * 4] = 0xff;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
/** ⭐ 只有**檔頭**宣稱很大 —— 那正是解壓炸彈的樣子（⛔ 本體不用真的那麼大）。 */
function pngClaiming(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(16))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── 手工組 ZIP（⭐ 收 Buffer，⛔ 不是只收字串 —— 那正是本票的重點）─────────
function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const comp = deflateRawSync(f.data);
    const useDef = comp.length < f.data.length;
    const payload = useDef ? comp : f.data;
    const method = useDef ? 8 : 0;
    const name = Buffer.from(f.name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc32b(f.data), 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([lh, name, payload]);
    locals.push(local);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc32b(f.data), 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
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
  return Buffer.concat([...locals, cd, eocd]);
}

const ABILITY = {
  schema: "ability@1",
  id: ID,
  name: "測試技",
  description: "測試",
  castType: "self",
  maxRank: 1,
  cooldown: [1],
  manaCost: [0],
  range: 0,
  effects: [],
};

interface Tweak {
  /** 蓋掉 asset entry 的欄位（`null` ＝ 整列拿掉）。 */
  entry?: Record<string, unknown> | null;
  /** zip 裡放的圖（`null` ＝ 不放）。 */
  png?: Buffer | null;
}

function zipWithIcon(png: Buffer, tweak: Tweak = {}): Buffer {
  const docPath = `authoring/abilities/${ID}.json`;
  const assetEntry: Record<string, unknown> = {
    path: ASSET_PATH,
    role: "asset",
    contentSha256: assetSha256(png),
    contentSize: png.length,
    collection: "abilities",
    id: ID,
    targetField: "icon",
    mime: "image/png",
    ...(tweak.entry ?? {}),
  };
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
        path: docPath,
        role: "authoring",
        contentSha256: contentSha256(ABILITY),
        contentSize: 100,
        collection: "abilities",
        id: ID,
        op: "upsert",
      },
      ...(tweak.entry === null ? [] : [assetEntry]),
    ],
    requires: [],
    expectedDerived: [],
    validationPolicy: {},
    requiredScenarios: [],
    fidelityDecisions: [],
    acceptedWarnings: [],
  };
  manifest["packageDigest"] = packageDigest(manifest);
  const bytes = tweak.png === undefined ? png : tweak.png;
  return makeZip([
    { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest), "utf8") },
    { name: docPath, data: Buffer.from(JSON.stringify(ABILITY), "utf8") },
    ...(bytes === null ? [] : [{ name: ASSET_PATH, data: bytes }]),
  ]);
}

let app: FastifyInstance;
let contentDir: string;

beforeEach(async () => {
  const base = mkdtempSync(join(tmpdir(), "ggd-icon-"));
  contentDir = join(base, "content");
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

const postZip = (url: string, body: Buffer, headers: Record<string, string> = {}) =>
  app.inject({
    method: "POST",
    url,
    payload: body,
    headers: { "content-type": "application/zip", ...headers },
  });

const codesOf = (r: { json: () => unknown }): string[] => {
  const j = r.json() as { code?: string; diagnostics?: { code: string }[] };
  return [...(j.code === undefined ? [] : [j.code]), ...(j.diagnostics ?? []).map((d) => d.code)];
};

describe("GH#966 編輯器打包的 icon", () => {
  it("⚙️ 儀器：`cwebp` 在（⛔ 缺了不跳過 —— 環境不對就跳過的閘等於沒有閘）", () => {
    expect(
      cwebpOk,
      "⛔ 找不到 `cwebp` ⇒ ⭐ 出貨映像由 GH#967 保證裝了它（Alpine：`libwebp-tools`）。" +
        "本機：`brew install webp`；Debian/Ubuntu：`apt-get install -y webp`。",
    ).toBe(true);
  });

  it("★★ ⭐⭐ 一張圖 → zip → apply ⇒ **檔案落地** 且文件的 `icon` 指到它", async () => {
    const png = makePng(256, 256, 40);
    const r = await postZip(`${P}/apply`, zipWithIcon(png), {
      "x-ggd-operation-id": "icon-1",
    });
    expect(r.statusCode, `⛔ 帶 icon 的包被拒：${r.body.slice(0, 600)}`).toBe(200);

    // ⭐ ① 位元組真的落在出貨慣例的那個路徑上（⛔ 不是「回應說成功了」）。
    const rel = `assets/icons/abilities/${ID}.webp`;
    const abs = join(contentDir, rel);
    expect(existsSync(abs), `⛔ ${rel} 沒有落地 ⇒ 圖又不見了`).toBe(true);
    const out = readFileSync(abs);
    expect(out.subarray(0, 4).toString("latin1"), "⛔ 落地的不是 WebP").toBe("RIFF");
    expect(out.subarray(8, 12).toString("latin1")).toBe("WEBP");

    // ⭐ ② 文件的 `icon` 指到它 —— ⛔ 沒有這一步，圖在磁碟上而遊戲看不到。
    const rb = await app.inject({ method: "GET", url: `${P}/active/runtime-bundle` });
    const doc = (
      rb.json().collections["abilities"] as { entries: { id: string; doc: { icon?: string } }[] }
    ).entries.find((e) => e.id === ID)?.doc;
    expect(doc?.icon, "⛔⛔ 圖落地了而文件沒有指過去 ⇒ ⭐ 玩家看到的還是舊圖").toBe(rel);

    // ⭐ ③ 回應說得出圖去了哪裡（⛔ 一個只回「成功」的回應答不出「那我的 icon 呢」）。
    const landed = r.json().iconAssets as { path: string; unchanged: boolean }[];
    expect(landed.map((l) => l.path)).toEqual([rel]);
    expect(landed[0]!.unchanged, "第一次落地不該說「沒變」").toBe(false);
    expect(r.json().pendingReview, "⭐ 出貨預設要留一筆待審紀錄").toBe(true);
  });

  it("★★ ⭐⭐ zip 裡有圖而 manifest **沒宣告** ⇒ 報錯**並指名那個路徑**", async () => {
    const r = await postZip(`${P}/validate`, zipWithIcon(makePng(64, 64, 7), { entry: null }));
    expect(r.statusCode, "⛔⛔ 未宣告的 entry 被靜靜吃掉了 ⇒ ⭐ 設計師永遠不知道圖掉了").toBe(422);
    expect(codesOf(r)).toContain("ZIP_ENTRY_UNDECLARED");
    expect(r.json().message, "⛔ 沒有指名是哪一條").toContain(ASSET_PATH);
  });

  it("★★ ⭐ 反方向：manifest 宣告了而 zip 裡**沒有** ⇒ 也要報錯並指名", async () => {
    const r = await postZip(`${P}/validate`, zipWithIcon(makePng(64, 64, 7), { png: null }));
    expect(r.statusCode).toBe(422);
    expect(codesOf(r)).toContain("ZIP_ENTRY_MISSING");
    expect(r.json().message).toContain(ASSET_PATH);
  });

  it("★★ ⭐ `contentSha256` 改一個位元 ⇒ **整包退回**（宣稱是宣稱，位元組是事實）", async () => {
    const png = makePng(64, 64, 9);
    const wrong = assetSha256(png).replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    const r = await postZip(`${P}/validate`, zipWithIcon(png, { entry: { contentSha256: wrong } }));
    expect(r.statusCode).toBe(422);
    expect(codesOf(r)).toContain("ASSET_BYTES_MISMATCH");
  });

  it("★★ ⭐⭐ 宣稱超大尺寸的圖 ⇒ **在 decode 前**被拒（⛔ 不是 OOM）", async () => {
    const bomb = pngClaiming(65535, 65535);
    const r = await postZip(`${P}/validate`, zipWithIcon(bomb));
    expect(r.statusCode).toBe(422);
    expect(codesOf(r)).toContain("ASSET_DIMENSIONS_TOO_LARGE");
    // ⭐ 上限是**推導**的（出貨邊長 × 倍數），⛔ 不是文件裡的一個字面值。
    expect(r.json().diagnostics.map((d: { message: string }) => d.message).join(" ")).toContain(
      String(DEFAULT_ICON_UPLOAD.maxSourceEdgeMultiple * ICON_ENCODE.edge),
    );
  });

  it("★★ ⭐ 改名成 `.png` 的別種檔 ⇒ magic bytes 擋下來（S1）", async () => {
    const fake = Buffer.from("這不是 PNG，只是副檔名寫著 png".repeat(4), "utf8");
    const r = await postZip(`${P}/validate`, zipWithIcon(fake));
    expect(r.statusCode).toBe(422);
    expect(codesOf(r)).toContain("ASSET_FORMAT_REJECTED");
  });

  it("★★ ⭐⭐ CAS：第二份圖沒帶對 base ⇒ 拒，⛔ 不是默默覆蓋", async () => {
    const first = makePng(256, 256, 40);
    const a = await postZip(`${P}/apply`, zipWithIcon(first), { "x-ggd-operation-id": "cas-1" });
    expect(a.statusCode, `⛔ 第一次 apply 失敗：${a.body.slice(0, 400)}`).toBe(200);
    const landedSha = (a.json().iconAssets as { sha256: string }[])[0]!.sha256;

    // ⭐ 第二個人拿著「這支技能還沒有圖」的前提送 ⇒ 必須被擋。
    const second = makePng(256, 256, 200);
    const stale = await postZip(
      `${P}/validate`,
      zipWithIcon(second, { entry: { baseSha256: null } }),
    );
    expect(stale.statusCode, "⛔⛔ 過期的 base 被收下了 ⇒ ⭐ 那等於默默蓋掉對方的圖").toBe(422);
    expect(codesOf(stale)).toContain("ASSET_BASE_CHANGED");

    // ⭐ 帶著**現在**磁碟上那一份的 sha ⇒ 過。
    const ok = await postZip(
      `${P}/validate`,
      zipWithIcon(second, { entry: { baseSha256: landedSha } }),
    );
    expect(ok.statusCode, `⛔ 帶對 base 仍被拒：${ok.body.slice(0, 500)}`).toBe(200);
  });

  it("★ ⭐ 開關不是裝飾：`enabled:false` ⇒ 明確拒絕（⛔ 不是靜靜丟掉）", () => {
    const png = makePng(64, 64, 3);
    const entry = {
      path: ASSET_PATH,
      role: "asset",
      contentSha256: assetSha256(png),
      contentSize: png.length,
      collection: "abilities",
      id: ID,
      targetField: "icon",
    };
    const policy = { ...resolveIconUpload({ ...DEFAULT_ICON_UPLOAD, enabled: false }), maxSourceBytes: 1 << 23 };
    const r = checkIconAssets({
      entries: [entry],
      bytes: new Map([[ASSET_PATH, png]]),
      policy,
      existing: new Map(),
      sha256: assetSha256,
    });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["ASSET_UPLOAD_DISABLED"]);
    expect(r.plans).toEqual([]);
  });
});

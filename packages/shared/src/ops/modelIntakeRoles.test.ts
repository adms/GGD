/**
 * ⭐ 模型入庫棘輪的**分母**是以關係判定的（GH#1263）—— 量尺自證，兩個方向都跑。
 *
 * 在此之前分母是「全 repo 每一顆 GLB」，而凍結版本的位元組結構上不可以改 ⇒ 棘輪永遠降不回去（假綠燈⑨）。
 * 改成關係判定之後，最怕的是反方向：**一顆玩家預設就載入的壞模型被分進 (c) 而沒有人喊**。
 * ⇒ 同一份壞位元組（貼圖＝上限×2），只換它與英雄的**關係**：
 *   ① 它是英雄的預設身體 ⇒ (a) 硬棘輪 **紅**，而且更嚴的那一格 a_body_tex 也紅並指名「英雄 probe」
 *   ② 它只是那位英雄凍結的「原上線模型」 ⇒ (c) 不計、a_body_tex 0、閘綠、並印出理由
 *   ③ GH#1173 ab_gltf：同一條關係換成「嚴格 glTF 驗證驗不過」的位元組 —— 預設身體 ⇒ 紅並指名；凍結原上線模型 ⇒ 0、綠
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { HERO_MODEL_BUDGET, textureVramBytes } from "../content/modelUpload/budget";
import { modelUploadFixture } from "../content/modelUpload/fixtures";
import { encodeUploadGlb } from "../content/modelUpload/glb";

const SCRIPT = resolve(__dirname, "../../../../tools/w3x-import/model_intake.py");
/** ⭐ 從出貨上限推導（⛔ 不寫死 512：上限一調，夾具就會用錯的訊息紅）。 */
const EDGE = HERO_MODEL_BUDGET.texEdge.limit * 2;

/** 最小 GLB：`images` 張 PNG（共用一段只有 IHDR 寬高的位元組，`inspect()` 讀的就是那 8 個位元組）。 */
function glb(edge: number, images = 1): Buffer {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(edge, 16);
  png.writeUInt32BE(edge, 20);
  const text = JSON.stringify({ asset: { version: "2.0" }, images: Array.from({ length: images }, () => ({ bufferView: 0, mimeType: "image/png" })), bufferViews: [{ buffer: 0, byteLength: 24 }], buffers: [{ byteLength: 24 }] });
  const u32 = (...values: number[]) => Buffer.from(new Uint32Array(values).buffer);
  const chunk = (type: number, data: Buffer) => Buffer.concat([u32(data.length, type), data]);
  const body = Buffer.concat([chunk(0x4e4f534a, Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, " "))), chunk(0x004e4942, png)]);
  return Buffer.concat([u32(0x46546c67, 2, 12 + body.length), body]);
}

function scan(badIsDefault: boolean, { bad = glb(EDGE), clean = glb(64), validate = false } = {}) {
  const content = join(mkdtempSync(join(tmpdir(), "intake-roles-")), "content");
  const sha = createHash("sha256").update(bad).digest("hex");
  const write = (rel: string, data: string | Buffer) => {
    mkdirSync(join(content, rel, ".."), { recursive: true });
    writeFileSync(join(content, rel), data);
  };
  try {
    write(`assets/models/community/${sha}.glb`, bad);
    write("assets/models/community/clean.glb", clean);
    write("models/probe.body.json", JSON.stringify({ id: "probe.body", glbPath: badIsDefault ? `assets/models/community/${sha}.glb` : "assets/models/community/clean.glb" }));
    write("models/version.body.probe.json", JSON.stringify({ id: "version.body.probe", glbPath: `assets/models/community/${sha}.glb`, bodyVersion: { sourceModelKey: "probe.body", legacyAppearance: true } }));
    const previous = { modelKey: "version.body.probe", label: "原上線模型", sourceModelKey: "probe.body", binarySha256: sha, registeredAt: "2026-09-15T00:00:00.000Z", source: { kind: "previous" } };
    write("champions/probe.json", JSON.stringify({ id: "probe", modelKey: "probe.body", modelVersions: badIsDefault ? [] : [previous] }));
    write("ratchet.txt", "a=0\nb=0\na_body_tex=0\nab_gltf=0\n");
    const r = spawnSync("python3", [SCRIPT, "--all", ...validate ? [] : ["--no-validate"], "--content", content, "--ratchet", join(content, "ratchet.txt")], { encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dirname(content), { recursive: true, force: true });
  }
}

describe("模型入庫棘輪的分母以關係判定（GH#1263）", () => {
  it("① 壞模型是英雄的預設身體 ⇒ (a) 硬棘輪紅、a_body_tex 紅，兩邊都指名它", () => {
    const { code, out } = scan(true);
    expect(out, out).toMatch(/\(a\) 玩家預設拿得到[^\n]*有問題 1/);
    expect(code, out).toBe(1);
    expect(out).toMatch(new RegExp(`⛔⛔ \\(a\\)[\\s\\S]*英雄的預設身體 probe[\\s\\S]*貼圖邊長 ${EDGE}`));
    expect(out, out).toMatch(new RegExp(`英雄 probe → assets/models/community/[0-9a-f]{64}\\.glb（${EDGE}）[\\s\\S]*⛔⛔ a_body_tex[^\\n]*0 → 1 格`));
  }, 60_000);

  it("② 同一份位元組只是凍結的原上線模型 ⇒ (c) 不計、a_body_tex 0、閘綠、印出理由", () => {
    const { code, out } = scan(false);
    expect(out, out).toMatch(/\(a\) 玩家預設拿得到[^\n]*有問題 0/);
    expect(out).toMatch(/1 顆（有問題 1）原上線模型 —— /);
    expect(out).toMatch(/a_body_tex —— [^\n]*：1 格裡 0 格/);
    expect(code, out).toBe(0);
  }, 60_000);

  it("③ GH#1173 ab_gltf：驗不過的位元組是預設身體 ⇒ 紅並指名；同一份只是凍結的原上線模型 ⇒ 0、綠", () => {
    // ⭐ 出貨真的長這樣：09-09 凍結的副本 accessor 界對不上存進去的值（ACCESSOR_MAX_MISMATCH），其餘全對
    const fx = modelUploadFixture();
    const json = structuredClone(fx.json);
    json.accessors[fx.position]!.max = [9, 9, 9];
    const files = { bad: Buffer.from(encodeUploadGlb(json, fx.bin)), clean: Buffer.from(fx.bytes), validate: true };
    const hit = scan(true, files);
    expect(hit.out, hit.out).toMatch(/⭐ ab_gltf —— [^\n]*：1 顆\n[^\n]*\(a\) [^\n]*assets\/models\/community\/[0-9a-f]{64}\.glb {2}\[英雄的預設身體 probe\]/);
    expect(hit.out).toMatch(/⛔⛔ ab_gltf[^\n]*0 → 1 顆/);
    expect(hit.code).toBe(1);
    const frozen = scan(false, files);
    expect(frozen.out, frozen.out).toMatch(/⭐ ab_gltf —— [^\n]*：0 顆/);
    expect(frozen.code, frozen.out).toBe(0);
  }, 120_000);
});

describe("GH#1174 英雄貼圖 VRAM 線 —— python 這一份的上限讀 budget.ts（⛔ 不抄字面值）", () => {
  it("每張都剛好在邊長上限：塞得下的張數 ⇒ 不叫；多一張 ⇒ 叫", () => {
    const edge = HERO_MODEL_BUDGET.texEdge.limit;
    const fits = Math.floor(HERO_MODEL_BUDGET.vramBytes.limit / textureVramBytes(edge, edge));
    const probe = (images: number) => {
      const content = join(mkdtempSync(join(tmpdir(), "intake-vram-")), "content");
      const file = join(content, "assets/models/champions/probe.glb");
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, glb(edge, images));
        const r = spawnSync("python3", [SCRIPT, file, "--no-validate", "--content", content], { encoding: "utf8" });
        return `${r.stdout}${r.stderr}`;
      } finally {
        rmSync(dirname(content), { recursive: true, force: true });
      }
    };
    const under = probe(fits), over = probe(fits + 1);
    // ⭐ 量尺自證：先確認它真的掃到了（exit 2「讀不到預算」也不會印 VRAM —— 那不是「沒超線」）。
    expect(under, under).toMatch(/⭐ 掃了 1 顆/);
    expect(under).not.toMatch(/英雄貼圖 VRAM/);
    expect(over, over).toMatch(/英雄貼圖 VRAM/);
  }, 120_000);
});

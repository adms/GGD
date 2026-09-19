/**
 * merge.test — 合併 stage 的承重守衛（GH#1198 / #1175）。
 *
 * ⭐ 它跑的是**出貨的那一支**（`execFileSync` 打 optimize.ts 的 CLI），⛔ 不是我自己
 * 造一份 payload 餵進某個內部函式 —— 後者驗的是一條虛構通道（第二守則失敗形態⑤）。
 *
 * ⭐ 夾具是**真的出貨模型**，⛔ 不是合成的：
 *
 * | 夾具 | 今天 | 這份守衛釘住的 |
 * |---|---|---|
 * | `imported/herofate.glb` | 8 draws / 1 種畫法 | 接得動的那一邊**真的接了**，而像素沒變 |
 * | `imported/flamestrike1.glb` | 5 draws / 5 塊**全是半透明** | 接不動的那一邊**什麼都不寫** |
 *
 * ⚠️⚠️ ⭐ **這份守衛「守不到」什麼，要講清楚**（⛔ 不要讓下一個人以為它守到了）：
 * **半透明保護本身⛔ 不住這裡** —— 它住上游 `glb_draw_state` / `merge_glb_prims`
 * （GH#1283，那邊有自己的守衛）。⇒ 把**這個 repo 裡** worker 的 `blend_order`
 * 拿掉，`flamestrike1` **照樣**不會被寫出來 —— 因為上游的 `merge()` 預設仍然保護，
 * 而 optimize.ts 再擋一次「draw 沒變少就拒絕」。⭐ 那是**縱深防禦**，⛔ 不是這條斷言
 * 的功勞。⇒ 這一條驗的是**拒絕路徑接得對**（拒絕 ⇒ 產物樹一個檔都不留），
 * ⛔ 不是「半透明不會被接」。
 *
 * ⚠️ 同理，原本這裡想用 `ou99_467889`（17 draws / 17 種畫法各不相同）當反例 ——
 * ⛔ 它更假：擋住它的是「畫法各不相同」，⭐ 連拒絕路徑的哪一段在出力都分不出來。
 *
 * 突變紀錄見 commit message。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { measureGlb, readGlb, readImages, sha256File } from "./glb";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OPT = path.join(HERE, "optimize.ts");
/** 8 draws / 1 種畫法 ⇒ 該接。 */
const MERGEABLE = path.join(ROOT, "content/assets/models/imported/herofate.glb");
/** 5 draws,⭐ 5 塊**全是半透明** ⇒ ⛔ 一塊都不准接（接了就換掉繪製順序）。 */
const BLEND_ONLY = path.join(ROOT, "content/assets/models/imported/flamestrike1.glb");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "merge-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** 每張貼圖的位元組 —— 「畫面沒變」的證據就是這一份清單不變。 */
function textureBytes(file: string): string[] {
  const glb = readGlb(file);
  return readImages(glb).map((im) => {
    const v = glb.json.bufferViews[im.bufferView];
    return `${im.w}x${im.h}:${(glb.bin!.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)).toString("base64").slice(0, 44)}`;
  });
}

function runMerge(src: string, out: string): string {
  // --tex-edge 99999 關掉 texture stage ⇒ 這一輪只驗合併,⛔ 不混進縮圖的效果。
  return execFileSync(
    process.execPath,
    ["--import", "tsx", OPT, src, "--merge", "--tex-edge", "99999", "--out", out, "--apply"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

describe("merge stage", () => {
  it("接得動的：draw call 變少,而面數/骨架/貼圖一個位元組都沒變", () => {
    const out = path.join(tmp, "yes");
    const before = { sha: sha256File(MERGEABLE), m: measureGlb(MERGEABLE), tex: textureBytes(MERGEABLE) };
    runMerge(MERGEABLE, out);
    const produced = path.join(out, "assets/models/imported/herofate.glb");
    expect(fs.existsSync(produced)).toBe(true);
    const after = measureGlb(produced);

    expect(after.meshes).toBeLessThan(before.m.meshes); // ① draw call 真的掉了
    expect(after.triangles).toBe(before.m.triangles); // ② ⛔ 合併不可以吃掉幾何
    expect(after.clips).toBe(before.m.clips);
    expect(after.channelsPerFrame).toBe(before.m.channelsPerFrame);
    expect(textureBytes(produced)).toEqual(before.tex); // ③ ⭐ 像素不變的證據
    expect(sha256File(MERGEABLE)).toBe(before.sha); // ④ ⛔ 絕不就地覆蓋
  });

  it("全是半透明的：⛔ 一塊都不接,不寫出任何候選（拿掉保護就會變成 5→1）", () => {
    const out = path.join(tmp, "no");
    runMerge(BLEND_ONLY, out);
    expect(fs.existsSync(path.join(out, "assets/models/imported/flamestrike1.glb"))).toBe(false);
  });
});

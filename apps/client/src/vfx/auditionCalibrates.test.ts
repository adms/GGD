/**
 * 🔬 GH#768（量尺自證）＋ GH#715（台子接線）—— 兩張票同一個病：**量尺自己會說謊**。
 *
 * ⛔ 這裡**不做像素斷言**（那是各批 visual-proof 的事）。它問的是兩件靜態可判的事：
 *   ① 校準的**判準**真的問了兩個方向（拿掉「暗」那一半 ⇒ 這裡紅）；
 *   ② 台子真的裝了**出貨組合根**的那四道縫（少任一道 ⇒ 這裡紅並指名）。
 * ⚠️ 手法照 `GameApp.roundFxWiring.test.ts`：headless 建構不起來 ⇒ `stripComments`
 * ＋ 文字比對，所以**註解裡提到這些名字不算數**。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { assertTwoWay } from "./auditionCalibrate";

const read = (rel: string): string =>
  stripComments(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const R = (bright: number): { w: number; h: number; bright: number; lit: number } => ({
  w: 8,
  h: 8,
  bright,
  lit: bright,
});

describe("GH#768 audition 的量尺要**兩個方向**都自證", () => {
  it("已知亮 → 量得到 ⊕ 已知暗 → 量得少：這一組才算通過", () => {
    expect(() => assertTwoWay("尺", R(4000), R(12))).not.toThrow();
  });

  it("⬜ 亮的那一邊量到 0 ⇒ 擲例外並說「結論作廢」", () => {
    expect(() => assertTwoWay("尺", R(0), R(0))).toThrow(/作廢/);
  });

  it("⬛ 暗的那一邊**沒有變少** ⇒ 擲例外（⛔ 校準不可以變成「永遠回非零」）", () => {
    // 一支壞掉的尺永遠回同一個大數字 —— 單邊校準對它是**綠的**，而它的每一句
    // 「改前完全看不見」都是憑空的。這一條就是 #768 驗收條件③。
    expect(() => assertTwoWay("gl.readPixels", R(4000), R(4000))).toThrow(/證明不了東西不在/);
    expect(() => assertTwoWay("gl.readPixels", R(4000), R(9999))).toThrow(/gl\.readPixels/);
  });

  it("beamAudition 把**兩把尺**都交給校準（⛔ 不是只有出讀數的那一把之外的那把）", () => {
    // ⚠️ `probeDocs()` 的每一份 vfx@1 讀數走 readRaw()／gl.readPixels，
    // 而在 #768 之前只有 measure()／engine.readPixels 被校準過。
    const src = read("./beamAudition.ts");
    const at = src.indexOf("calibrateTwoWay({");
    expect(at, "beamAudition 沒有走 calibrateTwoWay").toBeGreaterThan(0);
    const block = src.slice(at, at + 700);
    for (const ruler of ["engine.readPixels", "gl.readPixels"]) {
      expect(block, `校準沒有收 ${ruler} 這把尺`).toContain(ruler);
    }
  });

  it("三個台子沒有一個留著自己手寫的單邊校準", () => {
    for (const f of ["./beamAudition.ts", "./chainLightningAudition.ts", "./featureProofAudition.ts"]) {
      const src = read(f);
      expect(src, `${f} 沒有走 calibrateTwoWay`).toContain("calibrateTwoWay");
      expect(src, `${f} 還留著手寫的 calib-quad ⇒ 那是第二個住處`).not.toContain("calib-quad");
    }
  });
});

describe("GH#715 audition 台子要裝**出貨組合根**的那四道縫", () => {
  it("少任何一道 ⇒ 這一頁會安靜地退回「只看得見 glb」", () => {
    const src = read("./beamAudition.ts");
    // ⛔ 順序照 ContentDb.load()：晉升表 → 綁定表 → setFamilyTuning（反了會鑄出空家族）
    const seams = ["setAbilityArtBindings(", "setAbilityVfxBindings(", "setFamilyTuning(", "vfxDoc:"];
    let cursor = -1;
    for (const s of seams) {
      const at = src.indexOf(s);
      expect(at, `beamAudition 沒有安裝 ${s} —— 少了它整頁的讀數都會掉進退路階梯`).toBeGreaterThan(0);
      if (s !== "vfxDoc:") {
        expect(at, `${s} 的安裝順序跟 ContentDb.load() 對不起來`).toBeGreaterThan(cursor);
        cursor = at;
      }
    }
  });
});

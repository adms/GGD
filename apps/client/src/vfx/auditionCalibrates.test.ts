/**
 * 🔬 GH#768（量尺自證）＋ GH#715（台子接線）—— 兩張票同一個病：**量尺自己會說謊**。
 *
 * ⛔ 這裡**不做像素斷言**（那是各批 visual-proof 的事）。四件事，⭐ 而它們**不一樣強**：
 *   ①②③ ⭐ **行為** —— 校準判準問了兩個方向（`assertTwoWay`）· `measure()` 自證失敗時
 *        交不出數字（`makeCertifiedMeasure` **可注入**）· 滿版亮幀數得到、全黑數到 0（`countBright`）
 *   ④ ⚠️ **結構** —— 台子有沒有把那些零件接上去（`stripComments` ＋ 文字比對）
 * ⚠️ ④ 是不得已的（`createBeamAudition()` headless 建構不起來：Babylon ＋ WebGL ＋ 真內容載入）
 * ⇒ 它擋得住「有人把接線刪掉」，⛔ 擋不住「有人把零件改成不校準」——**那一半由 ①②③ 守**。
 * ⚠️ ④ 是文字比對 ⇒ **註解裡提到這些名字不算數**。
 * ⚠️ #715 的第五道縫（施法不會被 `step()` 清空吃掉）是行為 ⇒ 住 `beamAuditionWiring.test.ts`。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { assertTwoWay } from "./auditionCalibrate";
import { countBright, makeCertifiedMeasure } from "./beamAudition";

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

/** ⭐ 一支**真的** `measure()`（三個零件注入）—— ⛔ 不掃字串、⛔ 也不必開一顆 GPU。 */
const spyMeasure = (
  certify: () => Promise<unknown>,
): { log: string[]; measure: (o?: { certify?: boolean }) => Promise<unknown> } => {
  const log: string[] = [];
  const measure = makeCertifiedMeasure({
    certify: () => {
      log.push("certify");
      return certify();
    },
    readPixels: async () => {
      log.push("read");
      return R(0);
    },
    census: () => ({ liveBeams: 2, liveVertices: 96 }),
  });
  return { log, measure };
};

describe("GH#768 AC#1 —— `measure()` 的**行為**（⭐ 可注入，⛔ 不再只是掃字串）", () => {
  it("餵一個會 reject 的自證 ⇒ 呼叫端**一個數字都拿不到**", async () => {
    const { log, measure } = spyMeasure(() => Promise.reject(new Error("這台量尺的一切結論作廢")));
    await expect(measure()).rejects.toThrow(/作廢/);
    expect(log, "自證失敗了還是去讀了那一幀 ⇒ 那個 0 會被當成證據寫進報告").toEqual(["certify"]);
  });

  it("⭐ 預設就自證，⭐ 而且**自證在前**、讀數在後 ⊕ 坑⑥的分母一起回", async () => {
    const { log, measure } = spyMeasure(async () => 1);
    await expect(measure()).resolves.toMatchObject({ lit: 0, liveBeams: 2, liveVertices: 96 });
    expect(log[0], "先量了再說 ⇒ 那個數字在發現尺瞎掉之前就已經被寫進報告了").toBe("certify");
  });

  it("⚠️ **接縫**（結構，⛔ 不是行為）：台子的 `measure` 真的是那支 factory 的產物", () => {
    // ⭐ 上面兩條驗 factory 自己；各驗一半而沒人驗接縫 ＝ 綠燈假來源⑪（組合是空的）。
    const src = read("./beamAudition.ts");
    const m = src.indexOf("const measure = makeCertifiedMeasure({");
    expect(m, "台子沒走 makeCertifiedMeasure ⇒ 上面兩條守的是一支沒有人用的函式").toBeGreaterThan(0);
    expect(src.slice(m, m + 200), "measure 的自證沒有接到 calibrate()").toContain("certify: () => calibrate()");
    const p = src.indexOf("const probeDocs = async");
    expect(src.slice(p, p + 600), "probeDocs 沒在拍對照幀之前自證 ⇒ 每份都會被讀成「空的」").toContain(
      "await calibrate()",
    );
  });
});

describe("GH#768 AC#2 —— 一張**滿版黃光**的幀，數出來 ⛔ 不是 0", () => {
  /** 8×8 的滿版單色 RGBA 幀。 */
  const frame = (r: number, g: number, b: number): Uint8Array =>
    Uint8Array.from({ length: 8 * 8 * 4 }, (_, i) => [r, g, b, 255][i % 4]!);

  it("滿版黃 ⇒ 64 格全算亮；全黑 ⇒ 0（⭐ 兩個方向，⛔ 單邊不算自證過）", () => {
    // ⚠️ 界線：AC② 的另一半（GPU 讀回空緩衝）要真 GPU。這裡驗**數的那一半** —— 黃的
    //    max 255（bright）而平均只有 170 ⇒「max 改成平均」會讓 bright 掉一半而沒東西紅。
    expect(countBright(frame(255, 255, 0))).toEqual({ bright: 64, lit: 64 });
    expect(countBright(frame(0, 0, 0))).toEqual({ bright: 0, lit: 0 });
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

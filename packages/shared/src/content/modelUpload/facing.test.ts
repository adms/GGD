import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { modelUploadFixture } from "./fixtures";
import { encodeUploadGlb, type GlbDocument, type GlbNode } from "./glb";
import { normalizeUploadedModel } from "./normalize";
import { FACING_CALIBRATION, facingIntake, looksLeftBoneName, measureFacing } from "./facing";

/**
 * 面向量測的承重不變量（GH#1272 / GH#1266）。
 *
 * ⚠️ 三條都是真的發生過的缺陷，⛔ 不是假想：
 *  ① 3ds Max Biped 的「`Bip001 L Thigh`」沒有一條正則認得 ⇒ 整族骨架**一對都湊不到**
 *     ⇒ 歸成「沒有骨架」而**安靜退出檢查** ⇒ 118 份模型出貨 0° 而幾何要 90°（18 位英雄側著走）
 *  ② 匯入的當下**沒有任何東西量面向** ⇒ 轉向是人手填的、多數填 0 ⇒ owner：「螃蟹走路」
 *  ③ 量不出來的那一批**必須不擋入庫**（owner 要的是 HITL 漏斗，⛔ 不是柵欄）
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.resolve(HERE, "../../../../..", "content");

/** 一副**只用名字**表達左右的骨架；`rightAt` 是「右」那一側所在的軸。 */
function rig(names: [left: string, right: string][], rightAt: "+z" | "-x"): Pick<GlbDocument, "nodes"> {
  const nodes: GlbNode[] = [{ name: "Root", children: names.flatMap((_, i) => [1 + i * 2, 2 + i * 2]) }];
  for (const [left, right] of names) {
    const [lx, lz] = rightAt === "+z" ? [0, -1] : [1, 0];
    nodes.push({ name: left, translation: [lx, 1, lz] }, { name: right, translation: [-lx, 1, -lz] });
  }
  return { nodes };
}

const BIPED: [string, string][] = [["Bip001 L Thigh", "Bip001 R Thigh"], ["Bip001 L Hand", "Bip001 R Hand"], ["Bip001 L Foot", "Bip001 R Foot"]];

describe("模型面向量測", () => {
  it("① 認得 3ds Max Biped 的「Bip001 L／R」命名 —— ⛔ 認不得就整族安靜退出檢查", () => {
    // ⭐ 這是 #1266 的根：不是「角度算錯」，是**量尺對這一族是瞎的**，
    //    而瞎掉的症狀是 `no-skeleton`（＝「結構性量不出來」）—— ⛔ 一個看起來很正當的綠燈。
    expect(looksLeftBoneName("Bip001 L Thigh")).toBe(true);
    expect(looksLeftBoneName("Bip001 R Thigh")).toBe(false);
    const measured = measureFacing(rig(BIPED, "+z"));
    expect(measured.kind).toBe("measured");
    expect(measured.kind === "measured" && measured.requiredYawOffsetDeg).toBe(90);
    expect(measured.kind === "measured" && measured.chirality.n).toBe(3);

    // ⭐ 反方向：⛔ 不可以把其他四條命名規則「簡化」掉，換成只剩 Biped 那一條。
    expect(measureFacing(rig([["Bone_Hip_L", "Bone_Hip_R"], ["Bone_Hand_L", "Bone_Hand_R"], ["LeftFoot", "RightFoot"]], "-x")).kind).toBe("measured");
  });

  it("② 匯入當下量面向：手填 0° 而幾何要 90° ⇒ 改成 90° 並留下手填值", () => {
    // ⭐ 兩個方向一起驗（CLAUDE.md：「一把只驗過單邊的尺，不算自證過」）——
    //    ⛔ 只驗「填錯會被改」證明不了「填對不會被亂動」。
    const wrong = facingIntake(rig(BIPED, "+z"), 0);
    expect(wrong.mismatch).toBe(true);
    expect(wrong.appliedYawOffsetDeg).toBe(90);
    expect(wrong.declaredYawOffsetDeg).toBe(0);      // ⭐ 手填值留著 ⇒ 審查頁可一鍵退回
    expect(wrong.needsManualReview).toBe(false);

    const right = facingIntake(rig(BIPED, "+z"), 90);
    expect(right.mismatch).toBe(false);
    expect(right.appliedYawOffsetDeg).toBe(90);

    // ⛔ 自動寫入關掉時只警告、⛔ 不動角度（這一格只有作者／CI 會轉 ⇒ 旗標／環境變數）。
    const off = facingIntake(rig(BIPED, "+z"), 0, { autoApply: false });
    expect(off.mismatch).toBe(true);
    expect(off.appliedYawOffsetDeg).toBe(0);
  });

  it("③ 量不出來 ⇒ 標「待人工確認」，⛔ 不擋入庫", () => {
    const none = facingIntake({ nodes: [{ name: "Root" }, { name: "Body" }] }, 0);
    expect(none.verdict.kind).toBe("no-skeleton");
    expect(none.needsManualReview).toBe(true);
    expect(none.mismatch).toBe(false);
    expect(none.appliedYawOffsetDeg).toBe(0);        // 沿用手填值，⛔ 不猜
    // 1–2 對：樣本太少，方向可能是巧合 ⇒ 也是人工，⛔ 不是「量到了」。
    expect(facingIntake(rig([BIPED[0]!], "+z"), 0).verdict.kind).toBe("few-pairs");
  });

  it("③-b 「沒有宣告角度」⛔ 不等於「填 0」—— 混起來整個 imported 家族會一直喊", () => {
    // ⭐ 後台 `ModelVersions.prepare()` 走的正是「沒有宣告」那條（它只做正規化，
    //    轉向留給模型文件）。⛔ 把它當成 0，`imported.*`（走家族預設 90°，含刻意不覆寫的
    //    `imported.heropika`）就**每一次**都被報成不一致 —— ⭐ 而一條一直喊的警報沒有人讀。
    const undeclared = facingIntake(rig(BIPED, "+z"), null);
    expect(undeclared.mismatch).toBe(false);          // ⛔ 不宣稱不一致
    expect(undeclared.measuredYawOffsetDeg).toBe(90); // ⭐ 但量到的還是要回報
    expect(undeclared.declaredYawOffsetDeg).toBe(null);
    // 對照組：同一副骨架，明確填 0 ⇒ 這才是真的不一致。
    expect(facingIntake(rig(BIPED, "+z"), 0).mismatch).toBe(true);
  });

  it("④ 兩條匯入路徑自動帶它 —— `normalizeUploadedModel` 的報告一定有面向那一格", async () => {
    // ⭐ 後台 `ModelVersions.prepare()` 與編輯器 `prepareUploadedHeroModel()` 都走這一支
    //    ⇒ 接在這裡，兩邊就都量得到（owner 2026-09-10：「後台設定跟編輯器都要自動帶入」）。
    const src = modelUploadFixture();
    src.json.nodes = rig(BIPED, "+z").nodes;
    const { report } = await normalizeUploadedModel(encodeUploadGlb(src.json, src.bin), { yawOffsetDeg: 0 });
    expect(report.facing.measuredYawOffsetDeg).toBe(90);
    expect(report.facing.appliedYawOffsetDeg).toBe(90);
    expect(report.facing.note).toContain("90");
  });

  it("⑤ 校準：對真的出貨 GLB 重算，答案要與出貨普查釘死的一致", () => {
    // ⭐⭐ 這一條是**兩個住處的接縫**：量測邏輯今天還有第二份在
    //    `apps/client/src/render/views/modelFacing.test.ts`（在本 lane 的柵欄外，改不得）。
    //    ⇒ 拿那支自己釘死的三具答案，在這裡用**真的位元組**重算一次 ——
    //    ⛔ 沒有這條線，「兩份量尺」就是一句沒人驗的散文，而它們會各自漂。
    //    ⚠️ 三具刻意各驗一個方向：heroryuk／linkstik 驗「量得到翻轉」，
    //    heropika 驗「⛔ 不會把對的改壞」（骨架 L/R 顛倒，掌性說 270 而尾巴說 +X ⇒ 90）。
    const docs = fs.readdirSync(path.join(CONTENT, "models"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(CONTENT, "models", f), "utf8")) as { id?: string; glbPath?: string });
    for (const [id, { requiredYawOffsetDeg, why }] of Object.entries(FACING_CALIBRATION)) {
      const doc = docs.find((d) => d.id === id);
      // ⛔ 找不到就紅：⚠️ 「校準的模型不見了」與「校準通過」長得一樣，⭐ 而那把尺就不再自證。
      expect(doc?.glbPath, `校準模型 ${id} 不在出貨內容裡（${why}）`).toBeTruthy();
      const buf = fs.readFileSync(path.join(CONTENT, doc!.glbPath!));
      const len = buf.readUInt32LE(12);
      const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len))) as Pick<GlbDocument, "nodes">;
      const verdict = measureFacing(json);
      expect(verdict.kind, `${id}：${why}`).toBe("measured");
      expect(verdict.kind === "measured" && verdict.requiredYawOffsetDeg, `${id}：${why}`).toBe(requiredYawOffsetDeg);
    }
  });
});

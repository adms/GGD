/**
 * ⭐ GH#691（#688 Phase 6-1）—— 蝗蟲群視覺第一批：`MonsoonBoltTarget.mdl`。
 *
 * census 排序表把「打雷」那一族排在視覺第一順位：**一次轉換**（stock MPQ → glb）
 * 讓 5 具同模型 dummy（`o00E`/`o00G`/`o02M`/`n00N`/`h00Q`）與 17 個 JASS 生成點
 * 一起有畫面。這一支是那批**綁定的對帳閘**。
 *
 * ⭐ 期望集合是**推導**的，⛔ 不是手寫名單（第〇·四守則：手寫的名單會過期而且
 * 不會有東西紅）。兩份證據都在 repo 裡，這裡把它們求聯集再與出貨技能取交集：
 *   ① `tools/w3x-import/join/out/JOIN_DERIVED.json` —— JASS 生成點 → 技能 rawcode
 *   ② `content/assets/vfx/w3x-ability-provenance.json` —— rawcode ↔ 技能 id、
 *      以及 `realArt[].stem` 直接點名這個模型的那幾支
 * ⇒ 之後 join 表補一列（今天 5 列 unresolved）或有人退休一支技能，這條閘自己跟著動。
 *
 * ⚠️ 它驗的是**機制到不到得了畫面**，⛔ 不是任何一個調校數字（第二守則：守衛驗
 * 機制不驗數字）—— scale/lifeSec 是 `content/` 的可調格，這裡一個都不釘。
 * 唯一被釘住的數值是 `tint`，而那不是調校：它必須**引用得到** `UNIT_TINTS.json`
 * 的一列（與 `model@1.fxTint` 那條「tint 有來源」同一條規矩）。
 *
 * 突變（承重線）：把任何一支的 `spawnModelFx` 節點從出貨 JSON 拿掉 → 這裡紅並指名
 * 那一支；champion 鏡射漏掉一邊也紅（鏡射漂掉時 PreviewController 渲染的是內嵌那份）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDoc } from "./loader";

const ROOT = join(__dirname, "../../../..");
const MODEL_KEY = "w3x.stock.monsoonbolttarget";
const STEM = "monsoonbolttarget";
const readJson = (p: string): any => JSON.parse(readFileSync(join(ROOT, p), "utf-8"));

const prov = readJson("content/assets/vfx/w3x-ability-provenance.json").abilities as Record<
  string,
  { rawcodes?: string[]; realArt?: { stem?: string }[] }
>;
const tints = readJson("tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json").units as Record<
  string,
  { model?: string; tint: number[] }
>;

/** rawcode → 技能 id（provenance 是唯一把 w3a rawcode 接回 GGD id 的表）。 */
const byRawcode = new Map<string, string[]>();
for (const [aid, v] of Object.entries(prov))
  for (const rc of v.rawcodes ?? []) byRawcode.set(rc, [...(byRawcode.get(rc) ?? []), aid]);

/** ⭐ 期望集合 = （JASS join ∪ provenance realArt）∩ 出貨技能。 */
function expectedAbilities(): string[] {
  const out = new Set<string>();
  for (const row of readJson("tools/w3x-import/join/out/JOIN_DERIVED.json").rows as any[]) {
    if (row.model_stem !== STEM || !row.join?.rawcode) continue;
    for (const aid of byRawcode.get(row.join.rawcode) ?? []) out.add(aid);
  }
  for (const [aid, v] of Object.entries(prov))
    if ((v.realArt ?? []).some((a) => a.stem === STEM)) out.add(aid);
  return [...out].filter((aid) => existsSync(join(ROOT, `content/abilities/${aid}.json`))).sort();
}

/** 那具 dummy 的頂點色 —— 出貨節點的 tint 只能是這幾個之一。 */
const monsoonTints = new Set(
  Object.values(tints)
    .filter((u) => (u.model ?? "").includes("MonsoonBoltTarget"))
    .map((u) => JSON.stringify(u.tint)),
);

describe("蝗蟲群視覺第一批 · MonsoonBoltTarget (GH#691)", () => {
  it("模型文件與 .glb 都在（缺一個就是「引用了一份客戶端拿不到的模型」）", () => {
    const doc = readJson(`content/models/${MODEL_KEY}.json`);
    expect(doc.schema).toBe("model@1");
    expect(doc.id, "檔名必須等於 doc id，否則進不了 _index.json").toBe(MODEL_KEY);
    expect(existsSync(join(ROOT, "content", doc.glbPath)), `${doc.glbPath} 不存在`).toBe(true);
  });

  it("每一支證據點名的出貨技能都真的擺得出那具模型（standalone + champion 鏡射）", () => {
    const expected = expectedAbilities();
    expect(expected.length, "推導出來的名單是空的 —— 兩份證據檔漂掉了").toBeGreaterThan(0);

    const missing: string[] = [];
    const badTint: string[] = [];
    const rejected: string[] = [];
    for (const aid of expected) {
      const [cid] = [aid.slice(0, aid.lastIndexOf("."))];
      const standalone = readJson(`content/abilities/${aid}.json`);
      // ⭐ 過**出貨那一支**驗證器（content:build 用的同一支）—— lane 期間 build 上鎖，
      //    這裡是 `spawnModelFx` 的 refine（static 必填 lifeSec / 禁 speed…）唯一會當場響的地方。
      const v = validateDoc("abilities", standalone);
      if (!v.ok) rejected.push(`${aid}: ${JSON.stringify(v.issues)}`);
      const champPath = `content/champions/${cid}.json`;
      const embedded: any[] = [];
      if (existsSync(join(ROOT, champPath))) {
        const ch = readJson(champPath);
        for (const slotted of Object.values<any>(ch.abilities ?? {}))
          if (slotted?.id === aid) embedded.push(slotted);
        for (const blk of [ch.exAbility, ch.passiveAbility])
          if (blk && typeof blk === "object")
            for (const v of Object.values<any>(blk)) if (v?.id === aid) embedded.push(v);
      }
      for (const [where, doc] of [
        ["standalone", standalone] as const,
        ...embedded.map((d, i) => [`champion 鏡射#${i}`, d] as const),
      ]) {
        const nodes = (doc.effects ?? []).filter(
          (e: any) => e?.kind === "spawnModelFx" && e.modelKey === MODEL_KEY,
        );
        if (nodes.length === 0) missing.push(`${aid} (${where})`);
        for (const n of nodes)
          if (n.tint && !monsoonTints.has(JSON.stringify(n.tint))) badTint.push(`${aid} ${n.tint}`);
      }
    }
    expect(missing, "這幾支的原作證據點名了 MonsoonBoltTarget，而出貨文件擺不出那具模型").toEqual(
      [],
    );
    expect(badTint, "節點 tint 引用不到 UNIT_TINTS.json 的任何一列 —— ⛔ 顏色不可以自己挑").toEqual(
      [],
    );
  });
});

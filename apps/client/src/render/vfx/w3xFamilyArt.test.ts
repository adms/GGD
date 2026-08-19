/**
 * THE ANTI-FABRICATION GUARD for the 258 family-art rows.
 *
 * 258 rows is far too many to eyeball, and the project's single most expensive
 * recurring defect is a table that LOOKS derived and is not (「註解會說謊」;
 * `mobTint.test.ts` that never existed; the phoenix-egg duration that four
 * layers agreed on and all four were wrong). So this file does not spot-check
 * the rows — it RE-DERIVES the whole thing from the two generated inputs and
 * diffs. A row typed in by hand, a family swapped because it "looked right", a
 * scale copied from the wrong reference: all of them come out as a diff line.
 *
 * ⭐ **GH#384 只換了比對的對象，⛔ 沒有放寬這條守衛。** 資料從
 * `w3xFamilyArt.ts` 的常數表搬進 `content/config/vfx-ability-art.json`，
 * 推導本身抽成 `deriveW3xFamilyArt.ts` —— **一份程式，兩個呼叫端**：
 * `generateAbilityArtContent.ts` 用它寫，這裡用它比對。
 * ⛔ 這裡不再自己抄一份推導（那會是第二個住處，而它一定會漂開）。
 *
 * 推導的規格寫在 `deriveW3xFamilyArt.ts` 的檔頭（五條，逐條保留）。
 *
 * `existsSync` gating matches `w3xAbilityArt.test.ts`: the generated inputs are
 * build products of `tools/w3x-import`, and a machine without them still runs
 * the rest of the suite. The structural checks below do NOT need them.
 */
import { describe, it, expect } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { w3xFamilyArtRows, familyArtFor, familyArtCounts } from "./w3xFamilyArt";
import { W3X_ART_FAMILIES, isW3xArtFamily } from "./w3xArtFamilies";
import {
  deriveW3xFamilyArt,
  type DerivedFamilyArt,
  type W3xModelUsage,
  type W3xVfxBindings,
} from "./deriveW3xFamilyArt";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const USAGE = root("tools/w3x-import/out/vfx-census/MODEL_USAGE.json");
const BINDINGS = root("tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json");

function derive(): Record<string, DerivedFamilyArt> {
  return deriveW3xFamilyArt(
    JSON.parse(readFileSync(USAGE, "utf8")) as W3xModelUsage,
    JSON.parse(readFileSync(BINDINGS, "utf8")) as W3xVfxBindings,
  );
}

const haveInputs = existsSync(USAGE) && existsSync(BINDINGS);

describe("w3x family art — structure", () => {
  it("binds a non-empty set, every family is real, every row is complete", () => {
    const rows = Object.entries(w3xFamilyArtRows());
    expect(rows.length).toBeGreaterThan(0);
    for (const [abilityId, row] of rows) {
      expect(isW3xArtFamily(row.family), `${abilityId} -> unknown family ${row.family}`).toBe(true);
      expect(W3X_ART_FAMILIES[row.family].models, `${abilityId} model off-family`).toContain(row.model);
      expect(row.w3aId, `${abilityId} has no rawcode`).toMatch(/^[A-Za-z0-9]{4}$/);
      expect(row.via.length).toBeGreaterThan(0);
    }
  });

  it("綁定表上的每一筆，都指得到一份真的技能文件（出貨的或已退場的）", () => {
    // ⚠️ 2026-08-13 有 235 支技能搬進 `content/_legacy/`，於是這一條一次紅了 74 筆。
    // ⛔ 那 74 筆**不是壞掉的綁定** —— 表記的是「這支技能該用哪個原作特效」，
    //    技能退場不會讓那個對應變錯，哪天復活就直接用得上。
    // ⭐ 真正該擋的是**打錯字／指到根本不存在的 id**，所以判準是「兩個目錄都找不到」。
    const ids = Object.keys(w3xFamilyArtRows());
    const ghost = ids.filter(
      (id) =>
        !existsSync(root(`content/abilities/${id}.json`)) &&
        !existsSync(root(`content/_legacy/abilities/${id}.json`)),
    );
    expect(ghost, `${ghost.length} 筆綁定指到一份根本不存在的技能（打錯 id？）`).toEqual([]);
    const retired = ids.filter((id) => !existsSync(root(`content/abilities/${id}.json`)));
    // 帳單，不是紅燈：退場的綁定留著是刻意的，數量爆炸才值得回頭看。
    expect(retired.length).toBeLessThan(ids.length);
  });

  it("a stated number is never a defaulted one — paramSource is set iff a number is present", () => {
    for (const [abilityId, row] of Object.entries(w3xFamilyArtRows())) {
      const hasNumber = row.scale !== undefined || row.tint !== undefined || row.flyHeight !== undefined;
      expect(!!row.paramSource, `${abilityId}: paramSource/number disagree`).toBe(hasNumber);
    }
  });

  it("no row carries a WHITE tint — white means the map stated nothing, so the key must be absent", () => {
    const white = Object.entries(w3xFamilyArtRows()).filter(
      ([, r]) => r.tint && r.tint[0] === 255 && r.tint[1] === 255 && r.tint[2] === 255,
    );
    expect(white.map(([id]) => id)).toEqual([]);
  });

  it("familyArtFor / familyArtCounts agree with the rows", () => {
    const rows = w3xFamilyArtRows();
    const first = Object.keys(rows)[0]!;
    expect(familyArtFor(first)).toBe(rows[first]);
    expect(familyArtFor(undefined)).toBeUndefined();
    expect(familyArtFor("no-such-ability")).toBeUndefined();
    const counts = familyArtCounts();
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(Object.keys(rows).length);
  });
});

describe.skipIf(!haveInputs)("w3x family art — re-derived from the import", () => {
  it("出貨的 content 綁定 IS the derivation of MODEL_USAGE + VFX_BINDINGS (every field)", () => {
    const derived = derive();
    const diffs: string[] = [];
    for (const [id, row] of Object.entries(w3xFamilyArtRows())) {
      const d = derived[id];
      if (!d) {
        diffs.push(`${id}: in content but NOT derivable from the import`);
        continue;
      }
      const a = JSON.stringify(row);
      const b = JSON.stringify({
        family: d.family,
        model: d.model,
        w3aId: d.w3aId,
        provenance: d.provenance,
        via: d.via,
        ...(d.anchor ? { anchor: d.anchor } : {}),
        ...(d.scale !== undefined ? { scale: d.scale } : {}),
        ...(d.tint ? { tint: d.tint } : {}),
        ...(d.flyHeight !== undefined ? { flyHeight: d.flyHeight } : {}),
        ...(d.paramSource ? { paramSource: d.paramSource } : {}),
      });
      if (a !== b) diffs.push(`${id}:\n  content ${a}\n  derived ${b}`);
    }
    expect(
      diffs,
      `${diffs.length} row(s) drifted from the import — 跑 ` +
        "`pnpm exec tsx apps/client/src/render/vfx/generateAbilityArtContent.ts`，⛔ 不要手改 JSON。",
    ).toEqual([]);
  });

  it("the set is COMPLETE — no derivable ability was silently left out", () => {
    const derived = derive();
    const rows = w3xFamilyArtRows();
    const abilityDocs = new Set(
      Object.keys(derived).filter((id) => existsSync(root(`content/abilities/${id}.json`))),
    );
    const missing = [...abilityDocs].filter((id) => !rows[id]).sort();
    expect(missing, `${missing.length} derivable ability(ies) missing from content`).toEqual([]);
  });

  it("the derivation is DETERMINISTIC (two runs, identical output)", () => {
    expect(JSON.stringify(derive())).toBe(JSON.stringify(derive()));
  });
});

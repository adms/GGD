/**
 * 【晉升列不可以把空間三格短路掉】（GH#818）
 *
 * `w3xArtFor` 是 `w3xAbilityArtRows()[id] ?? familyRow(id)` —— ⭐ 晉升列**取代**
 * 家族列。而晉升那一格（`zVfxPromotedBinding`）只回答「播哪一組 emitter」，
 * ⛔ 從不回答「播在哪裡」⇒ 高度 / 掛點 / 地面痕跡在那一行**蒸發**（失敗形態②，
 * 本 repo 的第 5 次）。
 *
 * 量到的（2026-08-29，出貨內容）：25 列 `promoted` 裡 15 列同一列上就有 `family`
 * 證據，10 支的掛點（`chest` / `hand,left`）是**後台真的存過的值** ——
 * 存得起來、驗得過、下游沒有人讀（第一·五守則「說了但不會發生」）。
 *
 * ⭐ 兩個方向都走（元規則⑫）：有家族的必須拿到，⛔ 真的沒有家族的必須仍然
 * absent —— 否則這條測試只是在證明「每一支都有一個數字」。
 *
 * 突變紀錄（承重那一條，一批一條）：
 *   · `w3xAbilityArtRows()` 拿掉 `...promotedSpatialFields(abilityId)`
 *     → 「晉升列沒有把家族層的高度／掛點／地面痕跡短路掉」紅，逐支指名。
 */
import { describe, it, expect } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空表。
import "./shippedAbilityArt.testkit";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zConfigVfxFamiliesDoc } from "@ggd/shared/content/schema/vfx";
import { abilityArtRows } from "./abilityArtContent";
import { setFamilyTuning, w3xArtFor } from "./w3xAbilityArt";

const REPO = resolve(__dirname, "../../../../..");
const SHIPPED = zConfigVfxFamiliesDoc.parse(
  JSON.parse(readFileSync(join(REPO, "content/config/vfx-families.json"), "utf8")),
);

/** ⛔ 不寫死 id（內容會變）—— 從出貨的那份 JSON 撈。 */
const promoted = () => Object.entries(abilityArtRows()).filter(([, r]) => r.promoted);

/** 契約說的掛點：後台覆寫 > owner 設計 > 原作證據（`resolveFamilyArt` 的順序）。 */
const wantAnchor = (id: string): string | undefined => {
  const r = abilityArtRows()[id]!;
  return SHIPPED.abilities?.[id]?.anchor ?? r.owner?.anchor ?? r.family?.anchor;
};

describe("晉升列的空間三格（GH#818）", () => {
  it("晉升列沒有把家族層的高度／掛點／地面痕跡短路掉", () => {
    setFamilyTuning(SHIPPED);
    const withFamily = promoted()
      .filter(([id, r]) => r.family ?? SHIPPED.abilities?.[id]?.family)
      .map(([id]) => id);
    expect(withFamily.length, "沒有任何一支同時有 promoted 與家族 —— 這條沒有被測對象").toBeGreaterThan(0);

    const noHeight = withFamily.filter((id) => w3xArtFor(id)?.heightY === undefined);
    expect(noHeight, `這些晉升技能的施法高度蒸發了：${noHeight.slice(0, 5).join(" / ")}`).toEqual([]);

    const anchored = withFamily.filter((id) => wantAnchor(id));
    expect(anchored.length, "出貨內容一個掛點都沒寫 —— 下面那圈會恆真").toBeGreaterThan(0);
    const lost = anchored.filter((id) => w3xArtFor(id)?.anchor !== wantAnchor(id));
    expect(lost, `這些晉升技能的掛點沒有離開 JSON：${lost.slice(0, 5).join(" / ")}`).toEqual([]);

    const decalled = withFamily.filter(
      (id) =>
        SHIPPED.families?.[(SHIPPED.abilities?.[id]?.family ?? abilityArtRows()[id]!.family!.family)!]
          ?.groundDecal !== undefined,
    );
    expect(decalled.length, "出貨內容沒有任何一族設過地面痕跡 —— 下面那圈會恆真").toBeGreaterThan(0);
    for (const id of decalled) {
      expect(w3xArtFor(id)?.groundDecal, `${id} 的地面痕跡蒸發了`).toBeDefined();
    }
  });

  it("⛔ 反方向：真的沒有家族的晉升仍然 absent（⛔ 不是被灌一個編出來的預設）", () => {
    setFamilyTuning(SHIPPED);
    const bare = promoted()
      .filter(([id, r]) => !r.family && !r.owner && !SHIPPED.abilities?.[id]?.family)
      .map(([id]) => id);
    expect(bare.length, "每一列晉升都帶家族 —— 這條反方向沒有被測對象").toBeGreaterThan(0);
    for (const id of bare) {
      const art = w3xArtFor(id);
      expect(art, `${id} 的晉升列不見了`).toBeTruthy();
      expect(art?.heightY, `${id} 沒有家族原型卻拿到高度 —— 那是一個編出來的值`).toBeUndefined();
      expect(art?.anchor, `${id} 沒有家族原型卻拿到掛點`).toBeUndefined();
    }
  });
});

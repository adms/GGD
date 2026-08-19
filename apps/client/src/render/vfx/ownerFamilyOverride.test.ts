/**
 * ⭐【owner 的設計覆寫真的贏過原作證據，而且它住在 content/】（GH#431）
 *
 * 這一條守的是**機制**，⛔ 不是天譴那一支：覆寫來自 `content/`、蓋在證據上、
 * 被後台蓋、而且**沒有動到證據**。少了任何一半，畫面上都跟「特效還沒調」
 * 長得一模一樣（第二守則失敗形態②）。
 *
 * 突變紀錄（2026-08-20，一批一條，挑最承重的那條線）：
 *   `familyTuning.resolveFamilyArt` 的 `design?.family ??` 拿掉 →
 *   第 1 與第 3 條紅（覆寫整層消失）✅ 用 `Edit` 還原，⛔ 沒有 checkout。
 */
import { describe, it, expect, afterEach } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import type { ConfigVfxAbilityArtDoc, VfxAbilityArtRow } from "@ggd/shared/content";
import { setAbilityArtBindings } from "./abilityArtContent";
import { loadAbilityArtFromDisk } from "./loadAbilityArtFromDisk";
import { w3xFamilyArtRows } from "./w3xFamilyArt";
import { ownerFamilyArtFor } from "./ownerFamilyArt";
import { resolveFamilyArt, resolveAllFamilyArt, requiredFamilyDocs } from "./familyTuning";

const ID = "godie-zzzz.r";
const EVIDENCE: VfxAbilityArtRow["family"] = {
  family: "shockwaveRing",
  model: "warstompcaster",
  w3aId: "A000",
  provenance: "w3a-override",
  via: "ability.casterArt",
};
const OWNER: VfxAbilityArtRow["owner"] = { family: "lightColumn", why: "測試用的設計裁決" };

function load(row: VfxAbilityArtRow): void {
  setAbilityArtBindings({
    id: "vfx-ability-art",
    schema: "config.vfx-ability-art@1",
    bindings: { [ID]: row },
  } as ConfigVfxAbilityArtDoc);
}

afterEach(() => {
  loadAbilityArtFromDisk();
});

describe("owner 設計覆寫（GH#431）", () => {
  it("⭐ 覆寫來自 content 且真的改變解析結果；⛔ 而證據那一格逐位不動", () => {
    load({ family: EVIDENCE });
    expect(resolveFamilyArt(ID, null)!.family, "沒有覆寫時就是原作證據").toBe("shockwaveRing");

    load({ family: EVIDENCE, owner: OWNER });
    const r = resolveFamilyArt(ID, null)!;
    expect(r.family, "owner 的設計沒有贏過 w3a —— 第〇·六守則第 1 層對第 5 層").toBe("lightColumn");
    // 知識不可以無聲消失：被推翻的原作值還在，而且是**同一次解析**看得到的。
    expect(r.evidence!.family).toBe("shockwaveRing");
    expect(w3xFamilyArtRows()[ID]!.family, "⛔ 覆寫改寫了證據表 → 反捏造守衛會開始說謊").toBe(
      "shockwaveRing",
    );
    expect(r.design!.why).toBe(OWNER!.why);
    expect(ownerFamilyArtFor("no-such-ability")).toBeUndefined();
  });

  it("後台的 live 覆寫仍然贏過設計層（設計層是**出貨預設**，不是天花板）", () => {
    load({ family: EVIDENCE, owner: OWNER });
    const console = {
      id: "vfx-families",
      schema: "config.vfx-families@1",
      enabled: true,
      scaleGain: 1,
      scaleMin: 0.5,
      scaleMax: 2,
      abilities: { [ID]: { family: "tornado" } },
    } as unknown as Parameters<typeof resolveFamilyArt>[1];
    expect(resolveFamilyArt(ID, console)!.family).toBe("tornado");
  });

  it("⛔ 原作證明不了任何東西的技能，owner 也綁得上 —— 而且那份 fx.fam 會被要求存在", () => {
    load({ owner: OWNER });
    expect(resolveFamilyArt(ID, null)!.family).toBe("lightColumn");
    const row = resolveAllFamilyArt(null).find((x) => x.abilityId === ID);
    expect(row, "⛔ 沒進 resolveAll ⇒ 產生器不會烘它，遊戲裡靜靜掉回替身").toBeDefined();
    expect(requiredFamilyDocs(null).has(row!.vfxKey)).toBe(true);
  });

  it("⭐ 出貨的天譴（65-04 `godie-udea.r`）真的是光柱，⛔ 不是貼地衝擊環", () => {
    loadAbilityArtFromDisk(); // 出貨那一份，⛔ 不是夾具
    const r = resolveFamilyArt("godie-udea.r", null)!;
    expect(r.family).toBe("lightColumn");
    expect(r.vfxKey).toContain("light-column");
    expect(r.evidence!.family, "原作值另存在隔壁那一格").toBe("shockwaveRing");
    expect(r.design!.why).toContain("光柱");
  });
});

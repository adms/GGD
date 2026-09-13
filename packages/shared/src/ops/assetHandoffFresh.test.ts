/**
 * 🧾 **素材缺口交接單不可以過期** —— `docs/素材缺口交接單.md`。
 *
 * owner 2026-09-12（逐字）：
 * > 「你應該要 commit 加上日期 讓別的工作流可以讀到 **但又不會讓日後的工作流誤會**」
 *
 * ## ⛔ 為什麼「加一個日期」不夠
 *
 * 一個日期是**散文** —— 它在過期之後長得跟沒過期**一模一樣**，
 * 而這個 repo 已經記錄過五次「一句活過保存期限的散文，而沒有任何東西變紅」。
 * ⇒ ⭐ 交接單的頭上記著一枚**資料指紋**（哪些英雄缺哪一軸），這條閘逐次重算並比對它。
 *
 * ⚠️ 指紋**刻意不含日期與 commit** —— 隨時鐘變動的欄位會讓比對永遠不相等，
 * 於是 `--check` 只能被放寬成模糊比對，⭐ 而一條被放寬的閘等於沒有閘
 * （同 `skillSpecFresh` / `caps:export` 刻意不放產生日期的理由）。
 *
 * 它紅了**不要改這條測試**，重產一份：
 *   `python3 tools/hero-intake/make-asset-handoff.py --out docs/素材缺口交接單.md`
 *
 * ── 突變紀錄 ───────────────────────────────────────────────────────
 *  · 在 MANIFEST 裡假裝 `godie-e00s` 有了語音包 → 指紋 4145e5ec… → 39068b51…，
 *    `--check` exit 2 並指名兩個指紋；還原後回綠。實測過。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "../../../..");

describe("素材缺口交接單 (docs/素材缺口交接單.md)", () => {
  it("⭐ 文件裡的缺口清單與**今天的 repo** 一致", () => {
    const r = spawnSync("python3", ["tools/hero-intake/make-asset-handoff.py", "--check"], {
      cwd: REPO, encoding: "utf8", timeout: 180_000,
    });
    expect(
      r.status,
      `${r.stdout}${r.stderr}\n` +
        "⇒ 交接單描述的缺口已經不是現況了。⛔ 不要改這條測試，重產一份：\n" +
        "   python3 tools/hero-intake/make-asset-handoff.py --out docs/素材缺口交接單.md",
    ).toBe(0);
  });

  it("ship34 的 8 組模型元件以精確 identityId 接入，Ryu 程序化候選已登記且其餘仍待動作", () => {
    const doc = JSON.parse(readFileSync(join(REPO, "docs/_review/material/hero-intake/ship34.json"), "utf8"));
    const byId = new Map(doc.heroes.map((hero: any) => [hero.id, hero]));
    const expected: Record<string, string[]> = {
      "acquired-zero": ["ssbu-zero-c00-static-skinned-v1"],
      "acquired-ram": ["rezero-ram-thunderstore-0.1.1-static-skinned-v1"],
      "acquired-beatrice": ["rezero-beatrice-thunderstore-0.1.1-static-skinned-v1"],
      "acquired-mario": ["ssbu-mario-c00-static-skinned-v1", "ssbu-mario-c00-static-skinned-v2", "ssbu-mario-c00-ultimate14-motion-v1"],
      "acquired-mewtwo": ["ssbu-mewtwo-c00-static-skinned-v1"],
      "acquired-pokemon-trainer": ["ssbu-ptrainer-female-c01-static-skinned-v1", "ssbu-ptrainer-male-c00-static-skinned-v1"],
      "acquired-ryu": ["ssbu-ryu-c00-procedural-six-state-v1", "ssbu-ryu-c00-static-skinned-v1"],
      "acquired-minecraft": ["ssbu-pickel-alex-c01-static-skinned-v1", "ssbu-pickel-steve-c00-static-skinned-v1"],
    };

    for (const [heroId, componentIds] of Object.entries(expected)) {
      const hero: any = byId.get(heroId);
      expect(hero?.model.componentStatus, heroId).toBe("accepted-independent-components-pending-hero-integration");
      if (heroId === "acquired-ryu") {
        expect(hero?.model.modelKey).toBe("community.body.6329b227d1e34b92b8ab9c5e21760b7d00d811296154efc9");
        expect(hero?.model.severity).toBe("warning");
      } else {
        expect(hero?.model.modelKey, heroId).toBeNull();
        expect(hero?.model.severity, heroId).toBe("blocker");
      }
      expect(hero?.model.components.map((component: any) => component.id), heroId).toEqual(componentIds);
      expect(hero?.model.components.every((component: any) => component.verified), heroId).toBe(true);
      expect(hero?.model.componentFilesInRepo, heroId).toBe(hero?.model.componentCount);
    }

    expect(doc.counts.independentComponentPending).toBe(8);
    expect(doc.counts.independentComponents).toBe(13);
    expect(doc.counts.modelCompletelyMissing).toBe(0);
    expect((byId.get("acquired-zero") as any).model.components.map((component: any) => component.id)).not.toContain("zero-lancer-p1-static-skinned-v1");
    expect((byId.get("acquired-mario") as any).model.nativeAnimationCount).toBe(5);
    expect((byId.get("acquired-mario") as any).model.proceduralAnimationCount).toBe(0);
  });

  it("四顆歷史 GLB 的精確位元組在 Git，材質正規化前版本可放在歷史歸檔路徑", () => {
    const doc = JSON.parse(readFileSync(join(REPO, "docs/_review/material/hero-intake/ship34.json"), "utf8"));
    const byId = new Map(doc.heroes.map((hero: any) => [hero.id, hero]));

    for (const heroId of ["acquired-jetragon", "acquired-astralym"]) {
      const model: any = (byId.get(heroId) as any)?.model;
      expect(model?.filesInRepo, heroId).toBe(2);
      expect(model?.filesArchivedInRepo ?? 0, heroId).toBe(0);
    }

    const relocated: Record<string, string> = {
      "acquired-kita-kita": "2bbff051c41157f9c9abdf9e9ca6c0b930e15687380f109eefdf208af5d4eb8c",
      "acquired-lord-nightmares": "d5cf4ff0969a21787bfcdd1fabf787339e91c37e266231602004fc2edb5993c8",
    };
    for (const [heroId, digest] of Object.entries(relocated)) {
      const model: any = (byId.get(heroId) as any)?.model;
      expect(model?.filesInRepo, heroId).toBe(2);
      expect(model?.filesAtDeclaredGitPath, heroId).toBe(1);
      expect(model?.filesArchivedInRepo, heroId).toBe(1);
      expect(model?.archivedFiles, heroId).toEqual([
        expect.objectContaining({
          sha256: digest,
          gitPath: `materials/hero-model-library/source-artifacts/historical-model-recovery-7bc2fa3f8/${digest}.glb`,
        }),
      ]);
      expect(model?.gap, heroId).toContain("精確 GLB 位元組在歷史歸檔路徑");
    }
  });
});

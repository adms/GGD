/**
 * Stand-in detection (task #76 §4 / the data debt of #77). Driven against the
 * REAL skeleton registry — sela and thorne both wear stand-in meshes — so a
 * change to a champion's modelKey is caught here rather than on the 3D stage.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { defaultPrefersVoxelBody } from "@ggd/shared/content/voxelSkin";
import { isStandInModel, STAND_IN_MODEL_KEYS, STAND_IN_NOTE_ZH } from "./standIn";

beforeAll(() => registerSkeletonContent());

describe("stand-in model detection", () => {
  it("flags every known generic KayKit fallback key", () => {
    cover("client-champ-standin");
    for (const key of STAND_IN_MODEL_KEYS) expect(isStandInModel(key)).toBe(true);
    expect(STAND_IN_MODEL_KEYS.size).toBe(4);
  });

  it("does not flag a real imported model, or an unknown/empty key", () => {
    cover("client-champ-standin");
    expect(isStandInModel("imported.herokunoichi")).toBe(false);
    expect(isStandInModel("imported.herosaber")).toBe(false);
    expect(isStandInModel("")).toBe(false);
    expect(isStandInModel(null)).toBe(false);
    expect(isStandInModel(undefined)).toBe(false);
  });

  it("reads the modelKey straight off the champion def (sela/thorne are stand-ins)", () => {
    cover("client-champ-standin");
    const sela = Champions.get("sela" as ChampionId);
    const thorne = Champions.get("thorne" as ChampionId);
    expect(isStandInModel(sela.modelKey)).toBe(true);
    expect(isStandInModel(thorne.modelKey)).toBe(true);
  });
});

/* ── GH#224 · 第一·五守則：這張徽章不可以承諾一個不會發生的身體 ──────────────
 * 這一段**重新量**（⛔ 不抄 standIn.ts 檔頭裡的那個數字，那會變成第二個住處）：
 * 拿出貨名單逐位問**出貨的那條規則** `defaultPrefersVoxelBody`，
 * 「徽章會亮的人」與「戰鬥中真的換成體素的人」是不是同一群。
 *
 * ⭐ 兩個方向一起讀：
 *   · 若有任何一位**亮著徽章卻不吃體素** → 文案不可以寫「體素」。
 *   · 若哪天內容改成全部都吃體素 → 這裡紅，提醒把承諾**加回去**。
 * ⛔ 這不是掃字串代替行為：判定那一半跑的是出貨的規則函數，字串那一半只是把
 *    結論釘在玩家真正讀到的那一行上。
 */
describe("GH#224 徽章文案 ↔ 出貨的身體規則", () => {
  const REPO = join(__dirname, "../../../../../..");

  /** `starter.go` 的 `starterChampions` —— 玩家真正選得到的那一份。 */
  function shippedRoster(): string[] {
    const src = readFileSync(join(REPO, "apps/platform/internal/curation/starter.go"), "utf8");
    const block = /starterChampions = \[\]string\{([\s\S]*?)\n\t\}/.exec(src);
    expect(block, "starter.go 的 starterChampions 區塊解析失敗（格式改了？）").not.toBeNull();
    const ids = [...block![1]!.matchAll(/"(godie-[^"]+)"/g)].map((m) => m[1]!);
    expect(ids.length, "出貨名單解析為空").toBeGreaterThan(0);
    return ids;
  }

  it("承諾體素的字眼，只有在出貨名單上每一位都真的吃體素時才准出現", () => {
    cover("client-champ-standin");
    const lit: string[] = [];
    const voxel: string[] = [];
    for (const id of shippedRoster()) {
      const doc = JSON.parse(
        readFileSync(join(REPO, "content/champions", `${id}.json`), "utf8"),
      ) as { modelKey?: string };
      if (!isStandInModel(doc.modelKey)) continue;
      lit.push(id);
      if (defaultPrefersVoxelBody(doc.modelKey, id)) voxel.push(id);
    }
    // 徽章要有對象，否則下面兩條都是空轉的真空斷言
    expect(lit.length, "出貨名單上沒有任何一位會亮徽章 —— 這條守衛失去對象了").toBeGreaterThan(0);
    const promisesVoxel = STAND_IN_NOTE_ZH.includes("體素");
    expect(
      promisesVoxel,
      `文案承諾體素，但出貨名單上只有 ${voxel.length}/${lit.length} 位真的吃體素` +
        `（不吃的：${lit.filter((c) => !voxel.includes(c)).join(", ")}）`,
    ).toBe(voxel.length === lit.length);
  });
});

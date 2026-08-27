/**
 * GH#325 —— **每一側的出生點至少坐得滿一隊**，由 schema 保證，⛔ 不由巧合保證。
 *
 * 缺口的形狀（兩個名詞的關係，⛔ 不是兩個各自壞掉的名詞）：
 *   · schema 說「每側 ≥ 1 個 spawn」——**對**。
 *   · 消費端 `MatchController` 說 `spawns[side]![slot % TEAM_SIZE]!`——也**對**。
 *   ⇒ 壞的是**配對**：一份完全合法的 arena@1（每側 1 個）讓 slot 1/2 取到 `undefined`，
 *     而兩個非空斷言把它一路帶進 runtime。出貨 13 張場地每側都是 3 個 —— 巧合。
 *
 * ⭐ 這一支驗的是**出貨的那份 schema**（`zZoneDef` 的 superRefine），
 * ⛔ 不是重寫一份判斷邏輯 —— 那只會證明夾具會算 `length < 3`。
 *
 * MUTATION LOG（第二守則）:
 *   · `schema/arena.ts` 的 `if (side.length < TEAM_SIZE)` 整段刪掉
 *       → 「少一個座位的場地會被 schema 擋下」紅（safeParse 變 success）。
 */
import { describe, expect, it } from "vitest";
import { TEAM_SIZE } from "../constants";
import { zZoneDef } from "./schema/arena";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { ContentLoader } from "./loader";
import type { ArenaDoc } from "./schema/arena";

const zoneWith = (perSide: number): unknown => ({
  id: "zone-under-test",
  center: { x: 0, z: 0 },
  boundaryRadius: 24,
  obstacles: [],
  spawns: [
    Array.from({ length: perSide }, (_, i) => ({ x: i, z: 0 })),
    Array.from({ length: perSide }, (_, i) => ({ x: i, z: 4 })),
  ],
});

describe("arena@1 的每一側出生點都坐得滿一隊 (GH#325)", () => {
  it("少一個座位的場地會被 schema 擋下，而且訊息指名 zone 與側", () => {
    const bad = zZoneDef.safeParse(zoneWith(TEAM_SIZE - 1));
    expect(bad.success, "每側只有 TEAM_SIZE-1 個 spawn 的文件竟然通過 —— 契約回到 .min(1) 了").toBe(
      false,
    );
    const msgs = bad.success ? [] : bad.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    // 指名「哪一個 zone 的哪一側」是這條 issue 存在的一半理由 —— 2026-08-02 的反向
    // 追查（第一行錯誤指向別的文件）就是訊息不指名造成的。
    expect(msgs.join("\n")).toContain("zone-under-test");
    expect(msgs.some((m) => m.startsWith("spawns.0")), msgs.join("\n")).toBe(true);
    expect(msgs.some((m) => m.startsWith("spawns.1")), msgs.join("\n")).toBe(true);
    expect(msgs.join("\n")).toContain(`TEAM_SIZE=${TEAM_SIZE}`);
  });

  it("剛好坐滿一隊就過（⛔ 閘不可以順手變成「至少 4 個」）", () => {
    expect(zZoneDef.safeParse(zoneWith(TEAM_SIZE)).success).toBe(true);
  });

  it("出貨的每一張場地都已經滿足它 —— 這條契約零內容改動", async () => {
    const { store } = await new ContentLoader(shippedContentSource()).load();
    const arenas = store.all<ArenaDoc>("arenas");
    expect(arenas.length, "一張場地都沒載到 ⇒ 這條斷言是空的").toBeGreaterThan(5);
    for (const a of arenas) {
      for (const zone of a.zones) {
        for (const [si, side] of zone.spawns.entries()) {
          expect(side.length, `${a.id}/${zone.id} side ${si}`).toBeGreaterThanOrEqual(TEAM_SIZE);
        }
      }
    }
  });
});

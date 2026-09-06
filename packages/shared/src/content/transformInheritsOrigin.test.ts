/**
 * GH#1064 —— **變身態的出身繼承本體**（`config.stat-normalization@1.transformInheritsOrigin`）。
 *
 * ── ⭐ 為什麼這條要走 `registerAll`，⛔ 不是直接呼叫 `withInheritedOrigin` ──────────
 * 這一格開關的價值全部落在**第四個住處＝消費端**（CLAUDE.md：三個住處齊全 ≠ 已上線）。
 * ⇒ 這裡註冊**出貨內容**、再從**註冊表**上把 20 具變身身體與它們的本體讀回來比 ——
 * 把 `registries.ts` 那一行 `roster` 拿掉，這一條就紅（失敗形態⑤：被測的要是出貨的那個）。
 *
 * ── 量到的（2026-09-07，⛔ 不是估的）────────────────────────────────────────────
 * 20 具變身身體裡 **16 具**由三圍推導出的出身與本體 owner 指派的不同；
 * 最極端的草泥馬（本體**坦克** → 推導**法刺**）11 項裡 10 項換一列、兩防從**極大**到**極小**。
 *
 * ⚠️ 只測**預設開啟**那一邊（第〇·六守則），關掉那一邊只留一條「回得去」的純函式斷言。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { shippedDocs } from "./__fixtures__/shippedContent";
import type { CollectionName } from "./schema/index";
import { ContentStore } from "./store";
import { registerAll } from "./registries";
import { Champions } from "../sim/content/registry";
import {
  bandsOf,
  originOf,
  statNormalizationFromDoc,
  withInheritedOrigin,
  type StatNormalization,
} from "./statNormalization";

const docs = (c: CollectionName): Record<string, unknown>[] =>
  shippedDocs<Record<string, unknown>>(c);

let CFG: StatNormalization;
/** [變身態 id, 本體 id] —— 從出貨英雄卡的 `transform` 讀，⛔ 不抄一份名單。 */
let PAIRS: [string, string][];

beforeAll(() => {
  const store = new ContentStore();
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
    "config",
  ] as const) {
    for (const doc of docs(c)) store.add(c, doc["id"] as string, doc);
  }
  registerAll(store);
  CFG = statNormalizationFromDoc(
    docs("config").find((c) => c["schema"] === "config.stat-normalization@1"),
  );
  PAIRS = docs("champions")
    .map((d) => [d, d["transform"] as { role?: unknown; counterpartId?: unknown } | undefined] as const)
    .filter(([, xf]) => xf?.role === "alternate" && typeof xf.counterpartId === "string")
    .map(([d, xf]) => [d["id"] as string, xf!.counterpartId as string]);
});

describe("變身態的出身繼承本體 (GH#1064)", () => {
  it("出貨路徑：每一具變身身體的十一屬性級距 ＝ 本體那一列", () => {
    expect(CFG.transformInheritsOrigin, "出貨這一格是開著的").toBe(true);
    // 量尺自證：真的讀到了整棵樹（20 對，⛔ 不是 0 對而「全部通過」）。
    expect(PAIRS.length).toBeGreaterThanOrEqual(20);
    const wrong: string[] = [];
    for (const [altId, baseId] of PAIRS) {
      const alt = Champions.tryGet(altId as never);
      const base = Champions.tryGet(baseId as never);
      if (!alt || !base) {
        wrong.push(`${altId}: 註冊表上找不到（本體 ${baseId}）`);
        continue;
      }
      const a = originOf(alt as never);
      const b = originOf(base as never);
      if (a !== b) wrong.push(`${altId}: 出身 ${a} ≠ 本體 ${baseId} 的 ${b}`);
      const ab = JSON.stringify(bandsOf(alt as never, CFG));
      const bb = JSON.stringify(bandsOf(base as never, CFG));
      if (ab !== bb) wrong.push(`${altId}: 級距 ${ab} ≠ 本體 ${bb}`);
    }
    expect(wrong, "變身身體沒有走本體那一列 —— registries 的 roster 那一格接上了嗎？").toEqual([]);
  });

  it("關掉它就逐位元回到 2026-09-07 之前（照自己的三圍推導）", () => {
    const off = { ...CFG, transformInheritsOrigin: false };
    const alt = docs("champions").find((d) => d["id"] === "godie-h02u")!;
    const roster = {
      championById: (id: string) => docs("champions").find((d) => d["id"] === id),
    };
    // 開著：查得到本體 ⇒ 蓋上本體的出身（草泥馬本體 godie-h02v ＝ 坦克）。
    expect(originOf(withInheritedOrigin(alt, CFG, roster) as never)).toBe("坦克");
    // 關掉：**同一個物件**原樣返回（⛔ 不是「值剛好一樣」）＋ 推導回法刺。
    expect(withInheritedOrigin(alt, off, roster)).toBe(alt);
    expect(originOf(alt as never)).toBe("法刺");
  });
});

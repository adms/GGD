import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GEOMETRY_SNAP_CONFIG_IDS, authorWarnings } from "./authorWarnings";

// ⭐ 表從出貨 config 讀（⛔ 不寫死 3）。
const CONFIG = join(dirname(fileURLToPath(import.meta.url)), "../../../content/config");
const configs = GEOMETRY_SNAP_CONFIG_IDS.map((id) => JSON.parse(readFileSync(join(CONFIG, `${id}.json`), "utf8")) as unknown);
const snapOf = (draft: object, cfg?: readonly unknown[]) =>
  authorWarnings("abilities", "probe.q", draft, cfg).filter((w) => w.rule === "geometry-snap");

describe("編輯器存檔警示：沒標級別的幾何會吸格（GH#1260 B3 修正輪）", () => {
  it("不在格上 ⇒ 指名那一格「寫 X、場上 Y」；有級別／沒抓到三張表 ⇒ 不喊", () => {
    const draft = { schema: "ability@1", id: "probe.q", castType: "ground", radius: 2.75 };
    const hit = snapOf(draft, configs);
    expect(hit.map((w) => w.field)).toEqual(["radius"]);
    expect(hit[0]!.message).toContain("2.75");
    expect(snapOf({ ...draft, radiusTier: "極小" }, configs)).toEqual([]);
    // ⛔ 還沒抓到後台的表就不猜（後台可能已關 snapUntiered）
    expect(snapOf(draft)).toEqual([]);
  });
});

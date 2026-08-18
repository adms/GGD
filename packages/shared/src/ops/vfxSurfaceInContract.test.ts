/**
 * ⭐【特效授權面必須真的出現在兩份對外文件裡】（GH#372）
 *
 * 量到的（v0.20.5，兩份文件都剛重新產生過）：
 *
 *   | 機制          | 技能標記機制與效果規則.md | ggd-runtime-capabilities.md |
 *   |---------------|--------------------------:|----------------------------:|
 *   | `convertTeam` |                         2 |                           2 |
 *   | **`orient`**  |                     **0** |                       **0** |
 *
 * effect kind 那一面是通的，**特效那一面整片不在合約裡** —— `gen_spec.ts` 只讀
 * effect / augment / condition / common 四份 schema，`schema/vfx.ts` 一格都沒讀。
 *
 * ⛔ 這是最安靜的一種缺陷：外部編輯器不會收到任何錯誤，它只是**不知道有這些格子**，
 * 於是它產出的每一支技能都沒有特效參數。`unsupported` 至少會被拒絕，這個連拒絕都沒有。
 *
 * ⭐ 這條驗的是「**名字真的出現在產出裡**」，⛔ 不是「函式存在」也不是「schema 有欄位」——
 * 後兩者在 2026-08-18 之前**全部是真的**，而合約仍然是空的。
 * 名單從 `buildCapabilityManifest()` 推導，⛔ 沒有手抄的欄位清單：
 * 哪天有人加一格 `orient.yawFrom`，這條自己會要求它進文件。
 *
 * 兩份文件的新鮮度由既有的兩條閘顧（`skillSpecFresh` 與 capability-export 的
 * `--check`），所以這裡讀磁碟上那一份就等於讀產生器的輸出。
 *
 * 突變紀錄（2026-08-18）：
 *   · 把 `gen_spec.ts` 的 §13 整段 emit 拿掉 → `pnpm spec:build` → 這條紅，
 *     並指名少了哪幾個名字（`emitter` / `orient` / `swirlDegPerSec` / `delayMs` …）✅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityManifest } from "../content/editorCapabilities";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const DOCS: readonly { label: string; path: string }[] = [
  { label: "技能標記機制與效果規則（怎麼用）", path: join(REPO, "docs/技能標記機制與效果規則.md") },
  {
    label: "ggd-runtime-capabilities（存不存在）",
    path: join(REPO, "docs/editor-contract/ggd-runtime-capabilities.md"),
  },
];

describe("特效授權面有進對外合約", () => {
  it("⭐ `vfxSurface` 的每一個名字都印在兩份文件裡 —— 少一個就是對方看不到的格子", () => {
    const surface = buildCapabilityManifest().vfxSurface;
    const places = Object.keys(surface);
    // 夾具前提：面整個空掉的話，下面每一條都會空轉通過。
    expect(places.length, "vfxSurface 是空的 —— 這條守衛在測空氣").toBeGreaterThan(3);
    expect(
      places,
      "`vfx@1.orient` 是巢狀的：漏了它，`swirlDegPerSec` 這幾格就沒有任何文件提過",
    ).toContain("vfx@1.orient");

    for (const { label, path } of DOCS) {
      const text = readFileSync(path, "utf8");
      const missing = new Set<string>();
      for (const [place, fields] of Object.entries(surface)) {
        if (!text.includes(place.replace("[]", ""))) missing.add(place);
        // `id` / `schema` 是每一份 JSON 都有的樣板欄位，⛔ 不是特效授權面的一部分。
        for (const f of fields) if (f !== "id" && f !== "schema" && !text.includes(f)) missing.add(f);
      }
      expect(
        [...missing].sort(),
        `《${label}》沒有提到這些特效授權格。⛔ 不要改這條測試 —— ` +
          "跑 `pnpm spec:build` 與 `pnpm caps:export`；還是紅的話代表產生器沒有把它們寫出去。",
      ).toEqual([]);
    }
  });
});

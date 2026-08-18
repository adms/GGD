/**
 * ⭐【授權面必須真的出現在兩份對外文件裡】（GH#372 特效 → GH#380 文件本體）
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
 * ⭐ **2026-08-19（GH#380）：同一個形狀在四個位置又發生了一次，所以這條擴成兩軸。**
 *
 * `vfxSurface` 回答「這一招長什麼樣子」，⛔ 但「**這一招本身是什麼**」那一面
 * 當時仍然整片不在合約裡 —— `castType`（指定／範圍／自身）、`hitRadius`、
 * `craftRole`、`status-effect@1` 的每一格：兩份文件都是 **0**。
 * 所以現在跑的是 `vfxSurface` **與** `docSurface` 兩張表，⛔ 沒有第二支測試檔：
 * 兩者由同一支 `deriveSurface()` 推導，多開一個授權位置這條自己會要求它進文件。
 *
 * ⚠️ 第二條 `it` 補的是**另一種**漏法（第五個缺口，同日量到）：名字**在 JSON 裡但
 * 不在人看的那一份**。`effectFields` 的 201 個名字有 109 個在 `.md` 裡出現 0 次 ——
 * 對方只讀 Markdown 的話，那 109 格一樣不存在。
 *
 * 突變紀錄：
 *   · 2026-08-18：把 `gen_spec.ts` 的 §13 整段 emit 拿掉 → `pnpm spec:build` → 紅，
 *     並指名少了哪幾個名字（`emitter` / `orient` / `swirlDegPerSec` / `delayMs` …）✅
 *   · 2026-08-19：把 `export.ts` 第 9 節的 `NAME_FAMILIES` 迴圈拿掉 →
 *     `pnpm caps:export` → 第二條紅，逐名指出 109 個 effect 參數（`absorbs` /
 *     `amountPerTick` / `apexHeight` …）在人看的那一份裡出現 0 次 ✅
 *   ⚠️ `docSurface` 那一半**沒有另做突變**：它和已經驗過的 `vfxSurface` 走的是
 *     同一支 `deriveSurface()` 與同一個迴圈，⛔ 再做一次是同一條線量第二遍。
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

describe("授權面有進對外合約", () => {
  it("⭐ `vfxSurface` + `docSurface` 的每一個名字都印在兩份文件裡 —— 少一個就是對方看不到的格子", () => {
    const m = buildCapabilityManifest();
    const surface = { ...m.vfxSurface, ...m.docSurface };
    const places = Object.keys(surface);
    // 夾具前提：面整個空掉的話，下面每一條都會空轉通過。
    expect(places.length, "授權面是空的 —— 這條守衛在測空氣").toBeGreaterThan(3);
    for (const nested of ["vfx@1.orient", "ability@1.marks[]"]) {
      expect(
        places,
        `\`${nested}\` 是巢狀的：漏了它，裡面那幾格就沒有任何文件提過`,
      ).toContain(nested);
    }

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
        `《${label}》沒有提到這些授權格。⛔ 不要改這條測試 —— ` +
          "跑 `pnpm spec:build` 與 `pnpm caps:export`；還是紅的話代表產生器沒有把它們寫出去。",
      ).toEqual([]);
    }
  });

  it("⭐ manifest 算出來的每一族名字都印在**人看的**那一份裡（⛔ 不是只在 JSON）", () => {
    const m = buildCapabilityManifest();
    // ⛔ 名單從 manifest 的形狀推導，⛔ 不是手抄的 key 清單 —— manifest 之後多一族，
    //    這條自己會要求它進文件（那正是 GH#372/#380 兩次都沒有人發現的原因）。
    const families = Object.entries(m).filter(
      (e): e is [string, readonly string[]] =>
        Array.isArray(e[1]) && e[1].every((v) => typeof v === "string"),
    );
    expect(families.length, "manifest 一族字串清單都沒有 —— 這條在測空氣").toBeGreaterThan(5);
    const md = readFileSync(DOCS[1]!.path, "utf8");
    const missing = families.flatMap(([k, names]) => names.filter((n) => !md.includes(n)).map((n) => `${k}.${n}`));
    expect(
      missing.sort(),
      "這些名字算出來了、寫進 JSON 了，⛔ 但人看的那一份一個字都沒印 —— " +
        "只讀 Markdown 的作者不會知道它們存在。修 `tools/capability-export/export.ts`，⛔ 不要改這條測試。",
    ).toEqual([]);
  });
});

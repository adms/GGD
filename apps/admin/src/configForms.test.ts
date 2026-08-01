/**
 * 通用設定編輯器的**語意**守衛 —— 「欄位都在但說明是欄位名」不算可調。
 *
 * 這一支守的不是「表單畫得出來」（那是 configFormsSave.test.ts 的事），而是
 * 「表單畫出來的東西操作者看得懂、而且不會因為 schema 長大而悄悄少一格」。
 *
 * 三件被釘死的事，各自對應一個真的發生過的失敗形態：
 *
 *  · **schema 加了欄位、標籤表沒跟上** → 通用引擎會怎麼樣？它會安靜地少畫一格。
 *    畫面沒有錯誤，操作者也不會知道自己少了一個旋鈕。所以 `每一個葉節點都有標籤`
 *    是雙向的：少寫紅，寫多也紅。
 *
 *  · **說明複述欄位名** → 「Max Pooled Rings：最大池化圓環數」是 JSON 編輯器，
 *    不是後台。`說明要寫它影響什麼` 擋掉「說明 ≈ 欄位名的人類化」這種寫法。
 *
 *  · **欄位只有下界**（#277）→ 24 打成 240 會過後台，然後在下游被靜默夾掉。
 *    `每一個數字欄位都有上界` 逼每一格都有天花板，來源是 schema 或標籤表二選一。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CONFIG_DOC_SPECS,
  DOC_META_PATHS,
  applyEdits,
  autoLabelFor,
  boundsFor,
  displayValue,
  docIfMatches,
  fieldRows,
  getAt,
  parseFieldInput,
  readSchema,
  specForPage,
} from "./configForms";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

function shippedDoc(docId: string): unknown {
  return JSON.parse(readFileSync(`${REPO}content/config/${docId}.json`, "utf8"));
}

/** 至少一個中日韓字 —— 說明是寫給操作者看的，不是給 schema 看的。 */
const HAS_CJK = /[一-鿿]/;

describe("設定文件標籤表 (adminui-config-forms-labels)", () => {
  it("schema 的每一個可編輯葉節點都恰好有一筆標籤，沒有多也沒有少", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      const { leaves } = readSchema(spec.zod);
      const schemaPaths = leaves.map((l) => l.path).sort();
      const labelPaths = spec.fields.map((f) => f.path).sort();
      // 兩個方向都要：少寫 = 操作者少一個旋鈕而且不會知道；
      // 多寫 = 標籤表指著一個不存在的欄位，儲存時才會炸。
      expect(labelPaths, `${spec.docId} 的標籤表與 schema 對不上`).toEqual(schemaPaths);
    }
  });

  it("schema 裡每一個非純量分支都被宣告過：preserved（帶著走）或 curve（畫成表格）", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      const { branches } = readSchema(spec.zod);
      // 陣列分支有兩條**明著宣告**的路，沒有第三條「沒人管它」的路：
      //   · preserved  = 這一頁不編輯，但儲存時原封不動帶著走（gore.championStyles）
      //   · curve      = 這一頁就是要編輯它（body-scale.attackRangeCurve）
      // 少宣告 = 儲存時把它弄不見（preserved 那一側）或畫不出來（curve 那一側），
      // 兩種都是「畫面沒有錯誤但東西沒了」。
      const declared = [
        ...spec.preserved.map((p) => p.path),
        ...(spec.curve ? [spec.curve.path] : []),
      ].sort();
      expect(
        branches.map((b) => b.path).sort(),
        `${spec.docId}: 有分支既不在 preserved 也不是 curve`,
      ).toEqual(declared);
      // curve 宣告的路徑必須真的是一個分支（打錯字的話它會安靜地畫一張空表）
      if (spec.curve) {
        expect(
          branches.some((b) => b.path === spec.curve!.path),
          `${spec.docId}: curve.path "${spec.curve.path}" 在 schema 裡不是一個分支`,
        ).toBe(true);
      }
      // 「為什麼」不可以留白 —— 那一行就是它為什麼值得被帶著走的理由。
      for (const p of spec.preserved) {
        expect(p.why.length, `${spec.docId}.${p.path} 的 why 太短`).toBeGreaterThan(15);
        expect(HAS_CJK.test(p.why)).toBe(true);
      }
    }
  });

  it("每一個數字欄位都有上界 —— 不是只有下界 (#277)", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      const { leaves } = readSchema(spec.zod);
      for (const leaf of leaves) {
        if (leaf.kind !== "number") continue;
        const label = spec.fields.find((f) => f.path === leaf.path)!;
        const bounds = boundsFor(leaf, label);
        expect(
          bounds.max,
          `${spec.docId}.${leaf.path} 沒有上界：打錯一個 0 會過後台`,
        ).toBeTypeOf("number");
        expect(Number.isFinite(bounds.max)).toBe(true);
      }
    }
  });

  it("說明寫的是「它影響什麼」，不是欄位名的人類化", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      for (const f of spec.fields) {
        const auto = autoLabelFor(f.path);
        expect(HAS_CJK.test(f.zh), `${spec.docId}.${f.path} 的名稱不是中文`).toBe(true);
        expect(HAS_CJK.test(f.note), `${spec.docId}.${f.path} 的說明不是中文`).toBe(true);
        // 「說明 = 欄位名」「說明 = 名稱」都等於沒有說明。
        expect(f.note.trim()).not.toBe(auto);
        expect(f.note.trim()).not.toBe(f.zh.trim());
        expect(
          f.note.length,
          `${spec.docId}.${f.path} 的說明太短，講不完它影響什麼`,
        ).toBeGreaterThan(30);
      }
    }
  });

  it("每一個 enum 欄位的每一個選項都有中文標籤", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      const { leaves } = readSchema(spec.zod);
      for (const leaf of leaves) {
        if (leaf.kind !== "enum") continue;
        const label = spec.fields.find((f) => f.path === leaf.path)!;
        for (const opt of leaf.options) {
          expect(
            label.optionLabels?.[opt],
            `${spec.docId}.${leaf.path} 的選項 "${opt}" 沒有標籤`,
          ).toBeTypeOf("string");
        }
      }
    }
  });

  it("上下界只有一個來源 —— schema 和標籤表同時給就丟例外", () => {
    cover("adminui-config-forms-labels");
    // vfx-cleanup 的 maxPooledRings 在 schema 就有 .max(512)。
    const spec = specForPage("vfxCleanup")!;
    const { leaves } = readSchema(spec.zod);
    const leaf = leaves.find((l) => l.path === "maxPooledRings")!;
    expect(leaf.max).toBe(512);
    expect(() => boundsFor(leaf, { path: leaf.path, zh: "x", note: "y", max: 99 })).toThrow(
      /schema 已經有上界/,
    );
  });

  it("每一份掛上後台的文件，content/ 裡真的有那一份而且過得了它自己的 schema", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      const doc = shippedDoc(spec.docId);
      expect((doc as { schema?: string }).schema).toBe(spec.schemaTag);
      // 出貨文件本身要合法 —— 不合法的話，這一頁「疊在基底上」的儲存會把一份
      // 壞文件原封不動送出去。
      expect(spec.zod.safeParse(doc).success, `${spec.docId} 出貨文件不合 schema`).toBe(true);
    }
  });

  it("`consumer` 指的檔案真的存在 —— 註解會說謊，這一條讓它說不了謊", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      const path = spec.consumer.match(/[\w./-]+\.ts/)?.[0];
      expect(path, `${spec.docId} 的 consumer 沒有指到任何檔案`).toBeTypeOf("string");
      // 存在即可；「它真的會讀到這個值」由 configFormsSave.test.ts 實際跑一次證明。
      expect(() => readFileSync(`${REPO}${path}`, "utf8")).not.toThrow();
    }
  });
});

describe("設定文件表單邏輯 (adminui-config-forms-logic)", () => {
  it("身分欄位不會被畫成輸入框（id / schema / note）", () => {
    cover("adminui-config-forms-logic");
    for (const spec of CONFIG_DOC_SPECS) {
      const { leaves } = readSchema(spec.zod);
      for (const meta of DOC_META_PATHS) {
        expect(leaves.some((l) => l.path === meta)).toBe(false);
      }
    }
  });

  it("超過上界的數字被擋下來，而且理由是中文的一句話", () => {
    cover("adminui-config-forms-logic");
    const spec = specForPage("vfxCleanup")!;
    const rows = fieldRows(spec, shippedDoc("vfx-cleanup"), shippedDoc("vfx-cleanup"));
    const row = rows.find((r) => r.path === "maxPooledRings")!;
    expect(parseFieldInput(row, "24")).toEqual({ ok: true, value: 24 });
    expect(parseFieldInput(row, "0")).toEqual({ ok: true, value: 0 });
    // #277 的形狀：24 打成 2400。
    const tooBig = parseFieldInput(row, "2400");
    expect(tooBig.ok).toBe(false);
    expect(tooBig.ok === false && tooBig.error).toMatch(/不可以大於 512/);
    const negative = parseFieldInput(row, "-1");
    expect(negative.ok).toBe(false);
    expect(parseFieldInput(row, "3.5").ok).toBe(false); // .int()
    expect(parseFieldInput(row, "").ok).toBe(false);
    expect(parseFieldInput(row, "abc").ok).toBe(false);
  });

  it("0..1 的強度欄位兩端都夾得住", () => {
    cover("adminui-config-forms-logic");
    const spec = specForPage("gore")!;
    const rows = fieldRows(spec, shippedDoc("gore"), shippedDoc("gore"));
    const row = rows.find((r) => r.path === "intensity")!;
    expect(parseFieldInput(row, "0.4")).toEqual({ ok: true, value: 0.4 });
    expect(parseFieldInput(row, "1")).toEqual({ ok: true, value: 1 });
    expect(parseFieldInput(row, "1.2").ok).toBe(false);
    expect(parseFieldInput(row, "-0.1").ok).toBe(false);
  });

  it("enum 只收 schema 認得的值", () => {
    cover("adminui-config-forms-logic");
    const spec = specForPage("modelLod")!;
    const rows = fieldRows(spec, shippedDoc("model-lod"), shippedDoc("model-lod"));
    const row = rows.find((r) => r.path === "presetTiers.medium")!;
    expect(parseFieldInput(row, "small")).toEqual({ ok: true, value: "small" });
    expect(parseFieldInput(row, "tiny").ok).toBe(false);
  });

  it("applyEdits 疊在整份基底上 —— 沒被編輯的分支一格都不會掉", () => {
    cover("adminui-config-forms-logic");
    const base = shippedDoc("gore") as Record<string, unknown>;
    const before = Object.keys(base["championStyles"] as object).length;
    expect(before).toBeGreaterThan(0);
    const next = applyEdits(base, new Map([["style", "off"]]));
    expect(next["style"]).toBe("off");
    expect(Object.keys(next["championStyles"] as object)).toHaveLength(before);
    expect(next["id"]).toBe("gore");
    expect(next["schema"]).toBe("config.gore@1");
    // 深拷貝：改過的那一份不可以動到呼叫端手上的基底。
    expect((base as { style: string }).style).toBe("blood");
  });

  it("applyEdits 走得進巢狀路徑", () => {
    cover("adminui-config-forms-logic");
    const base = shippedDoc("model-lod") as Record<string, unknown>;
    const next = applyEdits(base, new Map([["presetTiers.medium", "small"]]));
    expect(getAt(next, "presetTiers.medium")).toBe("small");
    expect(getAt(next, "presetTiers.low")).toBe("small");
    expect(getAt(next, "presetTiers.high")).toBe("high");
    expect(getAt(next, "presetTiers.auto")).toBe("high");
  });

  it("沒有基底文件時 applyEdits 直接丟例外，不會生出一份殘缺的文件", () => {
    cover("adminui-config-forms-logic");
    expect(() => applyEdits(null, new Map([["style", "off"]]))).toThrow(/基底文件/);
  });

  it("schema 對不上的文件一律當成沒有", () => {
    cover("adminui-config-forms-logic");
    const spec = specForPage("gore")!;
    expect(docIfMatches(spec, shippedDoc("gore"))).not.toBeNull();
    expect(docIfMatches(spec, shippedDoc("model-lod"))).toBeNull();
    expect(docIfMatches(spec, null)).toBeNull();
  });

  it("顯示值用中文，不是 true / false", () => {
    cover("adminui-config-forms-logic");
    const label = { path: "enabled", zh: "x", note: "y" };
    expect(displayValue(true, label)).toBe("開啟");
    expect(displayValue(false, label)).toBe("關閉");
    expect(displayValue(undefined, label)).toBe("—");
    expect(displayValue("small", { ...label, optionLabels: { small: "small（最省）" } })).toBe(
      "small（最省）",
    );
  });
});

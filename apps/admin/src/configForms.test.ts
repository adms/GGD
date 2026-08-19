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
  elsewhereCovers,
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
      // ⚠️ GH#410：`elsewhere` 是**唯一**合法的第二個去向（那一格由別頁編輯，
      // 或整塊缺席所以刻意不畫）。它和 `preserved` 同一個形狀 —— 一列一個看得見
      // 的決定 + 一行說得出「那它在哪裡編」，⛔ 不是一個「這一頁只畫我列的那些」
      // 的旗標（那會讓漏接重新變成靜默的）。
      const schemaPaths = leaves
        .map((l) => l.path)
        .filter((p) => !elsewhereCovers(spec, p))
        .sort();
      const labelPaths = spec.fields.map((f) => f.path).sort();
      // 兩個方向都要：少寫 = 操作者少一個旋鈕而且不會知道；
      // 多寫 = 標籤表指著一個不存在的欄位，儲存時才會炸。
      expect(labelPaths, `${spec.docId} 的標籤表與 schema 對不上`).toEqual(schemaPaths);
    }
  });

  it("`elsewhere` 的每一列都涵蓋到真的葉節點，而且寫得出「那它在哪裡編」", () => {
    cover("adminui-config-forms-labels");
    // ⚠️ 沒有這一條的話 `elsewhere` 就是一個許願池：打錯一個路徑（`mobWave`）
    // 不會有任何反應，而它涵蓋不到的那 150 格會**同時**從標籤表與畫面上消失，
    // 上面那條斷言照樣綠 —— 那正是這個逃生口最可能腐爛的方式。
    for (const spec of CONFIG_DOC_SPECS) {
      const { leaves } = readSchema(spec.zod);
      for (const e of spec.elsewhere ?? []) {
        expect(
          leaves.some((l) => l.path === e.path || l.path.startsWith(`${e.path}.`)),
          `${spec.docId}.elsewhere 的 "${e.path}" 在 schema 裡涵蓋不到任何葉節點`,
        ).toBe(true);
        expect(
          e.why.length,
          `${spec.docId}.elsewhere 的 "${e.path}" 沒說它在哪一頁編`,
        ).toBeGreaterThan(30);
        expect(HAS_CJK.test(e.why)).toBe(true);
      }
      // 一格不可以「既畫在這裡、又宣告在別頁」——那是兩個輸入框改同一個數字。
      for (const f of spec.fields) {
        expect(
          elsewhereCovers(spec, f.path),
          `${spec.docId}.${f.path} 同時有標籤又被 elsewhere 涵蓋`,
        ).toBe(false);
      }
    }
  });

  it("schema 裡每一個非純量分支都被宣告過：preserved（帶著走）／curve／tables（畫成表格）", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      const { branches } = readSchema(spec.zod);
      // 非純量分支有三條**明著宣告**的路，沒有第四條「沒人管它」的路：
      //   · preserved  = 這一頁不編輯，但儲存時原封不動帶著走（gore.championStyles）
      //   · curve      = 這一頁就是要編輯它，兩欄斷點表（body-scale.attackRangeCurve）
      //   · tables     = 這一頁就是要編輯它，對照表（item-card.markers）
      // 少宣告 = 儲存時把它弄不見（preserved 那一側）或畫不出來（curve / tables
      // 那一側），兩種都是「畫面沒有錯誤但東西沒了」。
      const declared = [
        ...spec.preserved.map((p) => p.path),
        ...(spec.curve ? [spec.curve.path] : []),
        ...(spec.tables ?? []).map((t) => t.path),
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
      // curve 那一條的孿生檢查：tables 宣告的每一條路徑也必須真的是一個分支
      // （打錯字的話它會安靜地畫一張空表，而且存檔時把一個不存在的鍵寫進文件）。
      for (const t of spec.tables ?? []) {
        expect(
          branches.some((b) => b.path === t.path),
          `${spec.docId}: tables 的 "${t.path}" 在 schema 裡不是一個分支`,
        ).toBe(true);
      }
      // 「為什麼」不可以留白 —— 那一行就是它為什麼值得被帶著走的理由。
      for (const p of spec.preserved) {
        expect(p.why.length, `${spec.docId}.${p.path} 的 why 太短`).toBeGreaterThan(15);
        expect(HAS_CJK.test(p.why)).toBe(true);
      }
    }
  });

  it("每一張對照表都有中文說明、上界、以及 enum 選項的中文", () => {
    cover("adminui-config-forms-labels");
    // 和純量欄位同一組規則（說明寫「它影響什麼」、字數有上界、enum 每個選項有
    // 中文）—— 表格不是漏洞：一張沒有說明的 markers 表就是一個 JSON 編輯器。
    for (const spec of CONFIG_DOC_SPECS) {
      for (const t of spec.tables ?? []) {
        expect(HAS_CJK.test(t.title), `${spec.docId}.${t.path} 的標題不是中文`).toBe(true);
        expect(t.intro.length, `${spec.docId}.${t.path} 沒有說明段落`).toBeGreaterThan(0);
        for (const p of t.intro) expect(HAS_CJK.test(p)).toBe(true);
        expect(HAS_CJK.test(t.key.zh)).toBe(true);
        expect(
          t.key.note.length,
          `${spec.docId}.${t.path} 的鍵說明太短，講不完它影響什麼`,
        ).toBeGreaterThan(30);
        expect(HAS_CJK.test(t.key.note)).toBe(true);
        // 字串欄位的上界（#277 在字串上的形狀）：沒有它，一個 40 字的標記會被
        // 存下去，然後在卡片上撐出一個看不完的 chip。
        expect(t.key.maxLen).toBeGreaterThan(0);
        expect(Number.isFinite(t.key.maxLen)).toBe(true);
        expect(t.maxRows).toBeGreaterThanOrEqual(t.minRows);
        if (t.shape === "recordEnum") {
          expect(t.value, `${spec.docId}.${t.path} 是 recordEnum 但沒有值那一欄`).toBeTruthy();
          expect(t.value!.options.length).toBeGreaterThan(1);
          for (const o of t.value!.options) expect(HAS_CJK.test(o.zh)).toBe(true);
        } else {
          expect(t.value, `${spec.docId}.${t.path} 是 stringList，不該有值那一欄`).toBeUndefined();
        }
      }
    }
  });

  it("每一個數字欄位都有上界 —— 不是只有下界 (#277)", () => {
    cover("adminui-config-forms-labels");
    for (const spec of CONFIG_DOC_SPECS) {
      const { leaves } = readSchema(spec.zod);
      for (const leaf of leaves) {
        if (leaf.kind !== "number") continue;
        // 別頁在編的那幾格不畫在這裡，界由那一頁自己負責（GH#410）。
        if (elsewhereCovers(spec, leaf.path)) continue;
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
        if (elsewhereCovers(spec, leaf.path)) continue;
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

  it("每一個 pattern 和 schema 對同一個值判一樣的結果", () => {
    cover("adminui-config-forms-labels");
    /**
     * ⚠️ 這一條在 2026-08-02 之前**不存在**，而 `ConfigFieldLabel.pattern` 的註解
     * 卻宣稱它存在（第三守則）。也就是說 damage-colors 那九格 HEX6 從加進來的那天
     * 起，就沒有任何東西在比對它和 `zColorHex`。
     *
     * 做法：拿一組候選字串，逐一問兩邊 ——「這一格的 pattern 收不收」與「把它塞進
     * **整份出貨文件**之後 `spec.zod` 收不收」。兩邊判不一樣就是 drift，而 drift
     * 的症狀是「後台擋了但 PUT 沒擋」或反過來，兩種都很難從畫面上看出來。
     */
    const CANDIDATES = [
      "#FF5900",
      "#ff5900",
      "#FFF",
      "#GGGGGG",
      "#12345",
      "白色",
      "",
      // 這兩個是 12 / 13 個字（`.length` 真的數過，見下面的斷言）—— 少了它們，
      // 標籤欄位的 `.max(12)` 那一側就沒有任何候選字串踩得到。
      "十二個字剛剛好的標籤內容",
      "十三個字就會超過上界了唷唷",
    ];
    expect(CANDIDATES[7]!.length).toBe(12);
    expect(CANDIDATES[8]!.length).toBe(13);
    let checked = 0;
    for (const spec of CONFIG_DOC_SPECS) {
      const shipped = shippedDoc(spec.docId);
      for (const f of spec.fields) {
        if (!f.pattern) continue;
        // pattern 一定要配一句中文，否則被擋下來的操作者看到的是「格式不對」。
        expect(f.patternError, `${spec.docId}.${f.path} 有 pattern 但沒有 patternError`).toBeTypeOf(
          "string",
        );
        expect(HAS_CJK.test(f.patternError!)).toBe(true);
        // 出貨值本身一定要過自己的 pattern（不然這一頁一打開就是紅的）。
        expect(f.pattern.test(String(getAt(shipped, f.path))), `${spec.docId}.${f.path}`).toBe(true);
        for (const c of CANDIDATES) {
          const doc = applyEdits(shipped, new Map([[f.path, c]]));
          const zodOk = spec.zod.safeParse(doc).success;
          expect(
            f.pattern.test(c),
            `${spec.docId}.${f.path}: pattern 與 schema 對 ${JSON.stringify(c)} 判得不一樣（schema ${zodOk ? "收" : "不收"}）`,
          ).toBe(zodOk);
          checked++;
        }
      }
    }
    // GUARD-THE-GUARD：一條「零個欄位有 pattern」的迴圈是恆綠的。
    expect(checked).toBeGreaterThan(50);
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
      // ⚠️ 副檔名不是只有 `.ts`：`config.icon-style@1` 的真正消費端是 **Python**
      // （`tools/icon-gen/local/keywords.py` —— 地端兩階段產圖器），而
      // `config.ranking@1` 的是 **Go**（`internal/ranking/standingsoverride.go`
      // —— 每一場結算重讀覆蓋層的那一支）。
      // ⛔ 不可以為了通過這一條，在 consumer 裡塞一個存在但其實不讀它的 `.ts`：
      // 那正是「用散文護住一個旗標」，而這條守衛存在的理由就是不讓那件事發生。
      // 放寬的只有副檔名，牙齒（那個檔案必須真的存在）一顆都沒少。
      const path = spec.consumer.match(/[\w./-]+\.(ts|tsx|py|go)/)?.[0];
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

/**
 * 覆蓋率守衛：**下一份 `content/config/*.json` 漏接後台入口時，這裡會紅。**
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一支是為了 item-card 那個缺口寫的
 * ════════════════════════════════════════════════════════════════════════════
 * `config/item-card.json` 從出生到 2026-08-02 為止，`apps/admin/src` 全樹對它零
 * 引用 —— 而 3,500+ 條測試沒有任何一條會紅，因為「少一頁後台」不是任何一條斷言的
 * 反面。它是被人眼在一次複驗裡抓到的，而人眼不會每次都在。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三個這條守衛自己要先過的關（不然它就是下一個假守衛）
 * ════════════════════════════════════════════════════════════════════════════
 * **① GUARD-THE-GUARD**：掃到 0 份文件時必須爆炸，不是安靜地全綠。前例是
 * `bundle.test.ts` —— 它驗的是打包器而不是出貨的那一份，759 條全綠推了一份過期的
 * bundle 上線，客戶端選人畫面整個空掉。所以這裡除了「掃得到 ≥ 30 份」之外，還真的
 * 拿一個**空目錄**去問它一次，證明它會丟例外。
 *
 * **② 證據是資料結構，不是原始碼裡出現過那串字**（失敗形態 ⑥）。專屬頁那一族問的
 * 是 `pageRequiresSession(page)`（真的被匯出的函式）與 `*_DOC_ID` 常數的**值**
 * （真的 import 進來的常數），不是 grep App.tsx 有沒有出現 "voxelBody"。
 *
 * **③ 豁免表不可以自己長大**：列數與每一類的列數都釘死在下面。加一列必須同時改
 * 那個數字 —— 做得到，但做不到「沒有人注意到」。
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "@ggd/shared/testkit/cover";
import { pageRequiresSession, type Page } from "./store";
import { CONFIG_DOC_SPECS as CONFIG_DOC_SPECS_FOR_NAV } from "./configForms";
import {
  CONFIG_DOC_EXEMPTIONS,
  coverageVerdict,
  productionCallSites,
  registeredConfigDocIds,
  scanConfigDocs,
} from "./configDocCoverage";

const TAG = "adminui-config-doc-coverage";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const CONFIG_DIR = join(REPO, "content", "config");

/** 至少一個中日韓字 —— 理由是寫給三個月後那個人看的，不是給機器看的。 */
const HAS_CJK = /[一-鿿]/;

const byKind = (kind: string): typeof CONFIG_DOC_EXEMPTIONS =>
  CONFIG_DOC_EXEMPTIONS.filter((e) => e.kind === kind);

/** 這份 JSON 的任何一層裡出現過這個鍵嗎。 */
function hasKeyDeep(node: unknown, key: string): boolean {
  if (Array.isArray(node)) return node.some((n) => hasKeyDeep(n, key));
  if (!node || typeof node !== "object") return false;
  const obj = node as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true;
  return Object.values(obj).some((v) => hasKeyDeep(v, key));
}

describe("config 文件的後台入口覆蓋率 (adminui-config-doc-coverage)", () => {
  it("每一份 content/config 文件都有去向：走通用引擎、或在豁免表上", () => {
    cover(TAG);
    const scanned = scanConfigDocs(CONFIG_DIR);
    const verdict = coverageVerdict(scanned, registeredConfigDocIds(), CONFIG_DOC_EXEMPTIONS);

    // ── GUARD-THE-GUARD ①：真的掃到東西了嗎。
    expect(scanned.length, "掃到的 config 文件太少 —— 路徑或過濾條件壞了").toBeGreaterThanOrEqual(
      30,
    );
    expect(scanned.map((d) => d.id)).toContain("item-card");
    // 每一份的 id 都等於檔名 —— 不相等的話，後台用 docId 打的覆蓋層路徑會指到
    // 一份不存在的文件，而畫面上只會顯示「讀不到這份文件」。
    for (const d of scanned) {
      expect(d.id, `${d.file}.json 的 id 和檔名不一致`).toBe(d.file);
      expect(d.schema, `${d.file}.json 沒有 schema 欄位`).not.toBe("");
    }

    expect(
      verdict.unresolved,
      "這幾份 config 沒有任何後台入口，也沒有在豁免表上：要嘛做一頁，要嘛去 configDocCoverage.ts 寫下為什麼不做",
    ).toEqual([]);
    expect(
      verdict.duplicated,
      "這幾份同時在註冊表與豁免表上 —— 頁已經做出來了，豁免那一列是謊言，刪掉它",
    ).toEqual([]);
    expect(verdict.stale, "豁免表指著 content/config 裡不存在的文件").toEqual([]);
    expect(verdict.covered.length + verdict.exempt.length).toBe(scanned.length);
  });

  it("GUARD-THE-GUARD：對著一個空目錄掃，寧可爆炸也不要全綠", () => {
    cover(TAG);
    const empty = mkdtempSync(join(tmpdir(), "ggd-config-scan-"));
    try {
      expect(() => scanConfigDocs(empty)).toThrow(/GUARD-THE-GUARD/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    // 而且「零份文件」在判決層也不是通過：沒有文件就沒有 covered，也沒有 exempt。
    const v = coverageVerdict([], registeredConfigDocIds(), CONFIG_DOC_EXEMPTIONS);
    expect(v.covered).toEqual([]);
    expect(v.stale.length).toBe(CONFIG_DOC_EXEMPTIONS.length);
  });

  it("覆蓋率判決真的分得出三種去向（拿假資料問它一次）", () => {
    cover(TAG);
    // 不用真資料問這一條：真資料現在剛好三種都是空的，那樣的斷言對「函式永遠回
    // 空陣列」的實作也會過（失敗形態 ④：斷言方向和缺陷無關）。
    const scanned = [
      { file: "a", id: "a", schema: "config.a@1" },
      { file: "b", id: "b", schema: "config.b@1" },
      { file: "c", id: "c", schema: "config.c@1" },
      { file: "d", id: "d", schema: "config.d@1" },
    ];
    const v = coverageVerdict(scanned, ["a", "b"], [
      { docId: "b", kind: "KNOWN_GAP", why: "x", expiresWhen: "y" },
      { docId: "c", kind: "KNOWN_GAP", why: "x", expiresWhen: "y" },
      { docId: "zzz", kind: "KNOWN_GAP", why: "x", expiresWhen: "y" },
    ]);
    expect(v.covered).toEqual(["a"]);
    expect(v.exempt).toEqual(["c"]);
    expect(v.unresolved).toEqual(["d"]);
    expect(v.duplicated).toEqual(["b"]);
    expect(v.stale).toEqual(["zzz"]);
  });

  it("道具卡片排版真的走通用引擎 —— 這條守衛的起因", () => {
    cover(TAG);
    expect(registeredConfigDocIds()).toContain("item-card");
    expect(CONFIG_DOC_EXEMPTIONS.map((e) => e.docId)).not.toContain("item-card");
  });

  it("走通用引擎的每一頁都到得了：session-gate（行為）+ 導覽列一列（原始碼）", () => {
    cover(TAG);
    // ⚠️ 「註冊進 CONFIG_DOC_SPECS」和「操作者點得到」是兩件事。少一列導覽，那一頁
    // 就只是一個沒有入口的路由 —— 覆蓋率守衛照樣綠，而 owner 找不到它。這正是
    // configPagesRegistered.test.ts 對 戰鬥手感／對戰設定 兩頁釘的同一件事，這裡把
    // 它擴到**每一份**走通用引擎的文件。
    const app = readFileSync(join(REPO, "apps/admin/src/ui/App.tsx"), "utf8")
      // 註解剝掉 —— 這個 repo 的長註解裡什麼字都有。
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const specs = CONFIG_DOC_SPECS_FOR_NAV;
    expect(specs.length).toBeGreaterThan(10);
    for (const s of specs) {
      // 行為層（真的函式，不是掃字串）：沒有 session 時這一頁的儲存一律 401，
      // 所以它必須被 gate，否則登出的操作者會填完整張表才發現沒得存。
      expect(pageRequiresSession(s.page as Page), `${s.title} 沒有 session-gate`).toBe(true);
      // 原始碼層（誠實地說：這是掃描，不是行為 —— 它擋得住「忘了接線」，
      // 擋不住 rollup 把它 dead-fold 掉；後者只有真的 vite build 證明得了）。
      expect(app, `${s.title} 的導覽列沒有那一列，操作者點不到這一頁`).toContain(
        `page: "${s.page}", label:`,
      );
    }
  });

  it("豁免表的每一列都寫得出「為什麼」與「什麼時候該失效」", () => {
    cover(TAG);
    for (const e of CONFIG_DOC_EXEMPTIONS) {
      expect(e.why.length, `${e.docId} 的 why 太短 —— 三個月後沒有人知道它還算不算數`).toBeGreaterThan(
        30,
      );
      expect(HAS_CJK.test(e.why), `${e.docId} 的 why 不是中文`).toBe(true);
      // ⚠️ 沒有到期條件的豁免是永久的，而永久的豁免等於把那份文件從稽核範圍刪掉。
      expect(e.expiresWhen.length, `${e.docId} 沒有寫到期條件`).toBeGreaterThan(15);
      expect(HAS_CJK.test(e.expiresWhen), `${e.docId} 的到期條件不是中文`).toBe(true);
      expect(e.why).not.toBe(e.expiresWhen);
    }
    // 一份文件只能有一列。
    const ids = CONFIG_DOC_EXEMPTIONS.map((e) => e.docId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("豁免表不會自己長大 —— 列數與每一類的列數都釘死", () => {
    cover(TAG);
    // ⚠️ 改這幾個數字是一個**決定**，不是順手。加一列的人必須在這裡留下痕跡，
    // 而 code review 看得到這一行的 diff。
    expect(CONFIG_DOC_EXEMPTIONS).toHaveLength(24);
    // 2026-08-17：13 → 14。`roster`（英雄上下架）**往下走了一格** —— 它從
    // KNOWN_GAP 變成 OWN_PAGE，因為 ui/RosterPage.tsx 做出來了。⚠️ 這是這張表
    // 唯一「健康」的移動方向：帳單被付掉，而總列數不變。
    expect(byKind("OWN_PAGE")).toHaveLength(14);
    expect(byKind("NOT_TUNABLE")).toHaveLength(3);
    // 2026-08-02：2 → 5。新增的三列是 lobby-layout / valhalla-sandbox /
    // victory-podium —— 三份文件與 Zod 都接完了,只差客戶端還在讀寫死的常數。
    // 2026-08-03：5 → 4。victory-podium **往下走了一格**:客戶端接上了消費端,
    // 於是它從「做了一半」變成一頁真的後台（VICTORY_PODIUM_SPEC）。
    // ⚠️ 這個數字往上長 = 「做了一半」的份數變多,所以它必須是一個看得見的 diff。
    expect(byKind("DEFERRED")).toHaveLength(4);
    // ⚠️ KNOWN_GAP 是**帳單**：audio-map（混音表）、origin-routes（出身×路線文案）
    // 與 per-level-bonus（record 型欄位，通用引擎走不動）。這個數字往上長就是欠債
    // 變多，而它變多的那一刻要有人按下同意。
    // 2026-08-17：4 → 3。`roster` 那一列的到期條件是「那一頁做出來的那一天」，
    // 而 ui/RosterPage.tsx 做出來了 —— 它移到 OWN_PAGE，不是被免掉。
    // 2026-08-12：2 → 3。origin-routes 是 owner 指名的「新英雄轉生設計」那一頁的
    // 資料基礎 —— 110 個文案葉節點，通用長表單畫出來不叫可調。那一頁做出來時
    // 這一列會被守衛強迫刪掉。
    // 2026-08-13：3 → 4。per-level-bonus 的 `perLevel` 是 `z.record`（鍵不固定），
    // 通用引擎走不動 —— 它列不出「有哪些鍵」，畫出來會是一頁空的。這是引擎的
    // 缺口不是這份文件的特權，⛔ 所以它記在帳單裡而不是 NOT_TUNABLE。
    expect(byKind("KNOWN_GAP").map((e) => e.docId)).toEqual([
      "per-level-bonus",
      "audio-map",
      "origin-routes",
    ]);
  });

  it("OWN_PAGE 那一族：路由真的存在且 session-gated，docId 常數真的指向那份文件", () => {
    cover(TAG);
    const own = byKind("OWN_PAGE");
    for (const e of own) {
      expect(e.page, `${e.docId} 是 OWN_PAGE 但沒寫路由 key`).toBeTypeOf("string");
      // 行為層：`pageRequiresSession` 是真的被匯出的函式，直接問它。少了這一格，
      // loopback 免登入模式會把一個完全可以編輯的表單畫給沒有 session 的操作者。
      expect(pageRequiresSession(e.page as Page), `${e.docId} 的頁沒有 session-gate`).toBe(true);
      if (e.docIdConstant !== undefined) {
        expect(e.docIdConstant, `${e.docId} 的模組常數指到別份文件了`).toBe(e.docId);
      }
    }
    // 對照組：一個刻意不 gate 的頁面。少了它，上面那條在「函式永遠回 true」的
    // 實作下也會過（失敗形態 ④）。
    expect(pageRequiresSession("hub")).toBe(false);
    // ⚠️ 唯一沒有 docId 常數的是 combat-env，而那是**有理由**的（它寫平台的表，
    // 不寫 content overlay）。寫死這一條，是為了讓下一個「忘了填常數」的人紅。
    expect(own.filter((e) => e.docIdConstant === undefined).map((e) => e.docId)).toEqual([
      "combat-env",
    ]);
  });

  it("NOT_TUNABLE 那一族：出貨文件裡真的有它宣稱的出處欄位", () => {
    cover(TAG);
    const rows = byKind("NOT_TUNABLE");
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      expect(e.provenanceKey, `${e.docId} 是 NOT_TUNABLE 但沒指出出處欄位`).toBeTypeOf("string");
      const doc = JSON.parse(readFileSync(join(CONFIG_DIR, `${e.docId}.json`), "utf8")) as unknown;
      // 「它記的是查到什麼，不是我們想要什麼」的機器可驗版本 —— 那個欄位消失時，
      // 這一列的理由也就消失了。
      expect(
        hasKeyDeep(doc, e.provenanceKey!),
        `${e.docId} 裡找不到 ${e.provenanceKey} —— 這一列的理由不成立了`,
      ).toBe(true);
    }
    // 反向對照：一份**參數表**（不是台帳）不該有這種欄位，否則上面那條會被
    // 「任何文件都有隨便一個鍵」滿足。
    const itemCard = JSON.parse(readFileSync(join(CONFIG_DIR, "item-card.json"), "utf8")) as unknown;
    expect(hasKeyDeep(itemCard, "provenance")).toBe(false);
    expect(hasKeyDeep(itemCard, "source")).toBe(false);
  });

  it("round-grade 的豁免會自己到期：roundGradeFromDoc 目前 0 個 production 呼叫端", () => {
    cover(TAG);
    const row = CONFIG_DOC_EXEMPTIONS.find((e) => e.docId === "round-grade")!;
    expect(row.kind).toBe("DEFERRED");
    expect(row.issue).toContain("232");
    // ⚠️ 這就是這一列的到期條件本人：GH#232 落地那天呼叫端出現，這一條紅，
    // 有人被迫回來把豁免刪掉並補一頁。註解做不到這件事。
    expect(
      // ⚠️ 排除的兩個檔案：它自己的宣告，以及**這條守衛自己的豁免表**（那張表在
      // 字串裡寫著「roundGradeFromDoc 沒有呼叫端」，數到自己的文書作業就永遠不綠）。
      productionCallSites(REPO, "roundGradeFromDoc", [
        "sim/stats/roundGrade.ts",
        "admin/src/configDocCoverage.ts",
      ]),
      "roundGradeFromDoc 有 production 呼叫端了 —— round-grade 的豁免已到期，去補那一頁",
    ).toBe(0);
    // 對照組：一個**確實有** production 呼叫端的符號（ContentDb.load 每次開機都
    // 呼叫）。少了它，上面那條對「掃描器永遠回 0」的壞實作也會過。
    expect(
      productionCallSites(REPO, "applyItemCardDoc", ["ui/components/itemCardTheme.ts"]),
    ).toBeGreaterThan(0);
  });

  it("2026-08-02 收尾剩下的兩列 DEFERRED 也會自己到期：兩個 resolver 目前 0 個 production 呼叫端", () => {
    cover(TAG);
    // ⚠️ 這一條就是那幾列豁免的到期條件本人。文件的 Zod / union / 出貨值都
    // 接完了,唯一缺的是「客戶端改讀文件而不是讀寫死的常數」。那一天到了,對應的
    // resolver 會出現第一個呼叫端,這裡變成 1,守衛紅 —— 有人被迫回來刪掉豁免、
    // 註冊一個 ConfigDocSpec。註解做不到這件事（第三守則）。
    //
    // ⚠️ **這件事在 2026-08-03 真的發生過一次**,而且這條守衛就是那樣被觸發的:
    // `victory-podium` 原本是第三列,`RoundWinnerStage.victoryPodiumPolicy()` 接上
    // 之後呼叫端從 0 變成 1 → 這裡紅 → `VICTORY_PODIUM_SPEC` 進了 configForms.ts、
    // Page union / session 表 / 導覽列各補一列、豁免那一列被刪掉。它現在的守衛換成
    // 上面那兩條（「每一份文件都有去向」＋「走通用引擎的每一頁都到得了」），
    // 所以它從這張清單上消失**不是**失去覆蓋。
    //
    // 排除的路徑一律是「宣告本人」＋「這條守衛自己的文書作業」：豁免表在字串裡
    // 寫著這些名字,數到自己的文書作業就永遠不會綠（round-grade 那一列踩過）。
    const PENDING = [
      { docId: "lobby-layout", symbol: "resolveLobbyLayout", decl: "content/schema/config.ts" },
      {
        docId: "valhalla-sandbox",
        symbol: "resolveValhallaSandbox",
        decl: "content/schema/config.ts",
      },
    ] as const;
    for (const p of PENDING) {
      const row = CONFIG_DOC_EXEMPTIONS.find((e) => e.docId === p.docId);
      expect(row, `${p.docId} 不在豁免表上 —— 這條到期條件沒有東西可以綁`).toBeTruthy();
      expect(row!.kind).toBe("DEFERRED");
      expect(
        productionCallSites(REPO, p.symbol, [p.decl, "admin/src/configDocCoverage.ts"]),
        `${p.symbol} 有 production 呼叫端了 —— ${p.docId} 的豁免已到期。` +
          `去 configForms.ts 註冊一份 ConfigDocSpec（照 VICTORY_FX_SPEC 抄）、` +
          `補 store.ts 的 Page union 與 session 表、App.tsx 的導覽列一列,然後刪掉這一列豁免。`,
      ).toBe(0);
    }
    // 對照組同上：一個確實有 production 呼叫端的 resolver。少了它,上面那幾條對
    // 「掃描器永遠回 0」的壞實作也會全過（失敗形態 ④）。
    expect(
      productionCallSites(REPO, "resolveVictoryFx", ["content/schema/config.ts"]),
    ).toBeGreaterThan(0);
  });
});

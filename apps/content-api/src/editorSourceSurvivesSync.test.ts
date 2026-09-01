/**
 * ⭐⭐ P0-1 §5 —— **改動經 `skills:sync` 之後仍然存在**，而 Owner 文案的位元組不被改寫。
 *
 * ── ⛔ 為什麼這條是承重的 ──────────────────────────────────────────────────
 * 整個 source adapter 存在的理由只有一句：**直接寫產物會被下一次 sync 打回來**。
 * ⇒ ⭐ 如果走了來源那條路**還是**會被打回來，這一整套就沒有意義。
 * ⚠️ 而「它會不會被打回來」⛔ 不是讀程式碼看得出來的 —— ⭐ 要真的跑一次。
 *
 * ⚠️ ⭐ 這一支跑**真的產生器**（`skillremake:json` ＋ 三支會就地改同一批檔的正規化器）。
 * ⛔ 它刻意**不**跑整條 `skills:sync`（那是 40 支、十幾分鐘）——
 * ⭐ 而挑的這三支正是**戶籍表說會寫同一批檔**的那幾支：
 *   `tiers:apply` · `castderive:build:raw` · `skillremake:provenance`
 * ⇒ 會覆蓋它的就是它們，⛔ 其餘 37 支碰不到 `content/abilities/godie-e00s.*`。
 *
 * ── ⛔⛔ 2026-09-02 量到的：**不是每一格都會原樣存活，而那是對的** ──────────
 * 第一版這條測試改的是 `cooldown`（`[90,90,90] → [77,77,77]`），⭐ 而它紅了 ——
 * 回來仍是 **90**。⛔ 根因不是接縫壞掉：`tierize()` 是「值 → 級別 → 值」，
 * 而 **77 與 90 落在同一個級距（大）** ⇒ 兩者都解析回 90。
 * ⭐ 那正是第〇·四守則要的行為（值在載入時從共用表解析）。
 *
 * ⇒ ⭐ 所以這一支現在驗**兩個方向**（⛔ 單邊校準的尺會在最需要說話時沉默）：
 *   ① 非級距欄位（`effects[0].scatterRadius`）⇒ **原樣存活**
 *   ② 級距欄位（`cooldown`）⇒ **被解析回級距值**，而契約有宣告它
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把改動直接寫進**產物**（⛔ 不走來源）再跑同一串 → 🔴（改動被打回來）
 *
 * ⚠️⚠️ **⛔ 不要在別的 lane 在跑的時候跑這一支** —— 它真的改
 * `tools/skill-remake/heroes/godie-e00s.py`、真的跑產生器、真的解鎖隔離區。
 * ⭐ 而且 ⛔ **不要 kill 它**：`finally` 還沒跑完，來源會停在被改過的狀態。
 */
import { describe, it, expect } from "vitest";
import { withSourceLock } from "./testSourceLock";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { NORMALIZER_OWNED_FIELDS } from "@ggd/shared/content/import/editorSource";

const REPO = resolve(__dirname, "../../..");
const SRC = resolve(REPO, "tools/skill-remake/heroes/godie-e00s.py");
const PRODUCT = resolve(REPO, "content/abilities/godie-e00s.r.json");

/** ⭐ 會寫到 `content/abilities/godie-e00s.*` 的每一支（來自出貨戶籍表）。 */
const OVERWRITERS = [
  "bash scripts/genrun.sh skillremake:json",
  "bash scripts/genrun.sh tiers:apply",
  "bash scripts/genrun.sh skillremake:provenance",
];

interface Product {
  readonly cooldown: number[];
  readonly description: string;
  readonly effects: { scatterRadius?: number }[];
}
function read(): Product {
  return JSON.parse(readFileSync(PRODUCT, "utf8")) as Product;
}

function run(cmd: string): void {
  const p = cmd.split(" ");
  execFileSync(p[0]!, p.slice(1), {
    cwd: REPO,
    stdio: "pipe",
    timeout: 10 * 60_000,
    // ⛔⛔ `GGD_RECONCILE_OFF=1` —— ⭐ 理由是**具體的**，⛔ 不是「它很吵」：
    //   `genrun.sh` 的執行期對帳把「這一支跑的期間**檔案系統上變動的每一份**」
    //   歸給那一支。⚠️ 而這條測試在 vitest 裡跑 —— 同一個 repo 上任何**別的**東西
    //   （帳本追加、另一條 lane、編輯器存檔）在那幾分鐘裡寫了檔，就會被算到
    //   `skillremake:json` 頭上 ⇒ ⭐ 這條守衛會用**別人的**錯誤紅掉，
    //   而它要驗的東西（來源改動撐不撐得過重生成）根本沒被量到。
    //   ⚠️ 實測 2026-09-02：它把 `docs/_daily/2026-09-02.md` 算給了 skillremake:json。
    // ⚠️ ⛔ 這**不是**把對帳關掉：`pnpm skills:sync` 與 `ship:check` 上它照跑。
    env: { ...process.env, GGD_RECONCILE_OFF: "1" },
  });
}

describe("P0-1 §5 來源改動撐得過 sync", () => {
  it(
    "★★ ⭐ 改**來源**的一個非級距欄位 ⇒ 重生成 ⇒ 三支正規化器跑完，那個值**還在**",
    async () =>
      // ⭐ 與 `editorSourceRoutes.test.ts` 共用一把鎖 —— 兩支寫**同一個真實檔**。
      withSourceLock(() => {
      const srcBefore = readFileSync(SRC, "utf8");
      const before = JSON.parse(readFileSync(PRODUCT, "utf8")) as Product;
      // ⭐ 錨點挑**非級距**欄位：`scatterRadius` 是 effect 的原始參數，
      //   ⛔ 不歸任何一張級距表 ⇒ 它是「來源改動存不存活」的**乾淨**儀器。
      // ⚠️ ⛔ 不可以拿 `cooldown` 當錨點（第一版就是這樣紅的）——見下面那一條。
      const anchor = /"scatterRadius": 6\.0/;
      expect(
        anchor.test(srcBefore),
        "夾具錨點對不上 —— 來源改過了，先更新這條測試",
      ).toBe(true);
      expect(
        before.effects[0]?.scatterRadius,
        "儀器：改之前不是 6.0 ⇒ 下面量的是空氣",
      ).toBe(6.0);
      try {
        writeFileSync(
          SRC,
          srcBefore.replace(anchor, '"scatterRadius": 5.25'),
          "utf8",
        );
        for (const cmd of OVERWRITERS) run(cmd);
        const after = JSON.parse(readFileSync(PRODUCT, "utf8")) as Product;

        // ── ① ⭐ 承重的那一條：**非級距欄位原樣存活** ──────────────────────────
        expect(
          after.effects[0]?.scatterRadius,
          "⛔⛔ 改了**來源**、跑完重生成與三支正規化器之後，那個值**不見了** ⇒\n" +
            "⭐ source adapter 這一整套沒有意義（它存在的唯一理由就是「不會被打回來」）。",
        ).toBe(5.25);

        // ── ② ⭐⭐ 而**級距欄位不會**原樣存活 —— ⛔ 這不是缺陷，是第〇·四守則 ──────
        //   ⚠️ 這一條就是 `NORMALIZER_OWNED_FIELDS` 的**量測依據**：
        //     `tierize()` 是「值 → 級別 → 值」⇒ 來源寫什麼，回來的都是**級距表**的值。
        //   ⛔ 少了這條斷言，那份清單就只是一句散文（而散文會過期）。
        expect(
          after.cooldown,
          "⛔ 級距欄位竟然原樣存活了 ⇒ `tierize()` 沒有跑，⭐ 而 `normalizedFields` 這一格" +
            "正在對編輯器說謊（它宣稱這幾格會被下游改寫）。",
        ).toEqual(before.cooldown);
      } finally {
        writeFileSync(SRC, srcBefore, "utf8");
        for (const cmd of OVERWRITERS) run(cmd);
      }
      // ⭐ 還原之後也要驗**真的還原了** —— ⛔ 一條會留下殘留的測試比沒有測試更糟。
      const restored = JSON.parse(readFileSync(PRODUCT, "utf8")) as Product;
      expect(restored.effects[0]?.scatterRadius).toBe(6.0);
      expect(restored.cooldown).toEqual(before.cooldown);
      }),
    15 * 60_000,
  );

  it("★ ⭐ Owner 文案的**位元組**不被 JSON round-trip 改寫", () => {
    const doc = JSON.parse(readFileSync(PRODUCT, "utf8")) as {
      description: string;
    };
    // ⭐ 這一段裡有 owner 的口語、全形括號、換行與 emoji-free 中文標點 ——
    //   ⛔ 一個「順手正規化」的 round-trip 會把它們改掉，而卡面上看不出來。
    const raw = readFileSync(PRODUCT, "utf8");
    // ⭐ 驗的是**文字欄位的位元組**在 parse→stringify 之後逐字不變 ——
    //   ⛔ 不是整份檔的縮排（那是產生器的格式，與 owner 文案是兩件事）。
    const round = (
      JSON.parse(JSON.stringify(JSON.parse(raw))) as { description: string }
    ).description;
    expect(
      round,
      "⛔⛔ 一次 JSON round-trip 就改掉了 owner 的文案位元組 ⇒\n" +
        "⭐ 而 owner 的原文在同一 revision 內是 immutable 的（規格 §3.5）：" +
        "不縮寫、不潤飾、不刪除幽默內容。",
    ).toBe(doc.description);
    // ⭐ 而 `\u` 逃逸也算改寫：中文與全形標點必須以**原字元**存在檔案裡。
    expect(
      raw.includes("\\u"),
      "⛔ 產物裡有 `\\u` 逃逸 ⇒ owner 的中文被轉義了（讀起來一樣，位元組不一樣）",
    ).toBe(false);
    // ⭐ 逐字驗那句台詞還在（⛔ 不是「長度差不多」）。
    expect(doc.description).toContain(
      "「想到以前某個夜晚一隻大貓跟兩個蘿莉一直要我下面長大呢」",
    );
  });
});

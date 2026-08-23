/**
 * ⭐【Codex 合約散文裡的**數字**，必須等於出貨設定】
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼指紋那一條擋不住這個
 * ─────────────────────────────────────────────────────────────────────────────
 * `codexContractFresh.test.ts` 對帳的是**能力指紋**（effect kinds / hook events /
 * 模板家族）。它守得很好，⛔ 但它看不到散文表格裡的數字 —— 那些數字讀的是
 * `config.*`，跟能力清單完全無關。
 *
 * 2026-08-16 實測，同一份文件裡**四處在說謊**，而全套測試是綠的：
 *
 * | 文件寫 | 實際 | 差在哪 |
 * |---|---|---|
 * | 攻擊距離五格 `1.5 / 3 / 5 / 7 / 10` | 近戰 1.2–2.0、遠程 6–12 | **結構都變了**（一把尺→兩把） |
 * | 移動速度上限 `14` | **18** | owner 08-15 重新設計過 |
 * | `manaRegen` 倍率 `16` | **8.0** | 調過沒人回來改文件 |
 * | `damageDealt` 倍率 `0.5` | **1.0** | 同上 |
 *
 * ⛔ 而這份文件的第一句話就是「給**外部**技能模板編輯器」。
 * 對方照著 `1.5 / 3 / 5 / 7 / 10` 去設計一支「射程極大」的技能，
 * 會做出一個在引擎裡完全不是那個量級的東西 —— 而且**沒有任何一步會報錯**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這條測試自己也改過一次形狀，而那一次比修數字重要
 * ─────────────────────────────────────────────────────────────────────────────
 * 第一版是**解析散文表格**再逐格比對。它會紅，所以比沒有好 ——
 * ⛔ 但它守的是「手打的數字現在剛好是對的」，⚠️ 下一個人照樣要手打，
 * 只是這次會被罵。而且它自己就踩了一個真 bug：這份文件裡「小/中/大/極大」
 * **同時**是射程級距、AoE 範圍級距與魔耗倍率的列名，第一版把 AoE 那張表的
 * 「小 = 約打到 5 人」讀成射程的「小 = 5」。
 *
 * ⇒ owner 2026-08-16「do it」：三張表改成**產生的**（標記區塊），
 * 這條測試跟著降級成 `skillRemakeDocsFresh` 的形狀 —— 真的把產生器用
 * `--check` 跑起來（唯讀、回非零），⛔ 不是掃原始碼字串（失敗形態⑥）。
 *
 * ⚠️ 它紅了**不要改這條測試**，跑：
 *     pnpm contract:numbers
 * 然後把那份文件一起 commit。
 *
 * 突變紀錄（跑過）：
 *   · 把 `combat-env.json` 的 `manaRegen` 改成 99 → 紅（`--check` 回 1 並列出哪幾個區塊 stale）
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { BAND_MEANING, NORMAL_BANDS } from "../content/statNormalization";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = join(REPO, "tools/editor-contract/gen_contract_numbers.py");
const DOC = join(REPO, "docs/技能編輯器引擎須知 20260811.md");

describe("Codex 合約散文裡的數字", () => {
  it("🔴 三張數字表與 content/config/ 一致（真的跑 --check，⛔ 不是掃字串）", () => {
    cover("codex-contract-numbers");
    expect(existsSync(GEN), `${GEN} 不存在`).toBe(true);
    // ⛔ 失敗時把產生器自己的訊息原樣拋出來 —— 它會指名哪一個區塊 stale。
    try {
      execFileSync("python3", [GEN, "--check"], { cwd: REPO, encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      throw new Error(
        `合約文件的數字表過期了 —— 跑 \`pnpm contract:numbers\` 然後 commit 那份文件。\n` +
          `${err.stderr ?? ""}${err.stdout ?? ""}`,
      );
    }
  });

  it("⛔ 產生器與引擎的級距語意是同一組字（它是第二個住處）", () => {
    cover("codex-contract-numbers");
    // ⚠️ python 產生器讀不到 TS 常數，所以「極小=缺陷…」在它裡面抄了一份。
    //    ⛔ 抄一份就是第二個住處 —— 這一條就是它的守衛。
    const py = readFileSync(join(REPO, "tools/editor-contract/gen_contract_numbers.py"), "utf8");
    for (const band of NORMAL_BANDS) {
      expect(`${band}=${py.includes(`"${band}": "${BAND_MEANING[band]}"`)}`).toBe(`${band}=true`);
    }
  });

  it("⛔ 七個標記區塊都還在 —— 有人把它們刪掉就等於把表變回手打的", () => {
    cover("codex-contract-numbers");
    // ⚠️ 少了這一條，「刪掉標記 + 手打一張表」會讓上面那條**永遠綠**：
    //   `splice()` 找不到標記時是把區塊**附加在檔尾**，而 --check 只比對
    //   「產生器的輸出 == 檔案現況」。附加之後兩者一致，於是文件中段那張
    //   手打的假表沒有任何人在看（失敗形態③：可以刪掉而測試全綠）。
    const doc = readFileSync(DOC, "utf8");
    // ⭐ `contract-effects`（GH#380）：那一段的小標從 2026-08 起寫著「37 個 effect kind」
    //    而引擎是 39，⛔ 而它不在任何產生區塊裡，所以沒有東西會紅。手改成 39 只會把
    //    過期往後推一次 —— 現在標題裡的數字與清單都由 `V.effect_kinds()` 產生。
    // ⭐ `contract-sharding`（GH#467）：分片之後「一件事一份檔」這條規矩要**寫給對面看**，
    //    而且那張表的份數是現場 `readdir` 數的 —— 區塊被刪掉就退回一段沒人對帳的散文。
    // ⭐ `contract-tiers`（2026-08-21）：五級距那一整節。它在此之前是**四段散文**，
    //    而四段全部過期 —— 其中一段甚至印著一個已經不存在的級別名（`超大`），
    //    照著抄產出的技能會在載入時被整份拒絕，而沒有任何東西會紅。
    // ⭐ `contract-ap-damage` / `contract-normalized`（2026-08-21）：兩節在此之前是**散文**
    //    或**根本不存在**，而散文那一半已經量到過期（`manaRegen ×16` vs 出貨 8、
    //    「攻速不在 `appliesTo`」vs 它已經在）。⛔ 標記被刪掉就退回同一個形狀。
    for (const name of ["contract-caps", "contract-ap-damage", "contract-range",
                        "contract-normalized", "contract-bands", "contract-tiers",
                        "contract-effects", "contract-sharding"]) {
      expect(`${name}:${doc.includes(`<!-- BEGIN GENERATED:${name} -->`)}`).toBe(`${name}:true`);
    }
    // ⭐⭐ GH#611 —— `contract-env`（§八「全域倍率」）**退場了**，所以這一條的方向
    //    對它是**反過來的**：它在上面那張名單裡消失還不夠，⛔ 還要有人守著它
    //    **不會被加回來**。owner 2026-08-23 逐字：「編輯器只編輯原始資料（五級距），
    //    根本不需要知道系統倍率，避免雙重編輯」。
    // ⚠️ 只把名字從名單裡刪掉 = 這一章可以被任何人默默加回來而沒有東西會紅 ——
    //    那正是這份檔頭在講的失敗形態③。
    expect(
      doc.includes("<!-- BEGIN GENERATED:contract-env -->"),
      "⛔ §八「全域倍率」被加回契約了。owner 2026-08-23：「編輯器根本不需要知道系統倍率」" +
        "⇒ 退場的機制住 `tools/editor-contract/gen_contract_numbers.py` 的 `RETIRED`，" +
        "⛔ 不是把它從 BLOCKS 拿掉（那只會把一張會過期的表變成手寫散文）。",
    ).toBe(false);
    // ⭐ GH#381 —— 同一支產生器現在也管退役告示牌上那一句「實測引擎現在有 N 個」。
    //    ⚠️ 少了這一條，把標記刪掉 + 手打一個數字會讓上面那條 `--check` **永遠綠**
    //    （`splice()` 找不到標記是附加在檔尾，於是文件中段那句手打的又沒人看了）。
    const vocab = readFileSync(join(REPO, "docs/效果標籤詞彙表v2.md"), "utf8");
    expect(`vocab-kind-count:${vocab.includes("<!-- BEGIN GENERATED:vocab-kind-count -->")}`).toBe(
      "vocab-kind-count:true",
    );
  });

  it("⭐ 契約有講**技能傷害的新公式**與**出身決定每級成長**（2026-08-21 的兩條架構裁決）", () => {
    cover("codex-contract-numbers");
    // ⚠️ 這一條補的是失敗形態③：把 `table_ap_damage()` 或 `table_growth()` 整段拿掉再
    //    重新產生一次，「產出 == 磁碟」仍然成立 ⇒ `--check` 全綠，而契約少講了**兩件會讓
    //    對面算錯每一個傷害數字**的事。⛔ 所以這裡釘的是那幾句規則本身。
    // ⛔ 一個出貨數字都不釘（第零守則）—— `rate` / 級距值住在 `content/config/`，
    //    是 owner 每週在改的東西；這裡只問「契約有沒有把**關係**講出來」。
    const doc = readFileSync(DOC, "utf8");
    const block = (name: string): string =>
      doc.slice(doc.indexOf(`<!-- BEGIN GENERATED:${name} -->`),
                doc.indexOf(`<!-- END GENERATED:${name} -->`));
    const ap = block("contract-ap-damage");
    for (const [what, phrase] of [
      ["傷害是乘出來的不是加出來的", "最終技能傷害 = 基礎傷害 × (1 + 施法者法強 ×"],
      ["`stack` 的語意：既有 AP 係數留著", "留著"],
      ["⛔ 不要預先算進卡面", "被乘兩次"],
      ["rate=0 是 rollback", "rollback"],
      ["範圍由 originInScope 判", "originInScope"],
    ] as const) {
      expect(`${what}:${ap.includes(phrase)}`).toBe(`${what}:true`);
    }
    const growth = block("contract-bands");
    for (const [what, phrase] of [
      ["三圍成長歸 0", "三圍成長已經全部歸 0"],
      ["成長是反解出來的", "反解"],
      ["初始＝個性，成長＝定位", "初始＝個性，成長＝定位"],
    ] as const) {
      expect(`${what}:${growth.includes(phrase)}`).toBe(`${what}:true`);
    }
    // ⭐ §七那一段的重點不是「有幾條」，是**「你填的會被蓋掉」這句話有沒有印出來** ——
    //    少了它，作者會去填一格填了沒有用的欄位，而沒有任何一步會報錯。
    expect(`會被蓋掉:${block("contract-normalized").includes("會被蓋掉")}`).toBe("會被蓋掉:true");
  });

  it("⭐ 五級距那一節有講**級別贏**與**卡面↔實際**換算 —— `--check` 對「整節被抽掉」是綠的", () => {
    cover("codex-contract-numbers");
    // ⚠️ 這一條在補失敗形態③：把 `table_tiers()` 裡任何一段拿掉再重新產生一次，
    //    「產出 == 磁碟」仍然成立 ⇒ `--check` 全綠而契約少講了一件會讓對面算錯的事。
    //    ⛔ 所以這裡釘的是**那幾句規則本身**，不是「有沒有第六之二節」。
    // ⛔ 一個出貨數字都不釘（第零守則）—— 級距值住在 `content/config/*-tiers.json`，
    //    它是 owner 每週在改的東西；這裡只問「契約有沒有把換算關係講出來」。
    const doc = readFileSync(DOC, "utf8");
    const body = doc.slice(
      doc.indexOf("<!-- BEGIN GENERATED:contract-tiers -->"),
      doc.indexOf("<!-- END GENERATED:contract-tiers -->"),
    );
    for (const [what, phrase] of [
      ["兩格都填誰贏", "級別贏"],
      ["原始值只是退路", "留特例"],
      ["讀 JSON 原始欄位會讀到假的值", "不一定是引擎跑的值"],
      ["卡面值", "卡面"],
      ["卡面 → 場上的那一乘", "全域倍率"],
    ] as const) {
      expect(`${what}:${body.includes(phrase)}`).toBe(`${what}:true`);
    }
  });
});

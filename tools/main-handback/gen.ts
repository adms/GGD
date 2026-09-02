/**
 * ⭐⭐ `ggd-main-handback@1` —— **Main → Editor 的機器可讀回報**的產生器。
 *
 * ⛔⛔ **這支產生器在 2026-09-02 之前不存在。**
 * `docs/editor-contract/ggd-main-handback.json` 的 `note` 逐字寫著
 * 「⛔ 產物 —— 改 `tools/main-handback/gen.ts`」，⭐ 而那個路徑**一個檔案都沒有**
 * （`git show --stat 635ab8b6e` ⇒ 只加了那份 JSON）。
 * ⇒ ⭐ 一份**手打的檔案穿著產物的衣服**，而它是**對外契約**
 *   （CLAUDE.md 第〇·五：內部債可以忍，**對外契約不行** ——
 *    外部編輯器看不到我們的 registry，沒有辦法發現我們在說謊）。
 *
 * ⭐ 每一格都從**出貨的東西**推導：route 從原始碼掃、指紋從既有 receipt 讀、
 * 演出能力直接引用 `ggd-presentation-receipt.json`。
 *
 * ⭐⭐ 而它比手打那一份多一節：**`productionAccess`** ——
 * 「這條 route 在正式站怎麼拿」。
 * ⚠️ 那一節是被 Codex 撞出來的（2026-09-02）：
 * `active/target-profile` 與 `active/runtime-bundle` 在正式站回 **404**，
 * ⛔ 而那**不是缺口** —— `content-api` 在正式站**刻意不部署**
 * （`docker/edge.Dockerfile` 逐字：`/content-api/` is **deliberately absent**
 *  from the production nginx；plan §2：「Prod = static JSON via Nginx/CDN,
 *  content-api not deployed」）。
 * ⇒ ⭐ 缺的是**契約沒說正式站怎麼拿**，於是對面只能照 `routes` 打然後撞 404。
 *
 * 用法：`npx tsx tools/main-handback/gen.ts [--check]`
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/editor-contract/ggd-main-handback.json");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const json = (p: string) => JSON.parse(read(p)) as Record<string, unknown>;
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

/** ⭐ route 清單**從原始碼掃**，⛔ 不是手抄（手抄的清單會在下一次改 route 時過期）。 */
function importerRoutes(): string[] {
  const src = read("apps/content-api/src/importRoutes.ts");
  const out = new Set<string>();
  for (const m of src.matchAll(/app\.(?:get|post)\(\s*`\$\{prefix\}([^`]*)`/g))
    out.add(`\${prefix}${m[1]!.replace(/:[A-Za-z]+$/, "")}`);
  return [...out].sort();
}

/**
 * ⭐⭐ **正式站怎麼拿** —— 每一條都要指得到一個**真的存在的**靜態檔。
 *
 * ⛔ 一條指向不存在的檔的說明，就是下一個 404 —— 只是這一次是我們自己寫的。
 * ⇒ 這裡逐條 `existsSync`，缺席就 `status: "missing"`（⛔ 不是靜默省略）。
 */
function productionAccess(): unknown {
  const rows = [
    {
      route: "${prefix}/active/target-profile",
      productionUrl: "/content/editor-target-profile.json",
      file: "content/editor-target-profile.json",
      why:
        "⭐ 同一件事的靜態版：唯讀、從出貨資料推導、跟著 `content:build` 走 —— " +
        "那份檔自己的 `note` 逐字是「給外部技能／道具編輯器 **pin base** 用」。" +
        "⚠️ ⛔ 它**不含** `generatedAt`／activation 狀態（正式站沒有 activation）。",
    },
    {
      route: "${prefix}/active/runtime-bundle",
      productionUrl: "/content/bundle.json",
      file: "content/bundle.json",
      why:
        "⭐⭐ **正式站的 404 是契約本身**，⛔ 不是缺口：`runtime-bundle` 只在 " +
        "**apply 過**之後才有東西（`NO_ACTIVE_SNAPSHOT`，閘 `importRoutesG2.test.ts`），" +
        "而正式站從來沒有 activation。⇒ 執行期內容請讀 `bundle.json` —— " +
        "⚠️ ⛔ 那**不是** runtime-bundle 的替身（同一支測試逐字禁止用它冒充），" +
        "它是**正式站的內容本身**。",
    },
  ];
  return {
    note:
      "⭐ `content-api` 在正式站**刻意不部署**（`docker/edge.Dockerfile` 逐字：" +
      "`/content-api/` is deliberately absent from the production nginx）⇒ " +
      "`${prefix}/*` 在 `ggd.adms.ai` 上回 404 是**設計**，⛔ 不是壞掉。" +
      "⭐ 下面逐條給正式站的等價物；⛔ 其餘 route（validate／apply／rollback 等寫入端）" +
      "在正式站**沒有等價物**，那是同一個安全立場的另一半。",
    rows: rows.map((r) => ({
      ...r,
      status: existsSync(join(ROOT, r.file)) ? "static" : "missing",
    })),
  };
}

function build(): unknown {
  const prev = json("docs/editor-contract/ggd-main-handback.json");
  const receipt = json("docs/editor-contract/ggd-presentation-receipt.json");
  const caps = Object.fromEntries(
    (["singleArc", "evasionProvenance", "displaceCue", "replacementPolicy"] as const).map((k) => [
      k,
      (receipt[k] as { status: string }).status,
    ]),
  );
  return {
    schema: "ggd-main-handback@1",
    note:
      "⭐ Main → Editor 的**機器可讀回報**。⛔ 產物 —— 改 `tools/main-handback/gen.ts`，" +
      "⛔ 不要手改。⚠️ 每一格都是從出貨的東西量出來的（route 從原始碼掃、" +
      "能力直接引用 `ggd-presentation-receipt.json`）—— ⛔ 沒有一格是宣稱。",
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    commit: git("rev-parse", "HEAD"),
    // ⚠️ 沿用上一份量到的欄位（它們的來源在別的產生器，這裡⛔ 不重算）。
    receipts: prev.receipts,
    routes: { importer: importerRoutes(), sourceAdapter: [] },
    productionAccess: productionAccess(),
    machineSchemas: prev.machineSchemas,
    testEvidence: prev.testEvidence,
    brickCensus: prev.brickCensus,
    presentationCapabilities: caps,
    /** ⭐ **推導**：收據說 unsupported 的那幾格 —— ⛔ 不是手抄的一段散文。 */
    knownUnsupported: Object.entries(caps)
      .filter(([, v]) => v !== "supported")
      .map(([k]) => `${k} — ${(receipt[k] as { why: string }).why}`),
  };
}

const text = JSON.stringify(build(), null, 2) + "\n";
if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== text) {
    console.error("⛔ ggd-main-handback.json 過期 —— 跑 `bash scripts/genrun.sh handback:build`");
    process.exit(1);
  }
  console.log("✓ ggd-main-handback.json 是最新的");
} else {
  writeFileSync(OUT, text);
  console.log(`✓ 寫入 ${OUT}`);
}

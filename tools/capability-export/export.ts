/**
 * 把引擎的能力清單匯出成**外部技能編輯器專案**可以直接讀的兩份檔案。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼要有這一支（而不是把 `editorCapabilities.ts` 貼過去）
 *
 * `main_load_editor_plan.md` §2.1.1 的規則是硬的：
 *
 *   「遊戲端沒有對應 capability 時必須回 `unsupported-runtime`，
 *     **不可降級成相似但不同的效果**」
 *
 * 對面**現在**就要知道引擎支援什麼，否則會做出一整批上線就是死的技能。
 * 但對面**沒有這個 repo** —— 它讀不到 TypeScript，也 import 不到
 * `EFFECT_HANDLERS`。所以能力清單必須以**檔案**的形式跨出去。
 *
 * ⚠️ 一份跨專案的清單只要能過期，它就一定會過期，而且過期的方式最貴：
 * 對面照著一份舊清單做了三十支技能，上線才發現 capability 不存在。
 * 所以這支的核心不是 export，是 `--check` —— 它讓「清單過期」變成一條**紅燈**，
 * 而不是一個發現得很晚的事實。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⛔ 刻意沒有時間戳
 *
 * 交付物裡不寫「產生於 2026-08-08」。理由是 `--check`：任何隨時鐘變動的欄位都會
 * 讓「重新產生 → 逐位元組比對」永遠不相等，於是 `--check` 只能被放寬成模糊比對，
 * 而一條被放寬的閘等於沒有閘。指紋（`fingerprint`）已經是比日期更有用的身分：
 * 它只在**引擎事實真的變了**的時候變。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ ⛔ 交付物不得夾帶只有我們看得懂的東西
 *
 * 對方看不懂我們的批次編號、交接文件路徑、部署主機。`assertNoInternalLeaks()`
 * 在寫檔前掃一遍，命中就回非零 —— 這是閘不是判準（CLAUDE.md 的元規則）。
 * 保留的內部字串只有兩類，而且兩類在 Markdown 開頭都有明文說明：
 *   · `§` 章節 → 指的是雙方共有的《main_load_editor_plan.md》
 *   · `#數字` → GGD **遊戲端**的 GitHub issue，與編輯器專案的編號無關
 *   · `packages/...` 檔案路徑 → 只作為**佐證**欄，說明本身不依賴它
 *
 * 用法：
 *   npx tsx tools/capability-export/export.ts            # 產生／更新交付物
 *   npx tsx tools/capability-export/export.ts --check    # 過期就回非零（CI 閘）
 *   npx tsx tools/capability-export/export.ts --out-dir <dir>   # 改輸出位置（測試用）
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCapabilityManifest,
  DEPRECATED_FIELDS,
  type RuntimeCapabilityManifest,
} from "../../packages/shared/src/content/editorCapabilities";
import { validateDoc } from "../../packages/shared/src/content/loader";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

/** 交付物的預設位置。⛔ 不可以放進 `content/` —— 那裡的東西會被 `content:build` 掃進 bundle。 */
export const DEFAULT_OUT_DIR = join(REPO, "docs/editor-contract");
export const JSON_NAME = "ggd-runtime-capabilities.json";
export const MD_NAME = "ggd-runtime-capabilities.md";

/**
 * ⛔ 不可以出現在交付物裡的內部字串。命中 = 匯出失敗。
 *
 * 這張表是**決策點**（哪些字算內部），所以它是一份可加減的資料而不是散在程式裡的 if。
 */
export const INTERNAL_TOKENS: readonly string[] = [
  "CLAUDE.md",
  "_execution-batches",
  "_session-handover",
  "_requirements-audit",
  "ggd.adms.ai",
  "host-deploy",
  "/private/tmp",
  "scratchpad",
  "批次",
];

export function assertNoInternalLeaks(text: string, label: string): string[] {
  return INTERNAL_TOKENS.filter((t) => text.includes(t)).map(
    (t) => `${label} 夾帶了內部字串「${t}」—— 對方看不懂它，不可以出現在交付物裡`,
  );
}

// ---------------------------------------------------------------------------
// 產生
// ---------------------------------------------------------------------------

/** JSON 交付物。鍵序由 `buildCapabilityManifest()` 固定，內容已排序過，可 hash。 */
export function renderJson(m: RuntimeCapabilityManifest): string {
  return JSON.stringify(m, null, 2) + "\n";
}

/** 表格單格：跳脫會撞爛 Markdown 表格的字元（caveat 裡真的有 `raw|mitigated|hpLost`）。 */
function cell(s: string | undefined): string {
  return (s ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

const STATE_LABEL: Record<string, string> = {
  supported: "✅ 支援",
  partial: "⚠️ 部分支援",
  unsupported: "⛔ 不支援",
};

/**
 * ⭐ #467 —— 「一個 effect 種類現在住在哪個檔」。
 *
 * 為什麼要寫進交付物：對面回報「`chainLightning` 的 `decay` 收不到 0.9」時，
 * 以前只能回「在那個 4,754 行的 union 裡」；現在指得到一個檔名。
 *
 * ⛔ 這一節**不是**一句被散文護著的宣稱 —— 兩個覆蓋率數字是**每次匯出時
 * 真的去數目錄**得到的。有人加了一個種類卻沒開檔，這裡的分母分子會自己分家，
 * 而 `effectShardWiring.test.ts` 同時會紅（它把四個方向互相釘住：
 * 兩個目錄 × 種類清單 × 處理器註冊表）。
 */
const SHARD_DIRS = {
  欄位與上下界: "packages/shared/src/content/schema/effects",
  型別: "packages/shared/src/sim/effects/variants",
} as const;

export function effectKindLayoutSection(kinds: readonly string[]): string[] {
  const rows = Object.entries(SHARD_DIRS).map(([half, dir]) => {
    const have = new Set(
      existsSync(join(REPO, dir))
        ? readdirSync(join(REPO, dir))
            .filter((f) => f.endsWith(".ts") && !f.includes(".test.") && !f.startsWith("_"))
            .map((f) => f.slice(0, -3))
        : [],
    );
    const covered = kinds.filter((k) => have.has(k)).length;
    return `| ${half} | \`${dir}/<種類>.ts\` | ${covered} / ${kinds.length} 個種類有自己的檔 |`;
  });
  return [
    "⭐ **一個種類一個檔**（#467）—— 檔名恆等於上面那張清單裡的種類名：",
    "",
    "| 種類的哪一半 | 檔案 | 覆蓋 |",
    "|---|---|---|",
    ...rows,
    "",
    "⚠️ 右欄兩個數字是**每次匯出時數出來的**，⛔ 不是寫死的宣稱。分母是這一節上方那張",
    "清單的長度；分子是那個目錄裡真的存在的檔。兩者不相等就代表有種類還沒分出去。",
    "",
  ];
}

/**
 * ⭐ #467 —— 「一次產出很多支」的交件形狀。
 *
 * ⚠️ 上面那一節回答的是「一個種類住在哪個檔」，這一節回答**對面自己**要怎麼交件。
 * 少了它，對面唯一合理的推論是「把這一輪的東西寫成一份大檔交過來」，而那正是
 * 我們這邊剛拆掉的形狀：兩份同時進行的產出互相蓋掉，⛔ 而且沒有任何錯誤訊息。
 *
 * ⛔ 這一節刻意**不數** `content/` 的檔案數：那會讓這份交付物在每一次有人新增一支
 * 技能時被重寫，而它的價值來自「指紋沒變＝引擎事實沒變」。規則是結構，不是數字。
 */
export function parallelOutputSection(): string[] {
  return [
    "## 10. ⭐ 一次產出很多支的時候 —— 一件事一份檔",
    "",
    "⚠️ **這一節在 2026-08-20 之前不存在**，而它少的不是規矩是**吞吐**：" +
      "在此之前引擎的 40 個 effect 種類住在**同一個 4,754 行的檔**，於是任何一個新機制" +
      "都要碰那一個檔，兩件同時進行的工作就在排同一個隊。第 3 節那張表就是拆完的結果。",
    "",
    "### 10.1 你交出來的每一份東西都應該是一個**新檔案**",
    "",
    "| 你要產出／修改的東西 | 一份寫在哪 |",
    "|---|---|",
    "| 一支技能 | `content/abilities/<技能 id>.json` |",
    "| 一位英雄 | `content/champions/<英雄 id>.json` |",
    "| 一件道具 | `content/items/<道具 id>.json` |",
    "| 一個 effect 種類（引擎側，要我們做） | 第 3 節那兩個目錄**各一個新檔** |",
    "",
    "⭐ 判準只有一句：**你新增的東西應該是一個新檔案。**" +
      "如果你發現自己要「打開某個既有的大檔，在中間插一段」，那就是撞車的形狀 —— " +
      "兩份同時進行的產出會互相蓋掉，而**被蓋掉的那一份不會有任何錯誤訊息**。",
    "",
    "### 10.2 ⛔ 三種檔案你一個字都不要寫",
    "",
    "　`_index.json` · `bundle.json` · `manifest.json`",
    "",
    "它們是**推導值**，由遊戲端的一支打包程式產生。規則是" +
      "「**一個產物只能有一個產生器寫**」—— 第二個寫入者不會報錯，" +
      "它只會讓兩份產物開始分岔，而分岔的那一天沒有任何東西會紅。" +
      "⇒ 你只要交出**來源文件**，索引由我們這邊重新生成。",
    "",
    "### 10.3 需要一個引擎還沒有的機制時，怎麼講",
    "",
    "⛔ 不要說「請在那個聯集裡加一個分支」—— 那一支已經不裝種類了。" +
      "✅ 請寫：**種類名 · 它解鎖哪 N 支技能 · 每支要填哪幾格**。" +
      "一個新種類對我們是**兩個新檔**（第 3 節那兩個目錄各一個），" +
      "所以「它解鎖幾支」就是這件事值不值得做的全部依據。",
    "",
  ];
}

/**
 * ⭐ 級距欄位 —— 「你讀到的 JSON 欄位不一定是引擎跑的值」。
 *
 * ⚠️ 這一節在 2026-08-21 之前不存在，而少的不是一個名字，是**一條會讓對面算錯的規則**：
 * 對面沒有我們的註冊表，它只讀得到磁碟上那份 JSON。而出貨內容裡有一整批技能同時填了
 * 「級別」與「原始值」，兩者**不相等** —— 引擎用級別，檔案上寫的是另一個數字。
 * ⛔ 照著原始欄位設計，做出來的技能會是完全不同的量級，而且**沒有任何一步會報錯**。
 *
 * ⭐ 名單是**掃出貨 schema** 得到的，⛔ 不是手寫：只要有人新增一格 `*Tier`，
 * 這一節下一次匯出就會多一個名字（而 `--check` 會先紅一次要求重新匯出）。
 * ⛔ 這一節刻意**不印數字** —— 五格各是多少是另一份文件的工作（同第 7、8 節的分工）。
 * 這裡只回答「哪些名字是級別欄位、它們的優先序是什麼」。
 *
 * ⛔ 2026-08-23：這一節原本還有第二段，講「級距表查出來的是卡面值，場上還要再乘一組
 * 全域倍率」。owner 逐字裁決把它拿掉了 —— 見 `knobValueNotRestated.test.ts` 的檔頭。
 */
const SCHEMA_ROOT = "packages/shared/src/content/schema";
/**
 * ⛔ 只掃**內容作者寫得到**的那一面。`config.ts` 刻意不在裡面 —— 它也有 `*Tier`
 * 欄位（增益卡稀有度、相稱性警告門檻），但那些是**後台欄位**，把它們算進來
 * 等於叫對面去填兩格它根本碰不到的東西（＝ 宣稱一個不存在的能力）。
 */
const AUTHORING_SCHEMA_FILES = ["ability.ts", "common.ts"] as const;

export function tierFieldNames(): string[] {
  const files = AUTHORING_SCHEMA_FILES.map((f) => join(REPO, SCHEMA_ROOT, f));
  const effects = join(REPO, SCHEMA_ROOT, "effects");
  if (existsSync(effects)) {
    for (const f of readdirSync(effects)) {
      if (f.endsWith(".ts") && !f.includes(".test.")) files.push(join(effects, f));
    }
  }
  const names = new Set<string>();
  for (const p of files) {
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, "utf8").matchAll(/^\s{2,}(\w+Tier)\s*:\s*z/gm)) {
      names.add(m[1]!);
    }
  }
  return [...names].sort();
}

export function tierRewriteSection(): string[] {
  const names = tierFieldNames();
  return [
    "## 11. 🔴 你讀到的 JSON 欄位**不一定是引擎跑的值**",
    "",
    "下面這些欄位是**級別欄位**（五格：由後台的級距表把一個級別翻成一個數字）：",
    "",
    "　" + names.map((n) => `\`${n}\``).join(" · "),
    "",
    "每一格級別欄位旁邊都有一格**原始值**（例如 `rangeTier` 旁邊是 `range`）。規則只有一句：",
    "",
    "| 一份文件裡寫了 | 引擎跑什麼 |",
    "|---|---|",
    "| 只有級別 | 級距表查出來的值 |",
    "| 只有原始值 | 文件上那個值（⭐ 這是**留特例**的唯一寫法） |",
    "| **兩個都寫** | **級別贏**。原始值被整格取代 —— ⛔ 不是相加、⛔ 不是取大 |",
    "",
    "⛔ **所以「讀原始欄位」不是一個安全的近似。** 出貨內容裡真的有技能的 `range` 與" +
      "它的 `rangeTier` 差到數倍：檔案上寫著一個很小的數字，引擎跑的是級距表上那個大的。" +
      "把原始值當成事實去設計、去排序、去算 DPS，得到的結論會是錯的，" +
      "而**沒有任何一步會報錯**。",
    "",
    "**⇒ 交件建議：能填級別就填級別，⛔ 不要兩格都填。**" +
      "兩格都填不會報錯，只會讓那份文件從此對讀它的人說謊（包括你自己下一次讀它）。",
    "",
    ...deprecatedFieldsSection(),
  ];
}

/**
 * §12 —— ⭐ **回饋管道**（GH#675 ③）：你交出來的 JSON 被拒絕時，你會拿到什麼。
 *
 * ⛔ **這一節的每一個位元組都是跑出來的，不是打出來的。** 做法是把一份**出貨的**
 * 技能文件複製一份、只弄壞一個地方，然後餵進**出貨的** {@link validateDoc} ——
 * 貼在契約上的是它真的回傳的東西。
 *
 * ⚠️ 為什麼非這樣不可：一段手抄的錯誤格式與驗證器之間**沒有任何東西**在對帳，
 * 而對方唯一能拿來寫錯誤處理的就是這一段。它一旦漂掉，Codex 會照著一個
 * 不存在的形狀去 parse，然後在**每一次**被拒絕時安靜地拿不到原因
 *（檔頭 ③ 記過的同一個病：一段被散文守著的宣稱活過了它的保存期限）。
 * 現在驗證器的訊息一改，`--check` 的逐位元組比對當場就紅。
 *
 * ⚠️ ⛔ 這裡**不印**那份基底文件的檔名／內容：對方沒有這個 repo（檔頭「必須自足」），
 * 而且印了會讓一個不相干的內容改動把契約弄 stale。四個破壞點刻意都是
 * **與基底無關**的（少一格必填、換掉 kind、打錯 enum、多一個鍵），
 * 所以換一份基底文件不會改變輸出。
 */
const REJECTION_PROBES: ReadonlyArray<{
  readonly label: string;
  readonly note: string;
  readonly breakIt: (doc: Record<string, unknown>) => void;
}> = [
  {
    label: "少一格必填欄位",
    note: "`path` 就是那一格的名字。",
    breakIt: (d) => void delete d.cooldown,
  },
  {
    label: "引擎沒有的 effect kind",
    note: "⭐ 拒絕訊息**自己列出**全部合法的 kind —— 這是第 3 節那張表的執行期版本。",
    breakIt: (d) => void (d.effects = [{ kind: "mindControl", durationSec: 3 }]),
  },
  {
    label: "enum 值打錯字",
    note: "同上：合法值就在訊息裡，⛔ 不必回頭查文件。",
    breakIt: (d) => void (d.castType = "point"),
  },
  {
    label: "多打了一個引擎不認得的鍵",
    note: "⚠️ `path` 是**空字串**＝這一層物件本身。⛔ 未知欄位不會被忽略，整份會被拒絕。",
    breakIt: (d) => void (d.manaDrain = 5),
  },
  {
    label: "數字超出上下界",
    note: "上下界住 schema，⛔ 不在這份文件裡；被拒絕時訊息會說出那個界。",
    breakIt: (d) => void (d.maxRank = 99),
  },
  {
    label: "🔴 軟參照指到不存在的東西",
    note:
      "⭐ **它回 `ok: true`。** 逐份驗證**不查參照** —— 參照是整批載入時才解的" +
      "（解不開的那一份會被隔離，理由 `dangling-ref`）。" +
      "⇒ ⛔ 一次乾淨的逐份驗證**不代表**你的 `vfxKey` / `projectileId` 指得到東西。",
    breakIt: (d) => void (d.vfxKey = "no-such-vfx-id"),
  },
];

/** 挑一份**出貨的**技能文件當基底。⛔ 它必須真的驗得過，否則整節就是在示範一個謊。 */
function rejectionBaseDoc(): Record<string, unknown> {
  const dir = join(REPO, "content/abilities");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("_")).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
    if ("vfxKey" in doc && validateDoc("abilities", doc).ok) return doc;
  }
  throw new Error(
    "⛔ content/abilities 裡找不到任何一份**驗得過又帶軟參照**的技能文件 —— " +
      "§12 的拒絕範例會變成手寫的謊。修內容或修這支的挑選條件，⛔ 不要讓它靜靜地空掉。",
  );
}

export function rejectionFormatSection(): string[] {
  const base = rejectionBaseDoc();
  const L = [
    "## 12. ⭐ 你交出來的 JSON 被拒絕時，你會拿到什麼",
    "",
    "遊戲端收件時逐份跑一次**嚴格** Zod 驗證。回傳值只有兩種形狀：",
    "",
    "```ts",
    "{ ok: true,  doc }",
    "{ ok: false, issues: Array<{ path: string; message: string; code: string }> }",
    "```",
    "",
    "- `path` —— 進到文件裡的**點路徑**（`effects.0.kind`）。**空字串 = 這一層物件本身**。",
    "- `code` —— 機器讀的分類，取自 Zod 的 issue code（`invalid_type` · `too_big` ·" +
      " `invalid_enum_value` · `unrecognized_keys` · `invalid_union_discriminator` …）。",
    "- `message` —— 給人看的英文句子。⭐ enum／discriminator 那兩類的訊息**自己列出合法值**。",
    "",
    "⛔ **`issues` 是一個陣列，不是第一個錯誤。** 一次交件請把整批都改完再送 ——" +
      "逐條修、逐條重送會讓你在同一份文件上來回很多次。",
    "",
    "下面每一筆都是把一份出貨技能文件**只弄壞一個地方**再餵進出貨驗證器，" +
      "真的跑出來的回傳值（⛔ 不是手寫的範例）：",
    "",
  ];
  for (const p of REJECTION_PROBES) {
    const doc = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    p.breakIt(doc);
    const r = validateDoc("abilities", doc);
    L.push(`### 12.${REJECTION_PROBES.indexOf(p) + 1} ${p.label}`, "", p.note, "");
    L.push("```json");
    L.push(JSON.stringify(r.ok ? { ok: true } : { ok: false, issues: r.issues }, null, 2));
    L.push("```", "");
  }
  L.push(
    "### 12.7 ⛔ 通過驗證**不等於**上得了線",
    "",
    "這一關只回答「這份 JSON 的**形狀**對不對」。它 ⛔ 不回答：" +
      "① 參照指不指得到（見 12.6）② 用到的 capability 引擎有沒有" +
      "（那是第 1、2 節的事，會回 `unsupported-runtime`）" +
      "③ 這條 modifier 在出貨設定下改不改得動任何數字。",
    "",
    "⇒ **收到 `ok: true` 之後仍然要拿第 2 節的不可使用清單自己掃一遍。**",
    "",
  );
  return L;
}

/**
 * ⭐【GH#534】**還收得下、但⛔ 不要再填的欄位**。
 *
 * ⚠️ 這一段補的是上面那張表**答不出來的問題**：通則只說「兩格都填 → 級別贏」，
 * 它沒有說「那我該填哪一個」。傷害是 owner 明說要**全部**拉成級別的一軸
 *（2026-08-22：「④ **你拉上來**」），而外部編輯器把通則讀成「隨你填」，
 * 產出的每一支技能都會帶一個改公式表時不會跟著動的死數字 ——
 * ⛔ 而且它合法、能跑、不會收到任何錯誤。
 *
 * ⭐ 內容從 {@link DEPRECATED_FIELDS} 讀，⛔ 不在這裡打字：那一份與指紋綁在一起，
 * 所以一條政策進來的那天，對方 pin 的 base 會換。
 */
export function deprecatedFieldsSection(): string[] {
  if (DEPRECATED_FIELDS.length === 0) return [];
  const L = [
    "### 11.1 ⛔ 這幾格**還收得下，但不要再填**",
    "",
    "⚠️ 它們**不是** `unsupported`：Zod 收得下、引擎跑得動、你不會收到任何錯誤。" +
      "問題是它們是同一個值的**第二個住處** —— 我們改一次公式表，" +
      "填了級別的全庫跟著動，填了字面值的那幾支不動。",
    "",
    "| 欄位 | 哪一層 | 改填 | 票 |",
    "|---|---|---|---|",
    ...DEPRECATED_FIELDS.map(
      (d) => `| \`${d.field}\` | ${d.where} | \`${d.useInstead}\` | ${d.issue} |`,
    ),
    "",
  ];
  for (const d of DEPRECATED_FIELDS) {
    L.push(`**\`${d.field}\` → \`${d.useInstead}\`**：${d.why}`, "");
    L.push("　⭐ 仍然可以填字面值的例外**判準**（⛔ 不是名單）：");
    for (const e of d.exceptions) L.push(`　· ${e}`);
    L.push("");
  }
  L.push(
    "⛔ **例外要帶一個能被反駁的理由** ——「還沒收」不算理由。" +
      "被豁免的**節點名單**不在這份契約裡（它會動，而這份契約是逐位元組比對的）；" +
      "判準在上面，名單在遊戲端的豁免表。",
    "",
  );
  return L;
}

/** 人看的交付物。⭐ 必須自足 —— 對方沒有這個 repo。 */
export function renderMarkdown(m: RuntimeCapabilityManifest): string {
  const L: string[] = [];
  L.push(`# GGD 遊戲端執行期能力清單（\`${m.schema}\`）`);
  L.push("");
  L.push(`**指紋 \`${m.fingerprint}\`** —— 編輯器用它 pin base。指紋只在引擎事實真的改變時才會變。`);
  L.push("");
  L.push("## 這份文件是什麼");
  L.push("");
  L.push(
    "它回答**一個**問題：GGD 遊戲端的執行期引擎現在做得到哪些事。" +
      "每一格都從**出貨的註冊表推導**（effect 處理器表、Zod 的 hook 事件列舉、模板展開器本人），不是手打的清單。",
  );
  L.push("");
  L.push(
    "⛔ **最重要的規則**：遊戲端沒有對應 capability 時會回 `unsupported-runtime`，" +
      "**不會降級成相似但不同的效果**。所以編輯器不可以產出用到「不支援」清單裡任何一項的內容 —— " +
      "產出了也不會上線，只會被拒絕。",
  );
  L.push("");
  L.push("讀法上的三個約定：");
  L.push("");
  L.push("- `§` 開頭的章節編號指的是雙方共有的計畫文件《main_load_editor_plan.md》。");
  L.push("- `#` 加數字是 **GGD 遊戲端的 GitHub issue 編號**，跟編輯器專案自己的編號無關。");
  L.push(
    "- 「佐證」欄是 GGD repo 裡的檔案路徑，只用來讓我們自己被查核；" +
      "**說明欄本身已經自足**，不需要那個 repo 也讀得懂。",
  );
  L.push("");
  L.push("## 1. 計畫點名的 capability 逐筆狀態");
  L.push("");
  L.push("狀態有三種：✅ 現在就做得到 · ⚠️ 主要路徑可用但有明講的限制 · ⛔ 做不到。");
  L.push("");
  L.push("| 能力 | 狀態 | 出處章節 | 說明（限制／為什麼還沒有） | 佐證 |");
  L.push("|---|---|---|---|---|");
  for (const p of m.planned) {
    L.push(
      `| \`${p.key}\` | ${STATE_LABEL[p.state] ?? p.state} | ${cell(p.plan)} | ` +
        `${cell(p.caveat ?? p.reason)} | ${cell(p.evidence)} |`,
    );
  }
  L.push("");
  L.push("## 2. ⛔ 不可使用清單");
  L.push("");
  L.push("編輯器產出的內容只要用到下列任何一項，遊戲端就會回 `unsupported-runtime`：");
  L.push("");
  for (const k of m.unsupported) L.push(`- \`${k}\``);
  L.push("");
  L.push("## 3. 可以編譯到的 effect 種類");
  L.push("");
  L.push("這是引擎執行期**真的有處理器**的全部種類；不在這張表上的名稱一律會被拒絕。");
  L.push("");
  L.push(m.effectKinds.map((k) => `\`${k}\``).join(" · "));
  L.push("");
  L.push(...effectKindLayoutSection(m.effectKinds));
  L.push("## 4. 可以掛的 hook 事件");
  L.push("");
  L.push(m.hookEvents.map((k) => `\`${k}\``).join(" · "));
  L.push("");
  L.push("## 5. 可展開的技能模板家族");
  L.push("");
  L.push(
    "模板是「參數化的技能骨架」：填參數就展開成一組 effect。" +
      "下列家族已在遊戲端出貨且可展開（清單由展開器本人過濾，所以不會宣稱一個展不開的家族）。",
  );
  L.push("");
  L.push(m.templateFamilies.map((k) => `\`${k}\``).join(" · "));
  L.push("");
  L.push("## 6. 模擬器能力旗標");
  L.push("");
  L.push("| 能力 | 可用 | 限制 |");
  L.push("|---|---|---|");
  for (const k of Object.keys(m.simCapabilities)) {
    const c = m.simCapabilities[k]!;
    L.push(`| \`${k}\` | ${c.available ? "✅" : "⛔"} | ${cell(c.caveat)} |`);
  }
  L.push("");
  L.push("## 7. 特效（VFX）授權面 —— 你在哪一份 JSON 的哪一層寫得出特效參數");
  L.push("");
  L.push(
    "⚠️ **這一節在 2026-08-18 之前完全不存在**，而後果不是「少一個欄位」：" +
      "特效那一整面對編輯器是**不存在的**，所以它產不出任何一支帶特效參數的技能 —— " +
      "而且**不會收到任何錯誤**，因為它根本沒寫那些格子。" +
      "⛔ 這比「不支援」更難發現：不支援至少會被拒絕。",
  );
  L.push("");
  L.push(
    "下表的鍵是**授權的位置**（你在哪一份文件的哪一層寫它），值是那一層收得下的欄位名。" +
      "欄位名一樣是從出貨的 schema 推導的，所以不會宣稱一個引擎不認得的格子。" +
      "⚠️ 每一格的**上下界與語意**在這份清單裡看不到 —— 那是另一份文件的工作，" +
      "這裡只回答「這個名字存不存在」。",
  );
  L.push("");
  L.push("| 寫在哪 | 欄位 |");
  L.push("|---|---|");
  for (const [k, fields] of Object.entries(m.vfxSurface)) {
    L.push(`| \`${k}\` | ${fields.map((f) => `\`${f}\``).join(" · ")} |`);
  }
  L.push("");
  L.push(
    "⭐ 兩個最容易被漏掉的：`vfx@1.orient` 是**巢狀**的（只看 `vfx@1` 只看得到 `orient` " +
      "這個名字，看不到裡面的三格），而 `ability@1.vfxLayers[]` 是**每一支技能自己的覆寫**——" +
      "同一份 `vfx@1` 文件被兩支技能用，兩支可以各自放大、轉色、改仰角，⛔ 不必複製一份文件。",
  );
  L.push("");
  L.push("## 8. 文件授權面 —— 一支技能／一件道具／一個狀態**本身**寫得出什麼");
  L.push("");
  L.push(
    "⚠️ **這一節在 2026-08-18 之前完全不存在**，而它少的是最基本的一層：" +
      "第 3 節告訴你一支技能可以做出哪些**效果**，這一節才告訴你" +
      "「**這一支是指定還是範圍、射得多遠、多久放一次、耗多少魔**」。" +
      "在它之前 `castType` / `range` / `hitRadius` / `craftRole` 在整份契約裡出現 **0 次** —— " +
      "⛔ 所以照著舊契約產出的技能，那幾格一律是引擎的預設，而且**不會收到任何錯誤**。",
  );
  L.push("");
  L.push(
    "讀法和第 7 節一樣：鍵是**授權的位置**（你在哪一份 JSON 的哪一層寫它），" +
      "值是那一層收得下的欄位名，全部從出貨的 schema 推導。" +
      "⚠️ `id` 與 `schema` 是每一份文件都有的樣板欄位，不是這個面的特色。" +
      "⚠️ 每一格的**上下界與語意**看另一份文件（這裡只回答「這個名字存不存在」）。",
  );
  L.push("");
  L.push("| 寫在哪 | 欄位 |");
  L.push("|---|---|");
  for (const [k, fields] of Object.entries(m.docSurface)) {
    L.push(`| \`${k}\` | ${fields.map((f) => `\`${f}\``).join(" · ")} |`);
  }
  L.push("");
  L.push(
    "⭐ `ability@1.marks[]` 是**巢狀**的（只看 `ability@1` 只看得到 `marks` 這個名字），" +
      "而且 `item@1.marks[]` 用的是**同一份**定義 —— 一件道具給的疊層和一支技能給的疊層" +
      "寫法完全一樣。⚠️ `template@1` 是**參數化的技能骨架**（第 5 節那些家族的文件形狀），" +
      "⛔ 不是另一種技能。",
  );
  L.push("");
  L.push("## 9. 參數名 —— effect／hook／條件／靈氣各自收得下哪些格子");
  L.push("");
  L.push(
    "⚠️ **這一節在 2026-08-19 之前只存在於隨附的 JSON 裡**，人看的這一份一個字都沒印。" +
      "而 `effectFields` 的 201 個名字有 **109 個**在整份文件裡出現 0 次 —— " +
      "第 3 節告訴你有哪些 kind，卻沒有任何一節告訴你**一個 kind 裡面寫得出哪些參數**。" +
      "⛔ 同一個安靜的失敗：不會被拒絕，只是不知道那些格子存在。",
  );
  L.push("");
  L.push(
    "⚠️ 下面每一族都是**所有分支的聯集** —— 一個名字出現在這裡代表「某一個 kind／某一顆" +
      "條件葉收得下它」，⛔ 不代表每一個都收。哪一個 kind 配哪幾格、以及每一格的" +
      "上下界與語意，看另一份文件。",
  );
  L.push("");
  const NAME_FAMILIES: readonly { label: string; names: readonly string[] }[] = [
    { label: "effect 參數（所有 kind 的聯集）", names: m.effectFields },
    { label: "條件葉種類", names: m.conditionLeafKinds },
    { label: "條件葉參數", names: m.conditionLeafFields },
    { label: "hook 參數", names: m.hookFields },
    { label: "靈氣參數", names: m.auraFields },
    { label: "`ability@1` 頂層欄位", names: m.abilityFields },
  ];
  for (const f of NAME_FAMILIES) {
    L.push(`**${f.label}**（${f.names.length}）`);
    L.push("");
    L.push(f.names.map((k) => `\`${k}\``).join(" · "));
    L.push("");
  }
  L.push(...parallelOutputSection());
  L.push(...tierRewriteSection());
  L.push(...rejectionFormatSection());
  L.push("---");
  L.push("");
  L.push(
    "這份檔案由 GGD repo 的匯出工具產生，並由一條 CI 閘（`--check`）保證它跟引擎同步：" +
      "引擎改了而清單沒重新產生，建置就會紅。所以**清單過期**這件事不會靜悄悄地發生。",
  );
  L.push("");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface RunResult {
  readonly code: number;
  readonly messages: readonly string[];
}

export function run(argv: readonly string[]): RunResult {
  const check = argv.includes("--check");
  const oi = argv.indexOf("--out-dir");
  const outDir = oi >= 0 && argv[oi + 1] ? resolve(argv[oi + 1]!) : DEFAULT_OUT_DIR;

  const m = buildCapabilityManifest();
  const want: Record<string, string> = {
    [join(outDir, JSON_NAME)]: renderJson(m),
    [join(outDir, MD_NAME)]: renderMarkdown(m),
  };

  const leaks = Object.entries(want).flatMap(([p, t]) => assertNoInternalLeaks(t, p));
  if (leaks.length > 0) return { code: 2, messages: leaks };

  if (check) {
    const stale: string[] = [];
    for (const [p, text] of Object.entries(want)) {
      if (!existsSync(p)) stale.push(`缺少交付物：${p}`);
      else if (readFileSync(p, "utf8") !== text) stale.push(`交付物已過期：${p}`);
    }
    if (stale.length > 0) {
      return {
        code: 1,
        messages: [
          ...stale,
          "引擎的能力變了但清單沒重新產生。跑 `pnpm caps:export` 並把產物一起 commit。",
        ],
      };
    }
    return { code: 0, messages: [`能力清單是最新的（指紋 ${m.fingerprint}）`] };
  }

  mkdirSync(outDir, { recursive: true });
  for (const [p, text] of Object.entries(want)) writeFileSync(p, text);
  return {
    code: 0,
    messages: Object.keys(want).map((p) => `已寫入 ${p}`).concat(`指紋 ${m.fingerprint}`),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const r = run(process.argv.slice(2));
  for (const msg of r.messages) (r.code === 0 ? console.log : console.error)(msg);
  process.exit(r.code);
}

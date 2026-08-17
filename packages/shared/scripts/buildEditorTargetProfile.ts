/**
 * ⭐【`content/editor-target-profile.json`】—— 給外部編輯器的**遠端資料契約**。
 *
 * owner 2026-08-14：「正式站最好增加一份唯讀文件⋯至少包含 contentVersion /
 * schema／compiler contract 版本 / runtime capabilities / tag manifest 版本與 hash /
 * authoring rules / 英雄道具開放清單 digest / asset manifest digest /
 * 各 collection hash / 是否允許 production delta」。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 為什麼是**靜態檔**而不是端點
 * ---------------------------------------------------------------------------
 * `/capabilities` 與 `/active/target-profile` 早就有了，但它們住在 content-api，
 * 而**正式站沒有把 content-api 對外開**。編輯器在別台機器上，它拿得到的只有
 * `https://ggd.adms.ai/content/*` —— 那是 edge 直接服務的 live bind-mount。
 * ⇒ 把同一份資料寫成 `content/` 底下的檔，編輯器一個 GET 就有，零認證、零 CORS。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 這份**必須是推導的**（第〇·五守則）
 * ---------------------------------------------------------------------------
 * 同一個 repo 已經有一份手寫的能力表撒過兩次謊，而 2026-08-14 又抓到合約文件的
 * 指紋過期。對外契約說謊的代價是**對方看不到我們的 registry，沒有辦法發現**。
 * 所以：
 *   · 每一格都從出貨資料算出來，⛔ 沒有任何一個手打的常數
 *   · 跟著 `pnpm content:build` 走 —— 內容一變它就變
 *   · 守衛 `shippedEditorProfileIsCurrent.test.ts` 比對 repo 裡被 commit 的那一份
 *
 * ⚠️ 拿不到的東西一律 `null` + 在 `unavailable[]` 說明原因，
 *    ⛔ 不要填 "unknown" / 0 / "" —— 那些會被對方當成真值。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityManifest } from "../src/content/editorCapabilities";
import { buildAuthoringRules } from "../src/content/authoringRules";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const CONTENT = join(REPO, "content");

export const EDITOR_TARGET_PROFILE_SCHEMA = "ggd-editor-target-profile@1";
export const EDITOR_PROFILE_FILE = "editor-target-profile.json";
/** 包格式規格的檔名（repo 根）。⭐ 對方 pin 的是它的 digest，⛔ 不是版本標籤。 */
export const PACKAGE_SPEC_FILE = "GGD_EDITOR_PACKAGE_SPEC.md";

/** 12 hex —— 與 `manifest.json` 的 collection hash 同一種長度，讀起來一致。 */
function sha12(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function readJson<T>(p: string): T | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * `content/config/<id>.json` 的直讀器。
 *
 * ⚠️ build 腳本跑的時候 `Configs` 登錄表是空的,所以 `buildAuthoringRules()`
 * 要的來源是**磁碟上的出貨檔**而不是登錄表。⛔ 讓它自己去讀 `Configs` 會
 * 安靜地拿到全部預設值,而這份 profile 會宣稱那是出貨值。
 */
const readShippedConfig = (id: string): unknown =>
  readJson<unknown>(join(CONTENT, "config", `${id}.json`)) ?? undefined;

/** 一個 collection 底下的每一份文件（⛔ 跳過 `_` 開頭 —— 那些是索引不是 doc）。 */
function readCollection<T extends { id?: string }>(name: string): T[] {
  const dir = join(CONTENT, name);
  if (!existsSync(dir)) return [];
  const out: T[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = readJson<T>(join(dir, f));
    if (d && typeof d.id === "string") out.push(d);
  }
  return out;
}

const sortedUnique = (xs: readonly string[]): string[] => [...new Set(xs)].sort();

/**
 * ⭐【內容詞彙表】—— owner 2026-08-16：「技能對應 技能標籤 效果 機制 **特效**
 * 跟**傳說武器道具**對應 效果與特效 也是」。
 *
 * ⚠️ 這與 `runtimeCapabilities` **不重疊**，兩者回答不同的問題：
 *
 * | | `runtimeCapabilities` | 這一格 |
 * |---|---|---|
 * | 回答 | 引擎**做得到**什麼（effect kind、hook 事件、條件葉、模板家族…） | 出貨內容**實際用了**哪些值 |
 * | 來源 | 出貨註冊表（程式） | `content/` 底下的文件 |
 * | 少了它會怎樣 | 對方做出引擎不認得的機制 | 對方填一個**解析不到的 id**，技能照放但**什麼都不會出現** |
 *
 * 🔴 最尖銳的一格是 `vfx.keys`：`vfxKey` 是 423/461 支技能的特效綁定，
 * 而 `content/vfx/` 有 **632** 份文件 —— ⛔ 對方沒有辦法知道哪些是給技能用的、
 * 哪些是道具或環境用的。填錯一個 id，技能**照樣放得出來、照樣造成傷害**，
 * 只是畫面上什麼都沒有（失敗形態①：算出來但沒有畫出來）。
 */
function buildVocabulary(): Record<string, unknown> {
  type Ability = {
    id?: string;
    vfxKey?: unknown;
    sfxKey?: unknown;
    innateKind?: unknown;
    template?: { ref?: unknown };
  };
  type Item = { id?: string; tags?: unknown; craftRole?: unknown; modifiers?: unknown };
  type Template = { id?: string; family?: unknown; status?: unknown; params?: unknown };

  const abilities = readCollection<Ability>("abilities");
  const items = readCollection<Item>("items");
  const templates = readCollection<Template>("ability-templates");
  const vfxIds = new Set(readCollection<{ id?: string }>("vfx").map((v) => v.id!));

  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

  const vfxKeys = sortedUnique(abilities.map((a) => str(a.vfxKey)).filter((x): x is string => x !== null));
  const sfxKeys = sortedUnique(abilities.map((a) => str(a.sfxKey)).filter((x): x is string => x !== null));
  // ⛔ 這一格必須是**量出來的**，不是宣稱的：dangling 一旦 > 0，
  //   代表出貨內容自己就有壞掉的綁定，而對方會照著抄。
  const dangling = vfxKeys.filter((k) => !vfxIds.has(k));

  const modifierStats = sortedUnique(
    items.flatMap((i) =>
      Array.isArray(i.modifiers)
        ? (i.modifiers as { stat?: unknown }[]).map((m) => str(m?.stat)).filter((x): x is string => x !== null)
        : [],
    ),
  );
  const modifierOps = sortedUnique(
    items.flatMap((i) =>
      Array.isArray(i.modifiers)
        ? (i.modifiers as { op?: unknown }[]).map((m) => str(m?.op)).filter((x): x is string => x !== null)
        : [],
    ),
  );

  const legendary = readJson<{ entries?: { itemId?: string }[] }>(
    join(CONTENT, "loot-tables", "legendary-weapons.json"),
  );
  const legendaryIds = sortedUnique((legendary?.entries ?? []).map((e) => e.itemId ?? "").filter(Boolean));
  const itemById = new Map(items.map((i) => [i.id!, i]));

  return {
    note:
      "出貨內容**實際用了**哪些值。⚠️ 與 runtimeCapabilities 不同：那一份說引擎做得到什麼，" +
      "這一份說內容裡有哪些合法的 id。⛔ 填一個不在這裡的 vfxKey，技能照放但畫面上什麼都不會出現。",
    // ── 技能鏈：技能 → 模板 → 效果/機制 → 特效/音效 ──────────────────────
    ability: {
      count: abilities.length,
      /** 用模板組出來的支數（其餘是逐支寫的 effects）。 */
      fromTemplate: abilities.filter((a) => str(a.template?.ref) !== null).length,
      /**
       * ⭐ 模板家族 + **它們吃的參數（含型別與上下界）** ——
       * 這就是「技能 = JSON 模板組合，沒有例外」那條守則的機器可讀版。
       *
       * ⚠️ `params` 原樣帶出去（`{type, default, min, max, unit}`），⛔ 不是只給 key ——
       * 編輯器要拿它畫滑桿並在**送出前**就擋掉越界，⛔ 而不是等引擎拒收。
       * ⚠️ `status: "draft"` 的那幾支參數是空的：它們**還不能用**，
       * 編輯器應該把它們列成不可選而不是列出來讓人填。
       */
      templates: templates.map((t) => ({
        id: t.id,
        family: t.family ?? null,
        status: t.status ?? null,
        params: (t.params as Record<string, unknown>) ?? {},
      })),
      /** 各狀態各幾支 —— ⭐ 對方一眼看得出「可用的模板有幾個」。 */
      templateStatus: templates.reduce<Record<string, number>>((acc, t) => {
        const s = str(t.status) ?? "unknown";
        acc[s] = (acc[s] ?? 0) + 1;
        return acc;
      }, {}),
      /** 天生技的兩種形態。⛔ 不是 castType —— 它講的是「被動還是主動」。 */
      innateKinds: sortedUnique(abilities.map((a) => str(a.innateKind)).filter((x): x is string => x !== null)),
      effectKindsSource: "runtimeCapabilities.effectKinds（⛔ 不在這裡重複一份）",
    },
    // ── 特效鏈 ────────────────────────────────────────────────────────────
    vfx: {
      /** `content/vfx/` 的總量 —— ⚠️ 遠大於技能可用的那一群。 */
      docCount: vfxIds.size,
      /** ⭐ 技能**實際綁過**的 key。編輯器的 vfxKey 欄位應該從這裡取值。 */
      keys: vfxKeys,
      sfxKeys,
      boundAbilities: abilities.filter((a) => str(a.vfxKey) !== null).length,
      /** ⛔ 量出來的。> 0 = 出貨內容自己有壞掉的綁定，⛔ 不要照抄。 */
      danglingKeys: dangling,
    },
    // ── 道具鏈：道具 → 角色/標籤 → 效果 ─────────────────────────────────
    item: {
      count: items.length,
      craftRoles: sortedUnique(items.map((i) => str(i.craftRole)).filter((x): x is string => x !== null)),
      tags: sortedUnique(items.flatMap((i) => (Array.isArray(i.tags) ? (i.tags as unknown[]).map(str) : [])).filter((x): x is string => x !== null)),
      modifierStats,
      modifierOps,
    },
    /** ⭐ 傳說武器池 —— 抽得到的那 N 件。⚠️ 池外的 `legendary` 標籤只是分類。 */
    legendaryWeapons: {
      poolSize: legendaryIds.length,
      itemIds: legendaryIds,
      /** ⛔ 量出來的：池裡指到不存在的道具 = 那一格抽出來是空的。 */
      missingItemIds: legendaryIds.filter((id) => !itemById.has(id)),
    },
    sources: {
      ability: "content/abilities/*.json",
      templates: "content/ability-templates/*.json",
      vfx: "content/vfx/*.json",
      item: "content/items/*.json",
      legendaryWeapons: "content/loot-tables/legendary-weapons.json",
    },
  };
}

interface Unavailable {
  field: string;
  reason: string;
}

/**
 * 從出貨資料算出整份 profile。**純函式**（除了讀檔）——
 * 同樣的 `content/` → 同樣的輸出，`generatedAt` 由呼叫端給，⛔ 不看時鐘。
 */
export function buildEditorTargetProfile(opts: { generatedAt: string }): Record<string, unknown> {
  const unavailable: Unavailable[] = [];

  // ── ① contentVersion + ⑧ 各 collection hash ─────────────────────────────
  const manifest = readJson<{
    contentVersion?: string;
    collections?: Record<string, { hash?: string; count?: number }>;
  }>(join(CONTENT, "manifest.json"));
  if (manifest === null) {
    unavailable.push({
      field: "content.*",
      reason: "content/manifest.json 讀不到 —— 還沒跑過 `pnpm content:build`。",
    });
  }
  const collections: Record<string, { hash: string; count: number }> = {};
  for (const [name, c] of Object.entries(manifest?.collections ?? {})) {
    if (typeof c.hash === "string" && typeof c.count === "number") {
      collections[name] = { hash: c.hash, count: c.count };
    }
  }

  // ── ③ runtime capabilities（推導自出貨註冊表）────────────────────────────
  const caps = buildCapabilityManifest();

  // ── ④ tag manifest 版本與 hash ─────────────────────────────────────────
  //    ⭐ 除了版本與 hash，**還回報它宣稱的引擎指紋** —— 因為那份 manifest 自己
  //    寫著「指紋變了就代表引擎動過，這份清單的裁決要重跑」。⚠️ 2026-08-14 實測
  //    它記的是 `ef984bcc` 而引擎已經是 `8d30566f` ⇒ 編輯器必須看得到這件事，
  //    ⛔ 不然它會照一份過期的標籤裁決產 JSON，而沒有任何東西叫。
  const tagPath = join(REPO, "skill-tag-manifest.json");
  const tagRaw = existsSync(tagPath) ? readFileSync(tagPath, "utf8") : null;
  const tag = tagRaw === null ? null : (JSON.parse(tagRaw) as Record<string, unknown>);
  if (tag === null) {
    unavailable.push({ field: "tagManifest", reason: "skill-tag-manifest.json 不存在。" });
  }
  const tagEngine = (tag?.["engine"] ?? {}) as Record<string, unknown>;
  const declaredFp = typeof tagEngine["contractFingerprint"] === "string"
    ? (tagEngine["contractFingerprint"] as string)
    : null;

  // ── ② packageSpec 的 digest（計畫 §1.2 路障三）──────────────────────────
  const specPath = join(REPO, PACKAGE_SPEC_FILE);
  const specRaw = existsSync(specPath) ? readFileSync(specPath, "utf8") : null;
  if (specRaw === null) {
    unavailable.push({
      field: "contract.packageSpec.digest",
      reason: `${PACKAGE_SPEC_FILE} 不在 repo 根目錄 —— 對方沒有辦法 pin 包格式。`,
    });
  }

  // ── ⑥ 英雄／道具開放清單 digest ────────────────────────────────────────
  //    ⚠️ 白名單是**平台的機器狀態**（gitignore），build 機器上通常沒有 ⇒ null。
  //    ⛔ 不要拿 content 的全量名單假裝成開放清單，那是兩個不同的東西。
  const whitelist = readJson<{ champions?: string[]; items?: string[] }>(
    join(REPO, "data", "curation", "whitelist.json"),
  );
  if (whitelist === null) {
    unavailable.push({
      field: "curation.*",
      reason:
        "data/curation/whitelist.json 不在（它是平台的執行期狀態，不進版控）。" +
        "要即時的開放清單請打 GET /api/v1/curation/whitelist。",
    });
  }
  const digestOfList = (xs: string[] | undefined): string | null =>
    xs === undefined ? null : sha12(JSON.stringify([...xs].sort()));

  // ── ⑦ asset manifest digest ────────────────────────────────────────────
  const lod = readJson<unknown>(join(CONTENT, "assets", "models", "_lod.json"));
  if (lod === null) {
    unavailable.push({ field: "assetManifestDigest", reason: "assets/models/_lod.json 不存在。" });
  }

  // ── ⑨ 是否允許 production delta ────────────────────────────────────────
  //    ⛔ 硬性 false：delta 需要一個真的 authoring store base，而正式站沒有。
  //    這一行是**契約**不是設定 —— 對方最該先讀的一行（見 PACKAGE_SPEC §4.2）。
  const deltaExportAllowed = false;
  unavailable.push({
    field: "deltaExportAllowed",
    reason:
      "正式站沒有 authoring store base ⇒ 只支援 bootstrap 模式。" +
      "delta 需要一個真的 base receipt，⛔ 不可以拿 content digest 代替。",
  });

  const body = {
    schema: EDITOR_TARGET_PROFILE_SCHEMA,
    generatedAt: opts.generatedAt,
    readOnly: true,
    note:
      "唯讀。給外部技能／道具編輯器 pin base 用。每一格都從出貨資料推導，" +
      "⛔ 沒有手打的常數；跟著 pnpm content:build 走。",

    // ① + ⑧
    content: {
      contentVersion: manifest?.contentVersion ?? null,
      collections,
      collectionCount: Object.keys(collections).length,
    },

    /**
     * ⭐ GH#327 —— **哪一種雜湊說了算**（owner 2026-08-14:「請一定要檢查合法性
     * (包含 check sum & MD5 & 內容沒有 injection)」)。
     *
     * ⚠️ 這一格必須在契約裡明說,因為兩邊對「checksum」的理解不同會**安靜地**
     * 出錯:對方送 MD5、我們比 SHA-256,結果是每一包都被拒而診斷訊息看起來像
     * 格式問題。⛔ 而 MD5 對防篡改**已經沒有用** —— 碰撞可以在筆電上構造出來,
     * 所以它永遠不可以是准不准的依據。
     */
    digestPolicy: {
      /** 唯一有裁決權的雜湊。package / plan / activation digest 全部用它。 */
      authoritative: "sha-256",
      /** 正規化:先 RFC 8785 JCS,再 SHA-256。⛔ 不是對原始 bytes 直接 hash。 */
      canonicalization: "rfc8785-jcs",
      /**
       * 允許在 manifest 裡**額外**附上的雜湊,純粹當「有沒有傳壞」的快篩。
       * ⛔ 它們不參與任何 pass/fail 判斷,附了也不會讓一包更容易通過。
       */
      advisoryOnly: ["md5", "crc32"],
      /** 公開 profile 自己的短 digest 只夠偵測漂移,⛔ 不是簽章、不可當 CAS base。 */
      shortDigestIsNotASignature: true,
    },

    // ② schema / compiler contract 版本
    contract: {
      profileSchema: EDITOR_TARGET_PROFILE_SCHEMA,
      capabilitiesSchema: caps.schema,
      /**
       * ⭐ 包格式的規格 —— **digest 而不是一句散文**（計畫 §1.2 的第三個路障）。
       *
       * ⚠️ 這裡原本寫著字串 `"GGD_EDITOR_PACKAGE_SPEC.md（Draft 0.4）"`。
       * 計畫說那讓「importer 無法安全協商 exact schema／spec」—— 對的：
       * 「Draft 0.4」是一個**人讀的版本號**，而那份 md 改了一個字它也不會變。
       * 對方拿它 pin 不住任何東西。
       *
       * ⇒ 改成檔案內容的 sha12。規格改一個字 → digest 變 → 對方**看得出來**。
       */
      packageSpec: {
        file: PACKAGE_SPEC_FILE,
        digest: specRaw === null ? null : sha12(specRaw),
        bytes: specRaw === null ? null : Buffer.byteLength(specRaw, "utf8"),
        /** 人讀的版本標籤，⛔ 不可以拿它當協商依據 —— 那是 `digest` 的工作。 */
        label: "Draft 0.4",
      },
      /**
       * ⭐ 編譯器 —— **刻意是 null，而且它不會變成非 null**（owner 2026-08-15）。
       *
       * ⚠️ 這兩格以前是 null 因為「還沒做」。現在它們是 null 因為
       * **這條路上不會有編譯器** —— 見下面的 `authoringModel`：
       * 編輯器直接產 `ability@1` runtime JSON，所以沒有「創作真相 → 編譯 →
       * 比對」那一段，也就沒有東西需要指紋。
       *
       * ⛔ 不要因為「看起來比較完整」就填一個值。一個宣稱存在的編譯器合約會讓
       *    對方去實作重編比對 —— 而那是**我們這一側不會做的事**，於是他們每一包
       *    都會比對失敗，而失敗訊息看起來像格式問題。
       *
       * ⏸️ 封存的第一步在 `src/content/authoring/primitives.ts`（沒有出貨路徑）。
       *    GGD 若哪天真的變成多作者，那個檔案就是這一格變成非 null 的起點。
       */
      compiler: {
        contractVersion: null,
        fingerprint: null,
      },
    },

    // ③
    runtimeCapabilities: caps,

    // ── ③b 內容詞彙表（owner 2026-08-16「技能對應…特效…傳說武器道具」）────
    //    ⚠️ 與 ③ 不重疊：那一份說引擎做得到什麼，這一份說內容裡有哪些合法的 id。
    contentVocabulary: buildVocabulary(),

    // ④
    tagManifest: {
      schemaVersion: tag?.["schemaVersion"] ?? null,
      generated: tag?.["generated"] ?? null,
      tagCount: tag?.["tagCount"] ?? null,
      hash: tagRaw === null ? null : sha12(tagRaw),
      declaredEngineFingerprint: declaredFp,
      /**
       * ⭐ 這一格是整份文件最重要的一行之一：tag manifest 宣稱的引擎指紋
       * 跟引擎**現在**算出來的一不一樣。false ⇒ 那份標籤裁決是對舊引擎做的。
       */
      matchesEngine: declaredFp === null ? null : declaredFp === caps.fingerprint,
      /** 引擎**現在**的指紋，讓對方不必自己去別的地方查。 */
      engineFingerprint: caps.fingerprint,
      /**
       * ⭐ 對不上的時候**該怎麼辦** —— 計畫 §3.1 明列的三條，直接寫成機器讀得懂的。
       *
       * ⚠️ 這一格存在的理由：`matchesEngine: false` 是一個**事實**，而對方需要的是
       * 一個**處置**。裸露的 false 有兩種合理解讀（「整包退」還是「照做」），
       * 而它們差很多 —— 計畫的答案是「都不是」：
       *
       *   > Tag manifest 漂移**不應該封鎖所有 typed package**。`matchesEngine=false` 時：
       *   > · 禁止新增／改寫 canonical tag，或以 tag 推導 mechanics
       *   > · 仍可保留 Owner 原文與 presentation token
       *   > · 若 authoring truth 已是完整 typed mechanics，且其 required capabilities
       *   >   可獨立驗證，允許繼續做非 tag-authoring 的 staging validation
       */
      policy:
        declaredFp === null || declaredFp === caps.fingerprint
          ? {
              tagAuthoring: "allowed",
              tagDerivedMechanics: "allowed",
              typedPackages: "allowed",
              why: "標籤清單宣稱的引擎指紋與現在一致。",
            }
          : {
              // ⛔ 這份清單的裁決是對舊引擎做的，不可以拿它新增或改寫 canonical tag。
              tagAuthoring: "blocked",
              // ⛔ 更不可以用 tag 反推 mechanics —— 那是把過期的裁決當成事實。
              tagDerivedMechanics: "blocked",
              // ⭐ 但 typed package **照走** —— 漂移不應該封鎖所有東西。
              typedPackages: "allowed",
              why:
                `標籤清單宣稱 ${declaredFp}，引擎現在是 ${caps.fingerprint} —— ` +
                "那份裁決是對舊引擎做的。⭐ typed mechanics 走 capability 驗證，" +
                "不經過 tag，所以不受影響；⛔ 但 tag 本身不可以再被新增/改寫/反推。",
            },
    },

    /**
     * ⭐【authoring model】—— 編輯器該送**什麼形狀**進來（owner 2026-08-15）。
     *
     * ⚠️ `GGD_EDITOR_PACKAGE_SPEC.md` 現在寫的是四層模型（Definition → Product
     * → Chain → CompiledEffects），而那份規格是為**多作者、共享 product、跨組織
     * 協商**的世界寫的。GGD 是一個 owner、一個編輯器、一個遊戲。
     *
     * ⇒ owner 裁決：**編輯器直接產 `ability@1` / `item@1` runtime JSON**。
     *
     * | 規格原本要的 | 現在要的 | 為什麼可以砍 |
     * |---|---|---|
     * | 創作真相 + 期望編譯結果 | runtime JSON | 只有一種表示法就沒有兩個編譯器可以漂移 |
     * | 遊戲端重編 + 逐位元比對 | Zod + capability + authoring rules 驗證 | 那個比對是為了抓編譯器漂移,而漂移的前提不存在了 |
     * | Product / revision / exact ref | ⛔ 不需要 | 那是「多方共享同一段行為」的機制 |
     *
     * ⭐ **創作意圖沒有遺失**：`ability@1` 的 `template.cards` 本來就存著
     * 「哪一個模板 + 哪些參數」,所以重新打開一支技能看到的是滑桿,⛔ 不是一堆
     * 裸 effect。第〇·五守則（引擎做機制、JSON 做技能）反而被更直接地滿足。
     */
    authoringModel: {
      /** 送進來的文件形狀。 */
      accepts: ["ability@1", "item@1"],
      /** ⛔ 這些**不再**是必要的（規格四層模型的上三層）。 */
      notRequired: ["effect-template@1", "effect-product@1", "effect-chain@1", "expectedCompiled"],
      /** 驗證靠這三樣,⛔ 沒有重編比對。 */
      validatedBy: [
        "zod:collection-schema",
        "capabilities:ggd-runtime-capabilities@1",
        "authoring-rules:ggd-authoring-rules@1",
      ],
      /** ⭐ 保留模板與參數的欄位 —— 編輯器請填它,重新開啟才看得到滑桿。 */
      intentField: "template.cards",
      note:
        "owner 2026-08-15 裁決:砍掉編譯器那一層。規格 §2 的四層模型是為多作者世界寫的," +
        "GGD 只有一個作者 —— 一種表示法 + 一個驗證器 = 沒有第二個實作可以漂移。",
    },

    // ⑤ authoring rules
    authoringRules: {
      /**
       * ⭐ 定價／界限規則的端點（GH#327）。
       *
       * ⚠️ 這一格在 2026-08-14 之前是 `null`，出處指著
       * 「docs/技能編輯器引擎須知 第九章（散文，會過期）」—— 而那一章**自己**
       * 就寫著「權威是一個推導出來的端點」以及「⛔ 你抄一份到編輯器裡 =
       * 第二個住處 = 它一定會過期」。**規格寫好了，沒有人實作它。**
       *
       * ⇒ 現在它是真的：`buildAuthoringRules()` 從出貨 Zod 界 +
       *   `content/config/*.json` 推導，owner 在後台改一格，端點下一秒就變。
       */
      pricingEndpoint: "/api/v1/content-import/authoring-rules",
      pricingSource: "packages/shared/src/content/authoringRules.ts（推導，⛔ 不是散文）",
      /** ⭐ 內嵌一份，讓對方一個 GET 就拿得到（profile 本身就在 CDN 上）。 */
      rules: buildAuthoringRules(readShippedConfig),
      /** ⛔ 這幾條是 normative，見 PACKAGE_SPEC。列在這裡是為了讓對方不必翻文件。 */
      normative: [
        "新建 Product 預設 host-local；只有作者明示 Promote 才建立 shared Product",
        "shared Product 不得有 ownerHost；host-local 必須有",
        "Promote 不得原地改 scope —— 它建立新的 shared id / revision 1",
        "禁止把相同 id 的新 revision 自動套到全部使用者；未選取者繼續 pin 舊 exact ref",
        "Product params 一律 strict-validate；unknown / missing / 越界 / 無效 ref 全拒",
        "所有輸出 path 必須在 outputContract 與 hostKinds 的 allowlist，未知一律拒絕",
      ],
    },

    // ⑥
    curation: {
      championDigest: digestOfList(whitelist?.champions),
      itemDigest: digestOfList(whitelist?.items),
      championCount: whitelist?.champions?.length ?? null,
      itemCount: whitelist?.items?.length ?? null,
      liveEndpoint: "/api/v1/curation/whitelist",
    },

    // ⑦
    assetManifestDigest: lod === null ? null : sha12(JSON.stringify(lod)),

    // ⑨
    deltaExportAllowed,
    supportedModes: ["bootstrap"],

    /** 每一個 null 的出處。⚠️ 沒有這一格，null 跟「忘了填」長得一模一樣。 */
    unavailable,
  };

  // profileDigest：除了 generatedAt 與自己以外的全部欄位。
  const { generatedAt: _ignored, ...stable } = body;
  return { ...body, profileDigest: sha12(JSON.stringify(stable)) };
}

/** 寫出檔案。回傳 JSON 文字（守衛拿它比對，⛔ 不重算一次）。 */
export function writeEditorTargetProfile(generatedAt: string): string {
  const text = `${JSON.stringify(buildEditorTargetProfile({ generatedAt }), null, 2)}\n`;
  writeFileSync(join(CONTENT, EDITOR_PROFILE_FILE), text);
  return text;
}

// 直接執行時才寫檔（被 import 當函式庫時不要有副作用）。
if (process.argv[1] !== undefined && process.argv[1].endsWith("buildEditorTargetProfile.ts")) {
  const t = writeEditorTargetProfile(new Date().toISOString());
  const p = JSON.parse(t) as { profileDigest: string; content: { contentVersion: string | null } };
  console.log(`editor-target-profile.json  cv=${p.content.contentVersion}  digest=${p.profileDigest}`);
}

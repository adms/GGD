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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
      compiler: {
        // ⚠️ 編譯器本身還沒有版本化的合約（GH#313／#314 未做）⇒ null 而不是假值。
        contractVersion: null,
        fingerprint: null,
      },
    },

    // ③
    runtimeCapabilities: caps,

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

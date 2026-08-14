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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const CONTENT = join(REPO, "content");

export const EDITOR_TARGET_PROFILE_SCHEMA = "ggd-editor-target-profile@1";
export const EDITOR_PROFILE_FILE = "editor-target-profile.json";

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

    // ② schema / compiler contract 版本
    contract: {
      profileSchema: EDITOR_TARGET_PROFILE_SCHEMA,
      capabilitiesSchema: caps.schema,
      packageSpec: "GGD_EDITOR_PACKAGE_SPEC.md（Draft 0.4）",
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
    },

    // ⑤ authoring rules
    authoringRules: {
      /** ⚠️ 定價規則（MP 公式係數、冷卻硬界）**還沒有端點**，只有散文。 */
      pricingEndpoint: null,
      pricingSource: "docs/技能編輯器引擎須知 20260811.md 第九章（散文，會過期）",
      pricingIssues: ["GH#313", "GH#314"],
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

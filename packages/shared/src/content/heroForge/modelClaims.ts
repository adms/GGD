import { heroBodyModelIds } from "./bodyModels";
import { COMMUNITY_HERO_EXAMPLES } from "./communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "./communityLolBatch2";
import { ACQUIRED_MODEL_OPTIONS, ACQUIRED_PROXY_MODELS, COMMUNITY_ACQUIRED_HEROES } from "./communityAcquired";

/**
 * ⭐ GH#1188「待認領」的**唯一判準**（後台與編輯器都問 content-api 的 `GET /content-api/hero-body-models`，它只呼叫這一支）。
 *
 * > owner 2026-09-11 01:02（+0800；transcript 564b17ca 的 2026-09-10T17:02:31Z；#1188 body 最上面「以此為準」那一塊）逐字：
 * > 「我要的是 我們已經下載好模型 但是英雄根本沒設計過（包含上架及未上架）」
 * > owner 2026-09-11 00:29（+0800；2026-09-10T16:29:48Z）逐字：「劍心 明明就有」
 *
 * ⇒ 待認領 ＝ 可挑的英雄身體（`heroBodyModelIds`，編輯器與匯入器同一支）裡，**沒有任何一支設計過的英雄**連到它的那些。
 *
 * ⛔⛔ 2026-09-15 更正 991b02ed6：那一版只讀 `content/champions` 的身體鏈，量到可挑 194 顆裡標 112 顆待認領 ——
 * 審查者指出其中 45 顆被 heroForge TS 的社群／取得英雄引用（例 `ou99.470351` ← `godie-eevi` 劍心拔刀齋，正是 owner 說「明明就有」的那一位）。
 * ⭐ 而把下面每一個集合都算進去之後，112 顆只剩 **2** 顆（2026-09-15 出貨樹：`ou99.470467`、`ou99.476060`，
 *   下載清單裡兩者都是 `needs-roster-mapping`）：
 *   45 顆只有 heroForge TS 連到（例 `community.body.03dc…` ← `acquired-alice`、`ou99.466278` ← `godie-e00q` 黑化Saber）；
 *   60 顆只有下載清單知道是**替已有卡的英雄**買的替代造型（例 `ou99.463625` ← `godie-e002`／`godie-e00l` Saber、`ou99.497213` ← 空條承太郎）。
 * ⚠️ 後面那 60 顆沒有被任何卡、skin 或 TS 引用 ⇒ 只看「引用」仍會把它們標成待認領。
 *
 * ⭐ 「設計過的英雄」住在哪裡（2026-09-15 逐一查過）：
 *
 * | 集合 | 為什麼算設計過 | 它怎麼連到模型 |
 * |---|---|---|
 * | `content/champions` | 上架中，以及 roster 下架／隱藏的（都還是這個目錄的卡） | `modelKey` ＋ `modelVersions[].modelKey／sourceModelKey` |
 * | `content/_legacy/champions` | 未上架的歷史英雄卡 | 同上 |
 * | `content/skins` | `skin@1` 只為一支已有卡的英雄存在 | `championId` ＋ `modelKey` |
 * | heroForge TS：`COMMUNITY_HERO_EXAMPLES`／`COMMUNITY_LOL_BATCH2_EXAMPLES`／`COMMUNITY_ACQUIRED_HEROES` | 招式住 TS、還沒有卡的社群／取得英雄（含 `RELEASE_READY=false` 的那批 —— owner：「包含…未上架」） | recipe `modelKey`、`ACQUIRED_MODEL_OPTIONS`（全部替代）、`ACQUIRED_PROXY_MODELS` |
 * | `materials/hero-model-library/download-sources.json` 的 `entries` | owner 的下載清單：這顆模型是**替哪支英雄**下載的 | `sources[].sourceId`（`ou99:<帖號>`）× `heroIds` —— ⚠️ `heroIds` 自己也要是上面某個集合裡的英雄才算 |
 *
 * ⛔ 刻意不算的（每一條都說得出為什麼）：
 * - `materials/hero-model-library/inventory.json`／`design-backlog/*`：從上面這些**推導**出來的報表，⛔ 不是另一個設計來源（算進來＝同一份事實數兩次）
 * - 平台投稿資料庫：runtime 資料、不在 repo，content-api 看不到；投稿英雄上架後就是 `content/champions` 的卡
 * - sibling repo（`GGD-community-acquired-heroes`）：那批英雄已經鏡射成上面的 `COMMUNITY_ACQUIRED_*` TS
 * - `docs/ou99造型群組.json`／`3d_model_great_again_plan.md` 的角色分組：是**名字**，⛔ 不是英雄 id
 *   （owner 2026-09-08：同名匹配只是候選；而且量到 `ou99.473324` 在群組裡歸 Saber，實際是 `b2-aladdin`（阿拉丁）的身體鏈在用）
 */

/** 有英雄卡的集合（`<集合>/<id>` 的前綴）。 */
export const DESIGNED_HERO_CARD_COLLECTIONS = ["champions", "_legacy/champions"] as const;
/** content-api 要讀進 `heroBodyModelClaims` 的全部 content 集合。 */
export const HERO_MODEL_CLAIM_COLLECTIONS = [...DESIGNED_HERO_CARD_COLLECTIONS, "skins", "models"] as const;
/** owner 下載清單的住處（相對 repo 根）。 */
export const MODEL_ACQUISITION_REGISTRY_PATH = "materials/hero-model-library/download-sources.json";

export interface ModelAcquisitionEntry { heroIds?: readonly string[]; sources?: readonly { sourceId?: string }[] }

export interface HeroBodyModelClaims {
  ids: string[];
  /** `ids` 裡沒有任何設計過的英雄連到的。 */
  unclaimed: string[];
  /** 每一顆已認領的可挑模型 ← 哪幾支設計過的英雄（括號是證據來源）—— 標「已認領」的人要說得出是誰。 */
  claimedBy: Record<string, string[]>;
  /** ⚠️ 讀不到的證據（例：容器裡沒有 `materials/`）⇒ `unclaimed` 可能**多標**，畫面要說出來（⛔ 不靜默）。 */
  evidence: { missing: string[] };
}

type Link = readonly [model: unknown, hero: unknown, via: string];

/**
 * @param documents `HERO_MODEL_CLAIM_COLLECTIONS` 的文件（key ＝ `<集合>/<id>`）
 * @param acquisition 下載清單的 `entries`；讀不到給 `null`（⇒ `evidence.missing` 會列出它）
 */
export function heroBodyModelClaims(documents: Iterable<readonly [string, unknown]>, acquisition: readonly ModelAcquisitionEntry[] | null): HeroBodyModelClaims {
  const docs = [...documents], ids = heroBodyModelIds(docs), pickable = new Set(ids);
  const designed = new Set<string>(), links: Link[] = [];
  for (const [key, raw] of docs) {
    if (!raw || typeof raw !== "object") continue;
    const doc = raw as Record<string, unknown>;
    const cards = DESIGNED_HERO_CARD_COLLECTIONS.find((collection) => key === `${collection}/${String(doc.id)}`);
    if (cards && typeof doc.id === "string") {
      designed.add(doc.id);
      links.push([doc.modelKey, doc.id, cards]);
      if (Array.isArray(doc.modelVersions)) for (const version of doc.modelVersions as Array<Record<string, unknown> | null>) links.push([version?.modelKey, doc.id, cards], [version?.sourceModelKey, doc.id, cards]);
    } else if (key.startsWith("skins/")) links.push([doc.modelKey, doc.championId, "skins"]);
  }
  for (const recipe of [...COMMUNITY_HERO_EXAMPLES, ...COMMUNITY_LOL_BATCH2_EXAMPLES, ...COMMUNITY_ACQUIRED_HEROES]) { designed.add(recipe.id); links.push([recipe.modelKey, recipe.id, "heroForge"]); }
  for (const [hero, options] of Object.entries(ACQUIRED_MODEL_OPTIONS)) for (const option of options) links.push([option, hero, "ACQUIRED_MODEL_OPTIONS"]);
  for (const [hero, model] of Object.entries(ACQUIRED_PROXY_MODELS)) links.push([model, hero, "ACQUIRED_PROXY_MODELS"]);
  // 下載清單的 join key：`ou99:<帖號>` ⇔ 模型 id `ou99.<帖號>` 或 `ou99.<帖號>-<同帖第幾份>`（同一帖可以拆出多顆）。
  for (const entry of acquisition ?? []) for (const source of entry.sources ?? []) {
    const match = /^([a-z0-9]+):([A-Za-z0-9_]+)$/.exec(source.sourceId ?? "");
    if (!match) continue;
    const base = `${match[1]}.${match[2]}`;
    for (const id of ids) if (id === base || id.startsWith(`${base}-`)) for (const hero of entry.heroIds ?? []) links.push([id, hero, "download-sources"]);
  }
  const claimedBy: Record<string, string[]> = {};
  for (const [model, hero, via] of links) {
    if (typeof model !== "string" || typeof hero !== "string" || !pickable.has(model) || !designed.has(hero)) continue;
    claimedBy[model] = [...new Set([...(claimedBy[model] ?? []), `${hero}（${via}）`])].sort();
  }
  return { ids, unclaimed: ids.filter((id) => !claimedBy[id]), claimedBy, evidence: { missing: acquisition ? [] : [MODEL_ACQUISITION_REGISTRY_PATH] } };
}

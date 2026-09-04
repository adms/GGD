/**
 * `ggd-coord-packet@1` —— ⭐ **欄位表的唯一住處**（CLAUDE.md 第〇·四守則）。
 *
 * ⚠️ `AGENTS.md` §3 的那張表是**給人讀的鏡像** —— 它與這一份打架時，⭐ 以這一份為準
 * （閘：GH#988「`AGENTS.md` §3 列出的欄位名 ⊆ 這裡的欄位名」）。
 * ⛔ 不要在 `check.mjs` 裡再抄一份欄位名：那是第二個住處，而它會安靜地漂。
 */

export const SCHEMA_ID = "ggd-coord-packet@1";

/** packet 的落點（相對 repo root）。⛔ 不是 inbox／outbox —— 通道是 PR。 */
export const PACKET_DIR = "docs/editor-contract/coordination";

/** `contractFingerprint` 的分母。契約一變，舊 packet 就該重算（＝那一題可以重問）。 */
export const CONTRACT_FILE = "docs/editor-contract/ggd-type-catalog.json";
export const FINGERPRINT_LEN = 16;

/** `unblocks[]` 的 id 母體（機器發的「擋住幾支」）。 */
export const ACCEPTANCE_FILE = "docs/_reports/editor-skill-acceptance-42x46.json";

/** 頂層必填。⛔ 缺一個就紅（`ticket-lint` 的形狀：逐條列出缺什麼）。 */
export const REQUIRED = [
  "schema",
  "dedupeKey",
  "kind",
  "from",
  "to",
  "baseCommit",
  "contractFingerprint",
  "title",
  "claims",
];

/**
 * ⛔⛔ **存在就紅**。狀態住在 PR（第〇·四守則：⛔ 不要第二個住處）——
 * open＝NEW · review requested＝ACKNOWLEDGED · checks 綠＝VERIFIED ·
 * merged＝RESOLVED · label `owner-decision`＝OWNER_DECISION · closed 未 merge＝DEFERRED。
 */
export const FORBIDDEN = ["status"];

export const KINDS = ["brick-request", "claim", "question", "advisory-refresh", "owner-decision"];

export const CLAIM_KINDS = ["confirmed", "refuted", "inferred", "owner-decision"];
export const CLAIM_REQUIRED = ["kind", "commit"];
export const REPRO_REQUIRED = ["command", "expectedExit"];

export const OWNER_QUOTE_REQUIRED = ["date", "text"];

/** `brick-request` 的 `unblocks[]` 下限。**1 支 ＝ 專屬積木，不做**（GH#916 的判準）。 */
export const UNBLOCKS_MIN = 2;

/** `unblocks[]` 要對到的 machine issue 與它的 id 欄位（GH#986 落地後才有東西可對）。 */
export const BRICK_ISSUE_CODE = "MISSING_VISUAL_BRICK";
export const BRICK_ID_FIELD = "brickId";

/**
 * ⭐⭐ **安全邊界，⛔ 不是潔癖**：`--run-repro` 會在 CI 上**真的執行**這些字串，
 * 而 PR 可能來自 fork ⇒ 一個 packet 等於一次任意程式碼執行的機會。
 * ⇒ ① 前綴白名單 ② ⛔ 任何 shell 元字元（指令**不經過 shell**，逐 token 執行）。
 */
export const COMMAND_PREFIXES = ["pnpm ", "npx vitest run ", "bash scripts/", "node tools/", "python3 tools/"];
export const COMMAND_FORBIDDEN = [";", "&&", "||", "|", "$(", "`", ">", "<", "\n", "&"];

/** 逐條 repro 的執行上限（秒）。 */
export const REPRO_TIMEOUT_SEC = 300;

/** `dedupeKey` ＝ 檔名 ⇒ 它同時是一個路徑片段。⛔ 不准有 `/` 或 `..`。 */
export const DEDUPE_KEY_RE = /^[a-z0-9][a-z0-9.-]*$/;

/** `ownerQuotes[].date` 逐字 `YYYY-MM-DD`（⛔ 不接受「上週」這種）。 */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

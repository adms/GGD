/**
 * tools/review/stores.mjs —— 🔐 **批核材料** 與 **批核結果** 的兩個分署資料庫。
 *
 * owner 2026-08-27（逐字）：
 * > 「請同步到線上，並且**線上批核的結果也同步到本機端**，為避免**讀寫混淆**，
 * >  請將**批核材料跟批核結果分署不同資料夾**，用**特定存取script的特定存取權限**
 * >  來管理**避免錯改**」
 *
 * ## ⛔ 在此之前它們住在同一個檔，而那正是「讀寫混淆」的本體
 * `docs/_review/feature-verdicts.json` 一份檔同時裝著：
 *   · **我**寫的登記（title / family / issues / rollback 開關）
 *   · **owner**寫的裁決（verdict / reason / verdictAt）
 * ⇒ `registerBatch()` 每一次登記都**讀出 owner 的裁決欄位再寫回去**（`prev.verdict ?? null`）。
 *    那條「carry forward」看起來很無害，⛔ 但它讓「我重登記一批」與「他的裁決」
 *    共用同一次 `writeFileSync` —— 任何一邊的 bug、任何一次併發，都會吃掉另一邊。
 *
 * ## ⭐ 分署之後，互相覆蓋在**結構上**不可能
 * | 分署 | 落點 | 誰寫 | 權限 |
 * |---|---|---|---|
 * | 📦 **材料** | `docs/_review/material/batches.json` | 我（`review:register`） | **444**，寫入端自解鎖後重鎖 |
 * | 🧑‍⚖️ **結果** | `docs/_review/verdicts/{local,live}.json` | owner（批核頁 / 線上） | 644（頁面要寫得進去） |
 *
 * ⭐ **兩份檔的欄位集合刻意不相交** —— 材料檔裡沒有 `verdict` 這個字，
 *   結果檔裡沒有 `rollback` 這個字。⇒ 「寫錯邊」不是紀律問題，是 schema 會擋。
 *   閘：`packages/shared/src/ops/reviewSplitHomes.test.ts`。
 *
 * ## 🔀 為什麼結果是**兩個檔**（local / live）而不是一個
 * owner 要「線上批核的結果也同步到本機端」。⛔ 如果兩邊寫同一個檔名，
 * 同步就是一次**盲目覆蓋** —— 誰後 rsync 誰贏，而另一邊的裁決無聲消失。
 * ⇒ 各自一個檔（**append-only 的來源分離**），合併是**讀的時候算的**：
 *   同一個批次有兩筆 ⇒ 取 `verdictAt` 新的那一筆。
 * ⭐ 合併結果**不落地**（第〇·四守則：同一個事實不可以有第二個住處）。
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ────────────────────────────── 路徑（單一住處） ──────────────────────────────

/** 📦 批核材料：**我**寫的東西。⛔ 這底下不可以出現任何裁決欄位。 */
export const MATERIAL_DIR_REL = "docs/_review/material";
export const MATERIAL_REL = `${MATERIAL_DIR_REL}/batches.json`;
/** 🧑‍⚖️ 批核結果：**owner** 寫的東西。⛔ 這底下不可以出現任何登記欄位。 */
export const VERDICT_DIR_REL = "docs/_review/verdicts";
/** ⚠️ 分署之前的混合檔 —— 只讀，用來一次性遷移。 */
export const LEGACY_LEDGER_REL = "docs/_review/feature-verdicts.json";

/** 結果檔的合法來源。⭐ 一個來源一個檔 ⇒ 同步永遠不必覆蓋別人的檔。 */
export const VERDICT_SOURCES = ["local", "live"];
export const verdictRel = (source) => `${VERDICT_DIR_REL}/${source}.json`;

/** ⭐ 材料檔准許的欄位（⛔ 沒有一個是裁決）。 */
export const MATERIAL_FIELDS = new Set([
  "title", "family", "issues", "abilities", "commit", "sequenceDir", "rollback", "registeredAt",
]);
/** ⭐ 結果檔准許的欄位（⛔ 沒有一個是登記）。 */
export const VERDICT_FIELDS = new Set(["verdict", "verdictHash", "reason", "verdictAt", "source", "by"]);

// ────────────────────────────── 📦 材料（唯一寫入端） ──────────────────────────────

export function loadMaterial(repoRoot) {
  const p = join(repoRoot, MATERIAL_REL);
  if (existsSync(p)) {
    const doc = JSON.parse(readFileSync(p, "utf8"));
    return { schema: doc.schema ?? "review-material@1", batches: doc.batches ?? {} };
  }
  // ⚠️ 遷移期：材料檔還沒生出來時，從舊的混合檔**只取材料那一半**（⛔ 不碰裁決欄位）。
  const legacy = join(repoRoot, LEGACY_LEDGER_REL);
  if (!existsSync(legacy)) return { schema: "review-material@1", batches: {} };
  const doc = JSON.parse(readFileSync(legacy, "utf8"));
  const batches = {};
  for (const [id, reg] of Object.entries(doc.batches ?? {})) {
    batches[id] = Object.fromEntries(Object.entries(reg).filter(([k]) => MATERIAL_FIELDS.has(k)));
  }
  return { schema: "review-material@1", batches, fromLegacy: true };
}

/**
 * ⭐ **材料的唯一寫入端**，而且它自己開鎖／上鎖（與 `ruling.sh` / `ledger_table.py`
 * 同一個「自解鎖」形狀）—— 平時 444 讓任何手滑的 `Edit`／`>` 吃 EACCES。
 * ⛔ 它**濾掉**每一個不在 `MATERIAL_FIELDS` 的鍵：登記寫不進裁決，不靠自律靠 schema。
 */
export function saveMaterial(repoRoot, batches) {
  const dir = join(repoRoot, MATERIAL_DIR_REL);
  mkdirSync(dir, { recursive: true });
  const p = join(repoRoot, MATERIAL_REL);
  const clean = {};
  for (const [id, reg] of Object.entries(batches)) {
    clean[id] = Object.fromEntries(
      Object.entries(reg).filter(([k, v]) => MATERIAL_FIELDS.has(k) && v !== undefined),
    );
  }
  const doc = {
    schema: "review-material@1",
    note:
      "📦 批核材料 —— **我**寫的登記（rollback 開關在這）。owner 的裁決⛔ 不在這個檔，" +
      `在 ${VERDICT_DIR_REL}/。這個檔平時是 444，寫入請走 \`bash scripts/review-access.sh\`。`,
    batches: clean,
  };
  if (existsSync(p)) chmodSync(p, 0o644); // 自解鎖
  writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
  chmodSync(p, 0o444); // 重鎖
  return doc;
}

// ────────────────────────────── 🧑‍⚖️ 結果（唯一寫入端） ──────────────────────────────

function loadOneVerdictFile(repoRoot, source) {
  const p = join(repoRoot, verdictRel(source));
  if (!existsSync(p)) return {};
  const doc = JSON.parse(readFileSync(p, "utf8"));
  return doc.verdicts ?? {};
}

/**
 * 讀**全部**來源並合併。⭐ 合併規則：同一批次取 `verdictAt` **新**的那一筆。
 * ⛔ 合併結果不寫回任何檔 —— 它是推導出來的（第〇·四守則）。
 * @returns { [id]: { verdict, verdictHash, reason, verdictAt, source } }
 */
export function loadVerdicts(repoRoot) {
  const dir = join(repoRoot, VERDICT_DIR_REL);
  const sources = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort()
    : [];
  const merged = {};
  for (const source of sources.length > 0 ? sources : VERDICT_SOURCES) {
    for (const [id, v] of Object.entries(loadOneVerdictFile(repoRoot, source))) {
      const prev = merged[id];
      if (prev === undefined || String(v.verdictAt ?? "") > String(prev.verdictAt ?? "")) {
        merged[id] = { ...v, source: v.source ?? source };
      }
    }
  }
  if (Object.keys(merged).length > 0) return merged;
  // ⚠️ 遷移期：結果檔還沒生出來時，從舊的混合檔**只取裁決那一半**。
  const legacy = join(repoRoot, LEGACY_LEDGER_REL);
  if (!existsSync(legacy)) return merged;
  const doc = JSON.parse(readFileSync(legacy, "utf8"));
  for (const [id, reg] of Object.entries(doc.batches ?? {})) {
    if (reg.verdict === undefined || reg.verdict === null) continue;
    merged[id] = {
      verdict: reg.verdict,
      verdictHash: reg.verdictHash ?? null,
      reason: reg.reason ?? "",
      verdictAt: reg.verdictAt ?? null,
      source: "legacy",
    };
  }
  return merged;
}

/**
 * ⭐ **結果的唯一寫入端**。⛔ 它濾掉每一個不在 `VERDICT_FIELDS` 的鍵 ——
 * 裁決寫不進登記。⚠️ 這個檔**刻意保持可寫**（644）：線上那一台要靠頁面寫進去。
 * @param source "local"（本機 dev server）｜"live"（線上 sidecar）
 */
export function saveVerdictEntry(repoRoot, source, id, entry) {
  if (!VERDICT_SOURCES.includes(source)) throw new Error(`未知的裁決來源「${source}」`);
  const dir = join(repoRoot, VERDICT_DIR_REL);
  mkdirSync(dir, { recursive: true });
  const p = join(repoRoot, verdictRel(source));
  const verdicts = loadOneVerdictFile(repoRoot, source);
  verdicts[id] = Object.fromEntries(
    Object.entries({ ...entry, source }).filter(([k, v]) => VERDICT_FIELDS.has(k) && v !== undefined),
  );
  writeFileSync(
    p,
    `${JSON.stringify(
      {
        schema: "review-verdicts@1",
        source,
        note:
          `🧑‍⚖️ 批核結果（來源：${source}）—— **owner** 按下去的東西。⛔ 我不手改這個檔。` +
          ` 登記材料在 ${MATERIAL_DIR_REL}/。同步：\`bash scripts/review-sync.sh\`。`,
        verdicts,
      },
      null,
      2,
    )}\n`,
  );
  return verdicts[id];
}

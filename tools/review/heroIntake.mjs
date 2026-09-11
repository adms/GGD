/**
 * tools/review/heroIntake.mjs —— 🧍🖼🎙 **新英雄上架一頁檢核**的資料面。
 *
 * owner 2026-09-11（逐字）：
 * > 「全部放到**一頁檢核頁面**讓我複查，這個過程**全部自動化**，只留**最後我的審查通過與否**，
 * >  並且**這一頁也要放到後台管理頁**」
 *
 * ⭐ 材料是 `tools/hero-intake/run.mjs` 產的（`docs/_review/material/hero-intake/<batch>.json`），
 * 結果走既有的兩個分署住處（`tools/review/stores.mjs` 的 `verdicts/{local,live}.json`），
 * ⛔ 不是第三個帳本 —— id 命名空間是 `hero-intake:<batch>:<heroId>`。
 *
 * ⚠️ **材料的 digest 進裁決**：材料重跑過（模型換了、圖示重畫、語音包補了）就代表
 * 「你剛剛看的那一位」已經不是現在這一位 ⇒ 舊裁決在頁面上標成 `stale`，
 * ⛔ 不是靜靜地把它算成仍然有效。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadVerdicts, saveVerdictEntry } from "./stores.mjs";

export const MATERIAL_DIR_REL = "docs/_review/material/hero-intake";
export const verdictId = (batch, heroId) => `hero-intake:${batch}:${heroId}`;

const readJson = (p, d = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };

/** 每一位英雄一列：材料 ＋ 這一位目前的裁決（含「看的是不是同一份」）。 */
export function buildHeroIntakeQueue(repoRoot, batchFilter = null) {
  const dir = join(repoRoot, MATERIAL_DIR_REL);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  const verdicts = loadVerdicts(repoRoot);
  const batches = [];
  for (const f of files) {
    const doc = readJson(join(dir, f));
    if (!doc?.heroes) continue;
    const batch = doc.batch ?? f.slice(0, -5);
    if (batchFilter && batch !== batchFilter) continue;
    const heroes = doc.heroes.map((h) => {
      const v = verdicts[verdictId(batch, h.id)] ?? null;
      return {
        ...h,
        verdict: v?.verdict ?? null,
        reason: v?.reason ?? "",
        verdictAt: v?.verdictAt ?? null,
        verdictBy: v?.by ?? null,
        // ⭐ 裁決是對「那一份材料」下的：digest 變了就代表這一位重跑過。
        stale: v !== null && v.verdictHash !== undefined && v.verdictHash !== null && v.verdictHash !== doc.digest,
      };
    });
    batches.push({
      batch,
      generatedBy: doc.generatedBy ?? "",
      digest: doc.digest ?? "",
      voiceIndex: doc.voiceIndex ?? null,
      counts: {
        ...(doc.counts ?? {}),
        approved: heroes.filter((h) => h.verdict === "approve").length,
        rejected: heroes.filter((h) => h.verdict === "reject").length,
        undecided: heroes.filter((h) => h.verdict === null).length,
        stale: heroes.filter((h) => h.stale).length,
      },
      heroes,
    });
  }
  return {
    counts: {
      batches: batches.length,
      heroes: batches.reduce((n, b) => n + b.heroes.length, 0),
      undecided: batches.reduce((n, b) => n + b.counts.undecided, 0),
    },
    batches,
  };
}

/**
 * ⭐ 只有兩種裁決：`approve`（可以上架）／`reject`（退回）。
 * ⛔ `reject` **必填原因** —— 一個沒有理由的退回，下一輪讀到時沒有人知道要修什麼
 * （與功能級批核頁同一條規矩：owner 2026-08-24「追加原因的HITL」）。
 */
export function saveHeroIntakeVerdict(repoRoot, source, { batch, heroId, digest, verdict, reason, by }) {
  if (!["approve", "reject"].includes(verdict)) throw new Error(`verdict 只收 approve／reject，收到「${verdict}」`);
  if (verdict === "reject" && !String(reason ?? "").trim()) throw new Error("退回必填原因");
  return saveVerdictEntry(repoRoot, source, verdictId(batch, heroId), {
    verdict,
    verdictHash: digest ?? null,
    reason: String(reason ?? ""),
    verdictAt: new Date().toISOString(),
    by: by ?? null,
  });
}

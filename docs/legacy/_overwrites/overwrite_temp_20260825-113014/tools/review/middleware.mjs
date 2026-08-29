/**
 * tools/review/middleware.mjs —— 審查頁的資料面（GH#664，跨 lane 契約）。
 *
 * Connect 風格 (req, res, next)，掛在 dev server（vite `configureServer` 或任何
 * Connect/Express app）上：
 *   GET  /__review/queue    → { items: [...] }（現算，⛔ 不吃過期的 queue.json）
 *   POST /__review/verdict  → body { id, kind?, verdict: "pass"|"fail"|"unsure", hash, note? }
 *     ⭐ 寫入前驗 hash 還一致 —— 內容在頁面開著的期間變了就回 409 帶說明，
 *       ⛔ 不可以把一個對舊內容做的裁決記在新內容頭上。
 *
 * GH#669 —— **功能級**一頁式連續圖片批核（同一個通道，⛔ 不造第二套）：
 *   GET  /__review/features        → { counts, batches: [...] }（每列帶逐幀序列與亮像素）
 *   GET  /__review/frame?p=<rel>   → 一張 PNG（**只**從 docs/_reports/ 底下取）
 *   POST /__review/feature-verdict → body { id, hash, verdict: "keep"|"veto", reason? }
 *     ⭐ 預設是 live（已上線）；veto＝事後否決 ⇒ **必填 reason**（400 擋空的）。
 */
import { buildInventory, buildQueue, saveVerdict } from "./triage.mjs";
import { buildFeatureQueue, saveFeatureVerdict, SEQUENCE_ROOT_REL } from "./features.mjs";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const VERDICTS = new Set(["pass", "fail", "unsure"]);

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function createReviewMiddleware(repoRoot) {
  return (req, res, next) => {
    const url = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && url === "/__review/queue") {
      try {
        sendJson(res, 200, { items: buildQueue(repoRoot).items });
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }
    if (req.method === "POST" && url === "/__review/verdict") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const body = JSON.parse(raw || "{}");
          const { id, kind, verdict, hash, note } = body;
          if (typeof id !== "string" || typeof hash !== "string" || !VERDICTS.has(verdict)) {
            return sendJson(res, 400, { error: "需要 { id, hash, verdict: pass|fail|unsure, note? }" });
          }
          const matches = buildInventory(repoRoot).filter(
            (a) => a.id === id && (kind === undefined || a.kind === kind),
          );
          if (matches.length === 0) return sendJson(res, 404, { error: `未知資產 id：${id}` });
          if (matches.length > 1)
            return sendJson(res, 400, { error: `id 跨 kind 撞名，請帶 kind：${matches.map((a) => a.kind).join("/")}` });
          const asset = matches[0];
          if (asset.hash !== hash) {
            return sendJson(res, 409, {
              error: "內容已變 —— 你審的那一份已經不是出貨的那一份。重新整理佇列再審。",
              currentHash: asset.hash,
              submittedHash: hash,
            });
          }
          saveVerdict(repoRoot, { kind: asset.kind, id, hash, verdict, note });
          sendJson(res, 200, { ok: true, key: `${asset.kind}:${id}` });
        } catch (err) {
          sendJson(res, 500, { error: String(err) });
        }
      });
      return;
    }
    next();
  };
}

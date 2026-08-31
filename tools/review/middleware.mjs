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
 *
 * ## 🔐 兩種權限模式（owner 2026-08-27:「用**特定存取權限**來管理**避免錯改**」）
 * | mode | 誰在跑 | 可以寫什麼 | 為什麼 |
 * |---|---|---|---|
 * | `"local"`（預設） | 本機 dev server | 材料 ＋ 結果 | 這台就是我在開發的機器 |
 * | `"live"` | 線上 sidecar（ggd.adms.ai） | ⭐ **只有結果**（`verdicts/live.json`） | 📦 材料在線上是 **:ro** 掛載 |
 *
 * ⭐ 線上模式**明確 403 並說明理由**，⛔ 不是讓它去撞一個 EACCES ——
 *   一個沒有人看得懂的 500 與「這條路在這裡不存在」長得一樣（fail-open 的靜默）。
 * ⇒ 寫材料的兩條路（`POST /__review/verdict` 資產裁決 · `POST /__review/frame` 存證據）
 *   在 live 模式下回 403 並指出「這件事要在本機做，然後 git push」。
 */
import { buildInventory, buildQueue, saveVerdict } from "./triage.mjs";
import { auditPlan } from "./enable-audit.mjs";
import { buildFeatureQueue, saveFeatureVerdict, SEQUENCE_ROOT_REL } from "./features.mjs";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const VERDICTS = new Set(["pass", "fail", "unsure"]);

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function createReviewMiddleware(repoRoot, options = {}) {
  const mode = options.mode ?? "local";
  const verdictSource = options.verdictSource ?? (mode === "live" ? "live" : "local");
  /** ⭐ 會寫到**材料**那一側的路 —— 線上一律擋，並說明該去哪裡做。 */
  const writesMaterial = (method, url) =>
    (method === "POST" && url === "/__review/verdict") || (method === "POST" && url === "/__review/frame");

  return (req, res, next) => {
    const url = (req.url ?? "").split("?")[0];
    if (mode === "live" && writesMaterial(req.method, url)) {
      return sendJson(res, 403, {
        error:
          `⛔ 線上只開放**批核結果**（${url} 會寫到「批核材料」那一側）。` +
          "材料是 :ro 掛載 —— 這件事請在本機做完再 git push（owner 2026-08-27「材料與結果分署」）。",
        mode,
        allowed: ["GET /__review/features", "GET /__review/frame", "POST /__review/feature-verdict"],
      });
    }
    if (req.method === "GET" && url === "/__review/queue") {
      try {
        sendJson(res, 200, { items: buildQueue(repoRoot).items });
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }
    // ⭐⭐ GH#473 —— **啟用上架的當下自動跑稽核**（owner 2026-08-18：
    //    「你應該是要**設計啟用的時候才做自動跑測試 script**，測試結果再排入是否修理」）。
    //
    // ⚠️ ⭐ 為什麼要一條 route：`auditPlan` 讀 **repo 的檔案**（`content/` 與
    //    判準模組的原始碼）—— ⛔ 而後台是**瀏覽器**，它碰不到檔案系統。
    //    ⇒ 這一條就是那道縫；⛔ 沒有它，admin 算得出「要驗誰」卻**驗不了**。
    //
    // ⭐ 只對**傳進來的 id** 跑（票文逐字的成本斷言：「不啟用就不花錢」）。
    if (req.method === "GET" && url === "/__review/enable-audit") {
      try {
        const q = (req.url ?? "").split("?")[1] ?? "";
        const ids = new URLSearchParams(q).get("ids");
        const list = (ids ?? "").split(",").map((s2) => s2.trim()).filter(Boolean);
        // ⛔ 空清單就是空清單 —— ⭐ 回一個空計畫，⛔ 不是掃全部
        //    （那正是「不啟用不花錢」的實作，⛔ 不是一句註解）。
        sendJson(res, 200, list.length === 0
          ? { schema: "enable-audit-plan@1", ids: [], counts: {}, rows: [] }
          : auditPlan(repoRoot, list));
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

    // ── GH#669 功能級：連續圖片批核 ──────────────────────────────────────
    if (req.method === "GET" && url === "/__review/features") {
      try {
        sendJson(res, 200, buildFeatureQueue(repoRoot));
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }
    if (req.method === "GET" && url === "/__review/frame") {
      // ⚠️ 柵欄：**只**供應 docs/_reports/ 底下的 .png。normalize 之後仍要逐字檢查
      //    前綴，⛔ 不是「有沒有 ..」——後者擋不住 symlink 之外的每一種寫法。
      const rel = normalize(new URL(req.url ?? "", "http://x").searchParams.get("p") ?? "");
      if (!rel.startsWith(`${SEQUENCE_ROOT_REL}/`) || !rel.toLowerCase().endsWith(".png"))
        return sendJson(res, 400, { error: `只供應 ${SEQUENCE_ROOT_REL}/**/*.png，收到：${rel}` });
      const abs = join(repoRoot, rel);
      if (!existsSync(abs) || !statSync(abs).isFile()) return sendJson(res, 404, { error: `找不到 ${rel}` });
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.end(readFileSync(abs));
      return;
    }
    if (req.method === "POST" && url === "/__review/frame") {
      // 📸 GH#767 —— 驗收台子把一張 PNG 存進**證據目錄**。⭐ 它存在的理由是
      //    「連續圖片驗收」不可以是一件手工事：一個要人手動另存的步驟，下一輪
      //    就不會做，而 `review:register` 的閘正是靠這個目錄擋下沒有證據的登記。
      // ⚠️ 同一道柵欄（⛔ 不是「有沒有 ..」）：只准寫 docs/_reports/**/*.png。
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const body = JSON.parse(raw || "{}");
          const rel = normalize(String(body.path ?? ""));
          if (!rel.startsWith(`${SEQUENCE_ROOT_REL}/`) || !rel.toLowerCase().endsWith(".png"))
            return sendJson(res, 400, { error: `只收 ${SEQUENCE_ROOT_REL}/**/*.png，收到：${rel}` });
          const data = String(body.dataUrl ?? "");
          const comma = data.indexOf(",");
          if (!data.startsWith("data:image/png;base64,") || comma < 0)
            return sendJson(res, 400, { error: "dataUrl 不是 data:image/png;base64,…" });
          const abs = join(repoRoot, rel);
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, Buffer.from(data.slice(comma + 1), "base64"));
          sendJson(res, 200, { ok: true, path: rel, bytes: statSync(abs).size });
        } catch (err) {
          sendJson(res, 500, { error: String(err) });
        }
      });
      return;
    }
    if (req.method === "POST" && url === "/__review/feature-verdict") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const { id, hash, verdict, reason } = JSON.parse(raw || "{}");
          if (typeof id !== "string" || typeof hash !== "string")
            return sendJson(res, 400, { error: "需要 { id, hash, verdict: keep|veto, reason? }" });
          const batch = buildFeatureQueue(repoRoot).batches.find((b) => b.id === id);
          if (batch === undefined) return sendJson(res, 404, { error: `未知批次 id：${id}` });
          if (!batch.registered || batch.rollbackOk !== true)
            return sendJson(res, 409, {
              error: `「${id}」沒有可用的 rollback 開關 ⇒ 不可判定`,
              blockers: batch.blockers,
            });
          if (batch.hash !== hash)
            return sendJson(res, 409, {
              error: "序列已重渲染 —— 你看的那一份已經不是現在的那一份。重新整理再判定。",
              currentHash: batch.hash,
              submittedHash: hash,
            });
          const entry = saveFeatureVerdict(repoRoot, { id, hash, verdict, reason, source: verdictSource });
          sendJson(res, 200, {
            ok: true,
            id,
            source: verdictSource,
            status: entry.verdict === "veto" ? "vetoed" : "live",
            rollback: entry.rollback,
          });
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      });
      return;
    }
    next();
  };
}

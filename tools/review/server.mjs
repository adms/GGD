#!/usr/bin/env node
/**
 * tools/review/server.mjs —— 🌐 **把批核頁的資料面搬上線**（GH#794）。
 *
 * owner 2026-08-27（逐字）：
 * > 「⚠️ 讀不到批次 Error: 回的不是 JSON（HTTP 200）—— dev server 沒掛 /__review …
 * >  ⇒ **請同步到線上**，並且**線上批核的結果也同步到本機端**」
 *
 * ## ⛔ 為什麼不是「用 Go 再寫一份」
 * 佇列的計算（掃證據目錄 · 解析亮像素表 · 解析 rollback 開關 · hash 過期制）
 * 已經住在 `features.mjs`。用另一個語言在平台端重寫 = **第二個住處**，
 * 而它會在下一次改動時無聲地與本機那一份分岔（第〇·四守則）。
 * ⇒ 這一台是 **sidecar**：跑的是**同一份 middleware**、同一份 `features.mjs`。
 *   本機與線上唯一的差別是那一格 `mode`。
 *
 * ## 🔐 權限（＝掛載，⛔ 不是判準）
 *   docs/_review/material  :ro   📦 材料 —— 線上讀得到、**寫不進去**
 *   docs/_reports          :ro   📸 連續圖片 —— 同上
 *   content                :ro   🔧 rollback 開關要解析
 *   docs/_review/verdicts  :rw   🧑‍⚖️ 結果 —— **線上唯一寫得動的東西**
 * ⭐ 「線上不可以改材料」因此是**檔案系統**保證的，⛔ 不是我記得不要做。
 *   middleware 的 live 模式再多一層：那兩條寫材料的路直接 403 並說明去哪做。
 *
 * ## 🩺 /healthz 驗的是**關係**，⛔ 不是名詞
 * 部署後置條件的老教訓（CLAUDE.md「配對式後置條件」）：分別檢查「材料在不在」與
 * 「結果目錄在不在」，在**掛載掛錯**的時候兩項都會是綠的。
 * ⇒ 這裡真的做兩件事：**算一次佇列**（證明讀得動材料＋解析得了開關）
 *   ＋ **真的建一個檔再刪掉**（證明寫得進結果）。任一失敗 ⇒ `ok:false` ＋ 指名原因。
 *
 * ## 🔴 它同時服務 `/__live/**`（owner 2026-08-26「後台頁面都要 script 實時動態產生」）
 * 那 13 頁對照/設定頁的資料面 `tools/admin-live/` **同病同治**：也只掛在 vite dev
 * server 上 ⇒ 線上打開是空的。它是**純計算、零寫檔**（逐份 dataset 查證過），
 * 所以線上服務它沒有任何寫入風險 —— ⛔ 而不接它，那 13 頁的批核區也一起是空的。
 *
 * 用法：
 *   node tools/review/server.mjs                 # mode=live, port=8790
 *   GGD_REVIEW_MODE=local node tools/review/server.mjs
 */
import { createServer } from "node:http";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReviewMiddleware } from "./middleware.mjs";
import { createAdminLiveMiddleware } from "../admin-live/middleware.mjs";
import { buildFeatureQueue } from "./features.mjs";
import { MATERIAL_REL, VERDICT_DIR_REL } from "./stores.mjs";

const REPO = process.env.GGD_REVIEW_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "../..");
const MODE = process.env.GGD_REVIEW_MODE ?? "live";
const PORT = Number(process.env.GGD_REVIEW_PORT ?? 8790);

const review = createReviewMiddleware(REPO, { mode: MODE });
// ⚠️ 動態載入：admin-live 缺席時這一台**仍然要能服務批核頁**（那是它的主業）。
//    ⛔ 但缺席要**說出來**（/healthz 的 live 區塊），⛔ 不是靜默地少一半功能。
let adminLive = null;
let adminLiveWhy = null;
try {
  adminLive = createAdminLiveMiddleware(REPO);
} catch (err) {
  adminLiveWhy = String(err);
}

/** ⭐ 讀＋寫各真的做一次 —— 見檔頭「驗的是關係」。 */
function health() {
  const out = { ok: false, mode: MODE, root: REPO, material: {}, verdicts: {} };
  try {
    const q = buildFeatureQueue(REPO);
    out.material = {
      ok: q.counts.total > 0,
      file: MATERIAL_REL,
      present: existsSync(join(REPO, MATERIAL_REL)),
      ...q.counts,
    };
    if (q.counts.total === 0) out.material.why = "⛔ 掃不到任何連續圖片序列 —— docs/_reports 掛載掉了？";
  } catch (err) {
    out.material = { ok: false, why: String(err) };
  }
  // ⭐ 真的建一個檔再刪掉（＝ MatchRecorder 的 `replay.writable` 同一招）。
  const probe = join(REPO, VERDICT_DIR_REL, `.healthz-probe-${process.pid}`);
  try {
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    out.verdicts = { ok: true, dir: VERDICT_DIR_REL, writable: true };
  } catch (err) {
    out.verdicts = { ok: false, dir: VERDICT_DIR_REL, writable: false, why: String(err) };
  }
  out.live = adminLive === null ? { ok: false, why: adminLiveWhy } : { ok: true, note: "13 頁對照/設定頁的實時資料面" };
  out.ok = out.material.ok === true && out.verdicts.ok === true && out.live.ok === true;
  return out;
}

createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/healthz" || path === "/__review/healthz") {
    const h = health();
    res.statusCode = h.ok ? 200 : 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(h, null, 2));
    return;
  }
  const done = () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: `這一台只服務 /__review/** 與 /__live/**（收到 ${path}）`,
        mode: MODE,
        routes: [
          "GET /__review/features", "GET /__review/frame?p=…", "POST /__review/feature-verdict",
          "GET /__live/<dataset>", "GET /healthz",
        ],
      }),
    );
  };
  review(req, res, () => (adminLive === null ? done() : adminLive(req, res, done)));
}).listen(PORT, "0.0.0.0", () => {
  const h = health();
  console.log(
    `[review] mode=${MODE} port=${PORT} root=${REPO}\n` +
      `[review] 材料 ${h.material.total ?? "?"} 批（待裁決 ${h.material.pending ?? "?"}）· 結果可寫=${h.verdicts.ok} · /__live=${h.live.ok}` +
      (h.ok ? "" : `\n[review] ⛔ 不健康：${h.material.why ?? ""} ${h.verdicts.why ?? ""} ${h.live.why ?? ""}`),
  );
});

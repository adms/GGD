/**
 * VFX-SCRIPT STUDIO API (GH#838) — dev-only legacy preview/proof channel.
 *
 * 模式照抄 tools/review/middleware.mjs（GH#664 的跨 lane 契約）：
 * vite.config.ts 在 configureServer 時動態 import 這一份；模組缺席 ⇒ 路由回 503
 * 指名缺什麼，⛔ 不是白畫面。`apply:"serve"` ⇒ 這條路**不存在於任何出貨 build**。
 *
 * 路由（全部 JSON）：
 *   GET  /__vfxstudio/scripts        → { scripts: [{id, abilityId, path}] }（掃目錄）
 *   GET  /__vfxstudio/script?id=X    → 該檔原文
 *   POST /__vfxstudio/script         → 409；直接寫入已停用，改走 Editor AI 批核
 *   POST /__vfxstudio/publish        → 409；不得從 legacy studio commit/push
 *
 * ⚠️ 驗證的分工：**權威 Zod 驗證在頁面側**（studio import 出貨的 zVfxScriptDoc，
 * 存檔前 parse —— schema 單一住處）；這裡只做結構與路徑安全（id 白名單字元、
 * doc 是物件、id 一致），⛔ 不重打一份 schema。存了之後出貨還要 `pnpm content:build`
 * ＋ commit —— 回應裡帶著這句提醒，studio 的 UI 會顯示它。
 *
 * 2026-09-01 owner 新裁決：AI 調整必須先進一頁式人工批核，八招只驗 Editor
 * 表達能力。保留這支 middleware 的讀取與視覺證據功能，但永久拆掉兩條直寫出口。
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROUTE_PREFIX = "/__vfxstudio";
const ID_RE = /^[a-z0-9][a-z0-9.-]{0,80}$/;

/** @param {string} repoRoot */
export function createVfxStudioMiddleware(repoRoot) {
  const dir = join(repoRoot, "content", "vfx-scripts");

  /** @param {import("node:http").ServerResponse} res */
  const sendJson = (res, code, body) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };

  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   * @param {() => void} next
   */
  return function vfxStudioMiddleware(req, res, next) {
    const url = new URL(req.url ?? "/", "http://local");
    if (!url.pathname.startsWith(ROUTE_PREFIX)) return next();

    if (req.method === "GET" && url.pathname === `${ROUTE_PREFIX}/scripts`) {
      const scripts = [];
      if (existsSync(dir)) {
        for (const f of readdirSync(dir).sort()) {
          if (!f.endsWith(".json") || f.startsWith("_")) continue;
          try {
            const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
            scripts.push({ id: String(doc.id ?? f.replace(/\.json$/, "")), abilityId: doc.abilityId ?? null, path: `vfx-scripts/${f}` });
          } catch {
            scripts.push({ id: f.replace(/\.json$/, ""), abilityId: null, path: `vfx-scripts/${f}`, parseError: true });
          }
        }
      }
      return sendJson(res, 200, { scripts });
    }

    if (req.method === "GET" && url.pathname === `${ROUTE_PREFIX}/script`) {
      const id = url.searchParams.get("id") ?? "";
      if (!ID_RE.test(id)) return sendJson(res, 400, { error: `id 不合法：${id}` });
      const p = join(dir, `${id}.json`);
      if (!existsSync(p)) return sendJson(res, 404, { error: `content/vfx-scripts/${id}.json 不存在` });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(readFileSync(p, "utf8"));
    }

    if (req.method === "POST" && url.pathname === `${ROUTE_PREFIX}/script`) {
      return sendJson(res, 409, {
        error: "Legacy studio 已禁止直接寫 content。請到 /editor/vfx-forge 提交 AI 候選，再到後台「AI 變更上線前批核」。",
        reviewPage: "/admin/",
        editorPage: "/editor/vfx-forge",
      });
    }

    if (req.method === "POST" && url.pathname === `${ROUTE_PREFIX}/proof`) {
      // 📸 連拍證據落成檔案（天譴式驗收的耐久產物）。
      // ⚠️ 報告帶著 **control**（量尺自證的讀數）與每一格的亮像素 —— ⛔ 一份沒有
      //    control 的接觸表證明不了任何事（量尺可能整台是瞎的）。
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 64 * 1024 * 1024) req.destroy();
      });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw);
          const id = String(b?.abilityId ?? "");
          if (!ID_RE.test(id)) return sendJson(res, 400, { error: `abilityId 不合法：${id}` });
          const frames = Array.isArray(b?.frames) ? b.frames : [];
          if (frames.length === 0) return sendJson(res, 400, { error: "frames 是空的" });
          const stamp = String(b?.stamp ?? "unknown");
          const control = Number(b?.control ?? 0);
          const cells = frames
            .map(
              (f) =>
                `<figure><img src="${String(f.png)}" alt="t=${f.t}"><figcaption>t=${f.t}s<br><b>亮 ${f.bright}</b></figcaption></figure>`,
            )
            .join("\n");
          const peak = Math.max(...frames.map((f) => Number(f.bright) || 0));
          const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8">
<title>${id} 連拍證據（GH#838）</title>
<style>body{background:#05060a;color:#e8ecf6;font:13px/1.6 system-ui,"Noto Sans TC";margin:16px}
h1{font-size:16px;color:#f0c674}figure{display:inline-block;margin:0 8px 10px 0;text-align:center}
img{width:230px;border:1px solid #2a3145;border-radius:4px;display:block}
figcaption{color:#98a2bd;font-size:11px;margin-top:3px}b{color:#8fe38f}
.meta{color:#98a2bd;margin:6px 0 14px}code{color:#7dc4fc}</style>
<h1>📸 ${id} —— 演出腳本連拍證據（GH#838）</h1>
<div class="meta">
產生：<code>vfx-script-studio.html?ability=${id}&amp;capture=1</code>（真 SimWorld 施放 → 真事件 → 出貨 VfxSystem → VfxScriptPlayer）<br>
⭐ 量尺自證（兩個方向）：全亮 quad 在 ⇒ <b>${control}</b> 亮像素；quad 不在 ⇒ 更少（<code>calibrateTwoWay</code> 會擲例外，所以這份報告存在本身就是它過了）<br>
峰值 <b>${peak}</b> 亮像素 · ${frames.length} 格 · 時間戳 ${stamp}
</div>
${cells}
</html>`;
          // ⚠️ `outDir` ⛔ 不叫 dir —— 外層 closure 已經有一個 dir（vfx-scripts），
          //    同名遮蔽在這種檔案寫入的程式裡是下一個人讀錯的起點。
          const outDir = join(repoRoot, "docs", "_reports");
          if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
          const rel = `docs/_reports/vfx-proof_${id}_temp_${stamp}.html`;
          writeFileSync(join(repoRoot, rel), html, "utf8");

          // ⭐ GH#669 —— **同時**落一個逐格 PNG 的序列目錄。批次驗收頁
          //    （`feature-review.html`）吃的是那個形狀（`sequenceDir` ＋ 逐格檔），
          //    ⛔ 不是一份 HTML。⇒ 一次連拍同時產出「給人讀的接觸表」與
          //    「給驗收頁吃的序列」，⛔ 不必為了登記再拍一次（那會是第二份證據，
          //    而兩份會漂）。
          const seqRel = `docs/_reports/vfxscript_visual-proof_${stamp}`;
          const seqDir = join(repoRoot, seqRel);
          if (!existsSync(seqDir)) mkdirSync(seqDir, { recursive: true });
          const written = [];
          frames.forEach((f, i) => {
            const b64 = String(f.png).split(",")[1] ?? "";
            const name = `${id}_t${String(i).padStart(2, "0")}_${String(f.t).replace(".", "p")}s_bright${f.bright}.png`;
            writeFileSync(join(seqDir, name), Buffer.from(b64, "base64"));
            written.push(name);
          });
          // frames.md —— 序列目錄的**索引**（既有目錄都有一份；驗收頁與人都讀它）
          const mdPath = join(seqDir, "frames.md");
          // ⭐ **在哪一個 HEAD 上拍的** —— 沒有這一行，「這份證據驗的是不是修好
          //    之後的東西」永遠判不出來（`review:register` 逐字指出這個缺口）。
          //    ⚠️ 由**產生端**寫，⛔ 不是事後手補（手補的那一行下一次就會忘）。
          let head = "unknown";
          try {
            head = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
              cwd: repoRoot, encoding: "utf8", timeout: 10_000,
            }).trim();
          } catch { /* 不是 git 樹也要能產證據 —— 只是判不出新舊 */ }
          const header = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : `# 演出腳本連拍證據（GH#838 · 批次驗收 #669）\n\n> 台子：vfx-script-studio.html（真 SimWorld → 真事件 → 出貨 VfxSystem → VfxScriptPlayer）（HEAD=${head}）\n\n⭐ 每一格的檔名帶著**量到的亮像素**；量尺兩方向自證過（\`calibrateTwoWay\`）。\n`;
          writeFileSync(
            mdPath,
            header + `\n## ${id}（control=${control} · 峰值 ${peak}）\n\n` +
              written.map((n) => `- \`${n}\``).join("\n") + "\n",
            "utf8",
          );
          return sendJson(res, 200, { ok: true, path: rel, sequenceDir: seqRel, peak, frames: frames.length });
        } catch (err) {
          return sendJson(res, 400, { error: String(err?.message ?? err) });
        }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === `${ROUTE_PREFIX}/publish`) {
      return sendJson(res, 409, {
        error: "已取消從 Legacy studio commit/push。只有後台人工核准的精確 hash 能 Promote；網路 push 仍由 feature branch 流程處理。",
      });
    }

    return sendJson(res, 404, { error: `未知路由 ${req.method} ${url.pathname}` });
  };
}

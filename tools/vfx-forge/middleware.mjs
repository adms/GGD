/**
 * VFX-SCRIPT STUDIO API (GH#838) — dev-only 寫回通道，掛在 client vite dev server。
 *
 * 模式照抄 tools/review/middleware.mjs（GH#664 的跨 lane 契約）：
 * vite.config.ts 在 configureServer 時動態 import 這一份；模組缺席 ⇒ 路由回 503
 * 指名缺什麼，⛔ 不是白畫面。`apply:"serve"` ⇒ 這條路**不存在於任何出貨 build**。
 *
 * 路由（全部 JSON）：
 *   GET  /__vfxstudio/scripts        → { scripts: [{id, abilityId, path}] }（掃目錄）
 *   GET  /__vfxstudio/script?id=X    → 該檔原文
 *   POST /__vfxstudio/script         → { id, doc } 寫進 content/vfx-scripts/<id>.json
 *   POST /__vfxstudio/publish        → 回存主線（owner 2026-08-28 裁決「編輯儲存完後
 *        可以回存到主線甚至間接到github」）：`pnpm content:build`（產物跟上）→
 *        `git commit -F … -- <逐檔 pathspec>`（⛔ 不 stage、⛔ 不掃別人的檔 ——
 *        pathspec 只含 content/vfx-scripts 與 bundle/manifest 產物）→ `git push`。
 *        `.git/index.lock` 在 ⇒ 409（別的 git 動作在飛，⛔ 不搶）。逐步回報，
 *        任何一步紅都把 log 尾巴帶回去 —— 安靜的失敗與成功長得一樣（守則）。
 *
 * ⚠️ 驗證的分工：**權威 Zod 驗證在頁面側**（studio import 出貨的 zVfxScriptDoc，
 * 存檔前 parse —— schema 單一住處）；這裡只做結構與路徑安全（id 白名單字元、
 * doc 是物件、id 一致），⛔ 不重打一份 schema。存了之後出貨還要 `pnpm content:build`
 * ＋ commit —— 回應裡帶著這句提醒，studio 的 UI 會顯示它。
 *
 * ⚠️ 寫的是 `content/vfx-scripts/`（手編集合，genguard 無擁有者）——
 * ⛔ 這支永遠不可以長出「寫別的集合」的參數：那等於繞過產物隔離區。
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

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
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 512 * 1024) req.destroy(); // script 上限 64 段 —— 512KB 已是天文
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(raw);
          const id = String(body?.id ?? "");
          const doc = body?.doc;
          if (!ID_RE.test(id)) return sendJson(res, 400, { error: `id 不合法：${id}` });
          if (typeof doc !== "object" || doc === null || Array.isArray(doc))
            return sendJson(res, 400, { error: "doc 要是一個物件" });
          if (doc.id !== id) return sendJson(res, 400, { error: `doc.id（${doc.id}）與 id（${id}）不一致` });
          if (doc.schema !== "vfx-script@1")
            return sendJson(res, 400, { error: `schema 要是 vfx-script@1，收到 ${doc.schema}` });
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${id}.json`), JSON.stringify(doc, null, 2) + "\n", "utf8");
          return sendJson(res, 200, {
            ok: true,
            path: `content/vfx-scripts/${id}.json`,
            reminder: "已寫進工作樹。出貨前要：pnpm content:build ＋ git add（bundle 是 build 的產物）。",
          });
        } catch (err) {
          return sendJson(res, 400, { error: `body 不是 JSON：${err instanceof Error ? err.message : String(err)}` });
        }
      });
      return;
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
          return sendJson(res, 200, { ok: true, path: rel, peak, frames: frames.length });
        } catch (err) {
          return sendJson(res, 400, { error: String(err?.message ?? err) });
        }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === `${ROUTE_PREFIX}/publish`) {
      // ── 回存主線：build → commit（逐檔 pathspec）→ push ───────────────────
      const PATHSPEC = ["content/vfx-scripts", "content/bundle.json", "content/manifest.json"];
      const run = (cmd, args, timeoutMs) =>
        execFileSync(cmd, args, {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: timeoutMs,
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 16 * 1024 * 1024,
        });
      const steps = [];
      try {
        if (existsSync(join(repoRoot, ".git", "index.lock")))
          return sendJson(res, 409, {
            error: ".git/index.lock 在 —— 別的 git 動作在飛，等它完再按。",
            steps,
          });
        // ① 產物跟上（bundle 是 build 的產物 —— 沒有這一步，push 上去的是說謊的 bundle）
        try {
          run("pnpm", ["content:build"], 8 * 60 * 1000);
          steps.push({ step: "content:build", ok: true });
        } catch (err) {
          const tail = String(err?.stdout ?? "").slice(-1200) + String(err?.stderr ?? "").slice(-600);
          return sendJson(res, 500, { error: "content:build 紅了 —— 沒 commit 沒 push", steps, log: tail });
        }
        // ② 新檔進版控視野（-N＝intent-to-add，⛔ 不 stage 內容）
        const untracked = run("git", ["ls-files", "--others", "--exclude-standard", "content/vfx-scripts"], 30_000)
          .split("\n")
          .filter(Boolean);
        if (untracked.length) run("git", ["add", "-N", ...untracked], 30_000);
        // ③ 有沒有東西可 commit（乾淨就誠實說乾淨，⛔ 不空 commit）
        const dirty = run("git", ["status", "--porcelain", "--", ...PATHSPEC], 30_000).trim();
        if (!dirty) return sendJson(res, 200, { ok: true, clean: true, message: "工作樹乾淨 —— 沒有要回存的改動。", steps });
        const changed = dirty.split("\n").map((l) => l.slice(3)).filter((p) => p.startsWith("content/vfx-scripts/") && !p.endsWith("_index.json"));
        // ④ commit：訊息寫進 tmp 檔，pathspec 逐檔 —— ⛔ 不 stage、⛔ 不掃別人的檔
        const msgPath = join(tmpdir(), `vfxstudio-publish-${Date.now()}.txt`);
        writeFileSync(
          msgPath,
          `content(vfx-scripts)(#838): studio 回存主線 —— ${changed.map((p) => p.replace("content/vfx-scripts/", "").replace(".json", "")).join("、") || "產物刷新"}\n\n` +
            `特效工坊「⬆️ 回存主線」：content:build → commit（pathspec 只含 vfx-scripts＋bundle/manifest 產物）→ push，由 dev middleware 代跑（owner 2026-08-28 裁決）。\n\n` +
            `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n`,
          "utf8",
        );
        try {
          run("git", ["commit", "-F", msgPath, "--", ...PATHSPEC], 60_000);
          steps.push({ step: "commit", ok: true, hash: run("git", ["rev-parse", "--short", "HEAD"], 10_000).trim() });
        } catch (err) {
          return sendJson(res, 500, { error: "git commit 紅了", steps, log: String(err?.stderr ?? err?.message ?? "").slice(-800) });
        }
        // ⑤ push（間接到 github 的那一步）—— 失敗要說「commit 在了、push 沒上去」
        try {
          run("git", ["push"], 120_000);
          steps.push({ step: "push", ok: true });
        } catch (err) {
          return sendJson(res, 500, {
            error: "push 失敗 —— ⚠️ commit 已在本機主線，只是還沒上 GitHub（多半要先 pull）",
            steps,
            log: String(err?.stderr ?? err?.message ?? "").slice(-800),
          });
        }
        return sendJson(res, 200, { ok: true, steps, message: "✓ 已回存主線並 push 到 GitHub。" });
      } catch (err) {
        return sendJson(res, 500, { error: String(err?.message ?? err), steps });
      }
    }

    return sendJson(res, 404, { error: `未知路由 ${req.method} ${url.pathname}` });
  };
}

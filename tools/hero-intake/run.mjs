/**
 * 🧰 tools/hero-intake —— 新英雄上架的**一條龍**：模型對應 · 圖示 · 語音配對 → **一頁檢核**
 *
 * owner 2026-09-11（逐字）：
 * > 「我又有一批34個英雄上架中 請你做一樣的流程並且用**自動化流程（script）**的方式來執行**語音配對與圖示生成**」
 * > 「並且同時檢查**模型對應是否有缺漏**」
 * > 「全部放到**一頁檢核頁面**讓我複查，這個過程**全部自動化**，只留**最後我的審查通過與否**，
 * >  並且**這一頁也要放到後台管理頁**」
 *
 * ⭐ 這支不是新的產生器 —— 它**編排既有的那幾支**，把三件事收斂成一份**批核材料**：
 *
 * | 段 | 問什麼 | 讀誰 |
 * |---|---|---|
 * | 🧍 模型 | `modelKey` 指得到 model 文件嗎？`glbPath` 的檔**真的在工作樹**嗎？有 `clipMap` 嗎？ | `content/champions/*.json` → `content/models/*.json` → `content/assets/models/**` |
 * | 🖼 圖示 | `icon` 那一格有檔嗎？沒有就**產**（`tools/icon-gen/local/batch.py --only <id>`） | `content/assets/icons/champions/**` |
 * | 🎙 語音 | 有語音包嗎？出貨門檻缺哪幾格？全庫**有沒有這位角色的原作語音**可以補？ | `MANIFEST.json` · `lines/<id>/status.json` · owner 的角色語音索引 |
 *
 * ⛔ **它不自己裁決**：每一位英雄只算出 `blockers`（會擋上架的）與 `warnings`（要看一眼的），
 * 最後一步是 owner 在後台那一頁按**通過／退回** —— 結果寫進既有的 `docs/_review/verdicts/`
 * （`tools/review/stores.mjs` 的兩個分署住處，⛔ 不是第三個帳本）。
 *
 * ```sh
 * node tools/hero-intake/run.mjs --batch lol-batch2 --from docs/community-hero-forge/lol-batch2/official-names.json
 * node tools/hero-intake/run.mjs --batch ship81 --heroes b2-rem,b2-rin --no-gen-icons
 * node tools/hero-intake/run.mjs --batch ship81 --all                 # 全部 champions
 * node tools/hero-intake/run.mjs --batch ship81 --all --check         # 材料過期就回非零（閘）
 * ```
 */
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const CONTENT = join(ROOT, "content");
const MATERIAL_REL = "docs/_review/material/hero-intake";
const CATEGORIES_REL = "content/assets/audio/voices/lines/CATEGORIES.json";
const MANIFEST_REL = "content/assets/audio/voices/champions/MANIFEST.json";

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const BATCH = opt("--batch", "batch");
const CHECK = has("--check");
const GEN_ICONS = !has("--no-gen-icons");
const VOICE_INDEX = opt("--voice-index", process.env.GGD_VOICE_INDEX ?? null);
/**
 * ⭐ 還沒進 `content/champions/` 的英雄（待上架）**也要答得出模型那一段** ——
 * 來源是另一個 repo 的交付表（`docs/_reports/community-acquired-heroes/model-delivery-summary.json`：
 * 每一位的 `defaultModelKey` · `selectedClips` · `files[].gitPath`＋`sha256`）。
 * ⛔ 沒給就只能說「還沒有 champion 文件」，⛔ 不是假裝沒有模型。
 */
const DELIVERY = opt("--delivery", null);
/**
 * ⭐ 交付**表**與交付**的位元組**是兩件事 —— 表說「已交付」，位元組可能還在那個 repo，
 * 也可能**連那裡都沒有**（2026-09-11 量到：32 個交付檔裡有 4 個在來源 repo 也不存在）。
 * ⇒ 從交付表的路徑往上找到那個 repo 的根（`.git` 所在），兩邊都數一次。
 */
const DELIVERY_ROOT = opt("--delivery-root", null) ?? (() => {
  if (!DELIVERY) return null;
  let dir = dirname(DELIVERY);
  for (let i = 0; i < 8 && dir && dir !== "/"; i += 1) {
    if (existsSync(join(dir, ".git"))) return dir;
    dir = dirname(dir);
  }
  return null;
})();

const readJson = (p, d = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// ────────────────────────────── 英雄清單 ──────────────────────────────
/** `--heroes a,b` ｜ `--from <json>`（吃 id 陣列／{champions:{Name:{ownerName}}}／[{id,name}]）｜ `--all` */
function heroList() {
  const ids = opt("--heroes");
  if (ids) return ids.split(",").map((s) => ({ id: s.trim() })).filter((h) => h.id);
  const from = opt("--from");
  if (from) {
    const doc = readJson(join(ROOT, from)) ?? readJson(from);
    if (doc === null) die(`--from 讀不到：${from}`);
    const row = (x) => (typeof x === "string" ? { id: x } : { id: x.id ?? x.heroId, name: x.name, deliveryKey: x.deliveryKey ?? null });
    if (Array.isArray(doc)) return doc.map(row);
    if (Array.isArray(doc.heroes)) return doc.heroes.map(row);
    if (Array.isArray(doc.rows)) return doc.rows.map(row);
    if (doc.champions && !Array.isArray(doc.champions)) {
      // official-names.json 的形狀：{champions: {Sett: {ownerName: "賽特"}}} —— 還沒有 GGD id
      return Object.entries(doc.champions).map(([native, v]) => ({ id: v.id ?? `lol-${native.toLowerCase()}`, name: v.ownerName ?? native, native }));
    }
    die(`--from 認不得這個形狀：${from}`);
  }
  if (has("--all")) {
    return readdirSync(join(CONTENT, "champions"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => ({ id: f.slice(0, -5) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  die("要給 --heroes a,b ｜ --from <json> ｜ --all");
  return [];
}

function die(msg) { console.error(`[hero-intake] ⛔ ${msg}`); process.exit(2); }

// ────────────────────────────── ① 模型對應 ──────────────────────────────
const modelDocs = (() => {
  const dir = join(CONTENT, "models");
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = readJson(join(dir, f));
    if (d?.id) out.set(d.id, { ...d, rel: `content/models/${f}` });
  }
  return out;
})();

/**
 * ⭐⭐ 一顆 glb 缺席有**三種**意思，⛔ 它們不是同一件事（這一段是踩出來的：第一版把 45 位
 * 英雄全判成「真的缺一顆模型」，而其中 45 顆**都在 `content/assets-offdisk.json` 裡宣告過** ——
 * 位元組住 S3、雜湊住 git，那是 owner 2026-09-08 的歸屬表，⛔ 不是缺漏）：
 *   ① 宣告在 `assets-offdisk.json` ⇒ **正常**（本機沒抓而已，⭐ 有 sha256 驗得起來）
 *   ② 沒宣告，但**別的分支有** ⇒ checkout／合併的事
 *   ③ 沒宣告、任何分支都沒有 ⇒ ⛔ **真的缺一顆模型檔**
 */
const offDisk = (() => {
  const d = readJson(join(CONTENT, "assets-offdisk.json"), null);
  return new Set(Object.keys(d?.entries ?? {}));
})();

/**
 * ⭐ 「檔不在工作樹」與「檔**任何分支都沒有**」是兩件事 —— 前者是我 checkout 錯地方，
 * 後者才是真的缺漏。⇒ 一次把每一條 ref 的 blob 路徑收成一個集合，⛔ 不是逐檔問 git。
 */
function treePathsAnywhere(root, subdir) {
  const set = new Set();
  if (!root || !existsSync(join(root, ".git"))) return set;
  const refs = spawnSync("git", ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"], { cwd: root, encoding: "utf8" });
  const list = String(refs.stdout ?? "").trim().split("\n").filter(Boolean).slice(0, 40);
  for (const ref of list) {
    const r = spawnSync("git", ["ls-tree", "-r", "--name-only", ref, subdir], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    for (const line of String(r.stdout ?? "").split("\n")) if (line) set.add(line);
  }
  return set;
}
const trackedAnywhere = treePathsAnywhere(ROOT, "content/assets/models");

/**
 * 交付表：heroId／短名 → {defaultModelKey, selectedClips, files[]}
 *
 * ⛔⛔ **這是一把 join key，所以它自己要先被驗過**（CLAUDE.md 第〇·六守則：
 * 「⭐ 當你要用一把鑰匙把兩份對起來時，**先驗那把鑰匙**」）。交付表用的是**那個 repo 的短名**
 * （`ptrainer` · `steve-alex` · `oyaji` · `cooking-master`），GGD 這邊是 `acquired-*` / `godie-*`
 * ⇒ ⭐ 自動規則只解得開「去掉前綴就一樣」的那些，剩下的要在**清單裡逐位寫明** `deliveryKey`
 * （⛔ 不是在這裡猜近似字串，也⛔ 不是照順序配對 —— 順序不是 key）。
 */
const delivery = (() => {
  const out = new Map();
  if (!DELIVERY) return out;
  const d = readJson(DELIVERY) ?? readJson(join(ROOT, DELIVERY));
  if (!d?.heroes) die(`--delivery 讀不到或沒有 heroes：${DELIVERY}`);
  for (const h of d.heroes) {
    const short = String(h.hero ?? "");
    if (!short) continue;
    for (const key of [short, `acquired-${short}`, `godie-${short}`, ...(h.identityIds ?? [])]) if (key) out.set(key, h);
  }
  return out;
})();
/** 來源 repo 的「任何分支都有的路徑」與「宣告在 S3 的路徑」—— ⭐ 與本地那三分法同型 */
const sourceTracked = DELIVERY_ROOT ? treePathsAnywhere(DELIVERY_ROOT, "content/assets/models") : new Set();
const sourceOffDisk = new Set(Object.keys((DELIVERY_ROOT ? readJson(join(DELIVERY_ROOT, "content/assets-offdisk.json")) : null)?.entries ?? {}));
/**
 * ⛔⛔ **「任何分支的樹上都沒有」⛔ 不等於「位元組不存在」** —— 2026-09-11 量到 4 顆 glb 正是這樣：
 * 它們在 `7bc2fa3f8` 進來過，又被後來的一次合併刪掉 ⇒ 樹上查不到，⭐ 而位元組還在 git 歷史裡。
 * 兩者的處置完全不同（一個是「去撈回來」，一個是「還沒做出來」）⇒ ⭐ 分開回答，⛔ 不要合併成一句。
 */
const sourceEverAdded = (() => {
  const set = new Set();
  if (!DELIVERY_ROOT || !existsSync(join(DELIVERY_ROOT, ".git"))) return set;
  const r = spawnSync("git", ["log", "--all", "--full-history", "--diff-filter=A", "--name-only", "--pretty=format:", "--", "content/assets/models"],
    { cwd: DELIVERY_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60 * 1000 });
  for (const line of String(r.stdout ?? "").split("\n")) if (line.trim()) set.add(line.trim());
  return set;
})();

/** 交付表原本有幾列（⭐ 反方向要問「有沒有哪一列沒人認領」，⛔ 不是只問「我查得到嗎」） */
const deliveryRows = new Set([...delivery.values()].map((h) => String(h.hero)));
const deliveryClaimed = new Map();

/** ⭐ 一位英雄對到交付表的哪一列 —— 顯式 `deliveryKey` 優先，⛔ 指不到就**當場死**（別靜靜地沒對上）。 */
function deliveryRowFor(h) {
  if (h.deliveryKey) {
    if (!DELIVERY) die(`清單替 ${h.id} 指定了 deliveryKey「${h.deliveryKey}」，⛔ 但這次沒給 --delivery —— 補上那個旗標再跑`);
    const row = delivery.get(h.deliveryKey);
    if (!row) die(`${h.id} 的 deliveryKey「${h.deliveryKey}」在交付表裡查不到 —— ⛔ 那把鑰匙是錯的`);
    return row;
  }
  return delivery.get(h.id) ?? null;
}

/**
 * ⭐ 交付表的 `status` 逐字翻成一句話 —— ⛔ 不要把它讀成「有沒有交付」的布林：
 * 其中一種狀態（`rig-source-present-actions-missing`）的意思正是**還沒交付得出動作**。
 * ⛔ 認不得的狀態原字串照印，⛔ 不猜。
 */
const DELIVERY_STATUS_TEXT = {
  "converted-shared-contract-and-motion-verified": "已轉檔並驗過動作",
  "existing-finished-files-copied-byte-identical": "沿用既有成品（逐位元組相同）",
  "rig-source-present-actions-missing": "只有骨架來源，⛔ 動作還沒做",
};

const CLIPS = ["idle", "run", "attack", "cast", "hurt", "death"];

/**
 * ⭐ 一把 modelKey 在**這個 repo** 裡站不站得住 —— 兩條路共用它：
 * ① champion 文件上的 `modelKey` ② 交付表上的 `defaultModelKey`。
 * ⚠️ 後者是踩出來的：那 10 位「沿用既有成品」的交付列 `files` 是**空的**，
 * 因為那些檔**本來就在這個 repo** ⇒ ⛔ 空的 files ⛔ 不等於沒有模型，要真的拿那把 key 去查。
 */
function resolveModelKey(modelKey) {
  if (!modelKey) return { ok: false, modelKey: null, gap: "沒有 modelKey", severity: "blocker" };
  const doc = modelDocs.get(modelKey);
  if (!doc) return { ok: false, modelKey, gap: "modelKey 指不到任何 model@1 文件", severity: "blocker" };
  const glbPath = doc.glbPath ?? null;
  if (!glbPath) return { ok: false, modelKey, gap: "model 文件沒有 glbPath", severity: "blocker" };
  const abs = join(CONTENT, glbPath);
  if (!existsSync(abs)) {
    const declared = offDisk.has(glbPath);
    const inSomeBranch = trackedAnywhere.has(`content/${glbPath}`);
    return {
      ok: declared, modelKey, glbPath, offDisk: declared, inSomeBranch,
      gap: declared
        ? "位元組在 S3（`assets-offdisk.json` 宣告過，sha256 驗得起來）—— ⭐ 本機沒抓而已"
        : inSomeBranch
          ? "glb 不在這棵工作樹，⭐ 但**別的分支有** —— checkout／合併的事，⛔ 不是資產缺漏"
          : "glb **沒有宣告、任何分支也沒有** —— ⛔ 真的缺一顆模型檔",
      severity: declared ? "" : inSomeBranch ? "warning" : "blocker",
    };
  }
  const clip = doc.clipMap ?? null;
  const missingClips = clip ? CLIPS.filter((c) => !clip[c]) : CLIPS;
  return {
    ok: missingClips.length === 0,
    modelKey, glbPath, bytes: statSync(abs).size, clipMap: clip, missingClips,
    gap: missingClips.length === 0 ? "" : `clipMap 少了：${missingClips.join("／")}`,
    severity: missingClips.length === 0 ? "" : clip ? "warning" : "blocker",
  };
}

/** 模型對應的缺漏 —— ⭐ 每一階都分開回答，⛔ 不是一個「有沒有模型」的布林 */
function checkModel(champ, id, d = null) {
  // 還沒有 champion 文件，但**交付表有** ⇒ 回答得出「模型在哪、進 repo 了沒」。
  if (!champ && d) {
    const files = d.files ?? [];
    const status = String(d.status ?? "");
    const statusText = DELIVERY_STATUS_TEXT[status] ?? "";
    const key = d.defaultModelKey ?? null;
    // ⛔⛔ `files` 是**空的**時有**兩個**完全相反的意思，⛔ 而「0/0 個檔進來了」把兩個都讀成了「到齊」：
    //    ① 沒有 modelKey ⇒ 這一位**還沒有模型可交**（`rig-source-present-actions-missing`）⇒ ⛔ 真缺漏
    //    ② 有 modelKey ⇒ 檔**本來就在這個 repo**（`existing-finished-files-copied-byte-identical`）⇒ 去查那把 key
    if (files.length === 0) {
      if (!key) {
        return {
          ok: false, modelKey: null, clipMap: null, deliveryStatus: status, files: 0, filesInRepo: 0,
          gap: `交付表有這一位但**沒有模型**（0 個檔、沒有 modelKey）—— 狀態「${status || "(空)"}」${statusText ? `：${statusText}` : ""}`,
          severity: "blocker",
        };
      }
      const m = resolveModelKey(key);
      const bad = m.severity === "blocker";
      return {
        ...m, ok: false, clipMap: m.clipMap ?? d.selectedClips ?? null, deliveryStatus: status, files: 0, filesInRepo: 0,
        gap: bad
          ? `交付表說「${statusText || status}」，⛔ 但這個 repo 裡 ${m.gap}`
          : `模型已經在這個 repo（${statusText || status}${m.gap ? `；${m.gap}` : ""}）—— ⛔ 只差 champion 文件還沒進 content`,
        severity: bad ? "blocker" : "warning",
      };
    }
    const here = files.filter((f) => f.gitPath && existsSync(join(ROOT, f.gitPath)));
    const declaredOff = files.filter((f) => f.gitPath?.startsWith("content/") && offDisk.has(f.gitPath.slice("content/".length)));
    const landed = here.length + declaredOff.length;
    // ⭐ 反方向再問一次：那些檔**在來源 repo** 存在嗎？⛔ 「表上寫了」⛔ 不等於「位元組在」。
    // ⚠️ 而「來源那棵工作樹沒有」與「來源**任何分支都沒有**」又是兩件事（跟本地那三分法同型）——
    //    ⛔ 只 stat 檔案會把「在別的分支」誤判成「位元組沒交出來」。
    const liveAtSource = (f) => f.gitPath && (existsSync(join(DELIVERY_ROOT, f.gitPath)) || sourceTracked.has(f.gitPath) || sourceOffDisk.has(f.gitPath.replace(/^content\//, "")));
    const atSource = DELIVERY_ROOT ? files.filter(liveAtSource).length : null;
    const atSourceWorktree = DELIVERY_ROOT ? files.filter((f) => f.gitPath && existsSync(join(DELIVERY_ROOT, f.gitPath))).length : null;
    // 樹上沒有，但**歷史裡有** ⇒ 撈得回來（⛔ 不是「還沒做出來」）
    const inHistory = DELIVERY_ROOT ? files.filter((f) => !liveAtSource(f) && sourceEverAdded.has(f.gitPath)).length : 0;
    const gone = atSource === null ? 0 : files.length - atSource - inHistory;
    const sourceShort = gone > 0;
    return {
      ok: false, modelKey: d.defaultModelKey ?? null, clipMap: d.selectedClips ?? null,
      deliveryStatus: status, files: files.length, filesInRepo: landed,
      filesAtSource: atSource, filesAtSourceWorktree: atSourceWorktree, filesOnlyInSourceHistory: inHistory, filesGone: gone,
      gap: landed >= files.length
        ? `模型已交付且 ${files.length} 個檔都在 —— ⛔ 只差 champion 文件還沒進 content`
        : sourceShort
          ? `⛔ 交付表說「${statusText || status}」，但 ${gone}/${files.length} 個檔**來源 repo 的樹上與歷史裡都沒有** —— 位元組還沒交出來`
          : inHistory > 0
            ? `模型已交付（${statusText || status}），⚠️ 但 ${inHistory}/${files.length} 個檔在來源 repo **被後來的合併刪掉了**（位元組還在 git 歷史裡，撈得回來）`
            : `模型已交付（${statusText || status}），${atSource === null ? "" : `來源 repo ${atSource}/${files.length} 個檔在${atSourceWorktree < atSource ? "（其中 " + (atSource - atSourceWorktree) + " 個在別的分支／S3）" : ""}，`}但 ${files.length - landed}/${files.length} 個檔還沒進這個 repo`,
      severity: sourceShort ? "blocker" : "warning",
    };
  }
  if (!champ) {
    return {
      ok: false,
      gap: DELIVERY
        ? "還沒有 content/champions 文件，⛔ **交付表裡也沒有這一位** —— 模型從哪來還沒有答案"
        : "還沒有 content/champions 文件（⚠️ 沒給 --delivery，這支答不出模型在別的 repo 交付了沒）",
      severity: "blocker",
    };
  }
  const m = resolveModelKey(champ.modelKey ?? null);
  return m.modelKey === null ? { ...m, gap: "champion 文件沒有 modelKey" } : m;
}

// ────────────────────────────── ② 圖示 ──────────────────────────────
function checkIcon(champ, id) {
  // ⭐ 英雄還沒進 content ⇒ 圖示產生器（吃 live content 文件）**還不能跑**。
  // 那是**順序**，⛔ 不是第二個缺漏 —— 所以它是 warning，模型那一段也一樣。
  if (!champ) return { ok: false, gap: "等 champion 文件進 content 才產得了圖示", severity: "warning" };
  const rel = champ?.icon ?? null;
  if (!rel) return { ok: false, gap: "champion 文件沒有 icon 欄位", severity: "blocker" };
  const abs = join(CONTENT, rel);
  if (!existsSync(abs)) return { ok: false, path: rel, gap: "icon 指的檔不在工作樹", severity: "blocker" };
  const bytes = statSync(abs).size;
  const method = existsSync(`${abs}.method`) ? readJson(`${abs}.method`) : null;
  return { ok: true, path: rel, bytes, generator: method?.generator ?? method?.engine ?? null, gap: "", severity: "" };
}

/** ⭐ 沒有圖示就**產一張** —— 用出貨的那支本機批次器，⛔ 不是這裡自己畫 */
function generateIcon(id) {
  const r = spawnSync("python3", [join(ROOT, "tools/icon-gen/local/batch.py"), "--category", "champions", "--only", id], {
    cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000,
  });
  return { ran: true, code: r.status, tail: String(r.stdout ?? "").trim().split("\n").slice(-3).join("\n") || String(r.stderr ?? "").trim().slice(-400) };
}

// ────────────────────────────── ③ 語音 ──────────────────────────────
const voicePack = readJson(join(ROOT, MANIFEST_REL), { champions: {} });
const REQUIRED = readJson(join(ROOT, CATEGORIES_REL), {})?.shipGate?.required ?? [];

/** owner 的角色語音索引（本機素材庫）—— 有就用來找「這位角色有沒有原作語音」 */
function loadVoiceIndex() {
  const candidates = [
    VOICE_INDEX,
    "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-hero-model-options/materials/hero-model-library/voice-index.json",
  ].filter(Boolean);
  for (const p of candidates) {
    const d = readJson(p);
    if (d?.groups) return { path: p, groups: d.groups };
  }
  return null;
}

/**
 * ⭐ 兩個名字「像不像」—— ⛔ 這不是判準，是**證據**：編號對上而名字對不上的時候，
 * 頁面要**兩個都印出來**讓人看一眼（CLAUDE.md：一個單點的 key 錯誤會被同步器放大成資料毀損）。
 */
function namesAgree(a, b) {
  const clean = (x) => String(x ?? "").replace(/[\s·・（）()／/「」]/g, "");
  const A = clean(a); const B = clean(b);
  if (!A || !B) return false;
  if (A.includes(B) || B.includes(A)) return true;
  const cjk = (x) => new Set([...x].filter((c) => /[\u3400-\u9fff]/.test(c)));
  const sa = cjk(A); const sb = cjk(B);
  let shared = 0;
  for (const c of sa) if (sb.has(c)) shared += 1;
  return shared >= 2;
}

function checkVoice(id, name, index, inContent, identityIds = []) {
  const entry = voicePack.champions?.[id] ?? null;
  const lines = entry?.lines ?? {};
  const have = REQUIRED.filter((c) => Array.isArray(lines[c]) && lines[c].length > 0);
  const missing = REQUIRED.filter((c) => !(Array.isArray(lines[c]) && lines[c].length > 0));
  const shared = entry?.sharedFrom ?? null;
  const out = {
    ok: entry !== null && missing.length === 0,
    pack: entry !== null, sharedFrom: shared,
    categories: Object.keys(lines).length,
    required: REQUIRED.length, haveRequired: have.length, missing,
    select: Array.isArray(lines.select) ? lines.select.length : 0,
    candidates: [],
    gap: entry === null ? (inContent ? "沒有語音包" : "還沒有語音包（英雄也還沒進 content）") : missing.length ? `出貨門檻缺 ${missing.length} 格` : "",
    // ⭐ 還沒進 content 的英雄，語音當然還沒配 —— 那是**順序**，⛔ 不是它自己的缺陷。
    severity: entry === null ? (inContent ? "blocker" : "warning") : missing.length ? "warning" : "",
  };
  if (!index) return out;
  // ⭐ 全庫有沒有這位角色的原作語音？三種命中方式，⛔ 它們的可信度**不一樣**：
  //   ① 索引自己綁的 `heroIds`（owner 的索引器寫的）⇒ 最可信
  //   ② 交付表的 `identityId` 命中索引的**編號**（`300heroes:62` / `mba:Chara14`）
  //      ⚠️ 編號是 join key ⇒ ⭐ 一定要把索引那一邊的**名字也印出來**：編號對上而名字對不上，
  //      正是 key 漂掉的樣子（CLAUDE.md 第〇·六守則），⛔ 不可以靜靜地當成命中。
  //   ③ 名字包含 ⇒ ⛔ 只是候選（owner 2026-09-08：「同名匹配只是候選」）
  const byId = new Map();
  for (const g of index.groups) byId.set(String(g.id ?? g.groupId), g);
  const push = (g, why, confidence) => {
    const gid = String(g.id ?? g.groupId);
    if (out.candidates.some((c) => c.groupId === gid)) return;
    out.candidates.push({
      groupId: gid, groupName: g.name ?? "", library: g.library ?? "", work: g.work ?? "",
      language: g.language ?? "", fileCount: g.fileCount ?? 0,
      speakerVerified: g.speakerVerified ?? null, transcriptStatus: g.transcriptStatus ?? null,
      why, confidence,
    });
  };
  for (const raw of identityIds) {
    const g = byId.get(String(raw));
    if (!g) continue;
    const agree = namesAgree(name, g.name);
    push(g, agree
      ? `交付表的 identityId「${raw}」命中索引編號，名字也對得上`
      : `⚠️ 交付表說這一位是「${raw}」，而索引裡那個編號叫「${g.name ?? ""}」—— **編號對上、名字對不上**，要人看一眼`,
      agree ? "identity" : "identity-name-mismatch");
  }
  for (const g of index.groups) {
    const bound = Array.isArray(g.heroIds) && g.heroIds.includes(id);
    const byName = name && typeof g.name === "string" && g.name.includes(name);
    if (!bound && !byName) continue;
    push(g, bound ? "索引已綁 heroId" : "名字命中（⚠️ 只是候選）", bound ? "high" : "candidate");
    if (out.candidates.length >= 5) break;
  }
  out.candidates.sort((a, b) => ({ high: 0, identity: 1, "identity-name-mismatch": 2, candidate: 3 }[a.confidence] ?? 9)
    - ({ high: 0, identity: 1, "identity-name-mismatch": 2, candidate: 3 }[b.confidence] ?? 9));
  const mismatched = out.candidates.filter((c) => c.confidence === "identity-name-mismatch").length;
  if (!out.pack && out.candidates.length > 0) {
    out.gap += `；全庫有 ${out.candidates.length} 個候選來源`;
    if (mismatched) out.gap += `（⚠️ 其中 ${mismatched} 個編號對上但名字對不上）`;
  }
  return out;
}

// ────────────────────────────── 跑 ──────────────────────────────
const heroes = heroList();
const index = loadVoiceIndex();
const outDir = join(ROOT, MATERIAL_REL);
if (!CHECK) mkdirSync(outDir, { recursive: true });

const rows = [];
for (const h of heroes) {
  const champPath = join(CONTENT, "champions", `${h.id}.json`);
  const champ = readJson(champPath);
  const name = h.name ?? champ?.name ?? h.id;
  const drow = deliveryRowFor(h);
  if (drow) {
    const key = String(drow.hero);
    deliveryClaimed.set(key, [...(deliveryClaimed.get(key) ?? []), h.id]);
  }
  const model = checkModel(champ, h.id, drow);
  let icon = checkIcon(champ, h.id);
  let iconRun = null;
  if (!icon.ok && GEN_ICONS && !CHECK && champ) {
    iconRun = generateIcon(h.id);
    icon = { ...checkIcon(readJson(champPath), h.id), generated: iconRun.code === 0, run: iconRun };
  }
  const voice = checkVoice(h.id, name, index, champ !== null, drow?.identityIds ?? []);
  // ⭐ 圖示**不複製**一份進材料 —— 那會讓同一張圖在 git 裡有第二個住處（第〇·四守則）。
  // 頁面透過 `/__review/hero-asset?p=` 直接讀出貨樹那一張（那條路只供應 content/assets/icons/）。
  const iconAsset = icon.ok ? `content/${icon.path}` : null;
  const blockers = [model, icon, voice].filter((x) => x.severity === "blocker").map((x) => x.gap);
  const warnings = [model, icon, voice].filter((x) => x.severity === "warning").map((x) => x.gap);
  rows.push({ id: h.id, name, inContent: champ !== null, deliveryKey: drow ? String(drow.hero) : null, model, icon: { ...icon, asset: iconAsset }, voice, blockers, warnings, ready: blockers.length === 0 });
}

/**
 * ⭐⭐ **反方向再走一次**（CLAUDE.md 形態⑫）：上面那個迴圈只答得出「我這 N 位查得到交付列嗎」，
 * ⛔ 結構上答不出「交付表裡有沒有哪一列**沒有人認領**」—— 而那正是 join key 漂掉的樣子
 * （一位英雄配到別人的模型，兩邊看起來都很正常）。⇒ 兩頭都走，⛔ 一頭不算。
 */
const deliveryUnclaimed = [...deliveryRows].filter((k) => !deliveryClaimed.has(k)).sort();
const deliveryDouble = [...deliveryClaimed.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => `${k}←${ids.join("＋")}`);

// ⭐ digest 要涵蓋**頁面上看得到的每一件事** —— ⛔ 只放 glbPath/bytes 的話，
// 「模型交付狀態變了」這種改動不會讓舊裁決過期（而 owner 正是照那一欄按的）。
const digest = sha256(JSON.stringify(rows.map((r) => [
  r.id, r.ready, r.model.ok, r.model.deliveryStatus ?? "", r.model.filesInRepo ?? -1, r.model.files ?? -1, r.model.filesAtSource ?? -1,
  r.model.filesOnlyInSourceHistory ?? -1, r.model.filesGone ?? -1,
  r.model.glbPath ?? "", r.model.bytes ?? 0, r.icon.path ?? "", r.icon.bytes ?? 0, r.voice.haveRequired, r.voice.categories, (r.voice.candidates ?? []).map((c) => `${c.groupId}:${c.confidence}`).join("|"),
])));
const doc = {
  schema: "ggd-hero-intake@1",
  batch: BATCH,
  generatedBy: "tools/hero-intake/run.mjs",
  ownerAsk: "owner 2026-09-11「一批34個英雄上架中…用自動化流程（script）執行語音配對與圖示生成」「同時檢查模型對應是否有缺漏」「全部放到一頁檢核頁面…只留最後我的審查通過與否」",
  // ⭐ 這一份是**用哪一行算出來的** —— `--check` 少一個旗標就會得到不同的 digest，
  // ⛔ 而「材料過期」與「你少打了 --delivery」長得一模一樣。⇒ 把那一行存進材料。
  invocation: `node tools/hero-intake/run.mjs ${argv.filter((a) => a !== "--check").map((a) => (/[\s]/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
  voiceIndex: index?.path ?? null,
  delivery: DELIVERY ? { path: DELIVERY, root: DELIVERY_ROOT, rows: deliveryRows.size, claimed: deliveryClaimed.size, unclaimed: deliveryUnclaimed, doubleClaimed: deliveryDouble } : null,
  counts: {
    heroes: rows.length,
    ready: rows.filter((r) => r.ready).length,
    blocked: rows.filter((r) => !r.ready).length,
    // ⭐ 「缺漏」只算**擋上架**的那一種 —— ⛔ 把「順序還沒到」也算進去，這三個數字會永遠等於總人數
    //    （而一個永遠等於總人數的統計，讀起來跟「全部都壞了」一模一樣）。
    modelGaps: rows.filter((r) => r.model.severity === "blocker").length,
    iconGaps: rows.filter((r) => r.icon.severity === "blocker").length,
    voiceGaps: rows.filter((r) => r.voice.severity === "blocker").length,
    modelPending: rows.filter((r) => r.model.severity === "warning").length,
    iconPending: rows.filter((r) => r.icon.severity === "warning").length,
    voicePending: rows.filter((r) => r.voice.severity === "warning").length,
  },
  digest,
  heroes: rows,
};

const target = join(outDir, `${BATCH}.json`);
if (CHECK) {
  const prev = readJson(target);
  if (!prev) die(`${relative(ROOT, target)} 還沒產生 —— 跑一次 node tools/hero-intake/run.mjs --batch ${BATCH} …`);
  if (prev.digest !== digest) {
    die(
      `材料過期：磁碟上的英雄狀態已經變了（digest ${prev.digest?.slice(0, 12)} ≠ ${digest.slice(0, 12)}）\n` +
        `   ⭐ 這一份當初是這樣算的：${prev.invocation ?? "（舊材料沒記）"}\n` +
        `   ⚠️ 少一個旗標（例如 --delivery）也會得到不同的 digest —— ⛔ 那不是「英雄變了」`,
    );
  }
  console.log(`[hero-intake] --check ✓ ${relative(ROOT, target)} 是最新的（${prev.counts.heroes} 位）`);
  process.exit(0);
}
mkdirSync(dirname(target), { recursive: true });
// ⭐ 材料平時鎖 444（`scripts/review-access.sh`）—— 寫入端**自己解鎖、自己重鎖**，
// ⛔ 不是叫人先手動 chmod（一個要人記得的鎖，等於沒有鎖）。
if (existsSync(target)) chmodSync(target, 0o644);
writeFileSync(target, `${JSON.stringify(doc, null, 1)}\n`);
chmodSync(target, 0o444);
console.log(
  `[hero-intake] ${rows.length} 位 · 可上架 ${doc.counts.ready} · 被擋 ${doc.counts.blocked}` +
    `（擋上架：模型 ${doc.counts.modelGaps}／圖示 ${doc.counts.iconGaps}／語音 ${doc.counts.voiceGaps}` +
    `；等順序：模型 ${doc.counts.modelPending}／圖示 ${doc.counts.iconPending}／語音 ${doc.counts.voicePending}）→ ${relative(ROOT, target)}`,
);
for (const r of rows.filter((x) => !x.ready).slice(0, 12)) console.log(`  ⛔ ${r.id}（${r.name}）：${r.blockers.join("；")}`);
if (DELIVERY) {
  console.log(`[hero-intake] 交付表 ${deliveryRows.size} 列 · 對上 ${deliveryClaimed.size} 列`);
  if (deliveryUnclaimed.length) console.log(`  ⚠️ 沒有人認領的交付列（${deliveryUnclaimed.length}）：${deliveryUnclaimed.join("、")}`);
  if (deliveryDouble.length) console.log(`  ⛔ 同一列被兩位英雄認領：${deliveryDouble.join("、")}`);
}

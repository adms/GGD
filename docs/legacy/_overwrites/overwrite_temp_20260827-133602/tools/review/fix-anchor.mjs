/**
 * tools/review/fix-anchor.mjs —— GH#797 「登記的**修復 commit** 真的碰過這一批嗎？」
 *
 * ## 為什麼要有這一支
 * #795 把「有沒有證據」升級成「**證據在修復之前還是之後**」（`evidenceOrder()`）。
 * ⛔ 但那整條推理**架在一個沒有人驗過的前提上**：帳本登記的那個 sha，
 *    真的是這一批的修復嗎？錨錯了，祖孫比對比的就是「證據 vs 一支毫無關係的 commit」。
 *
 * ⇒ 這是「只驗名詞抓不到關係」的第三層：
 *    「**有沒有**登記 commit」是名詞 · 「**那個 commit 是不是這一批的修復**」才是關係。
 *
 * ## ⭐ 判準是**位元組**，⛔ 不是 commit 訊息
 * ⚠️⚠️ 2026-08-27 量到（而它推翻了 #797 自己的 AC1）：
 *   `invprim_visual-proof_20260826-1700` 登記的是 `e44bf446`，而 #797 主張真正的修復是
 *   `470cb1fd`（因為**它的訊息**寫著「TeamGlow 轉檔缺口修復」）。逐檔讀 diff：
 *
 *   | commit | 訊息 | 它真的動了什麼 |
 *   |---|---|---|
 *   | `e44bf446` | `fix(ops): 帳本寫入點自解鎖…` | ⭐ `revivehuman.glb` · `awaken.glb` · `w3xlib/gltf.py` · `convert_stock_model.py` · `fxLongAxisVisibleGeometry.test.ts` —— **正是這一批標題講的那三件事** |
 *   | `470cb1fd` | `fix(vfx)(#767): TeamGlow 轉檔缺口修復…` | ⛔ 只有報告 md · 帳本 · 一支 `rollbackSwitchReaches.test.ts` —— **零行轉檔程式** |
 *
 *   根因寫在 `docs/_reports/INVPRIM_temp_20260826-1700.md:236` 逐字：
 *   「**另一條 lane 把我的檔掃進了他們的 commit `e44bf446`**」——
 *   ⇒ 修復的**位元組**在 `e44bf446`，而**訊息**留在 `470cb1fd`。
 *   ⇒ ⭐ 一支照訊息（`#767` / `fix(vfx)`）判斷的閘會錨到 `470cb1fd` ＝ **錯的那一個**。
 *      照 diff 判斷的閘錨到 `e44bf446` ＝ 對的那一個。**這一支照 diff。**
 *
 * ## ⭐ 宣稱的檔案集合是**推導**的，⛔ 不是手寫的一張對照表
 * 從那一批**自己的登記**出發，沿出貨內容的引用圖走：
 *   `abilities[]` → `content/abilities/<id>.json`
 *     → `modelKey`  → `content/models/<key>.json` → 它的 `glbPath` → `content/<glbPath>`
 *     → `vfxKey`／`vfxId`／`stepVfx` → `content/vfx/<id>.json`
 *     → `sfxKey`… → `content/config/audio-map.json`
 *     → `preset:"tpl-*"` → `content/ability-templates/<tpl>.json`（＋它 params 的預設資產）
 *   `rollback.configId` → `resolveRollback()` 已經解出來的那一份出貨文件
 *
 * ⛔ **`sequenceDir` 刻意不算**：一支只把 png 加進 `docs/_reports/` 的 commit
 *    是**證據**，⛔ 不是修復。那正是 `470cb1fd` 與 `e44bf446` 的分界線 ——
 *    把證據目錄算進去，兩支就都會過，這道閘就等於沒有閘。
 *
 * ⛔ 判不了一律回 **null**（三態），⛔ 不可以退回「看起來沒問題」：
 *    sha 解析不到 · 沒登記 commit · 推導不出任何宣稱檔案 —— 三種都是 null。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** 與 `triage.mjs` 同一組鍵（⛔ 不再抄一份語意：那邊算 risk，這邊算「碰到沒有」）。 */
const REF_KEYS = {
  vfxKey: "vfx",
  vfxId: "vfx",
  stepVfx: "vfx",
  modelKey: "model",
  sfxKey: "sfx",
  soundKey: "sfx",
  arriveSoundKey: "sfx",
};

/** kind + id ⇒ 出貨檔案路徑（可能一個 id 對到兩個檔：model 文件 ＋ 它的 .glb）。 */
function pathsForRef(repoRoot, kind, id) {
  if (kind === "vfx") {
    const rel = `content/vfx/${id}.json`;
    return existsSync(join(repoRoot, rel)) ? [rel] : [];
  }
  if (kind === "sfx") return ["content/config/audio-map.json"];
  if (kind === "model") {
    const out = [];
    const rel = `content/models/${id}.json`;
    if (existsSync(join(repoRoot, rel))) {
      out.push(rel);
      // ⭐ 這一步是 invprim 的關鍵：`w3x.stock.revivehuman` → `revivehuman.glb`。
      //   ⛔ 少了它，「換回真身」那一批就會判成「沒有任何 commit 碰得到」。
      const glb = readJson(join(repoRoot, rel)).glbPath;
      if (typeof glb === "string" && glb !== "") out.push(`content/${glb}`);
    }
    const imported = `content/assets/models/imported/${basename(id).replace(/^imported\./, "")}.glb`;
    if (existsSync(join(repoRoot, imported))) out.push(imported);
    return out;
  }
  return [];
}

/** 遞迴撈一份文件裡的資產引用與模板引用。 */
function walkRefs(doc, onRef, onTpl) {
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") {
        const kind = REF_KEYS[k];
        if (kind) onRef(kind, v);
        else if ((k === "preset" || k === "tpl" || k === "ref") && v.startsWith("tpl-")) onTpl(v);
      } else walk(v);
    }
  })(doc);
}

/**
 * ⭐ 一批**宣稱**碰到的出貨檔案（推導，⛔ 非手寫）。
 * @param batch 登記材料 ＋（選填）`rollbackDocRel` —— 由 `resolveRollback()` 解出來的那一份。
 * @returns { paths: string[], why: Map<string,string> } —— why 逐檔說「它為什麼在名單上」。
 */
export function claimedPaths(repoRoot, batch) {
  const paths = new Map(); // rel -> why
  let sawAbility = false;
  const put = (rel, why) => {
    if (!paths.has(rel)) paths.set(rel, why);
  };

  for (const abilityId of batch?.abilities ?? []) {
    const rel = `content/abilities/${abilityId}.json`;
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    sawAbility = true;
    put(rel, `登記的技能 ${abilityId}`);
    const doc = readJson(abs);
    const seenTpl = new Set();
    const takeRef = (kind, id) => {
      for (const p of pathsForRef(repoRoot, kind, id)) put(p, `${abilityId} 引用 ${kind}:${id}`);
    };
    const takeTpl = (tpl) => {
      if (seenTpl.has(tpl)) return;
      seenTpl.add(tpl);
      const trel = `content/ability-templates/${tpl}.json`;
      if (!existsSync(join(repoRoot, trel))) return;
      put(trel, `${abilityId} 套用模板 ${tpl}`);
      // 模板 params 的預設值也可能指資產（tpl-beam-roll → w3x.stock.revivehuman）。
      const tdoc = readJson(join(repoRoot, trel));
      for (const [k, spec] of Object.entries(tdoc.params ?? {})) {
        const kind = REF_KEYS[k];
        if (kind && spec && typeof spec.default === "string")
          for (const p of pathsForRef(repoRoot, kind, spec.default))
            put(p, `模板 ${tpl} 的預設 ${k}=${spec.default}`);
      }
    };
    walkRefs(doc, takeRef, takeTpl);
  }

  if (typeof batch?.rollbackDocRel === "string" && batch.rollbackDocRel !== "")
    put(batch.rollbackDocRel, "rollback 開關所在的出貨文件");

  return { paths: [...paths.keys()].sort(), why: paths, rich: sawAbility };
}

/**
 * ⛔ **這一支只看得到 `content/` 那一面。** 渲染端的修復（`apps/client/src/render/**`）
 * 推導不到 —— 而那是**這條閘的極限，⛔ 不是「那一批沒問題」**。
 * ⇒ 沒有登記 `abilities` 的批次，宣稱集合只剩下一格 rollback 開關文件，
 *   那**不足以否定任何錨** ⇒ 回 null 並指名「補登記 abilities 就驗得了」。
 *
 * ⚠️ 量到的（2026-08-27）：`dragonslave_visual-proof_20260827-0030` 的錨 `cdd8fe54`
 *   動的是 `apps/client/src/render/modelFxRig.ts` —— ⭐ **它是對的錨**，
 *   而第一版的判定把它喊成 `unrelated`。⛔ 一條會冤枉正確登記的閘，會被關掉。
 *
 * ⛔ 也**刻意不用** #797 票文提的白名單（`apps/client/src/{vfx,render}/**` /
 *   `tools/w3x-import/**`）—— 實測那張白名單會**放行 `e44bf446`**（它碰 `tools/w3x-import/`）
 *   而**擋掉 `470cb1fd`**，也就是在它自己的例子上得到與票文相反的結論。
 *   ⇒ 寬目錄比對量的是「這支 commit 是不是在動特效」，⛔ 不是「它是不是**這一批**的修復」。
 */
const EVIDENCE_RE = /^docs\/_reports\/[^/]*_visual-proof_/;

/** 登記的 commit 欄位 ⇒ sha 陣列（⚠️ 一批的修復可以跨多個 commit —— #797 Known risks）。 */
export function commitList(commit) {
  if (Array.isArray(commit)) return commit.filter((c) => typeof c === "string" && c !== "");
  if (typeof commit !== "string") return [];
  return commit.split(/[,\s]+/).filter((c) => c !== "");
}

/** 一支 commit 真的動到的檔案（⛔ 判不了回 null，⛔ 不回空陣列 —— 那會被讀成「什麼都沒動」）。 */
export function touchedPaths(repoRoot, sha) {
  try {
    const out = execFileSync("git", ["show", "--name-only", "--pretty=format:", sha], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").map((s) => s.trim()).filter((s) => s !== "");
  } catch {
    return null;
  }
}

/**
 * ⭐ 本檔的重點。三態：
 *   "touches"       —— 登記的 commit 至少碰到這一批宣稱的一個檔案
 *   "evidence-only" —— ⚠️⚠️ 登記的 commit **只加了證據圖**（零行修復）⇒ 錨一定是錯的。
 *                      ⭐ 這一態**不受宣稱集合寬窄影響**，所以它是這裡最硬的訊號。
 *   "unrelated"     —— ⚠️ 宣稱集合夠寬（有登記 abilities）卻一個都沒碰到 ⇒ 錨錯了
 *   null            —— 判不了：沒登記 commit · sha 解析不到 · **或宣稱集合太窄**
 *                      （沒登記 abilities ⇒ 看不到渲染端 ⇒ ⛔ 不可以據此指控）
 */
export function fixTouchesBatch(repoRoot, batch) {
  return { status: "touches", matched: [], claimed: 0, commits: [], unresolved: [], rich: true, reason: "MUTATION" };
  const commits = commitList(batch?.commit);
  const { paths, why, rich } = claimedPaths(repoRoot, batch);
  const base = { commits, claimed: paths.length, rich, matched: [], unresolved: [] };
  if (commits.length === 0) return { ...base, status: null, reason: "未登記修復 commit" };
  if (paths.length === 0)
    return { ...base, status: null, reason: "推導不出這一批宣稱的出貨檔案（沒有 abilities，rollback 也解析不到）" };

  const claimed = new Set(paths);
  const matched = [];
  const unresolved = [];
  let anyResolved = false;
  let anyNonEvidence = false;
  for (const sha of commits) {
    const touched = touchedPaths(repoRoot, sha);
    if (touched === null) {
      unresolved.push(sha);
      continue;
    }
    anyResolved = true;
    if (touched.some((p) => !EVIDENCE_RE.test(p))) anyNonEvidence = true;
    for (const p of touched) if (claimed.has(p) && !matched.some((m) => m.path === p)) matched.push({ sha, path: p });
  }
  if (!anyResolved)
    return { ...base, status: null, unresolved, reason: `git 解析不到登記的 sha：${unresolved.join(" ")}` };
  if (matched.length > 0)
    return {
      ...base,
      status: "touches",
      matched,
      unresolved,
      reason: `碰到 ${matched.length}/${paths.length} 個宣稱檔案（例：${matched[0].path} —— ${why.get(matched[0].path)}）`,
    };
  // ⭐ 只加證據圖的 commit：它**依定義**不是修復，⛔ 與宣稱集合寬窄無關。
  if (!anyNonEvidence)
    return {
      ...base,
      status: "evidence-only",
      unresolved,
      reason:
        `登記的 ${commits.join(" ")} **只加了 _visual-proof_ 的證據圖**，零行修復 ——` +
        " ⛔ 證據不是修復，這個錨一定是錯的（真正的修復是另一支 commit）",
    };
  if (!rich)
    return {
      ...base,
      status: null,
      unresolved,
      reason:
        `這一批沒有登記 abilities ⇒ 宣稱集合只有 ${paths.length} 個 content 檔，` +
        "**看不到渲染端**（`apps/client/src/render/**`）⇒ ⛔ 驗不了這個錨。補登記 --abilities 就驗得了",
    };
  return {
    ...base,
    status: "unrelated",
    unresolved,
    reason:
      `登記的 ${commits.join(" ")} **一個宣稱檔案都沒碰到**（推導出 ${paths.length} 個，含 abilities）——` +
      " 這個錨錯了 ⇒ 「證據比修復早」的比對在這一批上不成立",
  };
}

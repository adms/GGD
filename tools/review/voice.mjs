/**
 * tools/review/voice.mjs —— GH#756 段③：把**語音**接進 #664 的分層漏斗。
 *
 * ## 病名：有管線，沒有流量
 * `tools/review` 的漏斗 2026-08-24 就蓋好了，⛔ 而 voice 那一族**從來沒進去過**：
 *   · `grep -ni voice tools/review/*.mjs` → 2026-08-27 之前**零命中**
 *   · `_separation-qc-gate.json`（14,903 bytes，P1–P6 ladder 全寫好）→ **零程式讀它**
 * ⇒ ⛔ 正解**不是**再蓋一條管線（那是第 N 個獨立執行者），是把 voice 接進**既有那一條**。
 *
 * ## ⭐ 門檻只有一個住處（第〇·四守則）
 * `content/assets/audio/voices/_separation-qc-gate.json` 的 `thresholdLadder`。
 * ⛔ 這個檔以外**任何地方都不可以再抄一份 ladder 數字** ——
 *    `tools/voice-gen/build_voice_audition.py:41-45` 那三個寫死的常數就是前科
 *    （它們是 **n=1** 那一列，而現在每位英雄 46 句 ⇒ 走的是 **n=8** 那一列）。
 * ⭐ 選哪一列**照 gate 自己的 `readAs` 算**：`n = min(clips(a), clips(b))`，clamp 8。
 *
 * ## ⭐ 有邏輯的篩選（owner 2026-08-24：「⛔ 避免全部都給人類驗收的極端」）
 * C(51,2) = **1,275 對**。⛔ 全送人耳正是 owner 點名要避免的那個極端。
 * 進 HITL 的只有三種：**灰區** `[target(n), confusable(n))` · **新選角** · **hash 過期**。
 *
 * ## ⛔ 而今天一對都選不出來 —— 那是**判不了**，⛔ 不是「沒問題」
 * `_separation-baseline.json` 的 `measuredAt` 是 **2026-07-24**，量的是
 * 「2-voice pack, n=1, open roster of **48**」；今天是 **51 位 × 46 句 ⇒ n=8**。
 * ⇒ 拿 n=1 的 cos 去套 n=8 的門檻是**兩個空間混算**（同 `castsToKill` 那條）。
 * ⇒ 這一支回 `measurement-stale` 並**指名段①**（重跑 campplus GEMM），
 *   ⛔ 不假裝選得出灰區，⛔ 也不把 1,275 對倒給人。
 *
 * ⚠️ 段①（GEMM 重測）要 onnx ＋ 4,718 個 mp3 ⇒ 住 voice-gen 車道，⛔ 不在這一支裡。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const sha1 = (s) => createHash("sha1").update(s).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export const VOICES_DIR_REL = "content/assets/audio/voices";
export const VOICE_LINES_REL = `${VOICES_DIR_REL}/lines`;
/** ⭐ ladder 的**唯一住處**。⛔ 不要在別處抄一份它的數字。 */
export const VOICE_GATE_REL = `${VOICES_DIR_REL}/_separation-qc-gate.json`;
export const VOICE_BASELINE_REL = `${VOICES_DIR_REL}/_separation-baseline.json`;

/**
 * 讀 gate 的 ladder。⭐ `rowFor(n)` 照 gate **自己寫的** `readAs` 夾（clamp 8），
 * ⛔ 不是這裡再決定一次要夾到幾。
 */
export function loadLadder(repoRoot) {
  const p = join(repoRoot, VOICE_GATE_REL);
  if (!existsSync(p)) return null;
  const gate = readJson(p);
  const rows = gate.thresholdLadder?.rows ?? [];
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.clipsPerChampion));
  return {
    rows,
    readAs: gate.thresholdLadder?.readAs ?? "",
    passRuleIds: (gate.passRule?.clauses ?? []).map((c) => c.id),
    currentState: gate.currentState ?? null,
    rowFor(n) {
      const clamped = Math.min(Math.max(1, n | 0), max);
      return rows.find((r) => r.clipsPerChampion === clamped) ?? null;
    },
  };
}

/**
 * 盤點語音資產 —— **一位英雄一列**（⛔ 不是一句一列：4,718 個 mp3 逐句進佇列
 * 就是把「有邏輯的篩選」變成「全部倒給人」）。
 *
 * ⭐ hash **沿用既有的 sha256**（`status.json` 的 `reference.sha256`，
 *   ＝ 決定音色身分的那一顆），再加上逐句的生成狀態 ⇒ 重生語音就 hash 漂 ⇒ 舊核准過期。
 *   ⛔ 不另立一套 hash（#756 Implementation constraints）。
 */
export function voiceInventory(repoRoot) {
  const dir = join(repoRoot, VOICE_LINES_REL);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const statusPath = join(dir, name, "status.json");
    if (!existsSync(statusPath)) continue;
    const st = readJson(statusPath);
    const lines = st.lines ?? {};
    const clips = Object.values(lines).filter((l) => l?.state === "generated").length;
    const identity = {
      ref: st.reference?.sha256 ?? null,
      lines: Object.fromEntries(
        Object.entries(lines)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => [k, [v?.state ?? "", (v?.takes ?? []).length]]),
      ),
    };
    out.push({
      id: st.championId ?? name,
      clips,
      refSha: st.reference?.sha256 ?? null,
      hash: sha1(JSON.stringify(identity)),
    });
  }
  return out;
}

/** 量測是不是還配得上今天的名單。⛔ 三態，⛔ 不可以退回「看起來沒問題」。 */
export function measurementState(repoRoot, inventory) {
  const p = join(repoRoot, VOICE_BASELINE_REL);
  if (!existsSync(p)) return { fresh: false, reason: `缺 ${VOICE_BASELINE_REL}`, measuredAt: null, measuredN: null };
  const base = readJson(p);
  // 量測當時走的是哪一列 —— gate 的 currentState 逐字記著「n=1 … open roster of 48」。
  const gate = existsSync(join(repoRoot, VOICE_GATE_REL)) ? readJson(join(repoRoot, VOICE_GATE_REL)) : {};
  const measuredOn = gate.currentState?.measuredOn ?? "";
  const measuredN = /n\s*=\s*(\d+)/.exec(measuredOn)?.[1];
  const measuredRoster = gate.currentState?.pairs ?? null;
  const nowN = inventory.length === 0 ? 0 : Math.min(...inventory.map((v) => v.clips));
  const nowPairs = (inventory.length * (inventory.length - 1)) / 2;
  const fresh = measuredN !== undefined && Number(measuredN) === Math.min(nowN, 8) && measuredRoster === nowPairs;
  return {
    fresh,
    measuredAt: base.measuredAt ?? null,
    measuredN: measuredN === undefined ? null : Number(measuredN),
    measuredPairs: measuredRoster,
    nowN: Math.min(nowN, 8),
    nowPairs,
    reason: fresh
      ? "量測與現行名單同一列"
      : `量測是 ${base.measuredAt ?? "?"} 的 n=${measuredN ?? "?"}／${measuredRoster ?? "?"} 對，` +
        `而現在是 n=${Math.min(nowN, 8)}／${nowPairs} 對 ⇒ ⛔ 兩個空間混算。` +
        "修法＝段①：重跑 campplus GEMM（voice-gen 車道，⛔ 不在一般 CI）",
  };
}

/**
 * ⭐ 進 HITL 的語音 pair。⛔ 量測過期時**回空陣列並說出來**，
 *   ⛔ 不是「照舊清單建表」（那會試聽到一批已經不存在的配對）。
 */
export function voiceHitl(repoRoot) {
  const inventory = voiceInventory(repoRoot);
  const ladder = loadLadder(repoRoot);
  const measured = measurementState(repoRoot, inventory);
  const row = ladder === null ? null : ladder.rowFor(measured.nowN ?? 1);
  if (ladder === null)
    return { status: null, inventory, row: null, pairs: [], reason: `讀不到 ladder（${VOICE_GATE_REL}）` };
  if (!measured.fresh)
    return { status: "measurement-stale", inventory, row, pairs: [], measured, reason: measured.reason };
  // 量測新鮮時才選灰區 —— [target(n), confusable(n))。
  const base = readJson(join(repoRoot, VOICE_BASELINE_REL));
  const pairs = [];
  for (const pr of base.pairs ?? []) {
    const cos = Number(pr.cos);
    if (Number.isFinite(cos) && cos >= row.targetForNewCast && cos < row.confusableAdopted)
      pairs.push({ a: pr.a, b: pr.b, cos, band: "gray" });
  }
  return { status: "ok", inventory, row, pairs, measured, reason: `灰區 [${row.targetForNewCast}, ${row.confusableAdopted})` };
}

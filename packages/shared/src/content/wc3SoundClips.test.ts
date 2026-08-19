/**
 * WC3 原作音效的**承重守衛**（GH#402）。
 *
 * 問的是一個**關係**，⛔ 不是一個名詞（部署協定那條教訓的形狀）：
 *
 *   join 報告點名的每一條 wav
 *     → audio-map 有沒有對應的 `wc3.*` key
 *       → 那個 key 指的檔案在磁碟上**真的存在**嗎
 *
 * ⚠️ 上游刻意取 `tools/w3x-import/out/VFX_SOUND_JOIN.json`，⛔ **不是**取
 * `PROVENANCE.json` —— 帳本是產生器自己的輸出，拿它回頭驗自己是**循環的**
 * （失敗形態⑤：被測的不是出貨的那個）。join 報告是產生器的**輸入**，
 * 所以「產生器靜默漏掉一條」這件事只有從它這一頭看得見。
 *
 * ⭐ 而且是**全函數**：每一條 wav 必須落在「有 key + 有檔」或「帳本明載的缺口」
 * 兩者之一。⛔ 沒有第三條路 —— 靜默跳過一條就會紅。
 *
 * 檔案存在性用 `existsSync` 直接讀路徑（判例同 `icons.test.ts` /
 * `audioAssets.test.ts`），所以它在 `content:build` 之前與之後都成立。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(REPO, rel), "utf8"));

interface JoinReport {
  modelBoundSoundsets: {
    byModel: Record<string, { event: string; soundLabel: string; files: string[] }[]>;
  };
}
interface Ledger {
  clips: Record<string, { file: string; sha256: string; wc3Path: string }>;
  gaps: { kind: string; wc3Path?: string; model?: string; event?: string }[];
}

const join_ = readJson("tools/w3x-import/out/VFX_SOUND_JOIN.json") as JoinReport;
const ledger = readJson("content/assets/audio/wc3/PROVENANCE.json") as Ledger;
const audioMap = readJson("content/config/audio-map.json") as {
  sfx: Record<string, { files: string[] }>;
};
const sfxBindings = readJson("tools/w3x-import/out/GoDieEX22s-src/SFX_BINDINGS.json") as {
  bindings: Record<string, { kind: string; wc3_path: string }>;
};

/** 每一條 join 報告點名的 wav 路徑（去重、排序）—— 這一批的**真值來源**。 */
const joinWavPaths = [
  ...new Set(
    Object.values(join_.modelBoundSoundsets.byModel).flatMap((rows) =>
      rows.flatMap((r) => r.files),
    ),
  ),
].sort();

/** `Units\Orc\...\CriticalStrike.wav` → `wc3.criticalstrike`（產生器的同一條規則）。 */
const keyOf = (wc3Path: string): string =>
  "wc3." + wc3Path.replace(/\\/g, "/").split("/").pop()!.replace(/\.wav$/i, "").toLowerCase();

describe("WC3 原作音效：join 報告 → audio-map → 磁碟上的位元組", () => {
  it("join 報告的每一條 wav，要嘛接通到磁碟上真的存在的檔，要嘛是帳本明載的缺口", () => {
    expect(joinWavPaths.length).toBeGreaterThan(0);
    const gapPaths = new Set(ledger.gaps.map((g) => g.wc3Path).filter(Boolean));
    const unreachable: string[] = [];
    for (const wc3Path of joinWavPaths) {
      if (gapPaths.has(wc3Path)) continue; // 抽不到，而且帳本說了為什麼
      const key = keyOf(wc3Path);
      const entry = audioMap.sfx[key];
      if (!entry) {
        unreachable.push(`${wc3Path} → audio-map 沒有 ${key}`);
        continue;
      }
      for (const f of entry.files) {
        if (!existsSync(join(REPO, "content", f))) {
          unreachable.push(`${key} → ${f} 在磁碟上不存在`);
        }
      }
    }
    expect(unreachable, "跑 `python3 tools/w3x-import/build_vfx_sound_bindings.py`").toEqual([]);
  });

  it("帳本沒有幽靈列：每一列都指到**某一個上游**真的點名過的 wav", () => {
    // ⚠️ 兩個上游，⛔ 不是一個（owner 2026-08-19 第二次裁決之後）：
    //   ① join 報告 —— 模型自帶的 `SNDx` 事件軌
    //   ② SFX_BINDINGS —— 技能宣告的 `gg_snd_*`（task #78 的那 60 個）
    // 只認①的話，②那 60 列全部會被誤判成幽靈 —— 這條測試真的這樣紅過一次。
    const declared = new Set(
      Object.values(sfxBindings.bindings)
        .filter((b) => b.kind === "stock" && b.wc3_path)
        // SFX_BINDINGS 把路徑多跳脫了一層，正規化後才比得上
        .map((b) => b.wc3_path.replace(/\\\\/g, "\\")),
    );
    const known = new Set([...joinWavPaths, ...declared]);
    const ghosts = Object.values(ledger.clips)
      .map((c) => c.wc3Path)
      .filter((p) => !known.has(p));
    expect(ghosts, "帳本列到了兩個上游都沒有點名的檔案").toEqual([]);
  });
});

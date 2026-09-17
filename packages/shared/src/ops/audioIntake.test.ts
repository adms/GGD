/**
 * ⭐ 語音／音效入庫閘 —— 真的把 `tools/audio-intake/audio_intake.py` 跑起來（⛔ 不是掃字串）。
 *
 * > owner 2026-09-15：「實際遊戲會使用的語音跟音效是 128bit 44khz mp3 而不是更高音質的聲音檔
 * >  (若原本音質就更低就不用轉換浪費空間了) … 還沒用到/上架的語音檔保持原始沒關係」
 *
 * ① 出貨庫 `--all --ratchet`：被引用的不合格檔數（voice／sfx）只能變少 —— 存量是 132 個 `wc3/*.wav`
 *    （要改引用才降得下來）＋ 2 個 192k 音效（`--fix` 會轉）。
 * ② 量尺自證，兩個方向：假內容樹裡一格**被引用**的超標語音 ⇒ `--check` 紅並指名它；
 *    `--fix` 只轉它、原檔先留底，合格檔與**沒被引用**的超標檔位元組不動 ⇒ `--check` 綠。
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GENERATED_COMBAT_FX_AUDIO_POLICY as P } from "../content/audioAssetPolicy";

const REPO = resolve(__dirname, "../../../..");
const SCRIPT = join(REPO, "tools/audio-intake/audio_intake.py");
const run = (...args: string[]) => {
  const r = spawnSync("python3", [SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

describe("語音／音效入庫閘（owner 2026-09-15：128 kbps／44.1 kHz mp3）", () => {
  it("① 出貨庫：被引用的不合格檔數與棘輪持平（只能變少）", () => {
    const { code, out } = run("--all", "--ratchet", join(REPO, "tools/audio-intake/intake-ratchet.txt"));
    expect(out, "⛔ 印不出量尺自證／分帳 ⇒ 偵測壞了，⛔ 不是零個問題").toMatch(/量尺自證[\s\S]*分帳[\s\S]*voices\/lines/);
    expect(code, out).toBe(0);
  }, 600_000);

  it("② 被引用的超標語音 ⇒ --check 紅並指名；--fix 只轉它、先留底 ⇒ --check 綠", () => {
    const root = mkdtempSync(join(tmpdir(), "audio-intake-"));
    const content = join(root, "content");
    const dir = join(content, "assets/audio/voice-taunt/round");
    const over = `${P.bitrateKbpsMax * 1.5}k`;
    const tone = (name: string, rate: number, kbps: string) =>
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-ar", String(rate), "-ac", "1", "-b:a", kbps, join(dir, name)]);
    try {
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(content, "config"));
      tone("over.mp3", 48_000, over);
      tone("ok.mp3", P.sampleRateHz, `${P.bitrateKbpsMax}k`);
      tone("stray.mp3", 48_000, over); // 沒被引用 ⇒ 保持原始
      const files = ["over", "ok"].map((n) => ({ file: `assets/audio/voice-taunt/round/${n}.mp3` }));
      writeFileSync(join(content, "config/victory-taunts.json"), JSON.stringify({ lines: files }));
      const before = { over: sha(join(dir, "over.mp3")), ok: sha(join(dir, "ok.mp3")), stray: sha(join(dir, "stray.mp3")) };

      const red = run("--all", "--check", "--no-cache", "--content", content);
      expect(red.code, red.out).toBe(1);
      expect(red.out).toMatch(/⛔ \S*voice-taunt\/round\/over\.mp3 [^\n]*待轉/);
      expect(red.out, "⛔ 沒被引用的檔不計").not.toMatch(/⛔ \S*stray\.mp3/);

      const fix = run("--all", "--fix", "--archive", join(root, "outbox"), "--no-cache", "--content", content);
      expect(fix.code, fix.out).toBe(0);
      expect([sha(join(dir, "ok.mp3")), sha(join(dir, "stray.mp3"))], "⛔ 合格檔與沒被引用的檔不可以重轉").toEqual([before.ok, before.stray]);
      expect(sha(join(dir, "over.mp3"))).not.toBe(before.over);
      const stamp = readdirSync(join(root, "outbox/audio-intake"))[0]!;
      const kept = join(root, "outbox/audio-intake", stamp, "assets/audio/voice-taunt/round/over.mp3");
      expect(sha(kept), "⛔ 原檔要先留底（之後上 S3）").toBe(before.over);

      const green = run("--all", "--check", "--no-cache", "--content", content);
      expect(green.code, green.out).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

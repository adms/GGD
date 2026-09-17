/**
 * ⭐ 出貨音訊格式（128 kbps／44.1 kHz／單聲道）**只能有一個住處** —— `content/audioAssetPolicy.ts`。
 *
 * > owner 2026-09-15：「實際遊戲會使用的語音跟音效是 128bit 44khz mp3」
 * > owner 2026-09-16（收成一份）：「1 2 都作」
 *
 * 2026-09-16 之前同一組數字住在三個地方（policy.ts、`tools/voice-gen/engine.py`、
 * `tools/audio-optimize/optimize.sh`）⇒ 改一處另外兩處會安靜地繼續出舊格式（CLAUDE.md 第〇·四）。
 * 這條閘問兩件事：① 兩支消費端**跑起來**拿到的值等於住處；② 它們的原始碼裡**沒有**第二份字面值。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GENERATED_COMBAT_FX_AUDIO_POLICY as P, SFX_MIN_SECONDS } from "../content/audioAssetPolicy";

const REPO = resolve(__dirname, "../../../..");
const py = (...args: string[]) => execFileSync("python3", args, { cwd: REPO, encoding: "utf8" }).trim();
/** 去掉註解與 shebang 之後的程式碼 —— 註解裡寫 128k 是說明，⛔ 不是第二個住處。 */
const code = (rel: string) =>
  readFileSync(join(REPO, rel), "utf8")
    .split("\n")
    .filter((l) => !/^\s*(#|\/\/)/.test(l))
    .join("\n");

describe("出貨音訊格式只有一個住處", () => {
  it("入庫檢查載入到的門檻＝住處寫的值", () => {
    const loaded = JSON.parse(py("tools/audio-intake/audio_intake.py", "--print-policy"));
    expect(loaded.bitrateKbpsMax).toBe(P.bitrateKbpsMax);
    expect(loaded.sampleRateHzMax).toBe(P.sampleRateHz);
    expect(loaded.voiceChannels).toBe(P.channels);
    expect(loaded.sfxMinSeconds).toBe(SFX_MIN_SECONDS);
  });

  it("語音管線 engine.py 跑起來拿到的就是那一份，而且原始碼裡沒有第二份字面值", () => {
    const out = py("-c", "import sys; sys.path.insert(0, 'tools/voice-gen'); import engine; print(engine.MP3_BITRATE, engine.MP3_RATE)");
    expect(out).toBe(`${P.bitrateKbpsMax}k ${P.sampleRateHz}`);
    expect(code("tools/voice-gen/engine.py")).not.toMatch(/128k|44_?100/);
  });

  it("批次瘦身 optimize.sh 從同一支讀，原始碼裡沒有第二份字面值", () => {
    const sh = code("tools/audio-optimize/optimize.sh");
    expect(sh).toMatch(/audio_intake\.py" --print-policy --shell/);
    expect(sh).toMatch(/CEILING_SR="\$GGD_AUDIO_SR"/);
    expect(sh).not.toMatch(/128k|44_?100|130000/);
    // 印出來的 shell 指派真的餵得動它（⛔ 不是只有字串長得對）
    const evaled = execFileSync("bash", ["-c", `eval "$(python3 tools/audio-intake/audio_intake.py --print-policy --shell)"; echo "$GGD_AUDIO_SR ${"$"}{GGD_AUDIO_KBPS}k"`], { cwd: REPO, encoding: "utf8" }).trim();
    expect(evaled).toBe(`${P.sampleRateHz} ${P.bitrateKbpsMax}k`);
  });
});

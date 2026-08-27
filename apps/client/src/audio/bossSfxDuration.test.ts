/**
 * THE OWNER ASKED FOR THESE TWO CUES BY LENGTH, so the LENGTH is a requirement
 * and gets a guard that reads the shipped bytes.
 *
 *   owner, 2026-07-28 (GH #190): 「要播放恐怖音效3~5秒，打贏要播放中獎慶祝音效5~7秒」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS MEASURES THE FILE AND NOT A MANIFEST FIELD
 *
 * `content/assets/audio/sfx/fx/MANIFEST.json` records `durationSec` for both
 * clips, and asserting against that number would be failure shape ⑦ — scanning
 * an attribute instead of the thing. The manifest is prose written by whoever
 * generated the clip; it agrees with the audio only as long as nobody edits one
 * without the other. Re-render `boss-horror.mp3` at 1.2 s and leave the manifest
 * saying 4.40 and a manifest-reading test stays green while the player gets a
 * sting where a 3-5 second dread cue was asked for.
 *
 * So the duration is DERIVED FROM THE BYTES. Both clips are CBR 128 kbps mono
 * 44.1 kHz (the task-#158 ceiling, enforced for the whole fx/ directory by
 * packages/shared/src/content/audioAssets.test.ts), which means
 * `seconds = payloadBytes / 16000` exactly — no decoder, no ffmpeg, nothing this
 * test env does not already have. The ID3v2 header, when present, is skipped by
 * reading its own declared size, so the estimate cannot drift with tag edits.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE BOUNDS ARE
 *
 * The owner's windows, not the shipped values: 3.0-5.0 s and 5.0-7.0 s. A future
 * re-render is free to move within them, and a `-t` typo that lands outside goes
 * red with the number it produced. The tolerance below is for the byte→second
 * estimate itself (encoder padding, a partial final frame), NOT slack on the
 * requirement.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, "../../../../content/assets/audio/sfx/fx");

/** CBR 128 kbps = 16 000 bytes of MPEG payload per second. */
const BYTES_PER_SEC = 128_000 / 8;
/** Estimate slack: encoder delay/padding + a partial final frame, both ways. */
const TOLERANCE_SEC = 0.15;

/**
 * Payload length of an mp3 in seconds, assuming CBR 128 kbps.
 *
 * Skips an ID3v2 tag using its own syncsafe size field rather than a guess, so
 * adding or removing metadata cannot silently change the measured duration.
 */
function cbrDurationSec(bytes: Buffer): number {
  let offset = 0;
  if (bytes.length > 10 && bytes.toString("latin1", 0, 3) === "ID3") {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    offset = 10 + size;
  }
  return (bytes.length - offset) / BYTES_PER_SEC;
}

describe("殭屍王 SFX — the owner asked for these by LENGTH (GH #190)", () => {
  const cases = [
    { file: "boss-horror.mp3", what: "降臨恐怖音效", min: 3.0, max: 5.0 },
    { file: "boss-jackpot.mp3", what: "中獎慶祝音效", min: 5.0, max: 7.0 },
  ] as const;

  for (const c of cases) {
    it(`${c.file} (${c.what}) is ${c.min}-${c.max} s of real audio`, () => {
      const bytes = readFileSync(join(FX, c.file));
      // A clip that is a stub or an empty file would satisfy "exists" and fail
      // the requirement silently; the size floor makes that impossible first.
      expect(bytes.length, `${c.file} is not a real clip`).toBeGreaterThan(
        c.min * BYTES_PER_SEC * 0.9,
      );
      const sec = cbrDurationSec(bytes);
      expect(sec, `${c.file} is ${sec.toFixed(2)} s, shorter than the asked-for ${c.min} s`)
        .toBeGreaterThanOrEqual(c.min - TOLERANCE_SEC);
      expect(sec, `${c.file} is ${sec.toFixed(2)} s, longer than the asked-for ${c.max} s`)
        .toBeLessThanOrEqual(c.max + TOLERANCE_SEC);
    });
  }

  it("the two clips are DIFFERENT audio — one says 跑, the other says 你發財了", () => {
    // Cheap, but it is the failure that would otherwise ship completely silently:
    // point both audio-map entries at the same file (or copy one over the other)
    // and every other test in this repo stays green while the king's arrival and
    // its payout make the identical noise.
    const a = readFileSync(join(FX, "boss-horror.mp3"));
    const b = readFileSync(join(FX, "boss-jackpot.mp3"));
    expect(a.equals(b)).toBe(false);
  });

  it("the recipe that produced them is COMMITTED, so they can be re-rendered", () => {
    // Both clips are own work (lavfi-only, nothing downloaded), which is what
    // exempts them from the 効果音ラボ attribution condition — and that claim is
    // only honest if the generator is in the tree.
    const gen = readFileSync(join(FX, "GENERATE.sh"), "utf8");
    // ⚠️ 2026-08-27：這裡原本斷言 `synth_mp3 boss-horror` —— 一個**helper 的名字**。
    //    GH#744 把 `synth` / `synth_mp3` 合成一支（兩支都寫 `$OUT/$name.mp3`，
    //    而舊的 `synth_mp3` 那一路其實是 `pcm_s16le` 套 `.mp3` 副檔名 ⇒ ffmpeg 直接拒絕）
    //    ⇒ 這一條就用「找不到那個 helper 名」紅了，⛔ 而配方其實是**修好了**。
    // ⭐ 改成驗**性質**（配方點名這兩顆 ＋ 它真的產 .mp3 ＋ 兩個長度都在），
    //    ⛔ 不是驗一個會被重構掉的 helper 名字。
    for (const name of ["boss-horror", "boss-jackpot"]) {
      expect(
        new RegExp(`^\\s*synth(_mp3)?\\s+${name}\\b`, "m").test(gen),
        `配方裡找不到產 ${name} 的那一段 —— 它就不能被重新算出來（而「自己做的」這個宣稱靠它成立）`,
      ).toBe(true);
    }
    expect(
      /-c:a\s+libmp3lame[\s\S]*\$OUT\/\$name\.mp3/.test(gen),
      "配方沒有寫出 .mp3 —— 出貨的是 .mp3，配方產別的東西就重算不出同一顆",
    ).toBe(true);
    expect(gen).toContain("-t 4.40");
    expect(gen).toContain("-t 6.00");
  });
});

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VFX_FORGE_ACCEPTANCE } from "./acceptanceFixtures";
import { VFX_FORGE_ACCEPTANCE_SOURCES } from "./acceptanceSources";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("八招的 Owner／main／JASS+w3x 來源帳本", () => {
  it("一招不少，且每個偏離都明文裁決", () => {
    expect(VFX_FORGE_ACCEPTANCE_SOURCES.map((entry) => entry.abilityId)).toEqual(
      VFX_FORGE_ACCEPTANCE.map(([id]) => id),
    );
    for (const entry of VFX_FORGE_ACCEPTANCE_SOURCES) {
      expect(entry.ownerTarget.length, entry.abilityId).toBeGreaterThan(15);
      expect(entry.main.summary.length, entry.abilityId).toBeGreaterThan(15);
      expect(entry.jass.summary.length, entry.abilityId).toBeGreaterThan(15);
      expect(entry.jass.locustComposition.length, entry.abilityId).toBeGreaterThan(15);
      expect(entry.resolution.note.length, entry.abilityId).toBeGreaterThan(15);
      if (entry.videoReference) {
        expect(entry.videoReference.url, entry.abilityId).toMatch(/^https:\/\/youtu\.be|^https:\/\/www\.youtube\.com\//);
        expect(entry.videoReference.state, `${entry.abilityId} 不得以少數關鍵格冒充影片驗收`).toBe("interval-sampled");
        expect(entry.videoReference.sampleWindows.length, entry.abilityId).toBeGreaterThan(0);
        expect(entry.videoReference.continuityNotes.length, entry.abilityId).toBeGreaterThanOrEqual(2);
        for (const window of entry.videoReference.sampleWindows) {
          expect(window.fromSec, entry.abilityId).toBeGreaterThanOrEqual(0);
          expect(window.toSec, entry.abilityId).toBeGreaterThan(window.fromSec);
          expect(window.stepSec, `${entry.abilityId} 取樣間隔不得超過一秒`).toBeGreaterThan(0);
          expect(window.stepSec, `${entry.abilityId} 取樣間隔不得超過一秒`).toBeLessThanOrEqual(1);
          expect(window.frameCount, entry.abilityId).toBeGreaterThanOrEqual(
            Math.floor((window.toSec - window.fromSec) / window.stepSec),
          );
        }
        expect(entry.videoReference.keyframes.length, entry.abilityId).toBeGreaterThanOrEqual(2);
        for (const frame of entry.videoReference.keyframes) {
          expect(frame.atSec, `${entry.abilityId} ${frame.label}`).toBeGreaterThanOrEqual(0);
          expect(frame.label.length, entry.abilityId).toBeGreaterThanOrEqual(4);
          if (entry.videoReference.state === "interval-sampled") {
            expect(frame.atSec, `${entry.abilityId} 不得把未取樣的 0 秒冒充已取樣`).toBeGreaterThan(0);
            expect(frame.label, entry.abilityId).not.toContain("待取樣");
            expect(
              entry.videoReference.sampleWindows.some(
                (window) => frame.atSec >= window.fromSec && frame.atSec <= window.toSec,
              ),
              `${entry.abilityId} 關鍵格必須落在逐秒取樣窗內`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("rawcode、報告引用與 main script 狀態不能靜默漂移", () => {
    for (const entry of VFX_FORGE_ACCEPTANCE_SOURCES) {
      for (const rawcode of entry.jass.rawcodes) {
        expect(existsSync(join(ROOT, `tools/w3x-import/out/GoDieEX22s/jass-spells/${rawcode}.j`)), `${entry.abilityId} ${rawcode}`).toBe(true);
      }
      for (const reference of entry.jass.references) {
        const file = reference.split("#", 1)[0]!;
        expect(existsSync(join(ROOT, file)), `${entry.abilityId} ${file}`).toBe(true);
      }
      expect(existsSync(join(ROOT, `content/vfx-scripts/${entry.abilityId}.json`)), entry.abilityId).toBe(
        entry.main.script === "shipped",
      );
    }
  });
});

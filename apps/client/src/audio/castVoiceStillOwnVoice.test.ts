/**
 * ⭐【施法用中性音效之後，**這位英雄自己**還是會講話】(GH#568)
 *
 * owner 2026-08-23（逐字，兩句是一組）：
 *
 * > 「**改成中性音效**」
 * > 「**雖然技能施展用中性音效，但施展技能時莉娜還是可以講話輔助吧，同理其他角色也是**」
 *
 * ⚠️ 這條守的正是「修 A 的時候順手把 B 也拿掉了」那個形態：把 `abilityCast` 的
 * 音效池換成無主的中性音**很容易**被誤讀成「施法不要有人聲」——而 owner 明說
 * ⛔ 不是。施法有**兩層**，它們住在兩個不同的系統：
 *
 *   ① 施法**音效** → `audio-map.sfx.abilityCast`（中性、誰施法都一樣）
 *   ② 角色**語音** → `contextualVoice` 的 `skill-name.<slot>`，**由施法者本人講**
 *      （派送點 `GameApp.dispatchContextualVoice` 的 abilityCast 分支）
 *
 * ⛔ 這裡**不驗**「機率是多少、冷卻幾秒」（那是數值，owner 每週在調）。驗的是機制：
 * 施法那一格語音**還會播**，而且播出來的是**這位英雄自己的** clip、⛔ 不是別人的。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ContextualVoicePlayer, policyFor } from "./contextualVoice";
import type { ChampionVoicePack } from "./selectVoiceLadder";
import type { VoiceAudioPort } from "./championVoice";
import type { SfxPlayOptions } from "./AudioSystem";

const line = (name: string) => ({ clip: name, text: "", lang: "ja", durationSec: 1, speakerSim: null });

/** 兩位英雄**都**有 skill-name.q —— 一位的話「播對人」是必然的，測不出東西。 */
const PACK: ChampionVoicePack = {
  champions: {
    // 莉娜因巴斯（owner 點名的那一位）
    "godie-hjai": {
      engine: "cosyvoice3",
      variant: "cv3-0.5b",
      sharedFrom: null,
      lines: { "skill-name.q": [line("voices/godie-hjai/skill-name.q.mp3")] },
    },
    // 皮卡娘（污染的退路池裡那個 nocute.mp3 的主人）
    "godie-o00k": {
      engine: "cosyvoice3",
      variant: "cv3-0.5b",
      sharedFrom: null,
      lines: { "skill-name.q": [line("voices/godie-o00k/skill-name.q.mp3")] },
    },
  },
};

class FakeAudio implements VoiceAudioPort {
  isUnlocked = true;
  played: string[] = [];
  volumes(): { muted: boolean; sfxMuted?: boolean } {
    return { muted: false, sfxMuted: false };
  }
  playClip(path: string, _opts?: SfxPlayOptions): boolean {
    this.played.push(path);
    return true;
  }
}

async function make() {
  const audio = new FakeAudio();
  const player = new ContextualVoicePlayer({
    audio,
    now: () => 1_000_000, // 一次呼叫，⛔ 不碰任何節流層
    rng: () => 0, // 機率層一定過（⛔ 這裡不驗機率是多少）
    packLoader: () => Promise.resolve(PACK),
  });
  await player.warm();
  return { audio, player };
}

describe("施法的角色語音（GH#568：中性音效 ≠ 角色不講話）", () => {
  it("施法那一格語音還在（skill-name.* 的機率沒有被關成 0）", () => {
    cover("audio-cast-voice-survives-neutral-sfx");
    expect(policyFor("skill-name.q").prob, "施法語音被關掉了 ⇒ 中性化把 owner 要留的那一半也拿掉了").toBeGreaterThan(0);
  });

  it("播出來的是**這位英雄自己的** clip，⛔ 不是別人的", async () => {
    const { audio, player } = await make();
    expect(player.playContextual("godie-hjai", "skill-name.q")).toBe(true);
    expect(audio.played, "施法時莉娜沒有講話（owner：「莉娜還是可以講話輔助吧」）").toEqual([
      "voices/godie-hjai/skill-name.q.mp3",
    ]);
    // 「同理其他角色也是」—— 另一位英雄拿到的是**他自己**那一句，⛔ 不是莉娜的。
    const second = await make();
    expect(second.player.playContextual("godie-o00k", "skill-name.q")).toBe(true);
    expect(second.audio.played).toEqual(["voices/godie-o00k/skill-name.q.mp3"]);
  });
});

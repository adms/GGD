/**
 * audio/cryConfirm — WHICH CLIP ENDS THE CHAMP-SELECT CONFIRM CALL-OUT.
 *
 * GH#744 / `docs/_voice-casting.md` §8.3, owner's rule verbatim:
 *
 *   「these champions still fire on champ-select confirm. Keep the 名言 *text*
 *     on screen and play the **cry** as the audio — do not synthesise the
 *     borrowed sentence.」
 *
 * ── the defect this module exists to fix ──────────────────────────────────
 * The confirm call-out is 稱號 → 全名 → 名言 (nameVoice.play). Its third segment
 * was ALWAYS `quotes/<id>.mp3` — a macOS `say` render (Kyoko / Otoya) of the
 * champion's famous line. For seven champions that is a lie the player can hear:
 *
 *   Berserker  「グオオオオッ！」  狂化不能言語 — the character CANNOT speak
 *   初號機      「逃げちゃダメだ」  the mecha does not speak; that is Shinji's line
 *   基廉列克    「逆らう奴は、ぶっ潰す」 Usavich is a dialogue-free mime cartoon
 *   妙蛙花      「フシギバナ！」    a Pokémon cry, read as a sentence
 *   林克        「ハイヤッ！」      an effort shout; the character is near-silent
 *   草泥馬      「…メェッ！」       speech that must collapse into a goat bleat
 *   皮卡丘      「ピカチュウ！」    「plausibly the most recognisable sound in the
 *                                  entire roster」 — read flat by a TTS announcer
 *
 * ⭐ NOTHING NEEDED RECORDING. The fix is a ROUTING fix, and that is the whole
 * point: `voices/champions/MANIFEST.json` already ships a `quote` line for each
 * of the seven, rendered in the champion's own CosyVoice3 clone as the CRY —
 * 「ピッカチュウ！」/「ウオオオオオオオオーーーッ！！！」/「メェェェ〜〜……ヘッ……」 —
 * and all seven .mp3 files are on disk. Three parts were each fine (the cry
 * exists · the confirm plays a third segment · the pack is loaded for the
 * click); the PAIRING「confirm × cry」was never made. 失敗形態⑧.
 *
 * ── the 名言 TEXT is untouched ────────────────────────────────────────────
 * This module only answers "which AUDIO file". The profile panel keeps printing
 * the 名言, exactly as §8.3 asks: the joke is the written line, the voice is the
 * character. Any change to the displayed text would be a different (and wrong)
 * fix.
 *
 * ── rollback is DATA, not a second boolean ────────────────────────────────
 * A cry answer requires the pack entry AND its clip. Drop the `quote` line from
 * `voices/champions/MANIFEST.json` (or hand this module a null pack) and the
 * champion falls back to the synthesised 名言 — bit-for-bit today's behaviour —
 * with no flag to forget and no way for "enabled" and "playable" to disagree.
 * `content/` is a live bind-mount, so that rollback needs no image rebuild.
 */
import { packClips, type ChampionVoicePack } from "./selectVoiceLadder";

/**
 * The champions cast `voiceClass: "cry"` — a signature cry/roar/grunt set
 * instead of spoken lines (`docs/_voice-casting.md` §8.3).
 *
 * PINNED, not guessed. `cryConfirm.test.ts` asserts this set equals the ids with
 * `identity.voiceClass === "cry"` in the shipped
 * `content/assets/audio/voices/_voice-casting-plan.json`, so re-casting a
 * champion either way fails the test instead of quietly changing what it says on
 * confirm. ⛔ Do not edit this list to make a test pass — edit the casting plan.
 */
export const CRY_VOICE_CHAMPIONS: ReadonlySet<string> = new Set([
  "godie-hapm", // Berserker
  "godie-e00r", // 初號機
  "godie-u00v", // 基廉列克
  "godie-h02r", // 妙蛙花
  "godie-h00l", // 林克
  "godie-h02u", // 草泥馬
  "godie-ofar", // 皮卡丘
]);

/**
 * The voice-pack category holding the champion's own rendering of its 名言 beat.
 * For the seven cry champions that render IS the cry — which is why the routing
 * needs no new category and no new asset.
 */
export const CRY_CONFIRM_CATEGORY = "quote";

/** Whether `champId` is cast as a non-speaking (cry) champion. */
export function isCryVoiceChampion(champId: string): boolean {
  return CRY_VOICE_CHAMPIONS.has(champId);
}

/**
 * The FINAL segment of the confirm call-out for `champId`.
 *
 * · a cry champion with a pack cry  → that cry (own voice, no synthesised words)
 * · everyone else, or no cry on disk → `quoteClip` unchanged (today's behaviour)
 *
 * `quoteClip` may be null (the champion has no 名言 clip); the answer is then
 * null and the call-out simply carries no third segment, exactly as before.
 * Never throws: a missing pack, a missing champion and an empty category all
 * degrade to `quoteClip`.
 */
export function confirmTailClip(
  champId: string,
  quoteClip: string | null,
  pack: ChampionVoicePack | null,
): string | null {
  if (!isCryVoiceChampion(champId)) return quoteClip;
  // `packClips` resolves the 變身 form share for us, so a cry champion's
  // alternate form answers with the same cry rather than falling back to TTS.
  const cries = packClips(pack, champId, CRY_CONFIRM_CATEGORY);
  return cries[0]?.clip ?? quoteClip;
}

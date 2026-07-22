/**
 * briefingContent — the four beats the 10-second rules briefing shows a
 * first-timer (task #76). READ, not spoken: the overlay is SILENT (the only VO
 * in champ select is the champion name call-out, task #35/#41), and this machine
 * must stay quiet during playtests (task #62).
 *
 * Scope was cut ruthlessly to the rules a new player literally cannot function
 * without — and two the brief originally listed were dropped on purpose:
 *   • the centre GUARDIAN tower — it is task #89 and NOT BUILT YET; a briefing
 *     must never teach a mechanic the game does not have.
 *   • item prices / the legendary draft — learnable in the shop itself (#106
 *     shows prices inline); not a "can't function" rule.
 *
 * The zh line is load-bearing (惡搞 voice, not a manual); the en/ja glosses are
 * short and optional, matching the trilingual UI direction of task #19. Beat 3
 * is the exact prep-vs-combat confusion the user hit personally (「戰鬥還沒開始
 * 嗎？」).
 */

export interface BriefingBeat {
  /** the load-bearing zh line */
  zh: string;
  /** short English gloss */
  en: string;
  /** short Japanese gloss */
  ja: string;
}

export const BRIEFING_BEATS: readonly BriefingBeat[] = [
  {
    zh: "這裡兩場 3v3 同時在打。你只管眼前這場，另一邊不關你的事。",
    en: "Two 3v3s run at once — you only fight the one in front of you.",
    ja: "3v3が同時に2試合。目の前の1試合だけ相手にすればいい。",
  },
  {
    zh: "沒有淘汰。全隊八條命一起花，花光才滾。",
    en: "No knockouts — your team shares eight lives; you're out only when they run out.",
    ja: "脱落なし。チームで8つの命を共有、尽きたら終わり。",
  },
  {
    zh: "開打前先逛攤買裝，買夠了按 Ready 直接開打——別讓隊友等。",
    en: "Shop before the round, then hit Ready to start early — don't keep your team waiting.",
    ja: "戦闘前に買い物、揃ったら Ready で即開始。仲間を待たせない。",
  },
  {
    zh: "被打趴別哭，叫隊友站進你的圈圈把你撿回來。",
    en: "Downed? A teammate stands in your circle to revive you.",
    ja: "倒れても泣かない。仲間が円に入れば復活できる。",
  },
] as const;

/** Milliseconds each beat holds before auto-advancing (4 × 2.5 s ≈ the 10 s window). */
export const BRIEFING_BEAT_MS = 2500;

/**
 * Which beat is showing at `elapsedMs` into the briefing. Clamps to the last
 * beat (so it holds rather than blanking if the window over-runs) and to the
 * first beat for a negative/NaN clock. Pure — the component owns the timer.
 */
export function activeBeatIndex(
  elapsedMs: number,
  count: number = BRIEFING_BEATS.length,
  perBeatMs: number = BRIEFING_BEAT_MS,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.floor(elapsedMs / perBeatMs));
}

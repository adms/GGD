/**
 * ⭐⭐ 第四批 37 名「**先上架、語音待補**」的**單一宣告**（GH#1281）。
 *
 * ── 為什麼要有這一份 ─────────────────────────────────────────────────────────
 * owner 2026-09-16（逐字）：「**全部英雄上架是預設的 不需要我審查通過**」
 * owner 2026-09-17（逐字）：「**我要全部上線**」
 *
 * ⇒ 這 37 名今天就在選人畫面上，而他們的**唸名／名言／戰鬥語音還沒做**
 *   （素材要走聽審，owner 2026-09-10「⛔ 人工聽審閘不代填」）。
 * ⚠️ 語音那一族有**四條**守衛各自問「每一位上架英雄都有嗎」：
 *   `championNamesJa`（呼名）· `nameVoice`（MANIFEST）· `selectVoiceCoverage`（選角）·
 *   `combatVoiceCoverage`（戰鬥）。四條各抄一份名單 ＝ 第〇·四守則說的「四個住處」，
 *   而它們一定會各自漂。⇒ ⭐ **名單只住這裡**，四條測試逐一 import。
 *
 * ── 這不是豁免，是**棘輪** ───────────────────────────────────────────────────
 * ⭐ 一位英雄的語音做好了 ⇒ 從這裡**刪掉那一列**（守衛會當場證明它真的有聲音）。
 * ⛔ 這張名單只能變短：多一位 ⇒ 那是新的缺口，要寫下**owner 的原話**才進得來。
 * ⚠️ 金色魔王（`acquired-lord-nightmares`）**在名單上**：owner 2026-09-17「金色魔王 一樣用莉娜音效」
 *   已經接上莉娜的 4 段原檔（普攻輕／重・落敗・⋯），⛔ 但四條守衛問的是「技能唸名／
 *   受傷／擊殺／死亡」那一組，今天還答不出來 ⇒ 誠實留在缺口上，⛔ 不是先劃掉再說。
 */
export const VOICE_GAP_BATCH4: readonly string[] = [
  "acquired-alice",
  "acquired-astralym",
  "acquired-asuna",
  "acquired-beatrice",
  "acquired-cattiva",
  "acquired-dio",
  "acquired-emilia",
  "acquired-inuyasha",
  "acquired-jetragon",
  "acquired-kita-kita",
  "acquired-kuroyukihime",
  "acquired-leafa",
  "acquired-lord-nightmares",
  "acquired-mario",
  "acquired-mewtwo",
  "acquired-minecraft",
  "acquired-morgiana",
  "acquired-naruto",
  "acquired-pokemon-trainer",
  "acquired-ram",
  "acquired-rim",
  "acquired-ryu",
  "acquired-saya",
  "acquired-wargreymon",
  "acquired-xiaodangjia",
  "acquired-zero",
  "lol-ahri",
  "lol-ashe",
  "lol-blitzcrank",
  "lol-chogath",
  "lol-fiddlesticks",
  "lol-garen",
  "lol-malphite",
  "lol-ornn",
  "lol-sett",
  "lol-thresh",
  "lol-velkoz",
];

/** 一行就答得出「這一位今天是不是宣告過的語音缺口」。 */
export function isDeclaredVoiceGap(championId: string): boolean {
  return VOICE_GAP_BATCH4.includes(championId);
}

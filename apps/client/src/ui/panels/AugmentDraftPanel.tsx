/**
 * AugmentDraftPanel — the 3-choose-1 draft (task #110). SeatState.offers →
 * pickOffer command. ONE panel serves every draft: silver/gold/prismatic
 * augment rounds, legendary WEAPON rounds and the orb gacha all arrive as the
 * same OfferState and render here, discriminated only by `offer.tier`.
 *
 * FOUR THINGS THIS PANEL OWES THE PLAYER (all requested):
 *
 *  1. A LoL-Arena flourish — 「炫彩一點…有微微發光流轉特效」. Each card is a
 *     `kind="card"` SfxButton, so it inherits the shared cyber-glow family
 *     (buttonFx.css) with a SUBTLE tier-tinted light flowing around its border.
 *     The tier colour rides in on the `--ggd-card-glow` custom property.
 *
 *  2. A MANDATORY icon — 「卡片一定要包含 icon 圖示」. Only ~13% of content has
 *     real art and generation is blocked, so MOST cards have none. Every card
 *     therefore renders a GlyphTile: a deterministic, id-seeded procedural glyph
 *     with a tier-coloured frame that has the same silhouette and weight as a
 *     real icon, and yields to the real PNG automatically the moment one lands
 *     (GlyphTile layers <IconImg> over the glyph — nothing here has to know
 *     whether the file exists). NEVER a ragged empty hole on the round's biggest
 *     decision.
 *
 *  3. A tech confirm — 「選定也會有厲害的科技音效」. Picking a card plays the
 *     weighty, mechanical `draftConfirm` lock-in cue (audio-map.json), authored
 *     to sit apart from the cyber hover and the countdown bells.
 *
 *  4. A REVEAL that sounds like a reveal (#110 sparkle + #82 gacha). Each card
 *     flips face-up in turn with a `draftCardReveal` sparkle; a legendary offer
 *     (the bought 傳說寶珠 gacha roll and the scheduled free legendary-weapon
 *     round both project as tier `weapon`) opens on a `legendaryRoll` spin
 *     build-up and lands the reveal on a `legendaryWin` jackpot. All the timing
 *     lives in the pure {@link revealSchedule}; this panel just fires each cue
 *     and flips the matching card. `playSfx` no-ops on an unmapped key, so the
 *     new cues degrade to silence until the audio-map phase wires their clips —
 *     and stay silent in test mode (the mixer is locked), same as draftConfirm.
 *
 * AND, since the 2026-07-24 playtest (P2), a FIFTH thing: it owns the screen
 * while it is up. It used to pin `top: 90` — landing on the merchant tip box —
 * and share the screen with the shop list, the countdown and Ready up, so four
 * surfaces asked for attention at once and nothing said which came first.
 *
 * It now (i) really centres, which is what its #107 registry row always
 * declared (`edge: "center"`), so it clears the tip box's band by construction
 * rather than by a pixel that happened to work at one resolution, and (ii)
 * paints a scrim at `INTERMISSION_Z.focusScrim` that demotes and click-blocks
 * everything it out-ranks. WHY the draft and not the shop: the draft is the one
 * surface here that is irreversible AND expiring — miss it and the round is
 * played without an augment, with no undo and no re-open — while browsing is
 * voluntary, resumable and completely intact the instant a card is picked. The
 * whole order, and the reasoning per band, is in panels/intermissionLayout.ts.
 */
import { useEffect, useState } from "react";
import { useHud } from "../../net/RoomStore";
import type { OfferView } from "../../net/RoomStore";
import { audioSystem } from "../../audio";
import { hudActions } from "../actions";
import { GlyphTile } from "../components/GlyphTile";
import { Tooltip } from "../components/Tooltip";
import { SfxButton } from "../SfxButton";
import { resolveChoice } from "./resolveChoice";
import { uiCues } from "../uiCuesConfig";
import { DRAFT_CONFIRM_SFX, tierColor, tierLabel, weaponEffectDescription } from "./draftCardStyle";
// owner 2026-08-02 的卡片排版,四個渲染點之一(三選一抽卡)。
import { ItemCardBody } from "../components/ItemCardBody";
import { itemCardDescription } from "./draftCardStyle";
import {
  draftChoiceSuffix,
  draftCardDescId,
  draftCardFallbackLabel,
  draftCardLabelledBy,
  draftCardNameId,
  draftDialogLabelId,
} from "./draftA11y";
import { isLegendaryOffer, revealSchedule } from "./draftReveal";
import { FOCUS_FADE_MS, focusHint, FOCUS_SCRIM_BG, INTERMISSION_Z } from "./intermissionLayout";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

/**
 * 🖤 **合成層旋鈕 —— 「三選一卡片選完前的閃爍」**（GH#618 的下一刀）
 *
 * > owner 2026-08-23：「**隨機三選一卡片選完前的閃爍 請找到根因修正**」
 * > （同一件事的前一則）「剛進商店 **介面有些部分**會**黑閃爍** 選完隨機三選一又回復正常」
 *
 * ── ⭐ 量到的（真的瀏覽器、真的出貨頁、`localhost:39527`，⛔ 不是推的）────────
 *
 * ① **這一整頁只有兩個東西被提升成合成層，而它們都是 `<canvas>`。**
 *    掃全 `document` 的 `will-change` / 3D transform / `filter` / `mix-blend-mode`：
 *    面積 > 900,000 px² 的提升者 **= 2 個，兩個都是 canvas**。
 *    ⇒ ⛔ **焦點遮罩沒有自己的合成層** —— 它是一塊**畫進 `#hud-root` 那一層**的
 *    滿版 `rgba(6,9,16,0.62)`（量到 rect = 1280×720 = **921,600 px²**）。
 *
 * ② **而 `#hud-root` 那一層每一幀都在被弄髒。** 量到 **20 條無窮動畫動的是
 *    非合成屬性**（`box-shadow` × 5、`background-position` × 15），
 *    合計 **81,449 px² 逐幀主執行緒重繪**。
 *    其中 **3 條 · 47,232 px²（+138%）是三選一自己帶來的**
 *    （A/B 量測：沒有 offer 時 17 條 / 34,217 px²，有 offer 時 20 條 / 81,449 px²）。
 *
 * ⇒ ⭐ **兩件事湊起來就是 owner 那句「有些部分」**：遮罩讓 `#hud-root` 從
 *    「大部分是透明、只有商店那一塊有內容」變成**每一塊 tile 都有內容**，
 *    而那一層每一幀都被那 20 條動畫弄髒 ⇒ 來不及 raster 的 tile 呈現出去
 *    就是頁面底色 `#0b0e14`（`index.html:27`）＝ **黑**。**tile 是分塊的 ⇒「有些部分」。**
 *
 * ③ ⚠️ 而在此之前遮罩還會**建一層再拆一層**：`ggdFocusIn` 是 200ms 的 opacity 動畫
 *    ⇒ Chrome 為它提升一個滿版合成層，**200ms 後動畫結束就把它拆掉**，
 *    那一格內容於是**折回 `#hud-root`**  ⇒ 卡片出現後正好 200ms 一次**滿版重新 raster**。
 *
 * ── ⭐ 我挑的（owner 常設：「自己判斷 但留後台開關可以簡易 rollback」）───────
 *
 * | 格 | 治哪一條 | ⛔ 一鍵回頭 |
 * |---|---|---|
 * | `scrimOwnLayer` | ①③：遮罩搬進**自己的**合成層 ⇒ 滿版填色只畫**一次**，`#hud-root` 回到「大部分透明」，而且⛔ 不再有 200ms 的建層／拆層 | `false` |
 * | `cardOwnLayer` | ②：三張卡各自一層 ⇒ 那條 `background-position`＋`blur(0.3px)`＋`mask-composite:exclude` 的逐幀重繪關在**自己的 15,744 px²** 裡，⛔ 不再弄髒共用層 | `false` |
 *
 * ⚠️ **代價**：多 4 個合成層（滿版 1 + 卡片 3）≈ 6 MB VRAM。
 * ⛔ 兩格都**不改任何一個像素的外觀** —— 它們只改「這些像素畫在哪一層」。
 *
 * ⛔ **為什麼是常數不是 `content/config/*.json`**：新增一份 config 一定會動到
 * `apps/admin/src/store.ts` 與 `ui/App.tsx` 各一行（`configDocCoverage.test.ts` 要求），
 * 而 CLAUDE.md 逐字稱那兩個是「已知唯一真正共用的檔」⇒ 併行 lane 必撞。
 * 同 `INTERMISSION_GPU`（`render/intermission/IntermissionScene.ts`）的前例。
 */
export const DRAFT_COMPOSITING = {
  /** 焦點遮罩自己一層（⛔ 回頭：`false`） */
  scrimOwnLayer: true,
  /** 三張卡各自一層（⛔ 回頭：`false`） */
  cardOwnLayer: true,
} as const;

/**
 * ⭐⭐ **本場已選**（GH#893）—— owner 2026-09-01 逐字：
 * > 「固有能力三選一**看不到過去選了哪些**」
 *
 * ⚠️ ⭐ 它讀的是**伺服器狀態**（`SeatView.augments` ← `SeatState.augments`），
 * ⛔ 不是客戶端自己記的 —— 客戶端記的那一份**重連之後就消失**
 * （失敗形態②：算出來但從沒送到客戶端），⭐ 而重連正是最需要它的時候。
 *
 * ⭐ 只印名字，⛔ 不印圖示與說明：這一條掛在三選一面板下面，
 * 而一排卡片會把玩家的注意力從「現在要選哪一張」上帶走。
 */
function PickedSoFar(): React.JSX.Element | null {
  // ⚠️⚠️ ⭐ **回字串，⛔ 不是陣列** —— GH#618 的閘（`augmentDraftNoReconcile`）
  //   量到：`seats` 的快取鍵含 `cooldowns`/`mana`，⭐ 所以每一張快照都是新物件
  //   ⇒ 一個回 `T[]` 的選擇器**每 tick 都「變了」** ⇒ 這棵子樹每張快照重跑 React。
  //   ⚠️ 而它**零個 DOM mutation** —— 兩種實作在螢幕上逐位元相同，
  //   差的只有主執行緒（失敗形態④），⛔ 所以肉眼看不出來，只有那條閘會叫。
  // ⇒ ⭐ join 成一個字串：內容沒變 ⇒ 字串相等 ⇒ zustand 不重跑。
  const pickedKey = useHud((s) => {
    if (s.localSeatId === null) return "";
    return (s.seats.find((v) => v.seatId === s.localSeatId)?.augments ?? []).join("\u0000");
  });
  const picked = pickedKey === "" ? null : pickedKey.split("\u0000");
  if (!uiCues().draftShowPicked) return null;
  if (!picked || picked.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 10,
        fontSize: 11,
        color: "#8b94a8",
        textAlign: "center",
        maxWidth: 640,
        lineHeight: 1.6,
      }}
    >
      本場已選（{picked.length}）：
      <span style={{ color: "#c8d0e0" }}>
        {picked.map((id) => resolveChoice(id).name || id).join("、")}
      </span>
    </div>
  );
}

export function AugmentDraftPanel(): React.JSX.Element | null {
  const offers = useHud((s) => {
    if (s.localSeatId === null) return null;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.offers ?? null;
  });
  if (!offers || offers.length === 0) return null;

  return (
    <>
      {/* THE FOCUS SCRIM (playtest P2). It takes pointer events on purpose: a
          merely-dimmed shop card still invites the click, and a Ready press
          with an unanswered offer silently throws the augment away. Both come
          back untouched the instant a card is picked, and the prep clock —
          lifted above this scrim by PrepClock — still ends the phase on its
          own, so nobody can be stuck behind it. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: INTERMISSION_Z.focusScrim,
          background: FOCUS_SCRIM_BG,
          pointerEvents: "auto",
          animation: `ggdFocusIn ${FOCUS_FADE_MS}ms ease-out both`,
          // ⭐ 見 DRAFT_COMPOSITING ①③ —— 這一塊是**滿版 921,600 px²**,不提升
          // 就等於把 `#hud-root` 整層填滿內容,而那一層每一幀都被 20 條非合成
          // 動畫弄髒。宣告在**掛載當下**(⛔ 不是等動畫開始),所以連 200ms 後
          // 那一次「拆層 ⇒ 滿版重新 raster」也一起消失。
          willChange: DRAFT_COMPOSITING.scrimOwnLayer ? "opacity" : undefined,
        }}
      >
        <style>{"@keyframes ggdFocusIn{from{opacity:0}to{opacity:1}}"}</style>
      </div>
      <div
        // task #197 — the pad focus layer scopes to this panel: the draft scrim
        // MUST be answerable by a pad, or a keyboard-less player loses the
        // augment. Priority 40 sits BELOW the modal scopes (pause=50,
        // settings/purchase/create-room=45) ON PURPOSE: a system modal opened
        // over the draft (e.g. pause) should take the pad, and the draft regains
        // capture the moment it closes. Keep any NEW scrim shown during a draft
        // out of the 41–49 band unless it truly must outrank the draft.
        data-pad-scope="augment-draft"
        data-pad-scope-priority="40"
        // task #265 (#252) — this is a MODAL CHOICE with its own scrim, so it
        // is a dialog, and it has to say so. Before this the panel carried no
        // ARIA at all: opening it announced nothing, and a pad/AT user landing
        // on a card heard two unlabelled divs read back. The label points at
        // the tier header already on screen (see draftA11y for why every name
        // here is `aria-labelledby` and never a re-typed `aria-label`).
        role="dialog"
        aria-modal="true"
        aria-labelledby={offers.map((o) => draftDialogLabelId(o.offerId)).join(" ")}
        style={{
          position: "absolute",
          // BOTH axes — the panel's #107 registry row declares `edge: "center"`
          // and hudPanelRect resolves that to ((H − h) / 2). Pinning a literal
          // top was the declaration/reality mismatch that put the card stack on
          // the merchant tip box's band.
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: INTERMISSION_Z.focus,
          width: 460,
          maxWidth: "92vw",
          padding: 14,
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 12,
          color: TEXT_MAIN,
          pointerEvents: "auto",
        }}
      >
        {offers.map((offer) => (
          // keyed by offerId so a new offer REMOUNTS the reveal — every fresh
          // roll replays its build-up / sparkles / jackpot from the top.
          <DraftOffer key={offer.offerId} offer={offer} />
        ))}
        {/* the answer to 「四件事同時要注意力」: say which one is first, and
            promise the rest is coming back. */}
        <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: TEXT_DIM }}>
          {focusHint()}
        </div>
      </div>
    </>
  );
}

/**
 * ONE draft offer: its tier header and the three choice cards, owning the reveal
 * sequence. On mount it schedules {@link revealSchedule} — a legendary offer
 * fires `legendaryRoll` at once, each card flips face-up on its own
 * `draftCardReveal` sparkle, and a legendary lands on `legendaryWin`. `revealed`
 * counts how many cards have flipped; a card below that count is face-up, the
 * rest are dimmed and lifted until their turn.
 *
 * EXPORTED for `draftA11y.test.ts`: the accessible-name guard server-renders
 * this — one offer per tier the family serves — and scans every focusable
 * element it produces. The panel itself reads the store, which the node test
 * env has no room for; the offer is the whole payload, so rendering it directly
 * exercises exactly the markup a player's AT would meet.
 */
export function DraftOffer({ offer }: { offer: OfferView }): React.JSX.Element {
  const accent = tierColor(offer.tier);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const legendary = isLegendaryOffer(offer.tier);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const step of revealSchedule(offer.choices.length, legendary)) {
      timers.push(
        setTimeout(() => {
          if (step.cardIndex !== undefined) {
            // flip THIS card face-up (monotonic: a late timer never un-reveals)
            setRevealed((n) => Math.max(n, step.cardIndex! + 1));
          }
          audioSystem.playSfx(step.event);
        }, step.atMs),
      );
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
    // remount-per-offer (see the key above) makes offerId the only real dep;
    // choices/tier are fixed for a given offerId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.offerId]);

  return (
    <div>
      {/* the dialog's label node — `aria-labelledby` on the panel points here,
          so the announced string IS the visible header, character for
          character, and can never drift from it. */}
      <div id={draftDialogLabelId(offer.offerId)} style={{ textAlign: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: "bold", color: accent, letterSpacing: "0.06em" }}>
          {tierLabel(offer.tier)}
        </span>
        <span style={{ fontSize: 11, color: TEXT_DIM }}> · {draftChoiceSuffix(offer.tier)}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {offer.choices.map((choice, idx) => {
          const { name, desc, icon } = resolveChoice(choice);
          // Weapon cards must state what the weapon DOES, not just its cost:
          // pull the shop's concrete effect+stat read of the same item, and
          // keep resolveChoice's text for augments/abilities (they already
          // carry a description) and for a bare item (its cost).
          const cardDesc = weaponEffectDescription(choice) ?? desc;
          // 傳說武器的原文走 <ItemCardBody>(標記 chip + 數值上色 + 一行一列);
          // 增益/技能卡沒有 `效能` 結構,維持原本那一段純文字。
          const cardDoc = itemCardDescription(choice);
          const faceUp = idx < revealed;
          return (
            <Tooltip
              key={choice}
              title={name}
              body={cardDesc}
              style={{ flex: 1, minWidth: 0, display: "flex" }}
            >
              <SfxButton
                kind="card"
                // task #265 (#252) — the card's accessible name. The GlyphTile
                // is `aria-hidden`, so without this a focused card offered an
                // AT/pad user two anonymous divs and, during the reveal, an
                // `opacity: 0` control with nothing to announce at all. Points
                // at the name + effect nodes THIS card already renders, so the
                // spoken name is exactly what is drawn. `SfxButton` spreads
                // `...rest` onto the real <button>, so no component change.
                aria-labelledby={draftCardLabelledBy(offer.offerId, idx)}
                // …and the SAME two values as a flat fallback. Per accname,
                // `aria-labelledby` wins wherever it is implemented, so this is
                // never what a compliant screen reader speaks. It exists because
                // simpler tree walkers — including the accessibility snapshot in
                // this repo's own browser tooling, measured 2026-07-26 with a
                // control probe — resolve neither `aria-labelledby` NOR
                // name-from-contents across the card's nested divs, and read the
                // button as unnamed. This is NOT a second copy of the text: it is
                // the same two expressions the JSX below renders, so the two can
                // not drift.
                aria-label={draftCardFallbackLabel(name, cardDesc)}
                // encode the chosen index so the server applies THIS card
                // (host accepts "offerId#idx"; plain id falls back to choice 0)
                onClick={() => {
                  audioSystem.playSfx(DRAFT_CONFIRM_SFX);
                  hudActions.sendCommand({ kind: "pickOffer", offerId: `${offer.offerId}#${idx}` });
                }}
                style={
                  {
                    // tier tint for the flowing border glow (.ggd-btn--card)
                    "--ggd-card-glow": accent,
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 8px 12px",
                    borderRadius: 12,
                    cursor: "pointer",
                    background: "linear-gradient(180deg, #1b2233 0%, #12172a 100%)",
                    border: `1px solid ${accent}44`,
                    color: TEXT_MAIN,
                    textAlign: "center",
                    // the reveal flip: a face-down card sits dimmed + lifted, then
                    // settles opaque the instant its draftCardReveal sparkle fires.
                    // pointer-events off while hidden so a card cannot be hovered
                    // or picked before the player can actually see it.
                    opacity: faceUp ? 1 : 0,
                    pointerEvents: faceUp ? "auto" : "none",
                    transform: faceUp ? "translateY(0)" : "translateY(8px)",
                    transition:
                      "box-shadow 0.25s ease, transform 0.28s ease, opacity 0.28s ease",
                    // ⭐ 見 DRAFT_COMPOSITING ② —— `.ggd-btn--card::before` 每一幀
                    // 重畫 `background-position`(⛔ 非合成屬性)而且帶 `blur(0.3px)`
                    // ＋ `mask-composite:exclude`,量到三張卡合計 **47,232 px²**
                    // (整頁逐幀重繪面積的 **58%**)。各給一層 ⇒ 關在自己的
                    // 15,744 px² 裡,⛔ 不再弄髒 `#hud-root` 那一層。
                    willChange: DRAFT_COMPOSITING.cardOwnLayer ? "transform" : undefined,
                  } as React.CSSProperties
                }
              >
                {/* MANDATORY icon: real art when present, else a deterministic
                    tier-framed glyph — never an empty hole. */}
                <GlyphTile
                  seed={choice}
                  icon={icon ?? null}
                  label={name}
                  accent={accent}
                  size={46}
                  radius={10}
                />
                <div
                  id={draftCardNameId(offer.offerId, idx)}
                  style={{ fontSize: 12.5, fontWeight: "bold", color: accent, lineHeight: 1.15 }}
                >
                  {name}
                </div>
                <div
                  id={draftCardDescId(offer.offerId, idx)}
                  style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.3 }}
                >
                  {cardDoc ? (
                    <ItemCardBody description={cardDoc} itemId={choice} fontSize={10} textColor={TEXT_DIM} />
                  ) : (
                    cardDesc
                  )}
                </div>
              </SfxButton>
            </Tooltip>
          );
        })}
      </div>
      {/* ⭐ GH#893 —— 本場已選（讀伺服器狀態，⛔ 不是客戶端自己記的）。 */}
      <PickedSoFar />
    </div>
  );
}

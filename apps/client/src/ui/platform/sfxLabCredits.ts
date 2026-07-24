/**
 * sfxLabCredits — the per-clip 効果音ラボ (Sound Effect Lab) listing shown on the
 * 版權聲明 page (#credits).
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY CLIP IS LISTED, WHEN THE LICENCE DOES NOT ASK FOR IT
 * ---------------------------------------------------------------------------
 * 効果音ラボ's terms are 商用可・報告不要・クレジット表記不要（禁止ではなく任意）:
 * attribution is OPTIONAL, not required. These rows are therefore COURTESY, not
 * a licence obligation — the CC-BY 4.0 login dragon in creditsData.ts remains the
 * ONE mandatory in-game credit, and nothing here may be promoted into that
 * bucket. They are listed in full because the project owner asked for it:
 * 「只要好好列出附記在授權頁面就好」.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE IS TRANSCRIBED, NEVER INVENTED
 * ---------------------------------------------------------------------------
 * Every sourceTitle / sourceUrl below is copied from
 * content/assets/audio/sfx/lab/MANIFEST.json (the `clips` array plus the
 * `phase2` ledger and its provenanceBackfill) and audio/voice-jp/MANIFEST.json.
 * Where the manifest only knows the source PAGE — `arenaAmbience`, whose
 * acquisition agent named the clip 「風に揺れる草木1」 but never reported the file —
 * `sourceUrl` is left undefined and the page is shown instead. Do not fill one in
 * from a guess; re-download from the recorded page and record what you fetched.
 *
 * That is now PINNED rather than promised: sfxLabCredits.test.ts joins every row
 * back to its manifest entry (field-for-field where the manifest is structured,
 * verbatim-substring where the backfilled wave records provenance as prose) and
 * asserts arenaAmbience is the ONLY page-only row. It was not, before that check:
 * the eight voice-jp rows shipped with no source URL at all while
 * voice-jp/MANIFEST.json had a direct one recorded for each.
 *
 * ---------------------------------------------------------------------------
 * 「使用中」 IS DERIVED, NOT DECLARED — AND IT MEANS AUDIBLE, NOT MAPPED
 * ---------------------------------------------------------------------------
 * The page's per-clip badge is a claim that the game will actually PLAY the
 * clip. That claim used to be computed from `mapKeys` alone — i.e. from
 * content/config/audio-map.json having an entry — and an audio-map entry is only
 * one third of a binding. A key is audible iff the map resolves it to a file
 * AND some code path calls `playSfx` with it AND (for an event-driven cue) the
 * sim event it rides is fanned out to clients. Reporting the first as if it were
 * all three let three clips (arrowRelease / arrowPierce / castCircle) sit on the
 * page as 使用中 while nothing in the client could reach them, and would have hid
 * the five cues whose events the fan-out whitelist was silently dropping.
 *
 * That is a measurement whose denominator was produced by the thing being
 * measured, and it is the exact failure the 効果音ラボ authorisation cannot
 * tolerate: the owner allowed these downloads on the condition that every clip
 * is properly listed here, so the ledger misreporting its own state is the one
 * defect that breaks the condition.
 *
 * So the two claims are now SEPARATE and neither is hand-maintained as an
 * "is it wired" list:
 *   • `mapKeys`   — what audio-map.json binds this file to. Pinned exactly by
 *                   sfxLabCredits.test.ts against that file.
 *   • `boundKeys` — DERIVED as `mapKeys ∩ audio/sfxReachability.PLAYABLE_SFX_KEYS`,
 *                   the keys some code path can actually play. Every membership
 *                   in that set is anchored by sfxReachability.test.ts to an emit
 *                   site on disk and to the game-server's fan-out whitelist.
 *   • `silentKeys`— mapped but unreachable, with `silentReasons` saying why. A
 *                   clip in this state is 收錄未啟用, not 使用中.
 * audio-map.json belongs to the audio lane; if a binding moves, `mapKeys` is
 * regenerated to match — never the reverse, and never by relaxing a test.
 *
 * NOTE: this is a LIST, not a soundboard. The pack forbids 再配布, and the one
 * build that would trip it is an audition screen that plays/downloads each clip.
 * Never add a play button to these rows.
 */
import { PLAYABLE_SFX_KEYS, sfxSilentReason } from "../../audio/sfxReachability";

/**
 * A row as AUTHORED. `mapKeys` is the raw audio-map binding and nothing more —
 * it says which event names resolve to this file, not that anything plays them.
 * The audible claim is derived from it (see {@link SFX_LAB_CLIPS}).
 */
export interface SfxLabClipSource {
  /** Path under content/assets/audio/, e.g. "sfx/lab/gold-gain.mp3". */
  readonly file: string;
  /** audio-map.json sfx event keys pointing at this file. NOT a claim of use. */
  readonly mapKeys: readonly string[];
  /** The Japanese title 効果音ラボ publishes the clip under. */
  readonly title: string;
  /** Original file name on the site, when the manifest recorded one. */
  readonly sourceFile?: string;
  /** Direct source URL; undefined when provenance is page-level only. */
  readonly url?: string;
  /** Source page on soundeffect-lab.info. */
  readonly page?: string;
  /** What it does in GGD, in the operator's language. */
  readonly use: string;
  readonly group: SfxLabGroupId;
}

/** An authored row plus the derived audibility verdict the page renders. */
export interface SfxLabClip extends SfxLabClipSource {
  /**
   * The keys that will ACTUALLY play this clip: `mapKeys` filtered to those some
   * code path can reach. This — not the presence of a map entry — is what the
   * page's 使用中 badge means. Empty ⇒ 收錄未啟用.
   */
  readonly boundKeys: readonly string[];
  /** Mapped keys that cannot sound today (empty in a healthy ledger). */
  readonly silentKeys: readonly string[];
  /** One reason per `silentKeys` entry, in the same order. */
  readonly silentReasons: readonly string[];
}

export type SfxLabGroupId = "ui" | "stage" | "weapon" | "magic" | "ambience" | "voice";

export const SFX_LAB_GROUPS: readonly { readonly id: SfxLabGroupId; readonly label: string }[] = [
  { id: "ui", label: "UI・系統" },
  { id: "stage", label: "演出・賽事" },
  { id: "weapon", label: "戰鬥・武器" },
  { id: "magic", label: "魔法・技能" },
  { id: "ambience", label: "環境音" },
  { id: "voice", label: "声素材（日文語音）" },
];

const SFX_LAB_SOURCE: readonly SfxLabClipSource[] = [
  { file: "sfx/lab/ui-denied.mp3", mapKeys: ["uiDenied"], title: "ビープ音1", sourceFile: "beep1.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/beep1.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "無法選擇／金幣不足時的錯誤提示", group: "ui" },
  { file: "sfx/lab/shop-purchase.mp3", mapKeys: ["shopPurchase"], title: "レジスターで精算", sourceFile: "clearing1.mp3", url: "https://soundeffect-lab.info/sound/various/mp3/clearing1.mp3", page: "https://soundeffect-lab.info/sound/various/", use: "商店購買成交", group: "ui" },
  { file: "sfx/lab/gold-gain.mp3", mapKeys: ["goldGain"], title: "お金を落とす1", sourceFile: "money-drop1.mp3", url: "https://soundeffect-lab.info/sound/various/mp3/money-drop1.mp3", page: "https://soundeffect-lab.info/sound/various/", use: "取得金幣", group: "ui" },
  { file: "sfx/lab/panel-open.mp3", mapKeys: ["panelOpen"], title: "メニューを開く4", sourceFile: "menu4.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/menu4.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "面板／視窗開啟", group: "ui" },
  { file: "sfx/lab/ui-cancel.mp3", mapKeys: ["uiCancel"], title: "キャンセル1", sourceFile: "cancel1.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/cancel1.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "取消、返回上一層", group: "ui" },
  { file: "sfx/lab/ability-rank-up.mp3", mapKeys: ["abilityRankUp"], title: "決定ボタンを押す10", sourceFile: "decision10.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/decision10.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "技能升級（投入技能點）", group: "ui" },
  { file: "sfx/lab/low-health.mp3", mapKeys: ["lowHealth"], title: "警告音1", sourceFile: "warning1.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/warning1.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "血量過低警告", group: "ui" },
  { file: "sfx/lab/settlement-reveal.mp3", mapKeys: ["settlementReveal"], title: "データ表示3", sourceFile: "data-display3.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/data-display3.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "結算畫面逐列揭示名次", group: "ui" },
  { file: "sfx/lab/uiTabSwitch.mp3", mapKeys: ["uiTabSwitch"], title: "カーソル移動1", sourceFile: "cursor1.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/cursor1.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "分頁／頁籤切換", group: "ui" },
  { file: "sfx/lab/uiToggle.mp3", mapKeys: ["uiToggle"], title: "スイッチを押す", sourceFile: "switch1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/switch1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "開關類設定切換（含全域音訊開關）", group: "ui" },
  { file: "sfx/lab/match-start-gong.mp3", mapKeys: ["matchStartGong"], title: "試合開始のゴング", sourceFile: "gong-played1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/gong-played1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "開賽鑼（與日文播報疊放）", group: "stage" },
  { file: "sfx/lab/match-end-gong.mp3", mapKeys: ["matchEndGong"], title: "試合終了のゴング", sourceFile: "gong-played2.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/gong-played2.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "終場鑼，進入結算", group: "stage" },
  { file: "sfx/lab/vs-reveal.mp3", mapKeys: ["vsReveal"], title: "対戦カード表示1", sourceFile: "match-card1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/match-card1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "選角對戰卡 VS 揭示", group: "stage" },
  { file: "sfx/lab/level-up-jingle.mp3", mapKeys: ["levelUpJingle"], title: "レベルアップ", sourceFile: "levelup1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/levelup1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "升級提示樂句（與日文播報疊放）", group: "stage" },
  { file: "sfx/lab/recessBell.mp3", mapKeys: ["recessBell"], title: "学校のチャイム", sourceFile: "school-chime1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/school-chime1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "中場「下課鐘」，備戰視窗開啟時響一次", group: "stage" },
  { file: "sfx/lab/draftCardReveal.mp3", mapKeys: ["draftCardReveal"], title: "キラッ1", sourceFile: "kira1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/kira1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "三選一抽卡：每張卡翻面時的閃光", group: "stage" },
  { file: "sfx/lab/legendaryWin.mp3", mapKeys: ["legendaryWin"], title: "ラッパのファンファーレ", sourceFile: "trumpet1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/trumpet1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "傳說寶珠中獎號角", group: "stage" },
  { file: "sfx/lab/legendaryRoll.mp3", mapKeys: ["legendaryRoll"], title: "ドラムロール", sourceFile: "drum-roll1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/drum-roll1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "傳說寶珠轉蛋滾動中（循環）", group: "stage" },
  { file: "sfx/lab/guardianLastHit.mp3", mapKeys: ["guardianLastHit"], title: "アイテムを入手1", sourceFile: "item-get1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/item-get1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "守衛塔最後一擊的金幣獎勵", group: "stage" },
  { file: "sfx/lab/attack-sword-1.mp3", mapKeys: ["attackSword1"], title: "剣で斬る1", sourceFile: "sword-slash1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/sword-slash1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "單手劍普攻（第一式）", group: "weapon" },
  { file: "sfx/lab/attack-sword-2.mp3", mapKeys: ["attackSword2"], title: "剣で斬る2", sourceFile: "sword-slash2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/sword-slash2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "單手劍普攻（第二式）", group: "weapon" },
  { file: "sfx/lab/attack-greatsword.mp3", mapKeys: ["attackGreatsword"], title: "大剣で斬る", sourceFile: "large-sword-slash1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/large-sword-slash1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "大劍普攻", group: "weapon" },
  { file: "sfx/lab/attack-katana.mp3", mapKeys: ["attackKatana"], title: "刀で斬る1", sourceFile: "katana-slash1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/katana-slash1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "刀（日本刀）普攻", group: "weapon" },
  { file: "sfx/lab/whiff-sword.mp3", mapKeys: ["whiff"], title: "剣の素振り2", sourceFile: "sword-gesture2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/sword-gesture2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "揮空、未命中", group: "weapon" },
  { file: "sfx/lab/block-clash.mp3", mapKeys: [], title: "剣で打ち合う2", sourceFile: "sword-clash2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/sword-clash2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "格擋音；目前 block 事件改用自製音效，此檔備而未用", group: "weapon" },
  { file: "sfx/lab/block-shield.mp3", mapKeys: [], title: "盾で防御", sourceFile: "shield1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/shield1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "格擋音；目前 block 事件改用自製音效，此檔備而未用", group: "weapon" },
  { file: "sfx/lab/bow-draw.mp3", mapKeys: ["bowDraw"], title: "弓を引き絞る1", sourceFile: "bow-draw1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/bow-draw1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "拉弓蓄力", group: "weapon" },
  { file: "sfx/lab/arrow-release.mp3", mapKeys: ["arrowRelease"], title: "弓矢を放つ", sourceFile: "arrow-release1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/arrow-release1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "放箭", group: "weapon" },
  { file: "sfx/lab/arrow-pierce.mp3", mapKeys: ["arrowPierce"], title: "弓矢が刺さる", sourceFile: "arrow-pierce1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/arrow-pierce1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "箭矢命中", group: "weapon" },
  { file: "sfx/lab/gunshot.mp3", mapKeys: ["gunshot"], title: "拳銃を撃つ", sourceFile: "handgun-firing1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/handgun-firing1.mp3", page: "https://soundeffect-lab.info/sound/battle/battle2.html", use: "槍械射擊", group: "weapon" },
  { file: "sfx/lab/magic-bolt.mp3", mapKeys: ["magicBolt"], title: "気弾1", sourceFile: "qigong1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/qigong1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "法師普攻的魔力彈（原本法師普攻放的是拉弓聲）", group: "weapon" },
  { file: "sfx/lab/impact-heavy.mp3", mapKeys: [], title: "重いパンチ1", sourceFile: "punch-heavy1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/punch-heavy1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "重擊音；會蓋掉自製暴擊音的辨識度，故備而未用", group: "weapon" },
  { file: "sfx/lab/guardianSlam.mp3", mapKeys: ["guardianSlam"], title: "打撃4", sourceFile: "blow4.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/blow4.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "守衛塔範圍重擊（樹人／石頭人／巨獸人）", group: "weapon" },
  { file: "sfx/lab/cast-circle.mp3", mapKeys: ["castCircle"], title: "魔法陣を展開", sourceFile: "magic-circle1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-circle1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "魔法陣展開，詠唱起手", group: "magic" },
  { file: "sfx/lab/magic-fire.mp3", mapKeys: ["magicFire"], title: "火炎魔法1", sourceFile: "magic-flame1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-flame1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "火系技能施放", group: "magic" },
  { file: "sfx/lab/magic-ice.mp3", mapKeys: ["magicIce"], title: "氷魔法1", sourceFile: "magic-ice1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-ice1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "冰系技能施放", group: "magic" },
  { file: "sfx/lab/magic-lightning.mp3", mapKeys: ["magicLightning"], title: "雷魔法2", sourceFile: "magic-electron2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-electron2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "雷系技能施放", group: "magic" },
  { file: "sfx/lab/magic-holy.mp3", mapKeys: ["exUnlockSting"], title: "聖魔法", sourceFile: "magic-attack-holy1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-attack-holy1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "EX 技能解鎖聖光（與日文播報疊放）", group: "magic" },
  { file: "sfx/lab/magic-heal.mp3", mapKeys: ["heal"], title: "回復魔法2", sourceFile: "magic-cure2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-cure2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "治療", group: "magic" },
  { file: "sfx/lab/magic-buff.mp3", mapKeys: ["buffApply"], title: "ステータス上昇魔法1", sourceFile: "magic-statusup1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-statusup1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "增益狀態附加", group: "magic" },
  { file: "sfx/lab/explosion.mp3", mapKeys: ["explosion"], title: "爆発2", sourceFile: "bomb2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/bomb2.mp3", page: "https://soundeffect-lab.info/sound/battle/battle2.html", use: "範圍爆炸", group: "magic" },
  { file: "sfx/lab/reviveChannel.mp3", mapKeys: ["reviveChannel"], title: "オーラ1", sourceFile: "aura1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/aura1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "隊友復活詠唱進行中（循環）", group: "magic" },
  { file: "sfx/lab/reviveComplete.mp3", mapKeys: ["reviveComplete"], title: "回復魔法4", sourceFile: "magic-cure4.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-cure4.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "復活完成", group: "magic" },
  { file: "sfx/lab/respawn.mp3", mapKeys: ["respawn"], title: "ニュッ1", sourceFile: "nyu1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/nyu1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "重生、重新進場", group: "magic" },
  { file: "sfx/lab/fireRingLoop.mp3", mapKeys: ["fireRingLoop"], title: "たき火", sourceFile: "fire1.mp3", url: "https://soundeffect-lab.info/sound/environment/mp3/fire1.mp3", page: "https://soundeffect-lab.info/sound/environment/", use: "火環收縮的燃燒床音（循環）", group: "ambience" },
  { file: "sfx/lab/arenaAmbience.mp3", mapKeys: ["arenaAmbience"], title: "風に揺れる草木1", page: "https://soundeffect-lab.info/sound/environment/", use: "競技場環境音床（循環）", group: "ambience" },
  { file: "sfx/lab/merchantAmbience.mp3", mapKeys: ["merchantAmbience"], title: "スーパーマーケット1", sourceFile: "supermarket1.mp3", url: "https://soundeffect-lab.info/sound/environment/mp3/supermarket1.mp3", page: "https://soundeffect-lab.info/sound/environment/", use: "中場市集人聲床（循環）", group: "ambience" },
  { file: "voice-jp/level-up.mp3", mapKeys: [], title: "「レベルアップ」", sourceFile: "info-lady1-levelup1.mp3", url: "https://soundeffect-lab.info/sound/voice/mp3/info-lady1/info-lady1-levelup1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "升級播報用候補", group: "voice" },
  { file: "voice-jp/prep-phase-start.mp3", mapKeys: [], title: "「準備はいいですか？」", sourceFile: "info-lady1-zyunbihaiidesuka1.mp3", url: "https://soundeffect-lab.info/sound/voice/mp3/info-lady1/info-lady1-zyunbihaiidesuka1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "備戰開始播報用候補", group: "voice" },
  { file: "voice-jp/countdown.mp3", mapKeys: [], title: "「3、2、1、0」", sourceFile: "info-lady1-countdown1.mp3", url: "https://soundeffect-lab.info/sound/voice/mp3/info-lady1/info-lady1-countdown1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "倒數播報用候補", group: "voice" },
  { file: "voice-jp/matchmaking-wait.mp3", mapKeys: [], title: "「しばらくお待ちください」", sourceFile: "info-lady1-shibarakuomachi1.mp3", url: "https://soundeffect-lab.info/sound/voice/mp3/info-lady1/info-lady1-shibarakuomachi1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "配對等待播報用候補", group: "voice" },
  { file: "voice-jp/settlement-victory.mp3", mapKeys: [], title: "「おめでとうございます」", sourceFile: "info-lady1-omedetougozaimasu1.mp3", url: "https://soundeffect-lab.info/sound/voice/mp3/info-lady1/info-lady1-omedetougozaimasu1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "勝利結算播報用候補", group: "voice" },
  { file: "voice-jp/settlement-defeat.mp3", mapKeys: [], title: "「残念でした」", sourceFile: "info-lady1-zannendeshita1.mp3", url: "https://soundeffect-lab.info/sound/voice/mp3/info-lady1/info-lady1-zannendeshita1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "落敗結算播報用候補", group: "voice" },
  { file: "voice-jp/candidates/match-start-youkoso.mp3", mapKeys: [], title: "「ようこそ」", sourceFile: "info-lady1-youkoso1.mp3", url: "https://soundeffect-lab.info/sound/voice/mp3/info-lady1/info-lady1-youkoso1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "開賽播報用候補", group: "voice" },
  { file: "voice-jp/candidates/round-start-start.mp3", mapKeys: [], title: "「スタート」", sourceFile: "info-lady1-start1.mp3", url: "https://soundeffect-lab.info/sound/voice/mp3/info-lady1/info-lady1-start1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "回合開始播報用候補", group: "voice" },
];

/**
 * Split a clip's authored `mapKeys` into what will actually sound and what will
 * not. Pure, and the ONLY place the page's 使用中 verdict is decided.
 *
 * Note the direction of the filter: a key must EARN its way into `boundKeys` by
 * being in `PLAYABLE_SFX_KEYS`, which no lane can grow without also naming a
 * real emit site (sfxReachability.test.ts). An unclassified key therefore
 * degrades to 收錄未啟用 — the ledger understates rather than over-claims when
 * something drifts, which is the only safe direction for an attribution page.
 */
function derive(src: SfxLabClipSource): SfxLabClip {
  const boundKeys: string[] = [];
  const silentKeys: string[] = [];
  const silentReasons: string[] = [];
  for (const key of src.mapKeys) {
    if (PLAYABLE_SFX_KEYS.has(key)) boundKeys.push(key);
    else {
      silentKeys.push(key);
      silentReasons.push(sfxSilentReason(key) ?? "no code path plays this key");
    }
  }
  return { ...src, boundKeys, silentKeys, silentReasons };
}

/**
 * The rendered ledger: every shipped clip, with its audibility DERIVED rather
 * than declared. `boundKeys.length > 0` is the page's 使用中 badge.
 */
export const SFX_LAB_CLIPS: readonly SfxLabClip[] = SFX_LAB_SOURCE.map(derive);

/** Clips the game will ACTUALLY play (the rest ship unused, and say so). */
export const SFX_LAB_BOUND_COUNT = SFX_LAB_CLIPS.filter((c) => c.boundKeys.length > 0).length;

/**
 * Clips that audio-map.json binds but nothing can reach — the state the old
 * map-only definition reported as 使用中. Zero in a healthy ledger; a non-empty
 * list is a wiring regression, not a credits bug, and names the clips to chase.
 */
export const SFX_LAB_MAPPED_BUT_SILENT: readonly SfxLabClip[] = SFX_LAB_CLIPS.filter(
  (c) => c.boundKeys.length === 0 && c.silentKeys.length > 0,
);

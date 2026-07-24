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
 * `boundKeys` mirrors content/config/audio-map.json: a clip with keys is audible
 * in game today, one without is shipped-but-not-wired and says so in `use`. That
 * file belongs to the audio lane — if a binding moves, update this list to match,
 * do not edit audio-map.json from here.
 *
 * NOTE: this is a LIST, not a soundboard. The pack forbids 再配布, and the one
 * build that would trip it is an audition screen that plays/downloads each clip.
 * Never add a play button to these rows.
 */

export interface SfxLabClip {
  /** Path under content/assets/audio/, e.g. "sfx/lab/gold-gain.mp3". */
  readonly file: string;
  /** audio-map.json sfx event keys this clip is bound to; empty = not wired. */
  readonly boundKeys: readonly string[];
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

export type SfxLabGroupId = "ui" | "stage" | "weapon" | "magic" | "ambience" | "voice";

export const SFX_LAB_GROUPS: readonly { readonly id: SfxLabGroupId; readonly label: string }[] = [
  { id: "ui", label: "UI・系統" },
  { id: "stage", label: "演出・賽事" },
  { id: "weapon", label: "戰鬥・武器" },
  { id: "magic", label: "魔法・技能" },
  { id: "ambience", label: "環境音" },
  { id: "voice", label: "声素材（日文語音）" },
];

export const SFX_LAB_CLIPS: readonly SfxLabClip[] = [
  { file: "sfx/lab/ui-denied.mp3", boundKeys: ["uiDenied"], title: "ビープ音1", sourceFile: "beep1.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/beep1.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "無法選擇／金幣不足時的錯誤提示", group: "ui" },
  { file: "sfx/lab/shop-purchase.mp3", boundKeys: ["shopPurchase"], title: "レジスターで精算", sourceFile: "clearing1.mp3", url: "https://soundeffect-lab.info/sound/various/mp3/clearing1.mp3", page: "https://soundeffect-lab.info/sound/various/", use: "商店購買成交", group: "ui" },
  { file: "sfx/lab/gold-gain.mp3", boundKeys: ["goldGain"], title: "お金を落とす1", sourceFile: "money-drop1.mp3", url: "https://soundeffect-lab.info/sound/various/mp3/money-drop1.mp3", page: "https://soundeffect-lab.info/sound/various/", use: "取得金幣", group: "ui" },
  { file: "sfx/lab/panel-open.mp3", boundKeys: ["panelOpen"], title: "メニューを開く4", sourceFile: "menu4.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/menu4.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "面板／視窗開啟", group: "ui" },
  { file: "sfx/lab/ui-cancel.mp3", boundKeys: ["uiCancel"], title: "キャンセル1", sourceFile: "cancel1.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/cancel1.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "取消、返回上一層", group: "ui" },
  { file: "sfx/lab/ability-rank-up.mp3", boundKeys: ["abilityRankUp"], title: "決定ボタンを押す10", sourceFile: "decision10.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/decision10.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "技能升級（投入技能點）", group: "ui" },
  { file: "sfx/lab/low-health.mp3", boundKeys: ["lowHealth"], title: "警告音1", sourceFile: "warning1.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/warning1.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "血量過低警告", group: "ui" },
  { file: "sfx/lab/settlement-reveal.mp3", boundKeys: ["settlementReveal"], title: "データ表示3", sourceFile: "data-display3.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/data-display3.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "結算畫面逐列揭示名次", group: "ui" },
  { file: "sfx/lab/uiTabSwitch.mp3", boundKeys: ["uiTabSwitch"], title: "カーソル移動1", sourceFile: "cursor1.mp3", url: "https://soundeffect-lab.info/sound/button/mp3/cursor1.mp3", page: "https://soundeffect-lab.info/sound/button/", use: "分頁／頁籤切換", group: "ui" },
  { file: "sfx/lab/uiToggle.mp3", boundKeys: ["uiToggle"], title: "スイッチを押す", sourceFile: "switch1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/switch1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "開關類設定切換（含全域音訊開關）", group: "ui" },
  { file: "sfx/lab/match-start-gong.mp3", boundKeys: ["matchStartGong"], title: "試合開始のゴング", sourceFile: "gong-played1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/gong-played1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "開賽鑼（與日文播報疊放）", group: "stage" },
  { file: "sfx/lab/match-end-gong.mp3", boundKeys: ["matchEndGong"], title: "試合終了のゴング", sourceFile: "gong-played2.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/gong-played2.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "終場鑼，進入結算", group: "stage" },
  { file: "sfx/lab/vs-reveal.mp3", boundKeys: ["vsReveal"], title: "対戦カード表示1", sourceFile: "match-card1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/match-card1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "選角對戰卡 VS 揭示", group: "stage" },
  { file: "sfx/lab/level-up-jingle.mp3", boundKeys: ["levelUpJingle"], title: "レベルアップ", sourceFile: "levelup1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/levelup1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "升級提示樂句（與日文播報疊放）", group: "stage" },
  { file: "sfx/lab/recessBell.mp3", boundKeys: ["recessBell"], title: "学校のチャイム", sourceFile: "school-chime1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/school-chime1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "中場「下課鐘」，備戰視窗開啟時響一次", group: "stage" },
  { file: "sfx/lab/draftCardReveal.mp3", boundKeys: ["draftCardReveal"], title: "キラッ1", sourceFile: "kira1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/kira1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "三選一抽卡：每張卡翻面時的閃光", group: "stage" },
  { file: "sfx/lab/legendaryWin.mp3", boundKeys: ["legendaryWin"], title: "ラッパのファンファーレ", sourceFile: "trumpet1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/trumpet1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "傳說寶珠中獎號角", group: "stage" },
  { file: "sfx/lab/legendaryRoll.mp3", boundKeys: ["legendaryRoll"], title: "ドラムロール", sourceFile: "drum-roll1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/drum-roll1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "傳說寶珠轉蛋滾動中（循環）", group: "stage" },
  { file: "sfx/lab/guardianLastHit.mp3", boundKeys: ["guardianLastHit"], title: "アイテムを入手1", sourceFile: "item-get1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/item-get1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "守衛塔最後一擊的金幣獎勵", group: "stage" },
  { file: "sfx/lab/attack-sword-1.mp3", boundKeys: ["attackSword1"], title: "剣で斬る1", sourceFile: "sword-slash1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/sword-slash1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "單手劍普攻（第一式）", group: "weapon" },
  { file: "sfx/lab/attack-sword-2.mp3", boundKeys: ["attackSword2"], title: "剣で斬る2", sourceFile: "sword-slash2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/sword-slash2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "單手劍普攻（第二式）", group: "weapon" },
  { file: "sfx/lab/attack-greatsword.mp3", boundKeys: ["attackGreatsword"], title: "大剣で斬る", sourceFile: "large-sword-slash1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/large-sword-slash1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "大劍普攻", group: "weapon" },
  { file: "sfx/lab/attack-katana.mp3", boundKeys: ["attackKatana"], title: "刀で斬る1", sourceFile: "katana-slash1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/katana-slash1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "刀（日本刀）普攻", group: "weapon" },
  { file: "sfx/lab/whiff-sword.mp3", boundKeys: ["whiff"], title: "剣の素振り2", sourceFile: "sword-gesture2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/sword-gesture2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "揮空、未命中", group: "weapon" },
  { file: "sfx/lab/block-clash.mp3", boundKeys: [], title: "剣で打ち合う2", sourceFile: "sword-clash2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/sword-clash2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "格擋音；目前 block 事件改用自製音效，此檔備而未用", group: "weapon" },
  { file: "sfx/lab/block-shield.mp3", boundKeys: [], title: "盾で防御", sourceFile: "shield1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/shield1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "格擋音；目前 block 事件改用自製音效，此檔備而未用", group: "weapon" },
  { file: "sfx/lab/bow-draw.mp3", boundKeys: ["bowDraw"], title: "弓を引き絞る1", sourceFile: "bow-draw1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/bow-draw1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "拉弓蓄力", group: "weapon" },
  { file: "sfx/lab/arrow-release.mp3", boundKeys: ["arrowRelease"], title: "弓矢を放つ", sourceFile: "arrow-release1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/arrow-release1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "放箭", group: "weapon" },
  { file: "sfx/lab/arrow-pierce.mp3", boundKeys: ["arrowPierce"], title: "弓矢が刺さる", sourceFile: "arrow-pierce1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/arrow-pierce1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "箭矢命中", group: "weapon" },
  { file: "sfx/lab/gunshot.mp3", boundKeys: ["gunshot"], title: "拳銃を撃つ", sourceFile: "handgun-firing1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/handgun-firing1.mp3", page: "https://soundeffect-lab.info/sound/battle/battle2.html", use: "槍械射擊", group: "weapon" },
  { file: "sfx/lab/impact-heavy.mp3", boundKeys: [], title: "重いパンチ1", sourceFile: "punch-heavy1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/punch-heavy1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "重擊音；會蓋掉自製暴擊音的辨識度，故備而未用", group: "weapon" },
  { file: "sfx/lab/guardianSlam.mp3", boundKeys: ["guardianSlam"], title: "打撃4", sourceFile: "blow4.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/blow4.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "守衛塔範圍重擊（樹人／石頭人／巨獸人）", group: "weapon" },
  { file: "sfx/lab/cast-circle.mp3", boundKeys: ["castCircle"], title: "魔法陣を展開", sourceFile: "magic-circle1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-circle1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "魔法陣展開，詠唱起手", group: "magic" },
  { file: "sfx/lab/magic-fire.mp3", boundKeys: ["magicFire"], title: "火炎魔法1", sourceFile: "magic-flame1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-flame1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "火系技能施放", group: "magic" },
  { file: "sfx/lab/magic-ice.mp3", boundKeys: ["magicIce"], title: "氷魔法1", sourceFile: "magic-ice1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-ice1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "冰系技能施放", group: "magic" },
  { file: "sfx/lab/magic-lightning.mp3", boundKeys: ["magicLightning"], title: "雷魔法2", sourceFile: "magic-electron2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-electron2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "雷系技能施放", group: "magic" },
  { file: "sfx/lab/magic-holy.mp3", boundKeys: ["exUnlockSting"], title: "聖魔法", sourceFile: "magic-attack-holy1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-attack-holy1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "EX 技能解鎖聖光（與日文播報疊放）", group: "magic" },
  { file: "sfx/lab/magic-heal.mp3", boundKeys: ["heal"], title: "回復魔法2", sourceFile: "magic-cure2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-cure2.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "治療", group: "magic" },
  { file: "sfx/lab/magic-buff.mp3", boundKeys: ["buffApply"], title: "ステータス上昇魔法1", sourceFile: "magic-statusup1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-statusup1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "增益狀態附加", group: "magic" },
  { file: "sfx/lab/explosion.mp3", boundKeys: ["explosion"], title: "爆発2", sourceFile: "bomb2.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/bomb2.mp3", page: "https://soundeffect-lab.info/sound/battle/battle2.html", use: "範圍爆炸", group: "magic" },
  { file: "sfx/lab/reviveChannel.mp3", boundKeys: ["reviveChannel"], title: "オーラ1", sourceFile: "aura1.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/aura1.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "隊友復活詠唱進行中（循環）", group: "magic" },
  { file: "sfx/lab/reviveComplete.mp3", boundKeys: ["reviveComplete"], title: "回復魔法4", sourceFile: "magic-cure4.mp3", url: "https://soundeffect-lab.info/sound/battle/mp3/magic-cure4.mp3", page: "https://soundeffect-lab.info/sound/battle/", use: "復活完成", group: "magic" },
  { file: "sfx/lab/respawn.mp3", boundKeys: ["respawn"], title: "ニュッ1", sourceFile: "nyu1.mp3", url: "https://soundeffect-lab.info/sound/anime/mp3/nyu1.mp3", page: "https://soundeffect-lab.info/sound/anime/", use: "重生、重新進場", group: "magic" },
  { file: "sfx/lab/fireRingLoop.mp3", boundKeys: ["fireRingLoop"], title: "たき火", sourceFile: "fire1.mp3", url: "https://soundeffect-lab.info/sound/environment/mp3/fire1.mp3", page: "https://soundeffect-lab.info/sound/environment/", use: "火環收縮的燃燒床音（循環）", group: "ambience" },
  { file: "sfx/lab/arenaAmbience.mp3", boundKeys: ["arenaAmbience"], title: "風に揺れる草木1", page: "https://soundeffect-lab.info/sound/environment/", use: "競技場環境音床（循環）", group: "ambience" },
  { file: "sfx/lab/merchantAmbience.mp3", boundKeys: ["merchantAmbience"], title: "スーパーマーケット1", sourceFile: "supermarket1.mp3", url: "https://soundeffect-lab.info/sound/environment/mp3/supermarket1.mp3", page: "https://soundeffect-lab.info/sound/environment/", use: "中場市集人聲床（循環）", group: "ambience" },
  { file: "voice-jp/level-up.mp3", boundKeys: [], title: "「レベルアップ」", sourceFile: "info-lady1-levelup1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "升級播報用候補", group: "voice" },
  { file: "voice-jp/prep-phase-start.mp3", boundKeys: [], title: "「準備はいいですか？」", sourceFile: "info-lady1-zyunbihaiidesuka1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "備戰開始播報用候補", group: "voice" },
  { file: "voice-jp/countdown.mp3", boundKeys: [], title: "「3、2、1、0」", sourceFile: "info-lady1-countdown1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "倒數播報用候補", group: "voice" },
  { file: "voice-jp/matchmaking-wait.mp3", boundKeys: [], title: "「しばらくお待ちください」", sourceFile: "info-lady1-shibarakuomachi1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "配對等待播報用候補", group: "voice" },
  { file: "voice-jp/settlement-victory.mp3", boundKeys: [], title: "「おめでとうございます」", sourceFile: "info-lady1-omedetougozaimasu1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "勝利結算播報用候補", group: "voice" },
  { file: "voice-jp/settlement-defeat.mp3", boundKeys: [], title: "「残念でした」", sourceFile: "info-lady1-zannendeshita1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "落敗結算播報用候補", group: "voice" },
  { file: "voice-jp/candidates/match-start-youkoso.mp3", boundKeys: [], title: "「ようこそ」", sourceFile: "info-lady1-youkoso1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "開賽播報用候補", group: "voice" },
  { file: "voice-jp/candidates/round-start-start.mp3", boundKeys: [], title: "「スタート」", sourceFile: "info-lady1-start1.mp3", page: "https://soundeffect-lab.info/sound/voice/info-lady1.html", use: "回合開始播報用候補", group: "voice" },
];

/** Clips wired into audio-map.json today (the rest ship unused, and say so). */
export const SFX_LAB_BOUND_COUNT = SFX_LAB_CLIPS.filter((c) => c.boundKeys.length > 0).length;

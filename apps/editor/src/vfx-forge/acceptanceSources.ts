/**
 * Human-readable source ledger for the eight Editor capability scenes.
 *
 * The three inputs answer different questions and must never be silently
 * blended: ownerTarget says what the current product should look like, main
 * says what the shipped runtime can already play, and jass says how the w3x
 * originally staged it (including locust/dummy composition).
 */
export interface AcceptanceSourceEntry {
  abilityId: string;
  label: string;
  ownerTarget: string;
  main: {
    script: "shipped" | "ability-only";
    summary: string;
  };
  jass: {
    rawcodes: readonly string[];
    summary: string;
    locustComposition: string;
    references: readonly string[];
  };
  resolution: {
    alignment: "aligned" | "partial" | "owner-override";
    note: string;
  };
  /**
   * Owner-supplied video is a motion-language reference, never an asset source.
   * We record only a small fixed set of poses: resampling happens when the
   * authored script hash changes, rather than generating a costly video audit
   * on every editor interaction.
   */
  readonly videoReference?: {
    readonly url: string;
    readonly state: "sampled" | "queued";
    readonly keyframes: readonly {
      readonly atSec: number;
      readonly label: string;
    }[];
  };
}

const REPORT_A = "docs/_reports/vfx-editor-jass3_temp_20260828-0042.md";
const REPORT_B = "docs/_reports/vfx-editor-jass3b_temp_20260828-0312.md";
const JASS = "tools/w3x-import/out/GoDieEX22s/jass-spells";

export const VFX_FORGE_ACCEPTANCE_SOURCES: readonly AcceptanceSourceEntry[] = [
  {
    abilityId: "godie-hjai.e",
    label: "04-03 龍破斬",
    ownerTarget: "紅橘投射物向前飛行一段距離後，在遠端形成有體積與餘燼的爆炸。",
    main: {
      script: "shipped",
      summary: "ability 已有 line-blast／抵達爆炸；script 補詠唱法陣，但沿途與爆炸層次仍不完整。",
    },
    jass: {
      rawcodes: ["A04R"],
      summary: "Fire_NOVA 詠唱後，DragonSlaveMove 以 0.03 秒週期推進 FireBlast，抵達後展開爆炸鏈。",
      locustComposition: "h013 MarkOfChaosTarget 聚氣法陣＋h014 FireBlast 投射物；原作沿途及終點另建立效果。",
      references: [`${REPORT_A}#②-龍破斬a04r莉娜-eh020hjai-兩形態共用`, `${JASS}/A04R.j`],
    },
    resolution: {
      alignment: "partial",
      note: "Owner 與 JASS 的投射→爆炸順序一致；以 Owner 的紅橘、體積火焰為視覺目標，保留 JASS 時序。",
    },
    videoReference: {
      url: "https://www.youtube.com/watch?v=cFz1d48fvN8",
      state: "queued",
      keyframes: [
        { atSec: 0, label: "投射起手（待依影片實際鏡頭取樣）" },
        { atSec: 0, label: "定距爆炸（待依影片實際鏡頭取樣）" },
      ],
    },
  },
  {
    abilityId: "godie-hjai.r",
    label: "04-04 神滅斬",
    ownerTarget: "莉娜高速 dash 穿過目標並完成紫黑色斬擊，角色動線必須清楚。",
    main: {
      script: "ability-only",
      summary: "Main 只有 ability 演出，沒有出貨 godie-hjai.r 專用 vfx-script；dash、角色動作與紫黑斬擊目前只存在 Editor 驗收 fixture。",
    },
    jass: {
      rawcodes: ["A07F"],
      summary: "命中後先造成傷害，0.5 秒後啟用 LinaS_Effect 推動目標，並對附近玩家震屏。",
      locustComposition: "施法點 HeroCloudCyd；推動路徑使用 UndeadDissipate、ImpaleTargetDust，另有 WispExplode。",
      references: [`${JASS}/A07F.j`, "tools/w3x-import/out/invocation-params/INVOCATION_PARAMS.json"],
    },
    resolution: {
      alignment: "owner-override",
      note: "JASS 核心是推動受害者，不是施法者 dash；依 Owner 最新目標改成 dash 斬擊，但在審查頁永久標示此偏離。",
    },
    videoReference: {
      url: "https://www.youtube.com/watch?v=cFz1d48fvN8",
      state: "queued",
      keyframes: [
        { atSec: 0, label: "衝刺起手（待依影片實際鏡頭取樣）" },
        { atSec: 0, label: "穿越後紫黑斬擊（待依影片實際鏡頭取樣）" },
      ],
    },
  },
  {
    abilityId: "godie-hart.r",
    label: "01-04 超究武神霸斬",
    ownerTarget: "多段角色動畫斬擊，最後以黃藍色直立光束砲收尾。",
    main: {
      script: "shipped",
      summary: "已有 combo、無敵與豐富 script，是八招中最完整的 main 基線；逐刀站位與加速仍需校準。",
    },
    jass: {
      rawcodes: ["A077", "A0B1"],
      summary: "七段斬擊逐刀換位，第三段升空，後段播放速度逐步提高，最後一刀另有終結演出。",
      locustComposition: "ResurrectTarget 武器光柱＋h002 幻影；施法者與受害者依段次改位置、高度、面向與動畫速度。",
      references: [`${REPORT_A}#①-超究武神霸斬a077--a0b1克勞德-r`, `${JASS}/A077.j`, `${JASS}/A0B1.j`],
    },
    resolution: {
      alignment: "partial",
      note: "多段與終結方向一致；必須補足逐刀身體位置、升空曲線與逐段加速後才可人工通過。",
    },
    videoReference: {
      url: "https://www.youtube.com/watch?v=9X6LCjFgAiA",
      state: "sampled",
      keyframes: [
        { atSec: 1.34, label: "起手：角色拔劍、藍白聚能，不以多枚月牙取代身體動作" },
        { atSec: 10.68, label: "連斬：角色與目標皆有位移／反應，斬擊為動作的附屬" },
        { atSec: 21.55, label: "終結：白藍主柱加少量黃光，高度與方向具壓迫感" },
      ],
    },
  },
  {
    abilityId: "godie-nbbc.r",
    label: "08-04 阿邦快速劍X",
    ownerTarget: "A 段先發出藍色衝擊波，B 段由小呆本人 dash 斬擊。",
    main: {
      script: "shipped",
      summary: "ability 有直線傷害、標記、延遲位移與落點傷害；script 有隱藏本體與 RedDragonMissile。",
    },
    jass: {
      rawcodes: ["A0EZ"],
      summary: "原作在出發點放 e003，隱藏本體約一秒後固定移動 550 wc3u，落點造成範圍傷害。",
      locustComposition: "e003 RedDragonMissile＋ImpaleTargetDust；受害者腳下 ThunderClapCaster。",
      references: [`${REPORT_B}#②-阿邦快速劍xa0ez勇者小呆-r`, `${JASS}/A0EZ.j`],
    },
    resolution: {
      alignment: "partial",
      note: "B 段 dash 與 JASS 接近；A 段藍色衝擊波採 Owner／影片版本，須避免 ability 與 script 重複畫同一層。",
    },
    videoReference: {
      url: "https://youtu.be/QE9RrCjt428?t=157",
      state: "queued",
      keyframes: [
        { atSec: 157, label: "A 段藍色衝擊波" },
        { atSec: 158, label: "B 段角色 dash 斬擊" },
      ],
    },
  },
  {
    abilityId: "godie-nbbc.e",
    label: "08-03 龍鬥氣砲咒文",
    ownerTarget: "藍色經典橫向氣功砲，具有寬光束、白色核心與清楚的發射起點。",
    main: {
      script: "ability-only",
      summary: "Main 沒有專用 vfx-script；ability 仍是火焰 beam 加十顆紅龍飛彈。藍白聚能、寬光束與持續核心目前只存在 Editor 驗收 fixture。",
    },
    jass: {
      rawcodes: ["A05J"],
      summary: "同一幀沿施法面向每 150 wc3u 建立一個 e003，共十個，存活一秒；另有震屏與地形波紋。",
      locustComposition: "10× e003 RedDragonMissile，比例 4.0；兩秒後清理同型 dummy。",
      references: [`${JASS}/A05J.j`, "tools/w3x-import/out/invocation-params/INVOCATION_PARAMS.json"],
    },
    resolution: {
      alignment: "owner-override",
      note: "JASS 是十顆紅龍飛彈列陣；Owner 已明確指定藍色經典光束，因此保留十段節奏作參考，視覺改採藍色 beam。",
    },
  },
  {
    abilityId: "godie-ogrh.r",
    label: "09-04 龜派氣功",
    ownerTarget: "橘色經典橫向氣功砲，具有白色核心、槍口聚能與持續段。",
    main: {
      script: "shipped",
      summary: "ability 已有 ReviveHuman、FragDriller、六段 FlameStrike 與震屏；script 補槍口層。",
    },
    jass: {
      rawcodes: ["A03S"],
      summary: "槍口前 150 wc3u 建立 ReviveHuman 與 FragDriller，並在 200～1200 wc3u 同幀建立六個 FlameStrike。",
      locustComposition: "h007 ReviveHuman＋h008 FragDriller＋6× h006 FlameStrike1，兩秒後清除鏡頭噪動。",
      references: [`${REPORT_B}#①-龜派氣功a03s悟空-r`, `${JASS}/A03S.j`],
    },
    resolution: {
      alignment: "partial",
      note: "組成與時序接近；橫向拉伸 beam 是為 Owner 可讀性做的明確改編，不宣稱是 JASS 1:1。",
    },
    videoReference: {
      url: "https://youtu.be/XkFlhrLaHeA?t=68",
      state: "queued",
      keyframes: [
        { atSec: 68, label: "槍口聚能與橘色橫向主光束" },
        { atSec: 69, label: "白色核心與持續尾段" },
      ],
    },
  },
  {
    abilityId: "godie-e002.ex",
    label: "20-002 理想鄉EX",
    ownerTarget: "Avalon 反擊成功起手，接七段動畫斬擊，最後以黃藍氣功砲終結。",
    main: {
      script: "shipped",
      summary: "reflectSuccess 接縫與 17 段 script 已存在；目前角色模型 primitive／貼圖問題阻擋視覺核准。",
    },
    jass: {
      rawcodes: ["A0CT"],
      summary: "Avalon 反彈窗由受傷事件判定；成功後進入 ExcaliburMAX 七刀與第八擊終結鏈。",
      locustComposition: "MonsoonBolt、鏈鎖閃電、拖曳與多段斬擊效果；EX 演出綁 Saber 受傷事件而非獨立 A0SP。",
      references: [`${REPORT_A}#③-理想鄉-ex-鏈avalon-a0ct--excaliburmaxsaber`, `${JASS}/A0CT.j`],
    },
    resolution: {
      alignment: "partial",
      note: "事件與三段敘事一致；模型資產、拖曳、隨機間隔與逐刀站位未通過前維持 fixture-pending。",
    },
    videoReference: {
      url: "https://youtu.be/KwAlIYfmV48?t=83",
      state: "queued",
      keyframes: [
        { atSec: 83, label: "Avalon 反擊起手" },
        { atSec: 91, label: "動畫連斬" },
        { atSec: 100, label: "黃藍終結砲" },
      ],
    },
  },
  {
    abilityId: "godie-hvsh.r",
    label: "48-04 騎英之手綱",
    ownerTarget: "Rider 本體高速 dash，伴隨藍色經典橫向氣功砲與清楚落點爆發。",
    main: {
      script: "ability-only",
      summary: "Main 沒有專用 vfx-script；ability 只有三層 modelFx 與 arcane beam，尚無 Rider 本體 bodyMove。dash、藍白橫向光砲與落點演出目前只存在 Editor 驗收 fixture。",
    },
    jass: {
      rawcodes: ["A0RQ"],
      summary: "依 EX 狀態分兩條路；普通路隱藏 Rider，用 h024 每 0.01 秒移動 50 wc3u，落點十二次 ThunderClap。",
      locustComposition: "h02D 光環、h015 翅膀、h02H Shockwave、h02I 法陣；普通路 h024／h025 與路徑特效群。",
      references: [`${JASS}/A0RQ.j`, "tools/w3x-import/out/invocation-params/INVOCATION_PARAMS.json"],
    },
    resolution: {
      alignment: "owner-override",
      note: "w3x 是魔法陣與蝗蟲群的曲線衝刺，並非藍色長光束；依 Owner 最新目標製作 dash＋beam，但完整保留偏離紀錄。",
    },
    videoReference: {
      url: "https://youtu.be/KwAlIYfmV48?t=446",
      state: "queued",
      keyframes: [
        { atSec: 446, label: "Rider 本體 dash" },
        { atSec: 447, label: "藍色橫向主光束與落點" },
      ],
    },
  },
];

export function acceptanceSourceFor(abilityId: string): AcceptanceSourceEntry | null {
  return VFX_FORGE_ACCEPTANCE_SOURCES.find((entry) => entry.abilityId === abilityId) ?? null;
}

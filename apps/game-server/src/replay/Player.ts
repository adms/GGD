/**
 * ReplayPlayer — re-runs a recorded match and SHOUTS the moment it disagrees.
 *
 * THE NON-NEGOTIABLE. A replay that silently diverges is worse than no replay,
 * because the owner would then debug a match that never happened. So this class
 * has exactly two failure modes and no third:
 *
 *   1. REFUSE BEFORE PLAYING. If the recording's identity does not match this
 *      host — a different contentVersion, a different registry fingerprint, a
 *      missing arena, an unreadable format — playback never starts and says why.
 *   2. STOP MID-PLAY. Every tick's two digests are compared with what was
 *      recorded. The first disagreement halts playback and reports the tick, the
 *      expected and actual values, and the most likely cause. There is no
 *      "continue anyway" path; a diverged replay is not a replay.
 *
 * PLAYBACK ALWAYS RUNS FROM TICK 0. Driver latches, the input mailbox and
 * `Seat.pendingDriver` are host state outside the sim and outside the digest, so
 * there is no state snapshot to seek into. Seeking backwards therefore rebuilds
 * and fast-forwards, which at the measured ~0.1 ms/tick is a couple of seconds
 * for a whole match — and it is honest, which a state-jumping scrubber would not
 * be. The fast-forward is chunked across macrotasks so a seek can never pin the
 * event loop of a server that is also running live matches.
 */
import { asSeatId, type SeatId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import { EMPTY_INTENT } from "@ggd/shared/sim/intents";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import type { Cheat } from "@ggd/shared/protocol/messages";
import { MatchController, type SeatSpec } from "../match/MatchController";
import type { Seat, SeatDriver } from "../seat/Seat";
import { hostDigest } from "./digest";
import { buildStamp, registryFingerprint } from "./fingerprint";
import { rebuildArena, rebuildBaseBonus, rebuildRules, rebuildWhitelist } from "./headerCodec";
import { Ownership } from "../curation/ownership";
import { REPLAY_FORMAT_VERSION, type ReplayHeader, type ReplayLine } from "./format";
import { loadReplay } from "./store";

/** How many ticks a single fast-forward slice runs before yielding. */
const CATCHUP_SLICE_TICKS = 400;

/** A refusal to play at all — reported to the viewer instead of a match. */
export interface ReplayRefusal {
  code:
    | "format-version"
    | "content-version"
    | "registry-fingerprint"
    | "missing-arena"
    | "no-header"
    | "unreadable";
  /** 繁體中文, shown verbatim in the client and the admin console. */
  message: string;
  expected?: string;
  actual?: string;
}

/** A digest disagreement — playback stops here, permanently. */
export interface ReplayDivergence {
  tick: number;
  /** Which digest disagreed first on this tick. */
  kind: "sim" | "host";
  expectedWorld: number;
  actualWorld: number;
  expectedHost: number;
  actualHost: number;
  /** 繁體中文 explanation naming the most likely cause. */
  message: string;
}

export interface ReplayRoundMark {
  tick: number;
  phase: string;
  round: number;
}

/**
 * A seat driver that plays back exactly what was recorded. It holds no
 * behaviour: the AI brain, the input mailbox and the network are all out of the
 * replay's trusted base by construction. `kind` is mutable because
 * `Seat.driverKind` is read by the intermission offer auto-pick — it is a real
 * sim input, not presentation.
 */
class ReplayDriver implements SeatDriver {
  kind: "human" | "ai" = "ai";
  private frames = new Map<number, IntentFrame>();

  set(tick: number, frame: IntentFrame): void {
    this.frames.set(tick, frame);
  }

  onAttach(_seat: Seat): void {}
  onDetach(): void {}

  produceIntent(_seat: Seat, _world: SimWorld, tick: number): IntentFrame {
    return this.frames.get(tick) ?? EMPTY_INTENT;
  }
}

/** Pre-tick host events, applied in recorded order just before the tick runs. */
type PreTickEvent =
  | { kind: "driver"; seatId: SeatId; driver: "human" | "ai" }
  | { kind: "select"; seatId: SeatId; championId: string }
  | { kind: "cheat"; seatId: SeatId; cheat: Cheat };

export class ReplayPlayer {
  readonly header: ReplayHeader;
  readonly rounds: ReplayRoundMark[] = [];
  /** Highest tick the recording carries a digest for. */
  readonly lastRecordedTick: number;
  /** True when the source file was cut short (server killed mid-match). */
  readonly truncated: boolean;

  ctl!: MatchController;
  divergence: ReplayDivergence | null = null;
  /** True once the recording has been played to its end without diverging. */
  finished = false;

  private readonly worldDigests = new Map<number, number>();
  private readonly hostDigests = new Map<number, number>();
  private readonly framesByTick = new Map<number, [number, IntentFrame][]>();
  private readonly preTick = new Map<number, PreTickEvent[]>();
  private drivers = new Map<SeatId, ReplayDriver>();

  private constructor(header: ReplayHeader, lines: ReplayLine[], truncated: boolean) {
    this.header = header;
    this.truncated = truncated;
    let last = -1;
    for (const line of lines) {
      switch (line.t) {
        case "i": {
          const list = this.framesByTick.get(line.k);
          if (list) list.push([line.s, line.f]);
          else this.framesByTick.set(line.k, [[line.s, line.f]]);
          break;
        }
        case "d":
          this.pushPre(line.k, { kind: "driver", seatId: asSeatId(line.s), driver: line.v });
          break;
        case "c":
          this.pushPre(line.k, { kind: "select", seatId: asSeatId(line.s), championId: line.id });
          break;
        case "x":
          this.pushPre(line.k, { kind: "cheat", seatId: asSeatId(line.s), cheat: line.c });
          break;
        case "g":
          for (let i = 0; i < line.w.length; i++) {
            this.worldDigests.set(line.k + i, line.w[i]!);
            this.hostDigests.set(line.k + i, line.h[i]!);
            last = Math.max(last, line.k + i);
          }
          break;
        case "r":
          this.rounds.push({ tick: line.k, phase: line.p, round: line.r });
          break;
        default:
          break;
      }
    }
    this.lastRecordedTick = last;
  }

  private pushPre(tick: number, ev: PreTickEvent): void {
    const list = this.preTick.get(tick);
    if (list) list.push(ev);
    else this.preTick.set(tick, [ev]);
  }

  /**
   * Open a recording for playback, or explain why it cannot be played. Never
   * throws for a normal "this recording does not belong to this build" case —
   * that is a first-class result the UI renders.
   */
  static async open(id: string): Promise<{ player: ReplayPlayer } | { refusal: ReplayRefusal }> {
    let loaded;
    try {
      loaded = await loadReplay(id);
    } catch (err) {
      return {
        refusal: {
          code: "unreadable",
          message: `無法讀取這份回放檔：${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
    const refusal = checkCompatibility(loaded.header);
    if (refusal) return { refusal };
    const player = new ReplayPlayer(loaded.header, loaded.lines, loaded.truncated);
    player.reset();
    return { player };
  }

  /** Rebuild the match from tick 0. Called at open and by every backward seek. */
  reset(): void {
    this.divergence = null;
    this.finished = false;
    const h = this.header;
    const specs: SeatSpec[] = h.seats.map((s) => ({
      seatId: s.seatId,
      teamId: s.teamId,
      accountId: s.accountId,
      displayName: s.displayName,
      championId: s.championId || undefined,
      isBot: s.isBot,
    }));
    const arena = rebuildArena(h.arenaId)!; // checked in checkCompatibility
    const pool = h.arenaPoolIds.map((id) => rebuildArena(id)!).filter(Boolean);
    this.ctl = new MatchController(
      h.matchId,
      h.seed,
      specs,
      { ...h.phaseConfig },
      h.startingLives,
      rebuildRules(h),
      arena,
      rebuildWhitelist(h),
      h.combatEnv,
      h.fireRing,
      pool,
      // ownership is not recorded: a replay never runs champ-select, so the
      // per-account gate has nothing to gate. Passed explicitly so the 基礎加成
      // table after it lands in the right slot (#278).
      Ownership.allowAll(),
      rebuildBaseBonus(h),
    );
    // Replace every driver with a playback driver BEFORE tick 0, and apply the
    // swap immediately so no AI brain ever runs. `driver` in the header is the
    // state at header-write time; every later attach rides a `d` line.
    this.drivers = new Map();
    for (const [seatId, seat] of this.ctl.seats) {
      const d = new ReplayDriver();
      d.kind = h.seats.find((s) => s.seatId === seatId)?.driver ?? "ai";
      this.drivers.set(seatId, d);
      seat.setDriver(d);
      seat.applyPendingDriver();
    }
    // Pre-load every recorded frame into its seat's driver.
    for (const [tick, entries] of this.framesByTick) {
      for (const [seatId, frame] of entries) this.drivers.get(asSeatId(seatId))?.set(tick, frame);
    }
  }

  get tick(): number {
    return this.ctl.world.tick;
  }

  get stopped(): boolean {
    return this.divergence !== null || this.finished;
  }

  /**
   * Advance one tick, verifying both digests. Returns false when playback must
   * not continue (diverged, or the recording ran out).
   */
  step(): boolean {
    if (this.stopped) return false;
    const tick = this.ctl.world.tick;
    if (tick > this.lastRecordedTick) {
      this.finished = true;
      return false;
    }
    for (const ev of this.preTick.get(tick) ?? []) this.applyPreTick(ev);
    this.ctl.tick();
    const ran = this.ctl.world.tick - 1;
    // A contained sim-step fault leaves the tick where it was; the recorder skips
    // its checkpoint in exactly the same case, so nothing to compare.
    if (ran < tick) return true;
    const expectedWorld = this.worldDigests.get(ran);
    if (expectedWorld === undefined) {
      this.finished = true;
      return false;
    }
    const actualWorld = this.ctl.world.digest();
    const expectedHost = this.hostDigests.get(ran)!;
    const actualHost = hostDigest(this.ctl);
    if (actualWorld !== expectedWorld || actualHost !== expectedHost) {
      const kind: "sim" | "host" = actualWorld !== expectedWorld ? "sim" : "host";
      this.divergence = {
        tick: ran,
        kind,
        expectedWorld,
        actualWorld,
        expectedHost,
        actualHost,
        message: explainDivergence(this.header, kind, ran),
      };
      return false;
    }
    return true;
  }

  private applyPreTick(ev: PreTickEvent): void {
    const seat = this.ctl.seats.get(ev.seatId);
    if (!seat) return;
    switch (ev.kind) {
      case "driver": {
        // A fresh driver object per swap, mirroring the live server (which
        // constructs a new HumanDriver / AIDriver each time). The frames are
        // re-seeded so the seat keeps playing back its recorded input.
        const next = new ReplayDriver();
        next.kind = ev.driver;
        for (const [tick, entries] of this.framesByTick) {
          for (const [seatId, frame] of entries) if (seatId === ev.seatId) next.set(tick, frame);
        }
        this.drivers.set(ev.seatId, next);
        seat.setDriver(next); // applied by ctl.tick()'s own boundary loop
        break;
      }
      case "select":
        this.ctl.selectChampion(ev.seatId, ev.championId);
        break;
      case "cheat":
        this.ctl.applyCheat(ev.seatId, ev.cheat);
        break;
    }
  }

  /**
   * Run up to `maxTicks` ticks synchronously. Returns the number actually run —
   * fewer means playback stopped (end of recording or divergence).
   */
  runSlice(maxTicks: number): number {
    let n = 0;
    while (n < maxTicks && this.step()) n++;
    return n;
  }

  /**
   * Fast-forward to `targetTick`, rebuilding from 0 first if we are past it.
   * Chunked across macrotasks so a seek never pins the event loop of a server
   * that is also running live matches.
   */
  async seek(targetTick: number): Promise<void> {
    if (targetTick < this.tick || this.stopped) this.reset();
    while (this.tick < targetTick && !this.stopped) {
      this.runSlice(Math.min(CATCHUP_SLICE_TICKS, targetTick - this.tick));
      await new Promise<void>((r) => setImmediate(r));
    }
  }

  /** The tick a given round's combat begins on, or null when never reached. */
  roundStartTick(round: number): number | null {
    const mark = this.rounds.find((m) => m.round === round && m.phase === "intermission");
    return mark ? mark.tick : null;
  }
}

/**
 * Everything that must agree before a single tick is simulated. Order matters:
 * report the most specific, most actionable mismatch first.
 */
export function checkCompatibility(header: ReplayHeader, now = currentIdentity()): ReplayRefusal | null {
  if (header.formatVersion !== REPLAY_FORMAT_VERSION) {
    return {
      code: "format-version",
      message:
        `這份回放是用第 ${header.formatVersion} 版的回放格式錄的，本伺服器只認得第 ` +
        `${REPLAY_FORMAT_VERSION} 版，無法播放。`,
      expected: String(REPLAY_FORMAT_VERSION),
      actual: String(header.formatVersion),
    };
  }
  if (header.contentVersion !== now.contentVersion) {
    return {
      code: "content-version",
      message:
        `拒絕播放：這場比賽錄製於內容版本 ${header.contentVersion || "(未記錄)"}，` +
        `目前伺服器是 ${now.contentVersion || "(未記錄)"}。英雄、技能與道具在版本之間會變動，` +
        `用新內容重播舊比賽會變成「另一場比賽」，比不能播放更糟。` +
        `請把內容切回錄製時的版本再看這份回放。`,
      expected: header.contentVersion,
      actual: now.contentVersion,
    };
  }
  if (header.registryFingerprint !== now.registryFingerprint) {
    return {
      code: "registry-fingerprint",
      message:
        `拒絕播放：內容版本相同（${header.contentVersion}），但內容登錄指紋不同` +
        `（錄製 ${header.registryFingerprint} / 目前 ${now.registryFingerprint}）。` +
        `代表英雄或強化的「排列順序」變了，或是程式內建的骨架內容 (skeleton.ts) 被改過——` +
        `這兩者都會改變隨機抽選的結果，但都不會讓 cv_ 版本號跟著變。`,
      expected: header.registryFingerprint,
      actual: now.registryFingerprint,
    };
  }
  for (const id of [header.arenaId, ...header.arenaPoolIds]) {
    if (rebuildArena(id) === null) {
      return {
        code: "missing-arena",
        message: `拒絕播放：這場比賽用到的競技場「${id}」在本伺服器上沒有載入，地形不同就不是同一場比賽。`,
        expected: id,
      };
    }
  }
  return null;
}

/** The identity of the content this process is currently running. */
export function currentIdentity(): { contentVersion: string; registryFingerprint: string; buildStamp: string } {
  return {
    contentVersion: activeContentVersion(),
    registryFingerprint: registryFingerprint(),
    buildStamp: buildStamp(),
  };
}

let activeCv = "";
/** Set once at boot by index.ts from the loaded content manifest. */
export function setActiveContentVersion(cv: string): void {
  activeCv = cv;
}
export function activeContentVersion(): string {
  return activeCv;
}

/**
 * Name the most likely cause of a divergence. The identity checks already ruled
 * content out before playback started, so by construction the remaining
 * suspects are a code change and — for a host-only divergence — the match
 * orchestrator specifically.
 */
/** `buildStamp()` 的回退值 —— ⭐ 語意住在 `../buildHealth.ts`。 */
const UNSTAMPED = "dev";

function explainDivergence(header: ReplayHeader, kind: "sim" | "host", tick: number): string {
  const now = buildStamp();
  const sameBuild = header.buildStamp === now;
  // ⛔⛔ GH#949 —— **兩邊都是回退值時，「相同」不是一個結論。**
  //
  // 正式站上 `buildStamp()` 必然落到 `"dev"`（容器裡沒有 checkout，而部署腳本
  // 只在 `build` 那一行給了 `GGD_BUILD_STAMP`）⇒ ⭐ **任兩份錄影都判「相同版本」**，
  // 而在此之前這一行會逐字說「所以問題不是版本落差」——
  // ⭐ 一句**在它最該說話的時候沉默**的診斷（CLAUDE.md：單邊校準的量尺）。
  const unstamped = header.buildStamp === UNSTAMPED || now === UNSTAMPED;
  const buildLine = sameBuild
    ? unstamped
      ? `⚠️ 兩邊都**沒有建置編號**（都是 ${UNSTAMPED}）⇒ ⛔ **版本落差無法排除** —— ` +
        `這台 shard 沒有被戳記（見 /healthz 的 build.stamped），所以「相同」只代表` +
        `兩份都沒有答案，⛔ 不代表程式碼沒變。`
      : `建置編號與錄製時相同（${header.buildStamp}），所以問題不是版本落差，` +
        `而是同一份程式碼在重播時走了不同的路徑——請把這段回報為 bug。`
    : `錄製時的建置是 ${header.buildStamp}，目前是 ${now}。` +
      `內容版本相同但程式碼不同，最可能的原因就是這次改動改變了模擬行為。`;
  const where =
    kind === "sim"
      ? `第 ${tick} 幀的「模擬狀態」對不上（位置／血量／隨機數流）。`
      : `第 ${tick} 幀的模擬狀態一致，但「主控狀態」對不上` +
        `（金幣／道具／技能等級／冷卻／命數／回合分數／選牌）——` +
        `代表模擬本身沒事，是比賽流程的計分或給獎邏輯變了。`;
  return `${where} ${buildLine} 已於此處停止播放，後面的畫面都不可信。`;
}

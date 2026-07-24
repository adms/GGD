// Package opsenv owns the GLOBAL operational-settings table (admin 系統運維):
// the small set of SERVER numbers an operator may change without a deploy.
//
// It is deliberately the SECOND instance of the pattern internal/combatenv
// proved out (task #28) — durable JSON truth, a public unauthenticated read the
// game-server consumes at match creation, admin-gated strictly-validated
// writes, a short TTL cache — and not a new mechanism. Same shape, same
// invariants, same failure modes, one thing to learn.
//
// WHAT IS WRITABLE, AND THE RULE THAT DECIDES IT. Only values whose worst case
// is "the shard admits fewer matches" or "patches arrive a little slower":
//
//	maxRooms    process-wide concurrent-match ceiling (GGD_MAX_ROOMS). Pure
//	            admission control: a counter consulted only inside the room's
//	            onCreate, before any sim world exists. LIVE-SAFE — and lowering
//	            it NEVER evicts a running match; the shard drains.
//	snapshotHz  Colyseus patch rate. Resolved once per room and frozen, so it
//	            is NEXT-MATCH-ONLY by construction: a running match keeps the
//	            rate it started with. Transport only; the sim still steps at
//	            TICK_HZ and stays byte-identical.
//
// Everything else this codebase can tune — tick rate, the phase durations, the
// economy block, the rate-limit policy, the match TTL, and every security
// posture flag — is served as a READ-ONLY descriptor (see Info) and is NOT in
// Keys. A PUT naming one of them is a 400 "unknown key".
//
// THE BOUNDARY THAT MUST NOT MOVE: the public read is UNAUTHENTICATED, because
// the game-server holds no platform token at match creation (the whitelist and
// combat-env precedent). So the moment a security flag (devCheats,
// whitelistBypass, deployTier, requireApproval) enters this document, an
// unauthenticated GET becomes the thing that decides whether cheats are on.
// Those flags stay out of Keys entirely, in any form.
//
// TWO PROTECTIONS CARRIED OVER FROM COMBAT-ENV'S SCARS, PRESENT FROM DAY ONE:
//
//  1. "Never configured" stays distinguishable from "configured to a value".
//     GetStored reports whether the file exists and the public handler serves an
//     EMPTY values map when it does not, because the game-server merges the
//     served body OVER its compiled defaults per key. A defaults-filled body
//     from a fresh platform would silently install the platform's idea of every
//     number over a deploy's env configuration — the exact bug that reset every
//     content-authored combat multiplier.
//  2. A drift guard. Keys, the compiled defaults and the bounds are all
//     mirrored from TypeScript, and keysync_test.go regex-parses those files and
//     asserts equality. A knob added on one side only turns the test red instead
//     of going invisible, which is how abilityRange lived for a whole release
//     without the console being able to see it.
package opsenv

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/httpx"
)

// Storage identifiers. The document lives at data/config/server-ops.json.
const (
	// Collection is the jsonstore collection (a directory under DATA_DIR).
	Collection = "config"
	// DocID is the single document id inside that collection.
	DocID = "server-ops"
	// RedisKey mirrors the marshalled document for Redis-native consumers.
	// It is a cache: the platform never reads it back as truth.
	RedisKey = "config:server-ops"
	// SchemaVersion is the doc version written by this build.
	SchemaVersion = 1
)

// ---------------------------------------------------------------- knobs -----

// Key names for the writable knobs. Mirrored from SERVER_OPS_KEYS in
// apps/game-server/src/config/serverOps.ts (the drift guard asserts equality).
const (
	KeyMaxRooms   = "maxRooms"
	KeySnapshotHz = "snapshotHz"
)

// Compiled defaults and bounds. Every one of these is ALSO declared in
// TypeScript; keysync_test.go parses the TS and asserts they agree, so a change
// on either side cannot silently make the console advertise a default the
// server would not actually use.
const (
	// DefaultMaxRooms mirrors DEFAULT_MAX_ROOMS in
	// apps/game-server/src/rooms/roomRegistry.ts. Lowered 200 → 50 by the owner.
	DefaultMaxRooms = 50
	// MinMaxRooms is 1, not 0. Zero is not a small value, it is a TOTAL OUTAGE:
	// every match creation throws and the platform's start flow fails for
	// everyone, so it must be a 400 rather than a setting.
	MinMaxRooms = 1
	// MaxMaxRooms bounds the guard so it cannot be deleted by a fat-fingered
	// 99999. One Node process cannot tick 500 rooms (500 × 12 seats at 30 Hz);
	// past this the unbounded-ticking-sims exhaustion the registry exists to
	// prevent is simply back.
	MaxMaxRooms = 500

	// TickHz mirrors TICK_HZ in packages/shared/src/constants.ts. It is NOT a
	// knob — see Info for why — but the snapshot bounds are derived from it, so
	// the drift guard pins it.
	TickHz = 30
	// DefaultSnapshotHz mirrors SNAPSHOT_HZ in packages/shared/src/constants.ts.
	DefaultSnapshotHz = 30
	// MinSnapshotHz / MaxSnapshotHz mirror MIN_SNAPSHOT_HZ / MAX_SNAPSHOT_HZ in
	// apps/game-server/src/config/snapshotRate.ts, which derive them from
	// TICK_HZ. Below TICK_HZ/2 the client's mandatory two-interval cushion
	// exceeds any sane interpolation delay; above TICK_HZ Colyseus serializes
	// the same tick twice and we pay bandwidth for zero new information.
	//
	// These are the TRANSPORT bounds only. The bound the console actually shows
	// and the validator actually enforces is EffectiveMinSnapshotHz(), which is
	// additionally floored by what the shipped client fleet can absorb — see
	// there for why advertising 15 while rejecting everything under 30 was a bug.
	MinSnapshotHz = TickHz / 2
	MaxSnapshotHz = TickHz

	// ClientInterpDelayMs mirrors INTERP_DELAY_MS in
	// packages/shared/src/constants.ts — the interpolation delay every SHIPPED
	// client is compiled with (apps/client/src/settings/types.ts derives both
	// its default and its slider floor from it). It is not a knob; it is a FACT
	// about the fleet, and it is what makes snapshotHz rejectable. See
	// coupledSnapshotErr.
	ClientInterpDelayMs = 66
)

// Safety classes, rendered as a badge in the console.
const (
	// SafetyLive — takes effect at the next create attempt, within the
	// game-server's cache TTL. Never touches a running match.
	SafetyLive = "live"
	// SafetyNextMatch — snapshotted at match creation and frozen; matches
	// already running keep what they started with.
	SafetyNextMatch = "nextMatch"
	// SafetyRestart — captured at process start; changing it is a deploy.
	SafetyRestart = "restart"
	// SafetyNever — must not be operator-settable at all.
	SafetyNever = "never"
)

// Descriptor is everything the console needs to render ONE knob: its bounds,
// its unit, its safety class and the zh-Hant copy. It is served BY THE PLATFORM
// so the bounds exist exactly once — the console cannot drift out of sync with
// the validator, which is the abilityRange class of bug fixed one level up.
type Descriptor struct {
	Key     string  `json:"key"`
	Default float64 `json:"default"`
	Min     float64 `json:"min"`
	Max     float64 `json:"max"`
	Integer bool    `json:"integer"`
	Unit    string  `json:"unit"`
	Safety  string  `json:"safety"`
	// ZhLabel is the field name shown in the console.
	ZhLabel string `json:"zhLabel"`
	// ZhNote is one line saying what the number actually does.
	ZhNote string `json:"zhNote"`
	// ZhApplies is the 何時生效 line: what an operator sees after saving.
	ZhApplies string `json:"zhApplies"`
	// Env names the environment variable that supplies the boot default, so an
	// operator can see that a deploy without the platform still has a value.
	Env string `json:"env"`
	// Where is the file:line home of the value (auditability).
	Where string `json:"where"`
}

// Keys is the canonical list of WRITABLE knobs, mirroring SERVER_OPS_KEYS in
// apps/game-server/src/config/serverOps.ts. Deliberately tiny: a value earns a
// place here by having a consumer on day one and by being unable to change what
// the deterministic sim computes.
var Keys = []string{KeyMaxRooms, KeySnapshotHz}

// Descriptors is the writable knob metadata, in display order.
// EffectiveMinSnapshotHz is the lowest snapshot rate this platform will ACCEPT,
// and therefore the lowest one the console is allowed to advertise.
//
// It is the transport floor (TICK_HZ/2) raised by what the SHIPPED CLIENT FLEET
// can absorb. The interpolation buffer clamps (freezes the remote) instead of
// extrapolating, so a client needs at least TWO snapshot intervals of delay to
// ride out one late packet — apps/client/src/settings/types.ts literally derives
// its slider floor as floor(2 × SNAPSHOT_MS) — and every shipped client is
// compiled with ClientInterpDelayMs. A rate below this floor does not merely
// cost bandwidth: it pushes every already-shipped client under its own cushion
// and the game stutters, with nothing on any screen saying why.
//
// THIS FUNCTION EXISTS BECAUSE THE BOUND WAS IN THE WRONG PLACE. The coupling
// used to be a separate post-range check, so the descriptor advertised 15..30
// and the console faithfully rendered 「可調整範圍 15 ～ 30」 while the platform
// 400'd everything from 15 to 29. That is precisely the failure the server-side
// descriptor design was introduced to make impossible — a console showing a
// range the validator does not enforce — reintroduced one level down. The
// coupling is a BOUND, so it lives in Min, and the console gets it for free.
//
// Never above MaxSnapshotHz: if the client delay were ever so small that no
// legal rate satisfied it, the constants themselves would be broken, and a
// descriptor with Min > Max would be unrenderable nonsense. Clamping keeps the
// single value TICK_HZ legal and lets the drift guard report the real problem.
func EffectiveMinSnapshotHz() float64 {
	hz := math.Ceil(2000.0 / float64(ClientInterpDelayMs))
	// Step down while the floor(2000/hz) <= delay rule still holds, so the bound
	// is the true minimum rather than the conservative ceiling of the division.
	for hz > 1 && math.Floor(2000/(hz-1)) <= float64(ClientInterpDelayMs) {
		hz--
	}
	if hz < MinSnapshotHz {
		hz = MinSnapshotHz
	}
	if hz > MaxSnapshotHz {
		hz = MaxSnapshotHz
	}
	return hz
}

var Descriptors = []Descriptor{
	{
		Key:     KeyMaxRooms,
		Default: DefaultMaxRooms,
		Min:     MinMaxRooms,
		Max:     MaxMaxRooms,
		Integer: true,
		Unit:    "場",
		Safety:  SafetyLive,
		ZhLabel: "同時對戰上限",
		ZhNote:  "單一遊戲伺服器行程能同時進行的對戰數。超過就拒絕開新場（保護 CPU / 記憶體）",
		ZhApplies: "立即生效（最多 5 秒內）。調低不會結束任何進行中的對戰：" +
			"若現有場次超過新上限，伺服器進入「排空」狀態，只是不再開新場，等舊場打完才恢復",
		Env:   "GGD_MAX_ROOMS",
		Where: "apps/game-server/src/rooms/roomRegistry.ts",
	},
	{
		Key:     KeySnapshotHz,
		Default: DefaultSnapshotHz,
		// The advertised floor is the EFFECTIVE one, so the range the console
		// renders is exactly the range the validator accepts. See
		// EffectiveMinSnapshotHz.
		Min:     EffectiveMinSnapshotHz(),
		Max:     MaxSnapshotHz,
		Integer: false,
		Unit:    "Hz",
		Safety:  SafetyNextMatch,
		ZhNote: "每秒送出幾次狀態封包。純傳輸：模擬仍以 " +
			strconv.Itoa(TickHz) + " Hz 運行，結果完全相同。" +
			"可調範圍的下限不是傳輸極限（" + formatNum(MinSnapshotHz) + " Hz），" +
			"而是「目前已發佈的客戶端能吃得下的最低頻率」——客戶端插值需要兩個快照間隔的緩衝，" +
			"編譯值是 " + strconv.Itoa(ClientInterpDelayMs) + " ms，所以低於 " +
			formatNum(EffectiveMinSnapshotHz()) + " Hz 會讓所有人畫面卡頓，平台直接拒絕",
		ZhLabel:   "快照頻率",
		ZhApplies: "下一場對戰生效（進行中對戰維持開始時的頻率）",
		Env:       "GGD_SNAPSHOT_HZ",
		Where:     "apps/game-server/src/config/snapshotRate.ts",
	},
}

var known = func() map[string]Descriptor {
	m := make(map[string]Descriptor, len(Descriptors))
	for _, d := range Descriptors {
		m[d.Key] = d
	}
	return m
}()

// KnownKey reports whether k names a writable knob.
func KnownKey(k string) bool {
	_, ok := known[k]
	return ok
}

// DescriptorFor returns the descriptor for a writable knob.
func DescriptorFor(k string) (Descriptor, bool) {
	d, ok := known[k]
	return d, ok
}

// Defaults is the compiled table every deploy starts from.
func Defaults() map[string]float64 {
	m := make(map[string]float64, len(Descriptors))
	for _, d := range Descriptors {
		m[d.Key] = d.Default
	}
	return m
}

// ----------------------------------------------------------------- info -----

// InfoItem is a READ-ONLY operational number: visible in the console with its
// value, its safety class and a plain sentence saying how it actually changes.
// Making these visible is most of what the owner asked for — an operator could
// not see any of them anywhere before — while keeping the writable set tiny.
type InfoItem struct {
	Key     string `json:"key"`
	ZhLabel string `json:"zhLabel"`
	// Value is rendered as text, not parsed: several of these are durations or
	// enums, and none of them are editable.
	Value  string `json:"value"`
	Safety string `json:"safety"`
	// ZhHow is how the value actually changes today.
	ZhHow string `json:"zhHow"`
	// ZhWhy is why it is not a console field.
	ZhWhy string `json:"zhWhy"`
	Where string `json:"where"`
}

// InfoFor builds the read-only inventory for a given match shape, derived match
// length and runtime policy. Order is display order.
//
// IT IS A FUNCTION, NOT A VAR, AND THAT IS THE POINT. Five of these rows quote
// numbers that live in content/config/config.match.json or in this binary's own
// flags. As a package-level table they were hand-copied prose, and #187 is what
// that costs: the row below said a match lasts 「約 15 分鐘」 — the arithmetic of
// a 3-lives match — for the entire period during which the owner's config said
// 8 lives and a match actually ran ~34 minutes. Every such number is now
// computed from the same file the game-server reads (matchlength.go), so the
// page cannot be stale without the game itself being stale.
func InfoFor(shape MatchShape, ml MatchLength, rt Runtime) []InfoItem {
	rt = rt.Resolved()
	// Where the numbers come from, said once, appended to the rows that are
	// derived so the owner can tell computed values from stated ones.
	derivedFrom := "content/config/config.match.json"
	if !shape.FromContent {
		derivedFrom = "（讀不到內容檔，以下為編譯內建值）" + derivedFrom
	}
	clampNote := ""
	if shape.HealthClamped {
		clampNote = fmt.Sprintf("（內容檔的 startingTeamLives 超過上限，遊戲伺服器會夾成 %d）", MaxStartingTeamHealth)
	}
	return []InfoItem{
		{
			Key: "tickHz", ZhLabel: "模擬頻率 (TICK_HZ)", Value: strconv.Itoa(TickHz) + " Hz",
			Safety: SafetyNever,
			ZhHow:  "改 packages/shared/src/constants.ts 後重新部署",
			ZhWhy: "模擬是鎖步決定性的，所有階段與手感常數都以「tick 數」表示（硬直 2/6、受擊 12、" +
				"擊倒 14、助攻視窗 300…）。改頻率等於同時把這些時間全部縮放一遍，等於在沒有任何數字" +
				"變動的情況下重新平衡整個遊戲，且已錄製的對戰無法重播",
			Where: "packages/shared/src/constants.ts",
		},
		{
			Key: "interpDelayMs", ZhLabel: "客戶端插值延遲", Value: strconv.Itoa(ClientInterpDelayMs) + " ms",
			Safety: SafetyNever,
			ZhHow:  "由玩家在遊戲內「設定 → 網路」調整，存在該玩家的瀏覽器；預設值編譯在客戶端",
			ZhWhy: "這不是伺服器數值，後台改它動不了任何一位在線玩家。它同時是快照頻率的另一半：" +
				"插值緩衝不外插，需要約兩個快照間隔的餘裕，所以它以「拒絕不相容的快照頻率」的形式被強制，" +
				"而不是變成第二個可自由填寫的欄位",
			Where: "packages/shared/src/constants.ts + apps/client/src/settings/types.ts",
		},
		{
			Key: "phaseDurations", ZhLabel: "階段秒數（選角 / 中場 / 戰鬥 / 結算）",
			Value: fmt.Sprintf("%s / %s / %s / %s 秒（火圈 %s 秒起）",
				formatNum(shape.ChampSelectSec), formatNum(shape.IntermissionSec),
				formatNum(shape.CombatMaxSec), formatNum(shape.ResolutionSec),
				formatNum(shape.FireRingStartSec)),
			Safety: SafetyNextMatch,
			ZhHow:  "在內容編輯器修改 content/config/config.match.json，重新載入內容即可（同樣是下一場生效）",
			ZhWhy: "已經是動態設定，且已有一個編輯入口。複製到這裡會變成同一個值有兩個寫入端、" +
				"沒有先後順序，下一個 bug 就是「我在編輯器改了卻沒反應」。" +
				"本行的數字是平台開機時直接讀那份檔案算出來的，不是抄的",
			Where: derivedFrom + " → apps/game-server/src/match/phaseConfig.ts",
		},
		{
			Key: "matchLength", ZhLabel: "一場對戰實際多長（推導值）",
			Value:  ml.ZhSummary() + clampNote,
			Safety: SafetyNever,
			ZhHow: fmt.Sprintf(
				"這行沒有旋鈕：它是由「%d 隊 × 每隊 %d 點隊伍生命值」＋階段秒數算出來的。"+
					"改內容檔的 startingTeamLives 或階段秒數，這裡就會跟著變",
				shape.TeamCount, shape.StartingTeamHealth),
			ZhWhy: fmt.Sprintf(
				"回合數不是公式，是打出來的：每回合輸的隊伍扣 %d/%d/%d… 點（第 7 回合起每回合再多 %d 點），"+
					"歸零淘汰，剩最後一隊獲勝；第 %d 回合起每 %d 回合是 High Stakes，贏家回 %d 點，"+
					"所以場次還會被拉長。平台用和遊戲伺服器同一套規則（PairedDuels）跑 %d 次模擬取平均，"+
					"得到平均 %.1f 回合（範圍 %d–%d 回合）。"+
					"模擬把每場對決當成五五波，這是唯一中立的假設，也因此偏保守："+
					"實際家庭對戰強弱有差，通常比這個數字更早結束。"+
					"為什麼要算而不是用寫的：這一行以前是手寫的「約 15 分鐘」，"+
					"那是「每隊 3 條命」時代的算式，內容檔早就不是 3 了，頁面卻沒跟著動，"+
					"而這正是拿來判斷「逾時多久算卡住」的那個數字",
				teamHealthLost(1), teamHealthLost(4), teamHealthLost(7), TeamHealthLateStep,
				HighStakesFirstRound, HighStakesPeriod, HighStakesReward,
				ml.Trials, ml.Rounds, ml.RoundsMin, ml.RoundsMax),
			Where: "apps/platform/internal/opsenv/matchlength.go ← " + derivedFrom +
				" + apps/game-server/src/match/PairedDuels.ts",
		},
		{
			Key: "economy", ZhLabel: "經濟與成長（起始金錢 / 擊殺金錢 / 售出退款 / 背包 / 等級上限）",
			Value: fmt.Sprintf("%s / %s / %s%% / %s / %s",
				formatNum(shape.StartingGold), formatNum(shape.KillGold),
				formatNum(math.Round(shape.SellRefund*100)),
				formatNum(shape.InventorySlots), formatNum(shape.LevelCap)),
			Safety: SafetyNextMatch,
			ZhHow:  "同上，內容編輯器",
			ZhWhy:  "內容作者的平衡數值，已有家。理由同階段秒數；同樣是開機時讀檔算出來的",
			Where:  derivedFrom,
		},
		{
			Key: "rateLimit", ZhLabel: "訊息限流（容量 / 每秒補充 / 連續丟棄斷線）", Value: "120 / 90 / 300",
			Safety: SafetyNextMatch,
			ZhHow:  "改 apps/game-server/src/net/messageRateLimiter.ts 後重新部署",
			ZhWhy: "這組數字有前科：斷線門檻原本計算「累計」丟棄，一位正常遊玩的玩家會在約 2:42 " +
				"被踢出，客戶端因此停止收到快照、倒數看似凍結。修法是改成「連續」丟棄。" +
				"當時的 bug 是語意不是大小，把它放進後台只會讓人用一個更整齊的數字重現同一個 2:42",
			Where: "apps/game-server/src/net/messageRateLimiter.ts",
		},
		{
			Key: "reconnectGraceSecs", ZhLabel: "斷線重連寬限", Value: "60 秒",
			Safety: SafetyRestart,
			ZhHow:  "改 apps/game-server/src/rooms/MatchRoom.ts 後重新部署",
			ZhWhy:  "可調範圍窄、營運價值低：太短則一次 wifi 抖動就把人永久換成 AI，太長則死掉的座位一直佔著房間",
			Where:  "apps/game-server/src/rooms/MatchRoom.ts",
		},
		{
			Key: "matchPendingTTL", ZhLabel: "對戰逾時回收（心跳制）",
			Value: fmt.Sprintf("心跳續命：最後一次心跳後 %s；沒收過心跳的才用 %s 保底。巡檢每 %s，真的卡住的房間最慢 %s 內清掉",
				formatDuration(rt.MatchLivenessGrace), formatDuration(rt.MatchPendingTTL),
				formatDuration(rt.ReaperInterval),
				formatDuration(rt.MatchLivenessGrace+rt.ReaperInterval)),
			Safety: SafetyRestart,
			ZhHow: "寬限時間可用環境變數 GGD_MATCH_LIVENESS_GRACE_SEC（60～900 秒，超出範圍會夾住並記警告）；" +
				"保底值在 apps/platform/internal/config/config.go，改完重啟平台",
			ZhWhy: fmt.Sprintf(
				"這個值以前是「一場最長 30 分鐘」的計時器，而且開場寫進去就再也不更新——"+
					"當一場實際要打 %s，平台就會在大家還在打的時候解散房間、並且給每個人記一筆「中離」。"+
					"現在改成：遊戲伺服器每 30 秒送一次 HMAC 簽章心跳，收到就把死線往後推，"+
					"所以「一場打多久」跟平台的任何常數都沒有關係了；%s 的保底只剩下一個用途——"+
					"遊戲伺服器根本沒送過心跳（舊版本／GGD_PLATFORM_URL 設錯／密鑰不符）時不讓 Redis 無限累積，"+
					"而且走到那條路的每一次回收都會記 ERROR 指名是哪個訊號不見了。"+
					"沒有放進可編輯清單，是因為它已經不是拿來調長短的旋鈕了",
				formatMinutes(ml.TypicalSec), formatDuration(rt.MatchPendingTTL)),
			Where: "apps/platform/internal/gamelink/liveness.go + apps/platform/internal/config/config.go",
		},
		{
			Key: "maxClients", ZhLabel: "每場人數上限",
			Value:  fmt.Sprintf("%d（%d 隊 × %d）", SeatCount, SeatTeamCount, SeatTeamSize),
			Safety: SafetyNever,
			ZhHow:  "這是玩法本身的定義，不是容量旋鈕",
			ZhWhy: "調高會放進沒有座位的客戶端；調低會把平台已經配位的玩家鎖在門外。" +
				"座位數以 packages/shared/src/constants.ts 為準，內容檔裡的 teamCount / teamSize 只是同一件事的宣告，" +
				"測試會盯著兩邊一致",
			Where: "packages/shared/src/constants.ts (SEAT_COUNT)",
		},
		{
			Key: "securityFlags", ZhLabel: "安全旗標（部署層級 / 白名單繞過 / 開發者作弊 / 共用密鑰）",
			Value: "public / off / off /（密鑰）", Safety: SafetyNever,
			ZhHow: "只能由環境變數在行程啟動時決定",
			ZhWhy: "本表的公開讀取端點是「不需驗證」的（遊戲伺服器在開場時沒有平台 token）。" +
				"只要把任何一個安全旗標放進來，一份可被任意人讀取的設定檔就變成了決定「作弊是否開啟」的東西。" +
				"這條界線寫在套件註解裡，並且靠「這些 key 根本不在可寫清單」來強制",
			Where: "apps/platform/internal/config/config.go + apps/game-server/src/rooms/MatchRoom.ts",
		},
		{
			Key: "botDifficulty", ZhLabel: "電腦強度", Value: "normal（未接線）",
			Safety: SafetyNever,
			ZhHow:  "目前無效：平台會儲存並透過 /_internal/matches 送出，但遊戲伺服器沒有讀取它",
			ZhWhy: "在它真的有作用之前不會出現在可編輯清單。「看起來可設定、其實沒接線」正是這次盤點要消滅的問題，" +
				"不是要再製造一個",
			Where: "apps/platform/internal/room/room.go → apps/game-server/src/index.ts",
		},
	}
}

// ------------------------------------------------------------------ doc -----

// Doc is the server-ops document. Values is ALWAYS the full table on an admin
// read (every key present) so the console can render the editor without
// backfilling; the PUBLIC read serves an empty map when nothing is stored.
type Doc struct {
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
	// Values maps knob key -> value.
	Values map[string]float64 `json:"values"`
}

// DefaultDoc is the compiled table: what a deploy runs on before any save.
func DefaultDoc() Doc {
	return Doc{Version: SchemaVersion, Values: Defaults()}
}

// sanitize backfills missing keys from the compiled defaults, drops unknown
// keys and replaces any value the WRITE PATH would have rejected — tolerance for
// hand-edited or older files. Out-of-range is replaced BY THE DEFAULT rather
// than clamped to the bound, because a hand-edited 0 for maxRooms must not
// become an outage and must not become a number nobody chose either.
//
// IT RUNS THE FULL Validate, NOT A SUBSET OF IT. Two ways a durable file can
// hold a value the PUT validator would refuse, neither of them hypothetical:
//
//  1. Someone edits data/config/server-ops.json by hand. The file is plain JSON
//     in the data directory and nothing stops it.
//  2. NOBODY EDITS ANYTHING AND THE FILE GOES STALE UNDERNEATH ITSELF. Bounds
//     here are derived from the shipped client constants, so a value that was
//     perfectly legal when it was saved becomes illegal the moment a netcode
//     change lands — exactly what happened while this package was being written
//     (INTERP_DELAY_MS 100 → 66 moved the snapshot floor 20 → 30). A stored 20
//     would then be served, unchanged and unremarked, to every game-server.
//
// An earlier version checked only min/max/integer/finite here, so the coupled
// snapshot rule — the one constraint whose whole purpose is to stop a save from
// stuttering the entire fleet — was enforced on exactly one of the two paths
// that can produce a served value.
func (d *Doc) sanitize() {
	out := make(map[string]float64, len(Descriptors))
	for _, desc := range Descriptors {
		v, ok := d.Values[desc.Key]
		if !ok || Validate(desc.Key, v) != nil {
			v = desc.Default
		}
		out[desc.Key] = v
	}
	d.Values = out
	if d.Version == 0 {
		d.Version = SchemaVersion
	}
}

// ----------------------------------------------------------------- repo -----

// Repo is the durable store: JSON truth via jsonstore, best-effort Redis mirror.
type Repo struct {
	store *jsonstore.Store
	rdb   *redisx.Client
}

// NewRepo builds the repository. rdb may be nil (no mirror).
func NewRepo(store *jsonstore.Store, rdb *redisx.Client) *Repo {
	return &Repo{store: store, rdb: rdb}
}

// Load reads the JSON truth. A missing file is NOT an error — it means no
// operator has ever saved, reported via the second return value, and the caller
// substitutes the compiled defaults.
func (r *Repo) Load() (Doc, bool, error) {
	var d Doc
	err := r.store.Get(Collection, DocID, &d)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return DefaultDoc(), false, nil
	}
	if err != nil {
		return DefaultDoc(), false, err
	}
	d.sanitize()
	return d, true, nil
}

// Save writes the JSON truth atomically, then mirrors into Redis. A mirror
// failure is logged, never fatal: Redis is rebuildable, the file is the truth.
func (r *Repo) Save(ctx context.Context, d Doc) error {
	if err := r.store.Put(Collection, DocID, d); err != nil {
		return err
	}
	r.mirror(ctx, d)
	return nil
}

func (r *Repo) mirror(ctx context.Context, d Doc) {
	if r.rdb == nil {
		return
	}
	data, err := json.Marshal(d)
	if err != nil {
		return
	}
	if err := r.rdb.R.Set(ctx, RedisKey, string(data), 0).Err(); err != nil {
		slog.Warn("opsenv: redis mirror failed (JSON truth is intact)", "err", err)
	}
	// Announce the change so RUNNING shards re-read the knobs. maxRooms is the
	// one value that is genuinely live (roomRegistry consults it inside
	// onCreate), so an announcement here changes admission on the very next
	// match instead of up to a TTL later.
	if err := r.rdb.PublishContentInvalidation(
		ctx, redisx.ContentKindServerOps, redisx.ContentETag(data), d.UpdatedAt,
	); err != nil {
		slog.Warn("opsenv: content-invalidation publish failed (shards refresh on their TTL)", "err", err)
	}
}

// -------------------------------------------------------------- service -----

// Service applies ops policy on top of the repository. The document is tiny and
// single-writer, so one mutex around the read-modify-write cycle is all the
// concurrency control needed.
type Service struct {
	repo  *Repo
	store *jsonstore.Store
	mu    sync.Mutex
	now   func() time.Time

	// rt is the process's own timing truth (content path + reaper policy),
	// captured once at construction because every value in it is fixed for the
	// life of the process. shape/length are DERIVED from it — see matchlength.go
	// for why the inventory may not simply state them in prose.
	rt     Runtime
	shape  MatchShape
	length MatchLength
}

// Runtime is what the read-only inventory needs from the rest of the process to
// describe itself HONESTLY: where the content tree is, and the actual reaper
// policy this binary booted with.
//
// It is a parameter rather than an import of internal/config because this
// package must stay a leaf — and because passing the values makes it visible at
// the call site that the page and the reaper are reading the SAME numbers. The
// zero value is legal: it falls back to compiled defaults, which is what tests
// and the opstate tooling get.
type Runtime struct {
	// ContentDir is the read-only content/ tree (cfg.ContentDir).
	ContentDir string
	// MatchPendingTTL is the BLIND fallback deadline (cfg.MatchPendingTTL) — the
	// leak-stopper for a match the platform never heard a heartbeat about. It is
	// NOT a match timer; reading it as one is what caused #187.
	MatchPendingTTL time.Duration
	// MatchLivenessGrace is how long a match survives its last heartbeat
	// (cfg.MatchLivenessGrace).
	MatchLivenessGrace time.Duration
	// ReaperInterval is the sweep period the reaper ACTUALLY runs at, after its
	// own clamp — not the value the caller asked for. The page quoted an
	// unclamped number for a year.
	ReaperInterval time.Duration
}

// Resolved fills a zero Runtime with the compiled config defaults so the
// inventory never renders "0 秒". Exported because the guard that checks the
// blind fallback still clears a real match has to ask for the same value the
// page renders, not a copy of it.
func (r Runtime) Resolved() Runtime {
	if r.MatchPendingTTL <= 0 {
		r.MatchPendingTTL = 2 * time.Hour
	}
	if r.MatchLivenessGrace <= 0 {
		r.MatchLivenessGrace = 3 * time.Minute
	}
	if r.ReaperInterval <= 0 {
		r.ReaperInterval = r.MatchLivenessGrace / 3
	}
	return r
}

// New builds the service. rdb may be nil (mirror disabled). rt supplies the
// content path and the reaper policy the inventory reports; its zero value is
// legal and means "describe the compiled defaults".
func New(store *jsonstore.Store, rdb *redisx.Client, rt Runtime) *Service {
	rt = rt.Resolved()
	shape := LoadMatchShape(rt.ContentDir)
	length := EstimateMatchLength(shape)
	slog.Info("opsenv: derived match length",
		"startingTeamHealth", shape.StartingTeamHealth, "fromContent", shape.FromContent,
		"meanRounds", math.Round(length.Rounds*100)/100,
		"typical", (time.Duration(length.TypicalSec) * time.Second).Round(time.Minute),
		"allRoundsFullLength", (time.Duration(length.LongSec) * time.Second).Round(time.Minute),
		"blindDeadline", rt.MatchPendingTTL, "livenessGrace", rt.MatchLivenessGrace)
	return &Service{
		repo: NewRepo(store, rdb), store: store, now: time.Now,
		rt: rt, shape: shape, length: length,
	}
}

// MatchShape is the content-derived match shape this process is describing.
func (s *Service) MatchShape() MatchShape { return s.shape }

// MatchLength is the derived match duration (see matchlength.go).
func (s *Service) MatchLength() MatchLength { return s.length }

// Runtime is the reaper/content policy the inventory reports.
func (s *Service) Runtime() Runtime { return s.rt }

// Info is the read-only inventory for THIS process, with every number that
// depends on the match config computed rather than quoted.
func (s *Service) Info() []InfoItem { return InfoFor(s.shape, s.length, s.rt) }

// SetNow overrides the clock seam (tests inject a fixed clock).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// Get returns the current table — the stored doc, or the compiled defaults when
// nothing has ever been saved (no lazy create).
func (s *Service) Get() (Doc, error) {
	doc, _, err := s.GetStored()
	return doc, err
}

// GetStored is Get plus whether the document actually exists on disk.
//
// The distinction matters to exactly one caller — the PUBLIC read the
// game-server consumes — because that read is MERGED OVER the game-server's
// COMPILED defaults with stored keys winning per key (see
// apps/game-server/src/config/serverOps.ts). Serving a defaults-filled table
// from an unconfigured platform would therefore push the platform's idea of
// every number over a deploy that configured itself through the environment: a
// shard started with GGD_MAX_ROOMS=200 would silently drop to 50 the moment it
// could reach a fresh platform nobody had ever configured. "Never configured"
// must stay distinguishable from "configured to that value".
func (s *Service) GetStored() (Doc, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, stored, err := s.repo.Load()
	if err != nil {
		return DefaultDoc(), false, err
	}
	return doc, stored, nil
}

// coupledSnapshotExplain produces the SPECIFIC message for a snapshot rate the
// shipped client fleet cannot absorb, so the operator reads why rather than a
// bare "out of range".
//
// The rule itself is no longer a separate check — it is baked into the
// descriptor's Min by EffectiveMinSnapshotHz, which is what keeps the console's
// advertised range identical to the accepted one. This function only decides
// which of two true sentences to print.
func coupledSnapshotExplain(hz float64) error {
	needed := math.Floor(2 * 1000 / hz)
	return httpx.BadRequest(
		"snapshotHz " + formatNum(hz) + " requires a client interpolation delay of at least " +
			formatNum(needed) + " ms (two snapshot intervals), but shipped clients are compiled " +
			"with " + strconv.Itoa(ClientInterpDelayMs) + " ms — lowering the rate alone would " +
			"stutter every client. The lowest accepted snapshotHz is " +
			formatNum(EffectiveMinSnapshotHz()) + ".")
}

// Validate checks ONE key/value against its descriptor. Exported so the same
// code answers "would this save be accepted?" without a write, and so the LOAD
// path (Doc.sanitize) enforces exactly what the WRITE path enforces — a stored
// value that would be refused today must never be served just because it was
// legal when it was written. Every rejection names the offending key and the
// bound it violated.
func Validate(k string, v float64) error {
	desc, ok := known[k]
	if !ok {
		return httpx.BadRequest("unknown server-ops key: " + truncate(k, 40))
	}
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return httpx.BadRequest(k + " must be a finite number")
	}
	if desc.Integer && v != math.Trunc(v) {
		return httpx.BadRequest(k + " must be a whole number")
	}
	if v < desc.Min || v > desc.Max {
		// For snapshotHz an under-range value is almost always the interpolation
		// coupling rather than the transport floor; say which.
		if k == KeySnapshotHz && v < desc.Min && v >= MinSnapshotHz {
			return coupledSnapshotExplain(v)
		}
		// "between 30 and 30" is not a sentence anyone should have to read.
		if desc.Min == desc.Max {
			return httpx.BadRequest(
				k + " must be exactly " + formatNum(desc.Min) + " (got " + formatNum(v) + ")")
		}
		return httpx.BadRequest(
			k + " must be between " + formatNum(desc.Min) + " and " + formatNum(desc.Max) +
				" (got " + formatNum(v) + ")")
	}
	return nil
}

// Replace overwrites the whole table (PUT semantics). The input may be SPARSE:
// omitted keys reset to the COMPILED DEFAULT — the payload is the complete
// desired state, mirroring combatenv.Replace and curation.Replace. Every
// present key must be a known knob, finite, whole where the descriptor says so,
// inside [Min, Max], and must satisfy any coupled rule — anything else is a
// 400 naming the bound, never silently dropped. version/updatedAt are
// server-owned.
func (s *Service) Replace(ctx context.Context, in map[string]float64) (Doc, error) {
	for _, k := range sortedKeys(in) {
		if err := Validate(k, in[k]); err != nil {
			return DefaultDoc(), err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	doc := DefaultDoc()
	for k, v := range in {
		doc.Values[k] = v
	}
	doc.Version = SchemaVersion
	doc.UpdatedAt = s.now().UTC()
	if err := s.repo.Save(ctx, doc); err != nil {
		return DefaultDoc(), err
	}
	return doc, nil
}

// NonDefault returns the values that differ from the compiled default, sorted
// by key — the compact audit-detail form (a save that changes nothing audits
// as {}).
func NonDefault(d Doc) map[string]float64 {
	out := map[string]float64{}
	defs := Defaults()
	for _, k := range sortedKeys(d.Values) {
		if d.Values[k] != defs[k] {
			out[k] = d.Values[k]
		}
	}
	return out
}

// Audit appends one line to the shared admin audit log so ops changes show up
// next to every other operator action. Best-effort: a failed audit write never
// fails the mutation itself.
func (s *Service) Audit(adminID, action string, detail map[string]any) {
	entry := admin.AuditEntry{
		AdminID:  adminID,
		Action:   action,
		TargetID: Collection + "/" + DocID,
		Detail:   detail,
		TS:       s.now().UTC(),
	}
	if err := s.store.AppendLine(admin.ColAudit, entry.TS.Format("2006-01-02"), entry); err != nil {
		slog.Warn("opsenv: audit append failed", "action", action, "err", err)
	}
}

// ---------------------------------------------------------------- utils -----

func sortedKeys(m map[string]float64) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func formatNum(v float64) string {
	return strconv.FormatFloat(v, 'g', -1, 64)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

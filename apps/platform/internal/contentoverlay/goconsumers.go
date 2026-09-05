package contentoverlay

// goconsumers.go — 普查：Go 這一側到底從**出貨的 content/ 樹**讀了哪些 config
// 文件，以及後台的覆蓋層改不改得到那一份。這是 task #241 的長期那一半。
//
// ── 為什麼需要一份「登記表」而不是一段散文 ──────────────────────────────────
// #241 的短期缺陷（後台 → 商店經濟 存了值，收費路徑一輩子讀不到）已經修好了，
// 端到端的守衛是 wallet/economy_api_test.go 的 TestOperatorPriceEditReachesGetWallet。
// 但那只修好一份文件。真正的坑是**類別**：
//
//	content-overlay 這條管線的設計對象是 TS 消費端（client / game-server 讀
//	merged bundle）。把一個「只有 Go 在讀」的欄位接到它上面，等於沒接 ——
//	後台會存進去、回 200、重整還看得到自己填的數字，玩家那邊完全沒變。
//
// 而這個錯誤**長得跟正確的一模一樣**：三處落地（content/config + Zod + admin）
// 全部做齊了也一樣壞。沒有東西會紅。所以下一個人會照同一個形狀再做一頁
// write-only 的後台，除非有一條會自己量的守衛。
//
// ── 這張表守的是「配對關係」，不是名詞 ─────────────────────────────────────
// 「後台存得進去」是一個名詞（覆蓋層寫入正常）。
// 「Go 讀得到某個值」是另一個名詞（讀檔正常）。
// 兩個名詞分別檢查都會綠，而缺陷活在它們中間 —— 那正是它活到今天的原因。
// goconsumers_test.go 因此**真的用後台那條 HTTP 路由存一次**，再去讀 Go 這一側
// 的即時答案，然後比對下面宣告的 Liveness。宣告與量到的不一致就紅。
//
// ⛔ 這張表不是「所有 config 文件」的清單。它只列 Go 會去讀出貨樹的那幾份 ——
// 其餘的 config 文件只有 TS 消費端，覆蓋層對它們本來就是即時的。
// 判斷「有沒有漏一份」是 TestEveryGoContentConfigReadIsRegistered 的工作：
// 它掃 internal/**/*.go 裡對 CONTENT_DIR 底下 config/ 的讀取，任何一份沒有登記
// 的文件都會讓它紅。

// Liveness says whether the Go reader of a shipped content config doc picks up
// the operator's content-overlay edit.
type Liveness string

const (
	// ReadsOverlay: the Go reader layers the durable overlay entry over the
	// shipped doc ON EVERY READ, so a console save is live with no restart.
	ReadsOverlay Liveness = "reads-overlay"
	// ShippedOnly: the Go reader only ever sees content/, which on the family
	// host is a read-only bind mount. A console save through the overlay does
	// NOT reach it. That is only acceptable when something ELSE is the live
	// consumer — LiveConsumer must say what, and it must not be "nothing".
	ShippedOnly Liveness = "shipped-only"
)

// GoConsumedConfig is one content config doc that Go reads out of CONTENT_DIR.
type GoConsumedConfig struct {
	// Key is the overlay map key (collection/id) the console writes, i.e. what
	// key(Collection, ID) produces — "config/store".
	Key string
	// File is the path under CONTENT_DIR the Go reader opens.
	File string
	// GoReader is the package that reads it.
	GoReader string
	// Liveness is the DECLARED behaviour. goconsumers_test.go measures it.
	Liveness Liveness
	// LiveConsumer names who does see an operator's edit. For ReadsOverlay that
	// is the Go reader itself; for ShippedOnly it MUST name a real runtime
	// consumer, because "nobody" is the #241 defect and this field is where a
	// future author is forced to notice that.
	LiveConsumer string
}

// GoConsumedConfigs is the census. Sorted by Key.
var GoConsumedConfigs = []GoConsumedConfig{
	{
		Key:      "config/store",
		File:     "config/store.json",
		GoReader: "internal/wallet",
		Liveness: ReadsOverlay,
		LiveConsumer: "internal/wallet itself — Service.effective() (economy.go) reads the durable " +
			"overlay entry on every pricing decision, so 後台 → 商店經濟 is live on the next request.",
	},
	{
		Key:      "config/combat-env",
		File:     "config/combat-env.json",
		GoReader: "internal/combatenv",
		Liveness: ShippedOnly,
		LiveConsumer: "apps/game-server (config/combatEnv.ts) — it merges the CONTENT doc it loaded " +
			"through the overlay-merged bundle with the platform's own override table, so an operator " +
			"edit to content/config/combat-env still reaches the match. What the platform reads here " +
			"is only the BASE the 戰鬥系統 page starts from; see the openQuestion on #241.",
	},
	{
		Key:      "config/ui-cues",
		File:     "config/ui-cues.json",
		GoReader: "internal/server (playercontent.go)",
		Liveness: ReadsOverlay,
		LiveConsumer: "internal/server itself — playerContentFlags() 先讀 durable overlay 再退回出貨樹，" +
			"所以後台把「玩家投稿」兩格關掉是**當下**生效的。⭐ 這兩格是一條對外開放路線的緊急開關，" +
			"⛔ 一個要等重啟才關得掉的開關比沒有開關更糟（見 #278 的前科）。",
	},
	{
		Key:      "config/ugc",
		File:     "config/ugc.json",
		GoReader: "internal/server (playercontent.go)",
		Liveness: ReadsOverlay,
		LiveConsumer: "internal/server itself — ugcDigestRecompute() 先讀 durable overlay 再退回出貨樹，" +
			"每一次投稿都重讀（GH#1022）。⭐ 這一格是「要不要相信客戶端的 digest」的一鍵回頭：" +
			"content-api 掛了而投稿必須開著時，後台翻它必須**當下**生效。" +
			"⚠️ 讀不到 ⇒ 視為 on（fail-closed：不知道就選擋人的那一邊）。",
	},
	{
		Key:      "config/config.match",
		File:     "config/config.match.json",
		GoReader: "internal/opsenv",
		Liveness: ShippedOnly,
		LiveConsumer: "apps/game-server (phaseConfig) — the match phases themselves come from the " +
			"overlay-merged bundle. The platform reads this file ONLY to derive the 系統運維 page's " +
			"「一場對戰實際多長（推導值）」, which is a display, not a rule.",
	},
}

// GoConsumedConfigFor returns the census entry for an overlay key.
func GoConsumedConfigFor(key string) (GoConsumedConfig, bool) {
	for _, e := range GoConsumedConfigs {
		if e.Key == key {
			return e, true
		}
	}
	return GoConsumedConfig{}, false
}

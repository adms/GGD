package platformarchive

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/ai"
	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/friend"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/invite"
	"github.com/ggd/platform/internal/matchstats"
	"github.com/ggd/platform/internal/opsenv"
	"github.com/ggd/platform/internal/ranking"
	"github.com/ggd/platform/internal/room"
	"github.com/ggd/platform/internal/submissions"
	"github.com/ggd/platform/internal/wallet"
)

// EntryKind is how one archive entry is stored and compared.
type EntryKind string

const (
	// KindDoc is a jsonstore document: <collection>/<id>.json.
	KindDoc EntryKind = "doc"
	// KindJSONL is an append-only NDJSON file: <collection>/<id>.jsonl.
	KindJSONL EntryKind = "jsonl"
	// KindOpaque is a byte blob this package does not parse (replays).
	KindOpaque EntryKind = "opaque"
)

// Policy is how import treats an entry whose target already exists.
type Policy string

const (
	// PolicySingleton — one operator-chosen document (whitelist, combat-env,
	// server-ops, the content overlay). A target document that is NEWER than
	// the archive blocks the import unless the operator overrides.
	PolicySingleton Policy = "singleton"
	// PolicyAdditive — many independent documents (accounts, invites, …).
	// Missing ones are added; existing ones are kept unless allowOverwrite.
	PolicyAdditive Policy = "additive"
	// PolicyAppendOnly — an append-only log file. An existing target file is
	// ALWAYS skipped: never overwritten, never merged. See failure mode #4.
	PolicyAppendOnly Policy = "append-only"
	// PolicyOpaque — byte-for-byte copy, compared on size+sha256, never
	// overwritten.
	PolicyOpaque Policy = "opaque"
)

// Groups. `core` is always on; the rest are opt-in and sized in the UI before
// the operator clicks.
const (
	GroupCore    = "core"
	GroupMatches = "matches"
	GroupHistory = "history"
	GroupAudit   = "audit"
	GroupReplays = "replays"
)

// AllGroups in report order. Core first because it is never optional.
var AllGroups = []string{GroupCore, GroupMatches, GroupHistory, GroupAudit, GroupReplays}

// GroupZH labels the groups for the console and the CLI report.
var GroupZH = map[string]string{
	GroupCore:    "核心資料",
	GroupMatches: "對戰紀錄",
	GroupHistory: "個人戰績履歷",
	GroupAudit:   "管理稽核紀錄",
	GroupReplays: "對戰回放",
}

// Rule is one line of the scope allowlist.
//
// Match answers the IMPORT question ("may this archive contain this
// collection?"); Enum answers the EXPORT question ("which collections of this
// shape exist on this host?"). They are separate functions on purpose: Enum
// touches the filesystem, Match must be a pure predicate so an archive can be
// judged without a data dir.
type Rule struct {
	// Name identifies the rule in reports (the collection, or the prefix
	// pattern for the enumerated ones).
	Name string
	// Group is the opt-in bucket this rule belongs to.
	Group string
	// Kind and Policy drive the reader and the planner.
	Kind   EntryKind
	Policy Policy
	// ZH is the operator-facing Chinese name.
	ZH string
	// Match reports whether a collection name belongs to this rule.
	Match func(col string) bool
	// AllowID, when non-nil, additionally restricts which ids inside the
	// collection are in scope. The `config` collection needs it: combat-env and
	// server-ops travel, ai-provider and slack-notify are SECRETS and must not.
	AllowID func(id string) bool
	// Enum lists the concrete collection names present under root. Exact rules
	// return themselves (or nothing); prefix rules do a depth-bounded scan.
	Enum func(root string) ([]string, error)
}

// Collection identifiers, taken from the owning packages so a rename over there
// becomes a compile error here instead of an archive that silently carries
// nothing. (opstate/export.go uses the same discipline.)
var (
	colAccounts         = account.ColAccounts
	colAccountsUsername = account.ColByUsername
	colAccountsEmail    = account.ColByEmail
	colInvites          = invite.Collection
	colWalletMeta       = wallet.ColWalletMeta
	colHeadToHead       = ranking.ColHeadToHead
	colCuration         = curation.Collection
	colConfig           = combatenv.Collection // == opsenv.Collection == ai.Collection
	colOverlay          = contentoverlay.Collection
	colOverlayLog       = contentoverlay.LogCollection
	colAnnouncements    = admin.ColAnnouncements
	colFriends          = friend.ColFriends
	// ⭐ 玩家投稿的**兩半**（GH#908）。⚠️ 它們刻意分成兩個集合（owner 2026-08-27：
	//   「批核材料跟批核結果分署不同資料夾」）⇒ 這裡也要兩條規則，⛔ 不是一條。
	colSubmissions        = submissions.CollectionMaterial
	colSubmissionVerdicts = submissions.CollectionVerdict
	colTemplates          = room.ColTemplates
	colHistory            = gamelink.ColHistory
	colAudit              = admin.ColAudit
	// ColReplays is the game-server's recording directory as the platform sees
	// it. It is NOT a jsonstore collection: apps/game-server writes it through
	// GGD_REPLAY_DIR and compose.family.yaml bind-mounts ../data/replays into
	// the GAME container separately. The platform only happens to see the bytes
	// because ../data:/data covers them. See failure mode #7.
	ColReplays = "replays"
)

// Config documents that travel. Everything else in `config` is refused, and the
// two refusals are named in the manifest so "not in the archive" can never be
// confused with "I forgot".
var (
	configDocCombatEnv = combatenv.DocID
	configDocServerOps = opsenv.DocID
	// SecretConfigDocs are the config documents this tool must NEVER move.
	SecretConfigDocs = map[string]string{
		ai.DocID:       "明文 AI provider API key，請在新主機的「AI 生成設定」重新輸入",
		"slack-notify": "Slack webhook 是密鑰（GET 回傳是遮罩過的），請在新主機重新輸入",
	}
)

// Excluded is the manifest's honest list of what was deliberately left behind.
// It is data, not prose: the console renders it and the CLI prints it.
type Excluded struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// ExcludedItems is the fixed refusal list. Order is report order.
func ExcludedItems() []Excluded {
	return []Excluded{
		{"config/" + ai.DocID, SecretConfigDocs[ai.DocID]},
		{"config/slack-notify", SecretConfigDocs["slack-notify"]},
		{"journal", "結算 WAL：沒有 commit marker 的 intent 會在新主機開機時重播舊結算"},
		{"owner-setup-token", "一次性擁有者宣告權杖，持有即可宣告新部署的擁有權，永不隨檔案移動"},
		{"blizzard-overlay", "84 MB 素材，隨部署映像走，不是平台資料（新主機一開始看起來很空是正常的）"},
		{"content-backups", "dev content-api 的本機備份，家用主機根本沒跑"},
		{"icon-src-original", "本機素材產線的存檔"},
		{"_index.json", "衍生狀態：匯出用 Scan 枚舉，匯入由 jsonstore.Put 自己重建"},
		{"_migration", "本功能自己的暫存與備份區（開頭底線 ⇒ 永遠不是合法 collection）"},
		{"redis", "可重建的鏡像。匯入後由本套件的 reindex 直接覆寫，不呼叫 boot.Rebuild（見 reindex.go）"},
	}
}

// segmentRe mirrors jsonstore.go's collection-segment rule. Enumeration uses it
// so a directory jsonstore itself would refuse can never become a collection
// name in an archive.
var segmentRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

// entryIDRe is DELIBERATELY IDENTICAL to jsonstore's idRe.
//
// Do not tighten it. `@` and `.` are legal because accounts/by-email/<email>
// and accounts/by-username/<name> use the login key AS THE FILE NAME. A
// plausible-looking hardening ("archive entries may not contain dots or @")
// would drop exactly those two collections and produce a host where every
// password is correct and no username resolves. See failure mode #9.
var entryIDRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9@._-]{0,127}$`)

func exact(name string) func(string) bool {
	return func(col string) bool { return col == name }
}

// enumExact returns the collection itself when its directory exists.
func enumExact(name string) func(string) []string {
	return func(root string) []string {
		if dirExists(filepath.Join(root, filepath.FromSlash(name))) {
			return []string{name}
		}
		return nil
	}
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// childDirs lists the immediate sub-directories of <root>/<rel> whose names
// jsonstore would accept as a path segment. It is the ONLY enumeration
// primitive in this package: bounded to one level, name-filtered, and never
// recursive — which is what keeps "export walks the data dir" impossible.
func childDirs(root, rel string) []string {
	entries, err := os.ReadDir(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return nil
	}
	out := []string{}
	for _, e := range entries {
		if !e.IsDir() || !segmentRe.MatchString(e.Name()) {
			continue
		}
		out = append(out, e.Name())
	}
	sort.Strings(out)
	return out
}

// Rules is the whole allowlist, in report order.
//
// EVERY collection the archive can carry appears here exactly once. Adding a
// collection to the platform does NOT add it to the archive; somebody has to
// come here and decide, which is the point.
func Rules() []Rule {
	simple := func(name, group string, kind EntryKind, policy Policy, zh string) Rule {
		enum := enumExact(name)
		return Rule{
			Name: name, Group: group, Kind: kind, Policy: policy, ZH: zh,
			Match: exact(name),
			Enum:  func(root string) ([]string, error) { return enum(root), nil },
		}
	}
	rules := []Rule{
		simple(colAccounts, GroupCore, KindDoc, PolicyAdditive, "帳號（含密碼雜湊）"),
		simple(colAccountsUsername, GroupCore, KindDoc, PolicyAdditive, "使用者名稱索引"),
		simple(colAccountsEmail, GroupCore, KindDoc, PolicyAdditive, "Email 索引"),
		simple(colInvites, GroupCore, KindDoc, PolicyAdditive, "邀請碼（未兌換者可直接註冊）"),
		simple(colWalletMeta, GroupCore, KindDoc, PolicyAdditive, "藍水晶餘額與最愛"),
		simple(colCuration, GroupCore, KindDoc, PolicySingleton, "內容白名單"),
		simple(colAnnouncements, GroupCore, KindDoc, PolicyAdditive, "公告"),
		simple(colFriends, GroupCore, KindDoc, PolicyAdditive, "好友"),
		simple(colTemplates, GroupCore, KindDoc, PolicyAdditive, "房間範本"),
		simple(colOverlay, GroupCore, KindDoc, PolicySingleton, "內容覆蓋層"),
		simple(colOverlayLog, GroupCore, KindJSONL, PolicyAppendOnly, "內容覆蓋層歷程"),
		simple(colHistory, GroupHistory, KindJSONL, PolicyAppendOnly, "個人戰績履歷"),
		// GH 2026-08-17 宿敵紀錄。⚠️ 這張白名單是**明列**的 —— 沒加進來的集合
		// 換主機時會安靜地留在舊機（沒有測試會紅），所以新集合一定要補這一行。
		simple(colHeadToHead, GroupHistory, KindDoc, PolicyAdditive, "宿敵對戰紀錄"),
		// ⭐⭐ 玩家**自己做的內容**（GH#908）。⚠️ 這是這台機器上最不可取代的一種資料：
		//   帳號可以重建、戰績可以重跑，⛔ 而一份玩家做的技能**沒有第二份**。
		//   ⇒ 兩半都是 Additive（⛔ 不是 Singleton：每一份投稿是一個獨立文件）。
		simple(colSubmissions, GroupCore, KindDoc, PolicyAdditive, "玩家投稿（內容本體）"),
		simple(colSubmissionVerdicts, GroupCore, KindDoc, PolicyAdditive, "玩家投稿的審核裁決"),
		simple(colAudit, GroupAudit, KindJSONL, PolicyAppendOnly, "管理稽核紀錄"),
	}

	// config — exact collection, RESTRICTED ID SET. The secrets live in the
	// same directory as the two documents that travel, so the id filter is the
	// whole security boundary for this rule.
	configEnum := enumExact(colConfig)
	rules = append(rules, Rule{
		Name: colConfig, Group: GroupCore, Kind: KindDoc, Policy: PolicySingleton,
		ZH:    "戰鬥系統 / 系統運維設定",
		Match: exact(colConfig),
		AllowID: func(id string) bool {
			return id == configDocCombatEnv || id == configDocServerOps
		},
		Enum: func(root string) ([]string, error) { return configEnum(root), nil },
	})

	// rankings/<season> and rankings/<season>/champions.
	rules = append(rules, Rule{
		Name: "rankings/<season>", Group: GroupCore, Kind: KindDoc, Policy: PolicyAdditive,
		ZH: "排行榜快照",
		Match: func(col string) bool {
			p := strings.Split(col, "/")
			switch len(p) {
			case 2:
				return p[0] == "rankings" && segmentRe.MatchString(p[1])
			case 3:
				return p[0] == "rankings" && segmentRe.MatchString(p[1]) && p[2] == "champions"
			}
			return false
		},
		Enum: func(root string) ([]string, error) {
			out := []string{}
			for _, season := range childDirs(root, "rankings") {
				out = append(out, "rankings/"+season)
				if dirExists(filepath.Join(root, "rankings", season, "champions")) {
					out = append(out, "rankings/"+season+"/champions")
				}
			}
			return out, nil
		},
	})

	// matches/<YYYY>/<MM> — gamelink.MatchCollection's partitioning.
	rules = append(rules, Rule{
		Name: "matches/<YYYY>/<MM>", Group: GroupMatches, Kind: KindDoc, Policy: PolicyAdditive,
		ZH: "對戰紀錄",
		Match: func(col string) bool {
			p := strings.Split(col, "/")
			return len(p) == 3 && p[0] == "matches" &&
				segmentRe.MatchString(p[1]) && segmentRe.MatchString(p[2])
		},
		Enum: func(root string) ([]string, error) {
			out := []string{}
			for _, y := range childDirs(root, "matches") {
				for _, m := range childDirs(root, "matches/"+y) {
					out = append(out, "matches/"+y+"/"+m)
				}
			}
			return out, nil
		},
	})

	// match-stats/<YYYY>/<MM> — the #207 per-match ANALYSIS LEDGER, partitioned
	// exactly like `matches` (matchstats.Collection mirrors
	// gamelink.MatchCollection on purpose).
	//
	// IT RIDES IN THE `matches` GROUP RATHER THAN A NEW ONE. A new group would
	// have to be named, sized and rendered in the console's export checklist,
	// and apps/admin is owned by another lane in this batch — a group nobody
	// can tick is a group that never travels. It also belongs there on the
	// merits: it is the same data class (one row per match), it is opt-in with
	// the settlement records it joins against, and an operator who takes
	// 對戰紀錄 without the ledgers would land on a host whose 後台覆盤 screen is
	// empty for every match it can list.
	rules = append(rules, Rule{
		Name: matchstats.CollectionPrefix + "/<YYYY>/<MM>", Group: GroupMatches,
		Kind: KindDoc, Policy: PolicyAdditive,
		ZH: "對戰覆盤帳本",
		Match: func(col string) bool {
			p := strings.Split(col, "/")
			return len(p) == 3 && p[0] == matchstats.CollectionPrefix &&
				segmentRe.MatchString(p[1]) && segmentRe.MatchString(p[2])
		},
		Enum: func(root string) ([]string, error) {
			out := []string{}
			for _, y := range childDirs(root, matchstats.CollectionPrefix) {
				for _, m := range childDirs(root, matchstats.CollectionPrefix+"/"+y) {
					out = append(out, matchstats.CollectionPrefix+"/"+y+"/"+m)
				}
			}
			return out, nil
		},
	})

	// replays — opaque bytes owned by the game-server (see ColReplays).
	rules = append(rules, Rule{
		Name: ColReplays, Group: GroupReplays, Kind: KindOpaque, Policy: PolicyOpaque,
		ZH:    "對戰回放（game-server 的檔案）",
		Match: exact(ColReplays),
		// Enum is unused for replays: the directory may be somewhere other than
		// DATA_DIR (GGD_ARCHIVE_REPLAY_DIR), so export.go handles it directly.
		Enum: func(root string) ([]string, error) {
			if dirExists(filepath.Join(root, ColReplays)) {
				return []string{ColReplays}, nil
			}
			return nil, nil
		},
	})
	return rules
}

// RuleFor returns the rule owning a collection name, or nil.
func RuleFor(col string) *Rule {
	rules := Rules()
	for i := range rules {
		if rules[i].Match(col) {
			return &rules[i]
		}
	}
	return nil
}

// NormalizeGroups validates a requested group list. core is ALWAYS present: an
// archive without accounts is not a migration, and letting the caller drop it
// would produce a file that restores cleanly onto an empty host.
func NormalizeGroups(in []string) ([]string, error) {
	want := map[string]bool{GroupCore: true}
	for _, raw := range in {
		g := strings.ToLower(strings.TrimSpace(raw))
		if g == "" {
			continue
		}
		if g == "all" {
			for _, a := range AllGroups {
				want[a] = true
			}
			continue
		}
		known := false
		for _, a := range AllGroups {
			if a == g {
				known = true
				break
			}
		}
		if !known {
			return nil, fmt.Errorf("platformarchive: unknown group %q (known: %s)",
				g, strings.Join(AllGroups, ", "))
		}
		want[g] = true
	}
	out := []string{}
	for _, a := range AllGroups {
		if want[a] {
			out = append(out, a)
		}
	}
	return out, nil
}

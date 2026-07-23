package opstate

import (
	"fmt"
	"net"
	"strings"

	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// BootCheckInput is what PlayableBootCheck needs to decide whether an empty
// whitelist is a boot-blocking misconfiguration or a fine local-dev state.
type BootCheckInput struct {
	// DataDir is the resolved DATA_DIR (already absolute).
	DataDir string
	// Addr is the platform's listen address (cfg.Addr).
	Addr string
	// FamilyTier is cfg.FullAssets — the owner's household deploy.
	FamilyTier bool
	// RequireInvite is cfg.RequireInvite — a gated, player-facing deploy.
	RequireInvite bool
	// AllowEmptyOverride is GGD_ALLOW_EMPTY_WHITELIST truthiness: the deliberate
	// "let me boot and curate from scratch in the console" escape.
	AllowEmptyOverride bool
}

// PlayableBootCheckResult is the outcome. Fatal means main should refuse to
// start; Message is the operator-facing explanation either way.
type PlayableBootCheckResult struct {
	// Fatal is true when the deploy is player-facing, the whitelist enables no
	// champion, and the override is not set. main exits non-zero.
	Fatal bool
	// PlayerFacing records whether the deploy was judged reachable by others.
	PlayerFacing bool
	// ChampionCount is how many champions the whitelist enables.
	ChampionCount int
	// Message is a single multi-line explanation to log.
	Message string
}

// PlayableBootCheck refuses to bring up a PLAYER-FACING deploy whose whitelist
// enables no champion — the exact state that greets a family with an empty
// champion select while every test stays green.
//
// WHAT COUNTS AS PLAYER-FACING, AND WHY IT IS NOT JUST "family tier". Three
// independent signals each mean "someone other than the developer will reach
// this": a networked listen address (the same fact that turns on the secret
// hardening and the invite gate), the family asset tier, and the invite gate
// being on. ANY of them arms the check. A loopback-only dev box with none of
// them set stays completely frictionless — it boots empty exactly as it does
// today, because a developer curating through the console is a normal thing and
// the empty state there is a starting point, not a failure.
//
// THE ESCAPE, AND WHY IT IS SAFE TO HAVE ONE. A brand-new family host that has
// NOT had a bundle restored yet is legitimately empty: the owner may intend to
// register and curate in the console. GGD_ALLOW_EMPTY_WHITELIST=1 permits that
// boot. Unlike a security flag, leaving it on only forfeits a safety net (boot
// stops checking the roster) — it can never expose anything — so an escape
// hatch here does not carry the usual "set once, forgotten, now a hole" cost.
// The refusal message names it explicitly alongside the two real fixes so the
// owner reaches for a fix first.
func PlayableBootCheck(in BootCheckInput) (PlayableBootCheckResult, error) {
	playerFacing := !loopbackOnly(in.Addr) || in.FamilyTier || in.RequireInvite

	store, err := jsonstore.New(in.DataDir)
	if err != nil {
		return PlayableBootCheckResult{}, err
	}
	doc, _, err := curation.NewRepo(store, nil).Load()
	if err != nil {
		return PlayableBootCheckResult{}, err
	}
	res := PlayableBootCheckResult{
		PlayerFacing:  playerFacing,
		ChampionCount: len(doc.Champions),
	}

	if len(doc.Champions) > 0 {
		res.Message = fmt.Sprintf("boot check: whitelist enables %d champions — playable.", len(doc.Champions))
		return res, nil
	}

	// Empty whitelist from here on.
	if !playerFacing {
		res.Message = "boot check: whitelist is empty, but this is a loopback-only dev bind — that is a normal " +
			"fresh-dev state (curate in the admin console, or run `make seed-demo`). Not blocking."
		return res, nil
	}
	if in.AllowEmptyOverride {
		res.Message = "boot check: whitelist is EMPTY on a PLAYER-FACING deploy, but GGD_ALLOW_EMPTY_WHITELIST is set — " +
			"booting anyway. Champion select will be empty until you curate. Unset this once the roster is restored so the check protects you again."
		return res, nil
	}
	res.Fatal = true
	res.Message = strings.Join([]string{
		"啟動已中止：這是對外／家人部署，但白名單沒有啟用任何英雄——家人會看到「空白的選角畫面」。請用下面任一種方式修好後再啟動。",
		"boot REFUSED: this deploy is player-facing but the content whitelist enables NO champion.",
		"Every champion pick would be rejected and your players would see an empty champion select.",
		fmt.Sprintf("  DATA_DIR = %s", store.Root()),
		fmt.Sprintf("  curation/whitelist.json = %s", emptyStateWord(len(doc.Champions))),
		"Fix it with ONE of:",
		"  1. restore the operator-state bundle exported from your laptop:",
		"       go run ./cmd/opstate restore -in ggd-operator-state.json -data \"$DATA_DIR\" -content \"$CONTENT_DIR\"",
		"  2. apply the built-in demo roster (48 champions):  make seed-demo   (or /seed -starter in the container)",
		"  3. to boot an EMPTY host on purpose and curate in the console, set GGD_ALLOW_EMPTY_WHITELIST=1",
	}, "\n")
	return res, nil
}

func emptyStateWord(n int) string {
	if n == 0 {
		return "enables 0 champions (empty)"
	}
	return fmt.Sprintf("enables %d champions", n)
}

// loopbackOnly reports whether addr binds a loopback interface only. It mirrors
// config.loopbackOnlyAddr (unexported there) so the boot check needs no new
// export from the heavily-contended config package. A wildcard or unparseable
// bind is NOT loopback-only — the fail-safe direction is "treat it as reachable".
func loopbackOnly(addr string) bool {
	host := strings.TrimSpace(addr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if host == "" {
		return false
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

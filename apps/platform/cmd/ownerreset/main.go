// Command ownerreset resets an administrator's password from the HOST.
//
//	go -C apps/platform run ./cmd/ownerreset -list
//	go -C apps/platform run ./cmd/ownerreset -username <name>
//	go -C apps/platform run ./cmd/ownerreset -username <name> -generate
//
// It is the answer to "the only administrator forgot their password". The
// authorisation is that you are running it: a shell on the machine that holds
// DATA_DIR. There is no endpoint, no token and — deliberately — no loopback
// check, because the LAN-published vite dev server launders every phone on the
// wifi into 127.0.0.1 as this binary sees it. See internal/ownerreset for the
// full reasoning and internal/server/devsurface_test.go for the standing lock.
//
// The password is NEVER a flag. With a terminal it prompts twice with the echo
// off; with -generate (or no terminal) it makes a strong one and prints it once.
//
// Environment: DATA_DIR and REDIS_ADDR/REDIS_PASSWORD, exactly as the platform
// reads them. No signing secrets are needed — this command mints no tokens.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"

	"golang.org/x/term"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/ownerreset"
)

// exit codes: 0 done, 1 refused (nothing changed), 2 changed but with warnings.
const (
	exitOK       = 0
	exitRefused  = 1
	exitWarnings = 2
)

func main() {
	// Logs go to STDERR so the one-time generated password on stdout can be
	// piped/copied without dragging log noise with it — and so nothing about
	// this run can end up in a log file that also holds the password.
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))

	// Before flag.Parse, so `-password …` gets an explanation rather than
	// flag's generic parse error.
	if err := ownerreset.RejectPasswordArg(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(exitRefused)
	}

	username := flag.String("username", "", "the administrator account to reset (as registered)")
	id := flag.String("id", "", "the administrator account id, if you know it instead of the username")
	generate := flag.Bool("generate", false, "generate a strong password and print it once, instead of prompting")
	allowNonAdmin := flag.Bool("allow-non-admin", false, "permit resetting an account that carries no admin role")
	list := flag.Bool("list", false, "list this deploy's administrators and exit (changes nothing)")
	flag.Usage = usage
	flag.Parse()

	st, err := config.LoadStorage()
	if err != nil {
		fail(err)
	}
	// Say WHICH state is about to be touched before touching it. DATA_DIR
	// defaults to a RELATIVE path, so running this from the wrong directory
	// silently opens an empty store beside the real one — and an empty store
	// looks exactly like a deploy with no accounts at all.
	slog.Info("ownerreset: opening the platform's state", "dataDir", st.DataDir, "redis", st.RedisAddr)

	deps, closeDeps, err := ownerreset.Open(st)
	if err != nil {
		fail(err)
	}
	defer closeDeps()
	ctx := context.Background()

	if *list {
		if err := printAdmins(ctx, deps, st); err != nil {
			fail(err)
		}
		return
	}
	if *username == "" && *id == "" {
		flag.Usage()
		os.Exit(exitRefused)
	}

	password, wasGenerated, err := obtainPassword(*generate)
	if err != nil {
		fail(err)
	}

	res, err := ownerreset.Reset(ctx, deps, ownerreset.Request{
		Username:      *username,
		AccountID:     *id,
		NewPassword:   password,
		AllowNonAdmin: *allowNonAdmin,
		Generated:     wasGenerated,
	})
	if err != nil {
		fail(err)
	}
	report(res, password, wasGenerated, st)
	if len(res.Warnings) > 0 {
		os.Exit(exitWarnings)
	}
	os.Exit(exitOK)
}

func usage() {
	fmt.Fprint(os.Stderr, `ownerreset — reset an administrator password from this machine

  go -C apps/platform run ./cmd/ownerreset -list
  go -C apps/platform run ./cmd/ownerreset -username <name>
  go -C apps/platform run ./cmd/ownerreset -username <name> -generate

The password is never a command-line argument. Without -generate this prompts
twice with the echo off; there is no flag that accepts one.

Flags:
`)
	flag.PrintDefaults()
	// The resolved values are printed at startup (see main), so this only has to
	// name the variables. Their DEFAULTS are deliberately not repeated here:
	// they belong to internal/config, and a second copy would be the one that
	// goes stale. (A literal address in this file would also trip the standing
	// no-address guard in internal/ownerreset/surface_test.go, which is a blunt
	// instrument on purpose.)
	fmt.Fprint(os.Stderr, `
Environment (same variables, same defaults, as the platform itself):
  DATA_DIR         durable JSON truth — must be the SAME one the platform runs with
  REDIS_ADDR       Redis host:port; required, so live sessions can be revoked
  REDIS_PASSWORD   optional
`)
}

// obtainPassword reads the new password from a no-echo TTY prompt, or generates
// one. It is never read from argv (see internal/ownerreset/password.go).
func obtainPassword(generate bool) (string, bool, error) {
	if generate {
		pw, err := ownerreset.GeneratePassword()
		return pw, true, err
	}
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		// No terminal means no way to prompt without echoing. Refuse rather than
		// fall back to reading a line in the clear, and point at the flag that
		// works here (a cron job, a pipe, `go run` under a wrapper).
		return "", false, errors.New(
			"ownerreset: stdin is not a terminal, so a password cannot be prompted for without echoing it. " +
				"Re-run in an interactive shell, or pass -generate to have one generated and printed once")
	}
	first, err := promptNoEcho(fd, "新密碼 / New password: ")
	if err != nil {
		return "", false, err
	}
	// Check the shape BEFORE asking for the confirmation — being told "too
	// short" only after typing it twice is a bad prompt.
	if err := ownerreset.ValidateNewPassword(first); err != nil {
		return "", false, err
	}
	second, err := promptNoEcho(fd, "再輸入一次 / Confirm new password: ")
	if err != nil {
		return "", false, err
	}
	if first != second {
		return "", false, errors.New("ownerreset: 兩次輸入的密碼不一致，未做任何更動 / the two passwords do not match — nothing was changed")
	}
	return first, false, nil
}

// promptNoEcho reads one line with the terminal echo disabled.
//
// The signal handler is not decoration: term.ReadPassword restores the terminal
// on return, but a Ctrl-C DURING the read kills the process with the echo still
// off, leaving the operator with a shell that no longer shows what they type —
// on the machine they just came to rescue.
func promptNoEcho(fd int, prompt string) (string, error) {
	state, err := term.GetState(fd)
	if err == nil {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt)
		defer signal.Stop(sig)
		go func() {
			if _, ok := <-sig; ok {
				_ = term.Restore(fd, state)
				fmt.Fprintln(os.Stderr)
				os.Exit(exitRefused)
			}
		}()
	}
	fmt.Fprint(os.Stderr, prompt)
	raw, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func printAdmins(ctx context.Context, deps ownerreset.Deps, st config.Storage) error {
	admins, err := ownerreset.ListAdmins(ctx, deps)
	if err != nil {
		return err
	}
	fmt.Printf("DATA_DIR: %s\n", st.DataDir)
	if len(admins) == 0 {
		fmt.Println("此部署沒有任何管理員帳號 / this deploy has NO administrator.")
		fmt.Println("下一個註冊的帳號會成為擁有者（見 internal/auth/bootstrap.go）——直接在遊戲客戶端註冊即可。")
		return nil
	}
	fmt.Printf("管理員 / administrators (%d):\n", len(admins))
	for _, a := range admins {
		flags := []string{}
		if a.Banned {
			flags = append(flags, "BANNED")
		}
		if a.Status != "" && a.Status != "approved" {
			flags = append(flags, a.Status)
		}
		note := ""
		if len(flags) > 0 {
			note = "  [" + strings.Join(flags, ", ") + "]"
		}
		fmt.Printf("  %-24s %s%s\n", a.Username, a.ID, note)
	}
	return nil
}

// report prints the outcome. The generated password goes to STDOUT and is
// stated to be one-time; everything else is commentary on stderr.
func report(res ownerreset.Result, password string, generated bool, st config.Storage) {
	fmt.Fprintf(os.Stderr, "\n✔ 已重設 %s (%s) 的密碼 / password reset\n", res.Username, res.AccountID)
	fmt.Fprintf(os.Stderr, "  · DATA_DIR: %s\n", st.DataDir)
	fmt.Fprintf(os.Stderr, "  · 已撤銷 %d 個登入工作階段 / refresh tokens revoked\n", res.SessionsRevoked)
	if res.ForcedApproved {
		fmt.Fprintf(os.Stderr, "  · 帳號狀態 %q → approved（原本無法登入）\n", res.PreviousStatus)
	}
	if res.ClearedBan {
		fmt.Fprintln(os.Stderr, "  · 已解除封鎖 / ban cleared")
	}
	if !res.WasAdmin {
		fmt.Fprintln(os.Stderr, "  · ⚠ 此帳號不是管理員（-allow-non-admin）/ target was not an administrator")
	}
	fmt.Fprintln(os.Stderr, "  · 平台不需重啟；既有的 access token 最多再存活 15 分鐘 / no restart needed")
	if generated {
		fmt.Fprintln(os.Stderr, "\n新密碼（只會顯示這一次）/ new password, shown once:")
		fmt.Println(password)
		fmt.Fprintln(os.Stderr, "\n登入後請到後台「變更密碼」改成你自己的密碼 / change it in the console after signing in.")
	}
	for _, w := range res.Warnings {
		fmt.Fprintf(os.Stderr, "\n⚠ %s\n", w)
	}
}

func fail(err error) {
	fmt.Fprintf(os.Stderr, "%v\n", err)
	os.Exit(exitRefused)
}

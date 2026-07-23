package ownerreset

// Where the new password comes from — and, more importantly, where it must NOT.
//
// A password passed on a command line is compromised the moment it is typed: it
// lands in the shell's history file, in `ps`/`/proc/<pid>/cmdline` where every
// other user on the box can read it, and in any process-accounting or audit
// daemon that records argv. So this command has NO flag that takes one. The two
// supported sources are a no-echo TTY prompt (cmd/ownerreset) and the generator
// below, and RejectPasswordArg turns the guess an operator WILL make —
// `-password hunter2` — into an explanation instead of a bare parse error.

import (
	"crypto/rand"
	"fmt"
	"strings"

	"github.com/ggd/platform/internal/auth"
)

// ValidateNewPassword is the platform's ONE password policy (auth.ValidatePassword)
// wrapped in a message written for a terminal rather than for an HTTP client.
//
// Reset applies the same rule again — it is authoritative — but a CLI that only
// discovers "too short" AFTER asking the operator to type it twice is a bad
// prompt. The rule itself is never restated here, so the two cannot diverge.
func ValidateNewPassword(password string) error {
	if err := auth.ValidatePassword(password); err != nil {
		return fmt.Errorf("ownerreset: 密碼不符合平台規則：需 8–128 個字元，且不可含控制字元 "+
			"(the platform requires 8–128 characters and no control characters): %w", err)
	}
	return nil
}

// GeneratedLength is how many alphabet characters a generated password carries
// (excluding the readability dashes). 20 characters over the 57-symbol alphabet
// below is ~116 bits of entropy — far past anything argon2id needs to protect,
// and short enough that an operator can read it off the screen and type it in.
const GeneratedLength = 20

// generatedGroup is how many characters go between dashes. Purely readability;
// the dashes are part of the password.
const generatedGroup = 5

// passwordAlphabet omits the characters that get mistyped when a human copies a
// credential off a terminal into a login form: 0/O/o, 1/l/I. Everything left is
// unambiguous in the fonts a terminal and a browser are likely to use.
const passwordAlphabet = "abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789"

// GeneratePassword returns a cryptographically random password.
//
// Sampling is REJECTION-based, not `b % len(alphabet)`: the modulo shortcut
// silently biases toward the first 256%54 symbols, which is the kind of defect
// that never shows up in a test and quietly costs entropy forever.
func GeneratePassword() (string, error) {
	n := len(passwordAlphabet)
	limit := byte(256 - (256 % n)) // bytes >= limit would fold unevenly
	var sb strings.Builder
	buf := make([]byte, 32)
	for written := 0; written < GeneratedLength; {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		for _, b := range buf {
			if written >= GeneratedLength {
				break
			}
			if b >= limit {
				continue // reject, no bias
			}
			if written > 0 && written%generatedGroup == 0 {
				sb.WriteByte('-')
			}
			sb.WriteByte(passwordAlphabet[int(b)%n])
			written++
		}
	}
	return sb.String(), nil
}

// passwordishFlags are the spellings an operator reaches for when they try to
// pass the password inline. Matched on the flag NAME only, so a legitimate
// value that happens to contain the word is unaffected.
var passwordishFlags = []string{"password", "pass", "pw", "passwd", "new-password", "newpassword", "secret", "p"}

// RejectPasswordArg refuses a command line that carries a password-shaped flag.
//
// Without it, `ownerreset -username x -password hunter2` fails with flag's own
// "flag provided but not defined" — after the password is already in the shell
// history and in argv. The error cannot un-leak it, so it says so plainly and
// tells the operator to clear their history.
func RejectPasswordArg(args []string) error {
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			continue
		}
		name := strings.ToLower(strings.TrimLeft(arg, "-"))
		if i := strings.IndexAny(name, "= "); i >= 0 {
			name = name[:i]
		}
		for _, bad := range passwordishFlags {
			if name == bad {
				return fmt.Errorf(
					"ownerreset: refusing %q — this command NEVER takes a password on the command line "+
						"(it would be saved in your shell history and visible to every user on this machine via `ps`). "+
						"Run it with no password flag: it prompts with the echo off, or use -generate to have one made for you. "+
						"Clear the command you just typed from your shell history",
					arg)
			}
		}
	}
	return nil
}

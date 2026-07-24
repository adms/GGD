package ownerreset

import "testing"

// The rejection threshold must never be narrowed to a byte.
//
// This test exists because gosec G115 pointed at `byte(256 - (256 % n))` and the
// finding was real — not today, but latent. For the 55-symbol alphabet the
// expression is 220 and everything works. For ANY alphabet length that divides
// 256 the expression is 256, and byte(256) is 0: `b >= limit` then rejects every
// byte drawn, and GeneratePassword loops forever with no error and no output.
//
// Padding the alphabet to 64 symbols "for more entropy" is a completely
// reasonable edit for someone to make, and it would hang the owner password
// reset — the one command an operator runs when they are already locked out.
// So the invariant is asserted over the lengths that would break it, not merely
// over the length we happen to ship.
func TestRejectionLimitSurvivesEveryPlausibleAlphabetLength(t *testing.T) {
	for n := 2; n <= 256; n++ {
		limit := 256 - (256 % n)
		if limit <= 0 || limit > 256 {
			t.Fatalf("alphabet length %d yields an unusable limit %d", n, limit)
		}
		// Every accepted byte must map inside the alphabet, and at least one
		// byte value must be acceptable — otherwise the sampling loop cannot
		// terminate.
		accepted := 0
		for b := 0; b < 256; b++ {
			if b < limit {
				accepted++
				if b%n >= n {
					t.Fatalf("n=%d: byte %d maps outside the alphabet", n, b)
				}
			}
		}
		if accepted == 0 {
			t.Fatalf("n=%d: no byte value is acceptable — GeneratePassword would never terminate", n)
		}
		// Rejection sampling is only unbiased if the accepted range is a whole
		// number of alphabet cycles.
		if limit%n != 0 {
			t.Fatalf("n=%d: limit %d is not a multiple of n — sampling would be biased", n, limit)
		}
	}
}

// The shipped alphabet is what the doc comments claim it is. The comments said
// 57 in one place and 54 in another; it is 55. Numbers in prose drift unless
// something checks them.
func TestShippedAlphabetMatchesItsDocumentedSize(t *testing.T) {
	if got := len(passwordAlphabet); got != 55 {
		t.Fatalf("passwordAlphabet is %d symbols; update the doc comments that say 55", got)
	}
	seen := map[rune]bool{}
	for _, r := range passwordAlphabet {
		if seen[r] {
			t.Fatalf("passwordAlphabet repeats %q — a repeat silently biases the sampling", r)
		}
		seen[r] = true
	}
	for _, bad := range "0Oo1lI" {
		if seen[bad] {
			t.Fatalf("passwordAlphabet contains %q, which the comment promises is excluded as mistypeable", bad)
		}
	}
}

package invite

import "testing"

func TestProbeNormalize(t *testing.T) {
	cases := []string{
		"GGD-5YMV-B2BN",
		"ggd-5ymv-b2bn",
		" GGD-5YMV-B2BN ",
		"GGD-5YMV-B2BN\n",
		"ggd 5ymv b2bn",
		"GGD5YMVB2BN",
		"5YMV-B2BN",                       // prefix cropped off
		"GGD-5YMV-B2BN。",                  // full-width period
		"邀請碼：GGD-5YMV-B2BN",               // pasted with a chinese label
		"Code: GGD-5YMV-B2BN",             // pasted with an english label
		"你的邀請碼是 GGD-5YMV-B2BN，到期 2026",   // pasted sentence
		"GGD-5YMV-B2BN https://x/register", // pasted whole LINE message
		"ＧＧＤ－５ＹＭＶ－Ｂ２ＢＮ",                    // fullwidth
		"GGD-5YMV-B2BN GGD-5YMV-B2BN",
		"GGD‑5YMV‑B2BN",  // U+2011 non-breaking hyphen
		"GGD—5YMV—B2BN",  // em dash
		"GGD-5YMV-B2B",   // one char short
		"GGD-5IMV-B2BN",  // I typed for 1-like
		"GGD-5YMV-B2BO",  // O typed
		"​GGD-5YMV-B2BN", // zero width space (some copy paths)
	}
	for _, c := range cases {
		t.Logf("%-40q -> %q", c, Normalize(c))
	}
}

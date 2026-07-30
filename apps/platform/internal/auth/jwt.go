package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/httpx"
)

// TokenIssuer is stamped into the `iss` claim of every access token AND is
// REQUIRED at verification.
//
// It used to be stamped and never read, which made it decoration: a token
// carrying any issuer at all — or none — passed. Requiring it costs nothing and
// is the outer half of the purpose binding described on AccessAudience.
const TokenIssuer = "ggd-platform"

// AccessAudience is the `aud` claim of an access token, and the thing that
// makes an access token USELESS as anything else signed with the same key.
//
// WHY IT EXISTS (GH#180). JWT_SIGNING_SECRET is no longer this file's private
// key. #209's one-tap approve links (internal/approvelink) are HMAC'd with the
// SAME secret, so "possession of a valid MAC under the platform secret" no
// longer implies "this is a session". Nothing in a bare HS256 JWT says what the
// signature was FOR, so without an audience the only thing keeping the two uses
// apart is that their encodings happen to differ — a coincidence of format, not
// a decision, and one that a future change to either format could quietly
// revoke. The `aud` claim makes the purpose an explicit, verified fact:
// VerifyAccess refuses anything not addressed to it, whoever signed it.
//
// Deliberately shaped like approvelink's tokenDomain ("ggd:approve:v1"): same
// namespace, same versioning, so a third use of the secret has an obvious
// pattern to follow — pick a new domain string, never reuse one.
//
// ⚠️ CHANGING THIS STRING INVALIDATES EVERY ACCESS TOKEN IN THE WILD. That is a
// deliberate property (it is how a purpose gets retired), not a free rename.
const AccessAudience = "ggd:access:v1"

// Claims are the platform's access-token claims.
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// MintAccess signs a 15-minute HS256 access token.
func (s *Service) MintAccess(a account.Account) (string, error) {
	now := time.Now()
	claims := Claims{
		Username: a.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   a.ID,
			Issuer:    TokenIssuer,
			Audience:  jwt.ClaimStrings{AccessAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
}

// VerifyAccess parses and validates an access token, pinning the HS256
// algorithm (alg-confusion / "none" rejected) and REQUIRING that the token was
// minted by this platform (`iss`) FOR this purpose (`aud`).
//
// Both jwt.WithIssuer and jwt.WithAudience treat a MISSING claim as a failure,
// not as "nothing to check" (see the library's parser_option.go), which is what
// makes them a gate rather than a filter. That is also why there is no grace
// period for tokens minted before the `aud` claim existed: they are refused on
// sight. The cost is bounded and self-healing — a refresh token is opaque and
// lives in Redis, untouched by this, so the client's normal 401 → /auth/refresh
// → retry path mints a compliant token without the player doing anything.
func (s *Service) VerifyAccess(token string) (*Claims, error) {
	claims := &Claims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		return s.jwtSecret, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(TokenIssuer),
		jwt.WithAudience(AccessAudience),
	)
	if err != nil || !parsed.Valid || claims.Subject == "" {
		return nil, httpx.Unauthorized("invalid or expired access token")
	}
	return claims, nil
}

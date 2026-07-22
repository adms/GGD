package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/httpx"
)

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
			Issuer:    "ggd-platform",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
}

// VerifyAccess parses and validates an access token, pinning the HS256
// algorithm (alg-confusion / "none" rejected).
func (s *Service) VerifyAccess(token string) (*Claims, error) {
	claims := &Claims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil || !parsed.Valid || claims.Subject == "" {
		return nil, httpx.Unauthorized("invalid or expired access token")
	}
	return claims, nil
}

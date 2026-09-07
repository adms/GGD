package admin

import (
	"context"
	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
	"github.com/go-chi/chi/v5"
	"net/http"
)

// Certification is separate from login approval and administration privileges.
func (s *Service) SetPowerUser(ctx context.Context, adminID, targetID string, grant bool) (AccountRow, error) {
	a, err := s.accounts.Update(ctx, targetID, func(ac *account.Account) error {
		if grant {
			if !ac.HasRole(account.RolePowerUser) {
				ac.Roles = append(ac.Roles, account.RolePowerUser)
			}
		} else {
			kept := make([]string, 0, len(ac.Roles))
			for _, role := range ac.Roles {
				if role != account.RolePowerUser {
					kept = append(kept, role)
				}
			}
			ac.Roles = kept
		}
		return nil
	})
	if err != nil {
		return AccountRow{}, notFoundOr(err)
	}
	action := "power_user_revoked"
	if grant {
		action = "power_user_certified"
	}
	if err := s.audit(ctx, adminID, action, targetID, map[string]any{"role": account.RolePowerUser}); err != nil {
		return AccountRow{}, err
	}
	return rowOf(a), nil
}

func (h *Handlers) setPowerUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Certified *bool `json:"certified"`
	}
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if req.Certified == nil {
		httpx.WriteError(w, httpx.BadRequest("certified is required"))
		return
	}
	row, err := h.svc.SetPowerUser(r.Context(), auth.MustIdentity(r.Context()).AccountID, chi.URLParam(r, "id"), *req.Certified)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"account": row})
}

# GGD — one-click local stack (kind + skaffold + helm) and test harness.
#
#   make up          create kind cluster (if missing) → build+deploy → port-forward edge
#   make dev         skaffold dev inner loop (watch/rebuild/redeploy)
#   make down        uninstall the helm release (cluster stays)
#   make nuke        delete the kind cluster entirely
#   make seed        re-run the idempotent platform seed (Redis hot layer)
#   make seed-demo   enable the demo starter whitelist so a fresh install is playable
#   make whitelist   show how many champions/items/abilities are currently enabled
#   make test        run ALL suites via the testrunner CLI (regression last + todo gate)
#   make logs        tail all GGD pod logs
#   make todo-check  static TODO/test gate
#   make lan-probe   prove the wifi can reach the game and NO write surface (#102)
#
# Every target checks its tools first and prints install hints instead of
# cryptic failures.

SHELL := /bin/bash
.DEFAULT_GOAL := help

CLUSTER      := ggd
REPO_ROOT    := $(abspath .)
KIND_CONFIG  := deploy/kind/kind-config.yaml
SECRETS_FILE := deploy/helm/secrets.local.yaml

# ---- tool guards -------------------------------------------------------------
# usage: $(call need,<binary>,<install hint>)
define need
	@command -v $(1) >/dev/null 2>&1 || { \
		echo "✗ '$(1)' is required but not installed."; \
		echo "  install: $(2)"; \
		exit 1; }
endef

.PHONY: help
help:
	@grep -E '^#   make' Makefile | sed 's/^#   //'

# ---- one-click cluster ---------------------------------------------------------
.PHONY: up
up:
	$(call need,docker,https://docs.docker.com/get-docker/  (and start the daemon))
	$(call need,kind,brew install kind   # or: go install sigs.k8s.io/kind@latest)
	$(call need,kubectl,brew install kubectl)
	$(call need,helm,brew install helm)
	$(call need,skaffold,brew install skaffold)
	@docker info >/dev/null 2>&1 || { echo "✗ docker daemon is not running"; exit 1; }
	@mkdir -p content data
	@if ! kind get clusters 2>/dev/null | grep -qx "$(CLUSTER)"; then \
		echo "→ creating kind cluster '$(CLUSTER)' (repo mounts: ./content RO, ./data RW)"; \
		sed "s|__REPO__|$(REPO_ROOT)|g" $(KIND_CONFIG) | kind create cluster --name $(CLUSTER) --config -; \
	else \
		echo "→ kind cluster '$(CLUSTER)' already exists"; \
	fi
	@$(MAKE) --no-print-directory secrets
	skaffold run -p local
	@echo "→ stack is up. Port-forwarding edge to http://localhost:8080 (Ctrl-C to stop)…"
	kubectl port-forward svc/ggd-edge 8080:8080

.PHONY: dev
dev:
	$(call need,docker,https://docs.docker.com/get-docker/)
	$(call need,kind,brew install kind)
	$(call need,skaffold,brew install skaffold)
	$(call need,helm,brew install helm)
	@kind get clusters 2>/dev/null | grep -qx "$(CLUSTER)" || { \
		echo "✗ kind cluster '$(CLUSTER)' not found — run 'make up' first"; exit 1; }
	@$(MAKE) --no-print-directory secrets
	skaffold dev -p local

.PHONY: down
down:
	$(call need,helm,brew install helm)
	@helm uninstall ggd 2>/dev/null || echo "→ release 'ggd' not installed"

.PHONY: nuke
nuke:
	$(call need,kind,brew install kind)
	kind delete cluster --name $(CLUSTER)

.PHONY: seed
seed:
	$(call need,kubectl,brew install kubectl)
	@# The seeder is its OWN binary (apps/platform/cmd/seed → /seed in the image);
	@# cmd/platform parses no flags. Idempotent: rebuilds the Redis hot layer
	@# from the data/ JSON truth. It does NOT touch the content whitelist.
	kubectl exec deploy/ggd-platform -- /seed

# Seed the Redis hot layer AND apply the demo starter whitelist — but only when
# no champion is enabled yet, so an operator's curation is never re-expanded.
# Safe to run on every install; a no-op on an already-curated one.
.PHONY: seed-starter
seed-starter:
	$(call need,kubectl,brew install kubectl)
	kubectl exec deploy/ggd-platform -- /seed -starter

# ---- demo starter whitelist ----------------------------------------------------
# A fresh install enables NOTHING (task #4: the whitelist is default-empty on
# purpose). This target is the one-liner that makes it playable, using only the
# existing admin API — no source change, no cluster required.
#
#   make seed-demo                       # localhost:60721, prompts for a token
#   make seed-demo TOKEN=… PLATFORM=…    # non-interactive / remote
#
# It UNIONS the curated bundle in (12 champions + 30 items + 60 abilities, see
# apps/platform/internal/curation/starter.go) and is audited as
# `curation.starter`. It never disables anything, and re-running is a no-op.
PLATFORM ?= http://127.0.0.1:60721
TOKEN    ?=

.PHONY: seed-demo
seed-demo:
	$(call need,curl,it ships with macOS/Linux — check your PATH)
	$(call need,jq,brew install jq)
	@tok="$(TOKEN)"; \
	if [ -z "$$tok" ]; then read -rsp "admin access token: " tok; echo; fi; \
	if [ -z "$$tok" ]; then echo "✗ no token given — aborting"; exit 1; fi; \
	echo "→ POST $(PLATFORM)/api/v1/curation/whitelist/starter"; \
	code=$$(curl -sS -o /tmp/ggd-seed-demo.json -w '%{http_code}' \
		-X POST "$(PLATFORM)/api/v1/curation/whitelist/starter" \
		-H "Authorization: Bearer $$tok" -H 'Content-Type: application/json' -d '{}'); \
	if [ "$$code" != "200" ]; then \
		echo "✗ HTTP $$code"; cat /tmp/ggd-seed-demo.json; echo; \
		echo "  401/403 → the token is not an admin token."; \
		exit 1; \
	fi; \
	jq '{champions:(.champions|length), items:(.items|length), abilities:(.abilities|length)}' /tmp/ggd-seed-demo.json; \
	echo "✓ demo starter set enabled — reload champ-select"

# Read-only: what is enabled right now?
.PHONY: whitelist
whitelist:
	$(call need,curl,it ships with macOS/Linux — check your PATH)
	$(call need,jq,brew install jq)
	@curl -sS "$(PLATFORM)/api/v1/curation/whitelist" | \
		jq '{champions:(.champions|length), items:(.items|length), abilities:(.abilities|length), updatedAt}'

.PHONY: logs
logs:
	$(call need,kubectl,brew install kubectl)
	kubectl logs -l app.kubernetes.io/part-of=ggd --all-containers --tail=100 -f

# ---- secrets (env-injected, never baked into images) ---------------------------
.PHONY: secrets
secrets:
	$(call need,openssl,it ships with macOS/Linux — check your PATH)
	@if [ ! -f $(SECRETS_FILE) ]; then \
		echo "→ generating $(SECRETS_FILE) (gitignored)"; \
		{ \
			echo "# generated by 'make secrets' — DO NOT COMMIT"; \
			echo "secrets:"; \
			echo "  jwtSigningSecret: $$(openssl rand -hex 32)"; \
			echo "  platformGameSharedSecret: $$(openssl rand -hex 32)"; \
			echo "  redisPassword: $$(openssl rand -hex 32)"; \
		} > $(SECRETS_FILE); \
	fi

# ---- tests ---------------------------------------------------------------------
.PHONY: test
test:
	$(call need,go,brew install go   # Go 1.23+)
	$(call need,pnpm,corepack enable && corepack prepare pnpm@9 --activate)
	@# Full run through the orchestrator: fixed category order, regression
	@# last, then the todo-check runtime gate as the final step.
	cd tools/testrunner && go run ./cmd/testrunner -once -mode all

.PHONY: todo-check
todo-check:
	$(call need,pnpm,corepack enable && corepack prepare pnpm@9 --activate)
	pnpm todo:check

# ---- convenience ----------------------------------------------------------------
.PHONY: helm-template
helm-template:
	$(call need,helm,brew install helm)
	helm template ggd deploy/helm/ggd -f deploy/helm/ggd/values-local.yaml

# nginx/nginx.conf is the source of truth; the helm chart ships a copy under
# files/ (charts cannot read outside their dir). infracheck fails on drift.
.PHONY: helm-sync-nginx
helm-sync-nginx:
	cp nginx/nginx.conf deploy/helm/ggd/files/nginx.conf
	cp nginx/dev/content-api.conf deploy/helm/ggd/files/content-api.dev.conf
	@echo "→ helm chart nginx copies refreshed"

# Task #102 — "can a device on the wifi reach a write surface?" is a question
# about SOCKETS, not about source, so it gets a probe against the running
# machine rather than only a unit test. Run it after ANY vite config change and
# after starting a dev server with --host; it is the check that would have
# caught the live hole. See docs/todo/admin.md § 內容管理.
.PHONY: lan-probe
lan-probe:
	./tools/lan-probe.sh

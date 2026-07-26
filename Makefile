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
#   make build-stamp print the build identity every image build is stamped with
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

# ---- BUILD IDENTITY (task #66, defect P0-6(a)) -------------------------------
# The client bakes this string into the bundle and the VersionBadge shows it at
# the bottom of every screen, so a screenshot names its build. The IMAGE cannot
# compute it: `.dockerignore` excludes `.git` and docker/edge.Dockerfile builds
# on node:22-alpine, which has no git. Asking git from inside the container is
# what made every image ever built say "dev" — a value plausible enough that
# nobody questioned it for months, while two different deploys were literally
# indistinguishable.
#
# So it is computed HERE, on the host, once, and EXPORTed — which is what makes
# it reach every build path at once: docker/compose.yaml and
# docker/compose.family.yaml interpolate `${GGD_BUILD_STAMP:-}` into their edge
# build args, and skaffold.yaml expands `{{.GGD_BUILD_STAMP}}`. Adding a new
# build path? Pass this variable, and add it to the guard test
# tools/testrunner/internal/infracheck/buildstamp_test.go.
#
# `-dirty` is part of the identity on purpose: the owner routinely builds from a
# modified tree, and two images off the same commit are otherwise one string.
GIT_SHA        := $(shell git rev-parse --short HEAD 2>/dev/null)
GIT_DIRTY      := $(shell test -n "$$(git status --porcelain --untracked-files=no 2>/dev/null)" && echo -dirty)
BUILD_DATE     := $(shell date -u +%Y-%m-%d)
export GGD_BUILD_STAMP ?= $(if $(GIT_SHA),$(GIT_SHA)$(GIT_DIRTY) $(BUILD_DATE),)

.PHONY: build-stamp
build-stamp:
	@if [ -z "$(GGD_BUILD_STAMP)" ]; then \
		echo "✗ no build stamp: git could not identify HEAD from $(REPO_ROOT)."; \
		echo "  Images built now will show UNSTAMPED-BUILD on the version badge."; \
		exit 1; \
	fi
	@echo "$(GGD_BUILD_STAMP)"

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

# =============================================================================
# FAMILY DEPLOY (task #176) — 家人同樂版：全開資源、密鑰硬化
#
#   make family-secrets        generate docker/.env with STRONG secrets (once)
#   make family-ship           manifest + verify the 84 MB asset overlay
#   make family-ship HOST=x    …and rsync it to a remote host, then verify THERE
#   make family-up             the ONE command: secrets → assets → build → up
#   make family-status         what is running, on which URL, at which tier
#   make family-down           stop (accounts, ladder and replays are KEPT)
#   make family-token          print the one-time owner-claim token
#   make family-admin-reset USER_NAME=<name>   reset an admin password on the host
#     (USER_NAME, not USER — `USER` is already set in every shell, so make would
#      silently reset whoever you are logged in as)
#   make opstate-export        snapshot HIS whitelist + combat-env → a bundle (laptop)
#   make family-restore        restore that bundle into the host platform (task #179)
#
# Full runbook (繁體中文): docs/family-deploy.md
# Operator-state migration: docs/runbooks/content-whitelist.md § operator-state
# =============================================================================

FAMILY_COMPOSE := -f docker/compose.yaml -f docker/compose.family.yaml
FAMILY_ENV     := docker/.env
OVERLAY_DIR    := data/blizzard-overlay
CURATION_DIR   := data/curation
ASSETS         := ./tools/deploy/ggd-assets.sh
# Where `make family-ship HOST=…` puts the shipped sets on the remote box.
REMOTE_ROOT    ?= /srv/ggd

# ---- secrets: ONE command, so he never invents his own ----------------------
# Idempotent by construction: an existing docker/.env is NEVER overwritten (it
# holds the secrets the running deploy's sessions and refresh tokens are signed
# with — regenerating them logs the whole family out).
.PHONY: family-secrets
family-secrets:
	$(call need,openssl,it ships with macOS and every Linux)
	@if [ -f $(FAMILY_ENV) ]; then \
		echo "→ $(FAMILY_ENV) already exists — keeping it (regenerating would invalidate every session)."; \
		echo "  To rotate deliberately: mv $(FAMILY_ENV) $(FAMILY_ENV).old && make family-secrets"; \
	else \
		umask 077; \
		{ \
		  echo "# docker/.env — generated by \`make family-secrets\` on $$(date -u +%Y-%m-%dT%H:%M:%SZ)."; \
		  echo "# gitignored. Every value below is 64 hex chars from openssl rand -hex 32."; \
		  echo "# The platform REFUSES TO BOOT on a networked bind if any of them is weak,"; \
		  echo "# empty or a known development value (apps/platform/internal/config)."; \
		  echo ""; \
		  echo "REDIS_PASSWORD=$$(openssl rand -hex 32)"; \
		  echo "JWT_SIGNING_SECRET=$$(openssl rand -hex 32)"; \
		  echo "PLATFORM_GAME_SHARED_SECRET=$$(openssl rand -hex 32)"; \
		  echo ""; \
		  echo "# Where the edge listens. 0.0.0.0 = reachable from the LAN/tunnel;"; \
		  echo "# 127.0.0.1 = this machine only. NOTHING ELSE is published off-loopback."; \
		  echo "GGD_BIND=0.0.0.0"; \
		  echo "GGD_PORT=8088"; \
		} > $(FAMILY_ENV); \
		chmod 600 $(FAMILY_ENV); \
		echo "✓ wrote $(FAMILY_ENV) (mode 600) with 3 strong secrets"; \
	fi

# ---- assets: the bytes git cannot carry -------------------------------------
# data/blizzard-overlay is 556 files / 87,403,869 B and is gitignored by
# .gitignore's `/data/**`. Without it 40 of 113 champions render as generic
# stand-ins and 97 of 113 are silent — with NOTHING logged. See
# docs/family-deploy.md and tools/deploy/ggd-assets.sh.
.PHONY: family-manifest
family-manifest:
	@test -d $(OVERLAY_DIR) || { echo "✗ $(OVERLAY_DIR) is missing on THIS machine — there is nothing to ship."; exit 1; }
	@$(ASSETS) manifest $(OVERLAY_DIR) blizzard-overlay
	@if [ -d $(CURATION_DIR) ]; then $(ASSETS) manifest $(CURATION_DIR) curation; fi

.PHONY: family-ship
family-ship: family-manifest
	@if [ -z "$(HOST)" ]; then \
		echo "→ local deploy: no copy needed, the compose overlay bind-mounts $(OVERLAY_DIR)."; \
		echo "→ verifying the source tree itself (deep: every content hash)…"; \
		$(ASSETS) verify $(OVERLAY_DIR) --deep; \
	else \
		command -v rsync >/dev/null || { echo "✗ rsync is required for HOST= shipping"; exit 1; }; \
		echo "→ shipping to $(HOST):$(REMOTE_ROOT) (incremental + resumable — re-run after an interruption)"; \
		ssh $(HOST) "mkdir -p $(REMOTE_ROOT)/blizzard-overlay $(REMOTE_ROOT)/curation"; \
		rsync -a --delete --partial --info=progress2 $(OVERLAY_DIR)/ $(HOST):$(REMOTE_ROOT)/blizzard-overlay/; \
		if [ -d $(CURATION_DIR) ]; then rsync -a --partial $(CURATION_DIR)/ $(HOST):$(REMOTE_ROOT)/curation/; fi; \
		echo "→ verifying WHAT ARRIVED (deep, on the remote host — not trusting rsync's opinion)…"; \
		scp -q $(ASSETS) $(HOST):$(REMOTE_ROOT)/ggd-assets.sh; \
		ssh $(HOST) "sh $(REMOTE_ROOT)/ggd-assets.sh verify $(REMOTE_ROOT)/blizzard-overlay --deep"; \
	fi

.PHONY: family-verify
family-verify:
	@$(ASSETS) verify $(OVERLAY_DIR) --deep

# ---- the one command --------------------------------------------------------
.PHONY: family-up
family-up:
	$(call need,docker,https://docs.docker.com/get-docker/  (and start the daemon))
	@docker info >/dev/null 2>&1 || { echo "✗ docker daemon is not running"; exit 1; }
	@# Create the replay sink on the HOST first so the bind mount inherits host
	@# ownership (a docker-created mount point can be root-owned on Linux and the
	@# game runs as an unprivileged user). Match recording (#175) writes here.
	@mkdir -p data/replays
	@$(MAKE) --no-print-directory family-secrets
	@$(MAKE) --no-print-directory family-ship
	@echo "→ building images (the client is built with VITE_GGD_FULL_ASSETS=1 — that flag is what makes the overlay actually load)"
	@# The badge on the deployed page is the ONLY way to answer "which build is
	@# this?" — print it here so the deploy log and the screenshot can be matched.
	@if [ -n "$(GGD_BUILD_STAMP)" ]; then \
		echo "→ build stamp: $(GGD_BUILD_STAMP)  (baked into the client bundle, shown bottom-centre)"; \
	else \
		echo "!! no git here: the version badge will read UNSTAMPED-BUILD and two deploys will be indistinguishable." >&2; \
	fi
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) build
	@echo "→ starting the datastore"
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) up -d redis
	@echo "→ seeding the starter roster into /data if nothing is enabled yet (idempotent)"
	@echo "   VIRGIN-HOST ORDER MATTERS: on a fresh host data/ holds only .gitkeep, so the"
	@echo "   platform's boot check would REFUSE to start player-facing with an empty whitelist."
	@echo "   Seeding runs in a THROWAWAY container (which does not run that check) so the roster"
	@echo "   exists in /data BEFORE the long-running platform asserts one — otherwise the deploy"
	@echo "   comes up DOWN and 'exec /seed' cannot reach a stopped container."
	@# --entrypoint /seed is REQUIRED: the platform image's ENTRYPOINT is /platform,
	@# so `run platform /seed -starter` would exec `/platform /seed -starter` — the
	@# SERVER (which ignores those args and then hits the empty-whitelist boot check
	@# and exits 1), seeding NOTHING. Override the entrypoint so the seeder runs.
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) run --rm -T --entrypoint /seed platform -starter
	@echo "→ bringing the full stack up (platform now boots with a non-empty whitelist and passes the boot check)"
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) up -d
	@echo "→ (optional) personalise: put HIS exact roster + combat-env on the host with  make family-restore"
	@$(MAKE) --no-print-directory family-status

.PHONY: family-status
family-status:
	@echo ""
	@docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) ps
	@echo ""
	@PORT=$$(grep -E '^GGD_PORT=' $(FAMILY_ENV) 2>/dev/null | cut -d= -f2); PORT=$${PORT:-8088}; \
	 IP=$$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $$1}'); \
	 echo "  遊戲網址   http://$${IP:-<this-host>}:$$PORT/"; \
	 echo "  後台管理   http://$${IP:-<this-host>}:$$PORT/admin/"; \
	 echo "  tier       family (全開資源)"
	@echo ""
	@echo "  一次性 owner 認領碼:  make family-token"
	@echo "  邀請碼:               後台管理 → 邀請碼 (#174)"

.PHONY: family-down
family-down:
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) down
	@echo "→ stopped. Accounts, ladder, replays and the redis volume are KEPT."
	@echo "  Next session: make family-up  (nothing is lost)"

.PHONY: family-logs
family-logs:
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) logs -f --tail=200

# ---- admin access on the host ----------------------------------------------
# Loopback auto-admin does NOT apply on a deployed box: it is a BUILD flag
# (import.meta.env.DEV), folded to false in the baked /admin/ bundle. These two
# targets are the whole recovery path.
.PHONY: family-token
family-token:
	@# The platform image is distroless (no shell, no `cat`), so `exec cat` can
	@# never work — it exits non-zero and the old `|| echo` fired even when the
	@# token DID exist, telling the owner (falsely) it was already claimed. Copy the
	@# file out through the docker API instead (`compose cp`, no in-container binary
	@# needed); it reads even a distroless container's filesystem.
	@tmp=$$(mktemp); \
	if docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) cp platform:/data/owner-setup-token "$$tmp" 2>/dev/null && [ -s "$$tmp" ]; then \
	  echo "一次性 owner 認領碼 (在 register 頁面填入以取得管理員身份):"; \
	  cat "$$tmp"; echo; \
	else \
	  echo "(沒有認領碼 — 平台可能還沒啟動，或 owner 帳號已被認領。)"; \
	  echo "  已被認領、要重設密碼:  make family-admin-reset USER_NAME=<你的管理員帳號>"; \
	fi; \
	rm -f "$$tmp"

.PHONY: family-admin-reset
family-admin-reset:
	@test -n "$(USER_NAME)" || { echo "usage: make family-admin-reset USER_NAME=<your admin username>"; exit 1; }
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) exec -T platform /ownerreset -username "$(USER_NAME)" -generate

# ---- operator-state migration (task #179) ----------------------------------
# The VERIFIED path for moving the owner's hand-curated content whitelist (and,
# if he ever sets one, the 戰鬥系統 combat-env override) between deploys. This is
# what carries HIS 48 champions — .gitignore excludes /data/**, so the whitelist
# never ships in git and a fresh host would otherwise serve an EMPTY champion
# select (the platform now REFUSES to boot player-facing in that state).
#
# Two directions, same file:
#   make opstate-export                       # on the laptop → BUNDLE (default ggd-operator-state.json)
#   make family-restore                       # on the host, into the running platform's /data
#   make family-restore FORCE=1               # ...even over newer host state (discards host edits)
#   make opstate-restore                      # laptop→laptop or into any DATA_DIR (needs Go)
#
# The bundle records "combat-env was never configured" as ABSENCE, and restore
# writes nothing for it — so a future content re-tune is never silently masked.
# It verifies every id against the target content tree and NAMES any that no
# longer exist; it is idempotent; it refuses to clobber newer host state unless
# FORCE=1. See docs/runbooks/content-whitelist.md § operator-state migration.
BUNDLE ?= ggd-operator-state.json

.PHONY: opstate-export
opstate-export:
	$(call need,go,brew install go   # Go 1.23+)
	go -C apps/platform run ./cmd/opstate export \
		-data $(abspath data) -content $(abspath content) -out $(abspath $(BUNDLE))

.PHONY: opstate-restore
opstate-restore:
	$(call need,go,brew install go   # Go 1.23+)
	@test -n "$(DATA)" || { echo "usage: make opstate-restore DATA=<target DATA_DIR> [BUNDLE=…] [FORCE=1]"; exit 1; }
	go -C apps/platform run ./cmd/opstate restore \
		-in $(abspath $(BUNDLE)) -data $(DATA) -content $(abspath content) $(if $(FORCE),-force,)

# Restore INTO the running family platform container. The bundle is streamed
# over stdin so the host filesystem is never touched, and /data + /srv/content
# are the same paths the server reads. `make family-up` already brings the host
# up PLAYABLE on the built-in demo roster (it seeds before the platform's boot
# check runs); this replaces that demo roster with HIS exact whitelist — and,
# if he ever configured one, his 戰鬥系統 override — and verifies every id against
# the host's content tree. A running platform picks the new whitelist up in ~5s.
.PHONY: family-restore
family-restore:
	@test -f $(BUNDLE) || { echo "✗ no bundle at $(BUNDLE) — export one on your laptop first: make opstate-export"; exit 1; }
	@echo "→ restoring operator state from $(BUNDLE) into the platform container"
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) exec -T platform \
		/opstate restore -in - -data /data -content /srv/content $(if $(FORCE),-force,) < $(BUNDLE)
	@echo "  (a running platform picks the new whitelist up within ~5s; no restart needed)"

# ---------------------------------------------------------------------------
# #243 資料搬遷 — the WHOLE platform data tree as one ZIP (無痛移機).
#
# NOT the same thing as opstate above, and the difference is the whole point:
#   opstate            = the operator's CHOICES (whitelist + combat-env). It
#                        deliberately refuses credentials, and family-restore
#                        stays pointed at it.
#   platformarchive    = accounts WITH PASSWORD HASHES, unredeemed invite codes,
#                        wallets, rankings, the content overlay. A migration.
#
# THE ARCHIVE IS A CREDENTIAL. Move it with scp or a USB stick, never email or
# chat, and delete both copies once the new host is up.
#
#   make archive-export                        # local DATA_DIR → ARCHIVE
#   make archive-inspect ARCHIVE=…             # what is in it (writes nothing)
#   make archive-plan  DATA=… ARCHIVE=…        # dry run against a target
#   make archive-apply DATA=… ARCHIVE=…        # write (auto-backs-up first)
#   make family-archive-export                 # HOST → a local ARCHIVE
#   make family-archive-apply ARCHIVE=…        # a local ARCHIVE → the HOST
# ---------------------------------------------------------------------------
ARCHIVE ?= ggd-platform-archive.zip
# GROUPS selects the optional data: matches,history,audit,replays (core always).
GROUPS  ?=

.PHONY: archive-export
archive-export:
	$(call need,go,brew install go   # Go 1.23+)
	go -C apps/platform run ./cmd/platformarchive export \
		-data $(abspath data) -content $(abspath content) -out $(abspath $(ARCHIVE)) $(if $(GROUPS),-groups $(GROUPS),)

.PHONY: archive-inspect
archive-inspect:
	$(call need,go,brew install go   # Go 1.23+)
	@test -f $(ARCHIVE) || { echo "✗ no archive at $(ARCHIVE)"; exit 1; }
	go -C apps/platform run ./cmd/platformarchive inspect -in $(abspath $(ARCHIVE))

.PHONY: archive-plan
archive-plan:
	$(call need,go,brew install go   # Go 1.23+)
	@test -n "$(DATA)" || { echo "usage: make archive-plan DATA=<target DATA_DIR> ARCHIVE=…"; exit 1; }
	go -C apps/platform run ./cmd/platformarchive plan \
		-in $(abspath $(ARCHIVE)) -data $(DATA) $(if $(GROUPS),-groups $(GROUPS),) \
		$(if $(OVERWRITE),-allow-overwrite,) $(if $(ADOPT),-resolve-collisions=adopt-archive,)

.PHONY: archive-apply
archive-apply:
	$(call need,go,brew install go   # Go 1.23+)
	@test -n "$(DATA)" || { echo "usage: make archive-apply DATA=<target DATA_DIR> ARCHIVE=…"; exit 1; }
	go -C apps/platform run ./cmd/platformarchive apply \
		-in $(abspath $(ARCHIVE)) -data $(DATA) -content $(abspath content) $(if $(GROUPS),-groups $(GROUPS),) \
		$(if $(OVERWRITE),-allow-overwrite,) $(if $(ADOPT),-resolve-collisions=adopt-archive,)

# Export FROM the running family platform. Streamed over stdout, so the host
# filesystem is never written to — same shape as family-restore's stdin.
.PHONY: family-archive-export
family-archive-export:
	@echo "→ exporting the platform data tree from the family host into $(ARCHIVE)"
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) exec -T platform \
		/platformarchive export -data /data -content /srv/content -out - $(if $(GROUPS),-groups $(GROUPS),) > $(ARCHIVE)
	@echo "  ⚠ $(ARCHIVE) contains PASSWORD HASHES and live invite codes. scp/USB only; delete it when done."

# Apply a LOCAL archive INTO the running family platform. THE documented first
# step on a brand-new host: run this BEFORE registering any account there, so
# there is no identity collision to resolve.
.PHONY: family-archive-apply
family-archive-apply:
	@test -f $(ARCHIVE) || { echo "✗ no archive at $(ARCHIVE) — export one first: make archive-export"; exit 1; }
	@echo "→ importing $(ARCHIVE) into the family platform container"
	docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) exec -T platform \
		/platformarchive apply -in - -data /data -content /srv/content \
		$(if $(GROUPS),-groups $(GROUPS),) $(if $(OVERWRITE),-allow-overwrite,) \
		$(if $(ADOPT),-resolve-collisions=adopt-archive,) < $(ARCHIVE)
	@echo "  now restart the platform so Redis rebuilds its indexes from the imported account JSON:"
	@echo "    docker compose $(FAMILY_COMPOSE) --env-file $(FAMILY_ENV) restart platform"

# docker/platform.Dockerfile — Go platform monolith (auth/friends/lobby/rooms/ranking).
#
# Contract (plan §3): Go module at apps/platform (go 1.25), binary entrypoint
# cmd/platform; serves :8080, health at /healthz; durable truth under DATA_DIR
# (mounted volume), content RO under CONTENT_DIR.
# Build context is the REPO ROOT: docker build -f docker/platform.Dockerfile .
#
# TWO binaries ship in this image:
#   /platform  the server (ENTRYPOINT)
#   /seed      the idempotent seeder (cmd/seed) run by the helm post-install
#              hook. `-starter` additionally applies the demo content whitelist
#              when — and only when — no champion is enabled yet.
# The server itself parses NO flags; the older `/platform --seed` contract was
# never implemented, so the hook Job must exec /seed.

FROM golang:1.25-alpine AS build
WORKDIR /src
# Dependency layer first for caching (go.sum may not exist on day one).
COPY apps/platform/go.mod apps/platform/go.su[m] ./
RUN go mod download
COPY apps/platform/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/platform ./cmd/platform \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

# Distroless static: no shell, no package manager, runs as nonroot (uid 65532).
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/platform /platform
COPY --from=build /out/seed /seed

# All configuration and secrets come from the environment (K8s ConfigMap +
# Secret / compose env). NOTHING secret is baked into this image (infra-09).
ENV APP_ENV=production \
    DATA_DIR=/data \
    CONTENT_DIR=/srv/content

EXPOSE 8080
USER nonroot
ENTRYPOINT ["/platform"]

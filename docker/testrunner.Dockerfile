# docker/testrunner.Dockerfile — DEV/CI-ONLY test orchestration service.
#
# The runner execs suites straight out of the repo (pnpm + go), so unlike the
# other images this one ships toolchains and expects the repo mounted at
# /repo. It refuses to start when APP_ENV=production and is only deployed when
# the Helm value test.enabled=true.
# Build context is the REPO ROOT: docker build -f docker/testrunner.Dockerfile .

# 1.25+: the copied toolchain must also run apps/platform suites (go 1.25).
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY tools/testrunner/go.mod tools/testrunner/go.sum ./
RUN go mod download
COPY tools/testrunner/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /out/testrunner ./cmd/testrunner

FROM node:22-alpine
RUN corepack enable && apk add --no-cache git
# Go toolchain so `go test` suites (platform, testrunner) can run in-container.
COPY --from=build /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"
COPY --from=build /out/testrunner /usr/local/bin/testrunner

# The repo (with node_modules installed) is expected at /repo:
#   docker run -v "$PWD":/repo -p 127.0.0.1:8799:8799 ggd-testrunner
WORKDIR /repo
EXPOSE 8799
ENTRYPOINT ["testrunner"]
# Inside a container/pod we must bind 0.0.0.0; the Service/port-forward is the
# access-control layer there, and the binary still refuses APP_ENV=production.
CMD ["-addr", "0.0.0.0:8799", "-root", "/repo"]

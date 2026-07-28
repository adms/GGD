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
# python3: NOT optional, and not a convenience. Two registered suites are driven
# by python from a vitest wrapper — `w3x-import-unit` (test/fixture_checks.py,
# stdlib-only) and `icon-gen-unit` (src/plan.py, src/generate.py). Without it
# `-mode all` in this image fails 23 tests and then the todo-gate fails another
# 50 beacons on top, so the container could never reproduce a host `make test`.
# That is the whole point of this image, so the interpreter belongs in it.
#
# ⚠️ The absence did NOT read as "python is missing". icon-gen's findPython()
# probes `["arch","-arm64","python3"]` for macOS/Rosetta, and on Linux `arch` is
# a real busybox applet that PRINTS THE MACHINE ARCH AND IGNORES ITS ARGUMENTS,
# exiting 0 — so the probe reported success and every python call returned
# "x86_64". The suite then failed on assertions about missing output. Fixing the
# image is what makes the diagnosis unnecessary; the false-positive probe itself
# is still worth hardening in tools/icon-gen/test/icon-gen.test.ts.
# py3-pillow from apk, NOT from pip: Pillow has C extensions, and building it
# from an sdist on musl would drag in the whole toolchain (zlib/jpeg/freetype
# headers + gcc) for one image.
RUN corepack enable && apk add --no-cache git python3 py3-pip py3-pillow
# The registered suites' python imports, censused across tools/w3x-import/**,
# tools/icon-gen/**, tools/reference/** and tools/status/**, are stdlib plus
# exactly three names: PIL (above), `mpyq` (below), and torch/diffusers — the
# last belong to the OFFLINE image-generation tools, which are not registered in
# suites.yaml and are never executed by `-mode all`, so they stay out.
#
# `mpyq` builds the synthetic .w3x MPQ archive in test/make_fixture.py. Without
# it all 18 w3x-import assertions fail on a missing PASS line rather than on the
# ModuleNotFoundError that caused it — the wrapper only reports which PASS lines
# it did not see, so the real error never reaches the report.
#
# --break-system-packages: alpine marks its python EXTERNALLY-MANAGED (PEP 668),
# and a venv would have to be re-activated by every suite the runner execs.
RUN pip install --no-cache-dir --break-system-packages mpyq
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

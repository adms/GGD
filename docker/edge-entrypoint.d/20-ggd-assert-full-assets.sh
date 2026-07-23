#!/bin/sh
# Runs from the stock nginx image's /docker-entrypoint.d/ BEFORE nginx starts.
# That entrypoint executes these under `set -e`, so exiting non-zero here stops
# the container from serving at all — which is the entire point.
#
# Task #176: a deploy that DECLARES itself full-asset (family tier) and is not
# must fail loudly at boot rather than quietly serve generic stand-ins for a
# third of the roster. The check itself lives in tools/deploy/ggd-assets.sh so
# the host-side `make family-ship` verification and this boot gate are the same
# code reading the same manifest.
#
# No-op unless /etc/nginx/ggd-tier/00-full-assets.geo.conf is present.
exec /usr/local/bin/ggd-assets.sh assert

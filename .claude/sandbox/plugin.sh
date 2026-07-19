#!/usr/bin/env bash
set -euo pipefail

# export LANGUAGE_VERSIONS="python-3.12.12"
# ${PLUGINS_DIR}/languages/python3.sh
# ${PLUGINS_DIR}/languages/react.sh

# # System packages: ffmpeg (audio pipeline) + the Cypress 14 runtime libraries.
# # node:22-slim is minimal, so Cypress's bundled Electron needs these explicitly.
# # xvfb/xauth provide the virtual display headless `cypress run` requires.
# apt-get update && apt-get install -y \
#   ffmpeg \
#   xvfb xauth \
#   libgtk2.0-0 libgtk-3-0 libgbm-dev libnotify-dev \
#   libnss3 libxss1 libasound2 libxtst6 \
#   && rm -rf /var/lib/apt/lists/*

# # Pre-cache the Cypress binary so the e2e suite never downloads it at test time.
# # Pin to the exact version in frontend/package-lock.json: if it drifts, the project's
# # cypress (^14) may resolve to a newer version whose binary isn't cached, forcing a
# # download on first run and defeating the point — bump this when the lockfile bumps.
# # This script runs as root (HOME=/root) but the tests run as the 'claude' user
# # (HOME=/home/claude), so install into claude's default cache dir and give it ownership.
# # Because that's claude's default location, no runtime CYPRESS_CACHE_FOLDER is needed.
# CYPRESS_VERSION=14.5.4
# export CYPRESS_CACHE_FOLDER=/home/claude/.cache/Cypress
# npm install -g "cypress@${CYPRESS_VERSION}"   # postinstall downloads the binary into the cache
# cypress verify
# chown -R claude:claude /home/claude/.cache

#!/usr/bin/env bash
#
# setup-memory.sh — run ONCE per laptop.
#
# Claude Code's auto-memory store lives at ~/.claude/projects/<slug>/memory,
# where <slug> is this checkout's absolute path with "/" replaced by "-"
# (e.g. /Users/you/Projects/d-mix -> -Users-you-Projects-d-mix). That dir is
# outside the repo, so memories don't sync across machines on their own.
#
# This script symlinks that per-machine store at the repo's checked-in
# .claude/memory/ directory, so the auto-memory the assistant reads/writes is
# the version-controlled one. Any pre-existing local store is backed up first,
# never deleted.
set -euo pipefail

# Repo's .claude dir = the directory this script lives in.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_MEMORY="$SCRIPT_DIR/memory"

# Slug = absolute repo path with "/" -> "-" (matches Claude Code's convention).
SLUG="${REPO_ROOT//\//-}"
STORE_DIR="$HOME/.claude/projects/$SLUG"
TARGET="$STORE_DIR/memory"

mkdir -p "$REPO_MEMORY" "$STORE_DIR"

# Already linked to the repo? Nothing to do.
if [ -L "$TARGET" ] && [ "$(readlink "$TARGET")" = "$REPO_MEMORY" ]; then
  echo "✓ auto-memory already linked: $TARGET -> $REPO_MEMORY"
  exit 0
fi

# A real (non-symlink) store already exists — back it up so nothing is lost.
if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
  BACKUP="$TARGET.local.bak.$(date +%Y%m%d%H%M%S)"
  mv "$TARGET" "$BACKUP"
  echo "• backed up existing local memory store -> $BACKUP"
  echo "  (copy any of those files into $REPO_MEMORY to version them)"
fi

# Replace a stale symlink if present, then link.
[ -L "$TARGET" ] && rm "$TARGET"
ln -s "$REPO_MEMORY" "$TARGET"
echo "✓ auto-memory linked: $TARGET -> $REPO_MEMORY"
echo "  memories are now read/written through the repo and sync via git."

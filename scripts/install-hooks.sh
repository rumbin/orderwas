#!/usr/bin/env bash
# Installs git hooks for local CI
set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK="$REPO_ROOT/.git/hooks/pre-commit"

echo "Installing pre-commit hook..."
cp "$REPO_ROOT/scripts/pre-commit" "$HOOK"
chmod +x "$HOOK"
echo "✓ Pre-commit hook installed at $HOOK"
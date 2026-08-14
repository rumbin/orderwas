#!/usr/bin/env bash
# Kill any lingering dev servers on the E2E ports
lsof -ti:3000 -ti:5173 2>/dev/null | xargs -r kill 2>/dev/null || true

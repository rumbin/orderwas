#!/usr/bin/env bash
set -e

echo "▶ Starting backend..."
cd "$(dirname "$0")/.."
npm -w server run dev &
SERVER_PID=$!

echo "▶ Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/health | grep -q '"ok"'; then
    echo "✓ Backend ready"
    break
  fi
  sleep 1
done

echo "▶ Starting frontend..."
npm -w client run dev &
CLIENT_PID=$!

echo "▶ Waiting for frontend..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 | grep -q 'root'; then
    echo "✓ Frontend ready"
    break
  fi
  sleep 1
done

echo "▶ Running E2E tests..."
npx playwright test --config e2e/playwright.config.ts
TEST_EXIT=$?

echo "▶ Cleaning up..."
kill $SERVER_PID $CLIENT_PID 2>/dev/null || true

exit $TEST_EXIT

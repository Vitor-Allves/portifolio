#!/usr/bin/env bash
# Runs every CRM test suite against a throwaway local Postgres database and a
# fake Meta API. Nothing here touches a real database or sends a real
# WhatsApp message. See tests/README.md.
#
#   tests/run.sh                 # all suites (expects a finished `npm run build`)
#   tests/run.sh campaigns-api   # one suite
#   CRM_TEST_SERVER=dev tests/run.sh   # use `next dev` instead of `next start`
set -euo pipefail
cd "$(dirname "$0")/.."

: "${TEST_DATABASE_URL:=postgresql://postgres@localhost:5432/crm_test}"
PORT="${CRM_TEST_PORT:-3100}"
MODE="${CRM_TEST_SERVER:-start}"
export FAKE_GRAPH_DIR="${FAKE_GRAPH_DIR:-$(mktemp -d)}"
export FAKE_GRAPH_PORT="${FAKE_GRAPH_PORT:-3199}"
export CRM_TEST_BASE="http://localhost:${PORT}"
export DATABASE_URL="$TEST_DATABASE_URL"
# Test-only: signs sessions and encrypts the fixture Administrador's 2FA secret (seeds need it too).
export ANALYTICS_SESSION_SECRET="test-only-session-secret-0123456789abcdef"
LOGS="${CRM_TEST_LOGS:-$FAKE_GRAPH_DIR}"
mkdir -p "$LOGS"

case "$TEST_DATABASE_URL" in
  *localhost* | *127.0.0.1*) ;;
  *) echo "TEST_DATABASE_URL must point at a local database" >&2; exit 1 ;;
esac

SERVER_PID=""
GRAPH_PID=""
stop() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$GRAPH_PID" ] && kill "$GRAPH_PID" 2>/dev/null || true
  SERVER_PID=""
  GRAPH_PID=""
  sleep 1
}
trap stop EXIT

# Empty database + fixtures ($@ = fixture names in tests/fixtures/seed-*.ts).
reset_db() {
  node tests/lib/reset-db.mjs
  for seed in "$@"; do npx tsx "tests/fixtures/seed-${seed}.ts"; done
}

# Fresh app server (the login rate limit lives in memory, so each suite gets its own).
start_server() {
  stop
  rm -f "$FAKE_GRAPH_DIR"/sent.jsonl "$FAKE_GRAPH_DIR"/ratelimit
  node tests/fixtures/fake-graph.mjs > "$LOGS/fake-graph.log" 2>&1 &
  GRAPH_PID=$!
  local cmd=(./node_modules/.bin/next start -p "$PORT")
  [ "$MODE" = "dev" ] && cmd=(./node_modules/.bin/next dev --webpack -p "$PORT")
  ANALYTICS_SESSION_SECRET="test-only-session-secret-0123456789abcdef" \
  WHATSAPP_APP_SECRET="local-app-secret" \
  WHATSAPP_WEBHOOK_VERIFY_TOKEN="local-verify" \
  WHATSAPP_ACCESS_TOKEN="fake-token" \
  WHATSAPP_PHONE_NUMBER_ID="000000" \
  WHATSAPP_BUSINESS_ACCOUNT_ID="waba-test" \
  WHATSAPP_GRAPH_BASE_URL="http://localhost:${FAKE_GRAPH_PORT}" \
  CRON_SECRET="${CRON_SECRET_FOR_TEST:-}" \
    "${cmd[@]}" > "$LOGS/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 120); do
    curl -s -o /dev/null "http://localhost:${PORT}/intelligence/login/" && return 0
    sleep 1
  done
  echo "server did not start; see $LOGS/server.log" >&2
  exit 1
}

run_suite() {
  local name="$1"
  echo
  echo "=== $name ==="
  case "$name" in
    schema) node tests/suites/schema.test.mjs ;;
    dashboard-data) reset_db base && npx tsx tests/suites/dashboard-data.test.ts ;;
    dashboard-e2e) reset_db base && start_server && node tests/suites/dashboard.e2e.mjs ;;
    campaigns-api) reset_db base campaigns && start_server && node tests/suites/campaigns.api.mjs ;;
    campaigns-e2e) reset_db base campaigns && start_server && node tests/suites/campaigns.e2e.mjs ;;
    regression) reset_db base campaigns && start_server && node tests/suites/regression.e2e.mjs ;;
    catalog-api) reset_db base campaigns && start_server && node tests/suites/catalog.api.mjs ;;
    catalog-e2e) reset_db base campaigns && start_server && node tests/suites/catalog.e2e.mjs ;;
    fields-api) reset_db base campaigns && start_server && npx tsx tests/suites/fields.api.mjs ;;
    fields-e2e) reset_db base campaigns && start_server && node tests/suites/fields.e2e.mjs ;;
    team-api) reset_db base campaigns && start_server && npx tsx tests/suites/team.api.mjs ;;
    team-e2e) reset_db base campaigns && start_server && node tests/suites/team.e2e.mjs ;;
    access-api) reset_db base campaigns && start_server && node tests/suites/access.api.mjs ;;
    access-e2e) reset_db base campaigns && start_server && node tests/suites/access.e2e.mjs ;;
    tasks-api) reset_db base campaigns && start_server && node tests/suites/tasks.api.mjs ;;
    tasks-e2e) reset_db base campaigns && start_server && node tests/suites/tasks.e2e.mjs ;;
    # The daily check needs CRON_SECRET; only these suites start the server with one (test-only value).
    automations-api) local CRON_SECRET_FOR_TEST="test-only-cron-secret"; reset_db base campaigns && start_server && node tests/suites/automations.api.mjs ;;
    automations-e2e) reset_db base campaigns && start_server && node tests/suites/automations.e2e.mjs ;;
    *) echo "unknown suite: $name" >&2; exit 1 ;;
  esac
}

SUITES=("$@")
[ ${#SUITES[@]} -eq 0 ] && SUITES=(schema dashboard-data dashboard-e2e campaigns-api campaigns-e2e catalog-api catalog-e2e fields-api fields-e2e team-api team-e2e access-api access-e2e tasks-api tasks-e2e automations-api automations-e2e regression)
for s in "${SUITES[@]}"; do run_suite "$s"; done
echo
echo "ALL SUITES PASSED (${SUITES[*]})"

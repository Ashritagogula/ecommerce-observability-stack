#!/usr/bin/env bash
#
# Automated verification script for the E-commerce Observability Stack.
#
# Checks:
#   1. The API responds with HTTP 200 on its root/health endpoint.
#   2. The /metrics endpoint exposes http_requests_total, orders_created_total,
#      and payment_failures_total.
#
# Exit codes: 0 = all checks passed, 1 = one or more checks failed.

set -uo pipefail

API_HOST="${API_HOST:-localhost}"
API_PORT="${API_PORT:-8080}"
API_URL="http://${API_HOST}:${API_PORT}"

FAIL=0

echo "=== Verifying E-commerce Observability Stack ==="
echo "Target: ${API_URL}"
echo

# --- 1. API health check -------------------------------------------------
echo "[1/2] Checking API responds with HTTP 200 on ${API_URL}/ ..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/" || echo "000")

if [ "$STATUS" = "200" ]; then
  echo "  PASS: API responded with HTTP 200"
else
  echo "  FAIL: API did not respond with HTTP 200 (got: ${STATUS})"
  FAIL=1
fi
echo

# --- 2. /metrics endpoint content check -----------------------------------
echo "[2/2] Checking ${API_URL}/metrics for required Prometheus metrics ..."
METRICS=$(curl -s --max-time 10 "${API_URL}/metrics" || echo "")

if [ -z "$METRICS" ]; then
  echo "  FAIL: /metrics endpoint returned no content"
  FAIL=1
else
  if echo "$METRICS" | grep -q "http_requests_total"; then
    echo "  PASS: http_requests_total present"
  else
    echo "  FAIL: http_requests_total missing from /metrics output"
    FAIL=1
  fi

  if echo "$METRICS" | grep -q "orders_created_total"; then
    echo "  PASS: orders_created_total present"
  else
    echo "  FAIL: orders_created_total missing from /metrics output"
    FAIL=1
  fi

  if echo "$METRICS" | grep -q "payment_failures_total"; then
    echo "  PASS: payment_failures_total present"
  else
    echo "  FAIL: payment_failures_total missing from /metrics output"
    FAIL=1
  fi

  if echo "$METRICS" | grep -q "http_request_duration_seconds"; then
    echo "  PASS: http_request_duration_seconds present"
  else
    echo "  FAIL: http_request_duration_seconds missing from /metrics output"
    FAIL=1
  fi
fi
echo

if [ "$FAIL" -eq 0 ]; then
  echo "=== All checks passed. ==="
  exit 0
else
  echo "=== One or more checks failed. ==="
  exit 1
fi

#!/usr/bin/env bash
#
# Simple load generator for local testing/demo purposes.
#
# Sends a steady stream of order-creation and lookup requests to the API so
# that Prometheus, Grafana, and Jaeger have meaningful data to display.
#
# Usage:
#   bash tests/load_test.sh [duration_seconds] [requests_per_second]
#
# Example:
#   bash tests/load_test.sh 120 10   # 120s at ~10 req/s

set -uo pipefail

API_HOST="${API_HOST:-localhost}"
API_PORT="${API_PORT:-8080}"
API_URL="http://${API_HOST}:${API_PORT}"

DURATION="${1:-60}"
RATE="${2:-5}"

ITEMS=("Wireless Mouse" "Mechanical Keyboard" "USB-C Hub" "Laptop Stand" "27in Monitor" "Noise Cancelling Headphones")

END_TIME=$(( $(date +%s) + DURATION ))
SLEEP_INTERVAL=$(awk "BEGIN { print 1.0 / ${RATE} }")

echo "Load-testing ${API_URL} for ${DURATION}s at ~${RATE} req/s ..."

COUNT=0
while [ "$(date +%s)" -lt "$END_TIME" ]; do
  ITEM="${ITEMS[$((RANDOM % ${#ITEMS[@]}))]}"
  AMOUNT=$(( (RANDOM % 20000 + 500) ))
  AMOUNT_DOLLARS=$(awk "BEGIN { printf \"%.2f\", ${AMOUNT}/100 }")

  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/orders" \
    -H "Content-Type: application/json" \
    -d "{\"item\": \"${ITEM}\", \"quantity\": 1, \"amount\": ${AMOUNT_DOLLARS}}")

  COUNT=$((COUNT + 1))
  if [ $((COUNT % 20)) -eq 0 ]; then
    echo "  ... ${COUNT} requests sent (last status: ${RESPONSE})"
  fi

  sleep "$SLEEP_INTERVAL"
done

echo "Load test complete. Sent ${COUNT} requests."

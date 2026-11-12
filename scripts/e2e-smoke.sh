#!/usr/bin/env bash
# End-to-end smoke test against the live site: logs in as the owner, then walks
# every read-only admin surface plus the public storefront, reporting status and
# latency. No writes — nothing here can change shop data.
set -u

B="${1:-https://www.cakestyles.in}"
EMAIL="${2:-owner@cakestyles.test}"
PASS="${3:-Cakestyles@123}"

TOKEN=$(curl -s -X POST "$B/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" --max-time 60 \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then echo "LOGIN FAILED"; exit 1; fi
echo "login OK"

hit() {
  local path="$1"; shift
  local out
  out=$(curl -s -o /tmp/e2e-body -w "%{http_code} %{time_starttransfer} %{size_download}" \
    --max-time 90 -H "Authorization: Bearer $TOKEN" "$@" "$B$path")
  local code=$(echo "$out" | cut -d' ' -f1)
  local ttfb=$(echo "$out" | cut -d' ' -f2)
  local size=$(echo "$out" | cut -d' ' -f3)
  local note=""
  if [ "$code" != "200" ] && [ "$code" != "201" ]; then
    note=" :: $(head -c 120 /tmp/e2e-body | tr -d '\n')"
  fi
  printf "%-6s %7.2fs %8s B  %s%s\n" "$code" "$ttfb" "$size" "$path" "$note"
}

echo "--- public storefront"
hit "/api/health"
hit "/api/settings/public"
hit "/api/categories"
hit "/api/products"
hit "/api/products?bestsellers=1&limit=8"

echo "--- auth / session"
hit "/api/auth/me"

echo "--- admin reads"
hit "/api/dashboard"
hit "/api/orders"
hit "/api/products/admin"
hit "/api/categories?all=1"
hit "/api/customers"
hit "/api/customers/summary"
hit "/api/invoices"
hit "/api/expenses"
hit "/api/enquiries"
hit "/api/settings"
hit "/api/users"
hit "/api/audit"
hit "/api/tasks"
hit "/api/crm/overview"
hit "/api/crm/segments"
hit "/api/crm/important-dates"
hit "/api/campaigns"

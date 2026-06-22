#!/usr/bin/env bash
# mcp/webrief-server/test/smoke-oauth.sh
# End-to-end smoke test for the OAuth flow against a local backend.
# Requires: curl, jq, python3, openssl.
# Run from repo root: ./mcp/webrief-server/test/smoke-oauth.sh
# Exits 0 on success, non-zero on any failure.

set -euo pipefail

BACKEND="${BACKEND:-http://localhost:3000}"
RESOURCE="${RESOURCE:-http://localhost:3000/api/mcp}"

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[34m%s\033[0m\n" "$*"; }

blue "=== 1. well-known/oauth-protected-resource ==="
curl -fsS "$BACKEND/.well-known/oauth-protected-resource" | jq .

blue "=== 2. well-known/oauth-authorization-server ==="
META=$(curl -fsS "$BACKEND/.well-known/oauth-authorization-server")
echo "$META" | jq .
echo "$META" | jq -e '.code_challenge_methods_supported | contains(["S256"])' >/dev/null || { red "FAIL: S256 missing"; exit 1; }

blue "=== 3. POST /oauth/register (Dynamic Client Registration) ==="
DCR=$(curl -fsS -X POST "$BACKEND/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Smoke Test","redirect_uris":["http://localhost:33421/callback"]}')
echo "$DCR" | jq .
CLIENT_ID=$(echo "$DCR" | jq -r .client_id)
[[ "$CLIENT_ID" == mcpc_* ]] || { red "FAIL: client_id missing or wrong prefix"; exit 1; }
green "client_id = $CLIENT_ID"

blue "=== 4. PKCE pair ==="
VERIFIER=$(openssl rand -base64 64 | tr -d '=+/' | tr -d '\n' | cut -c1-64)
CHALLENGE=$(printf "%s" "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 | tr -d '=' | tr '+/' '-_')
echo "verifier  = $VERIFIER"
echo "challenge = $CHALLENGE"

blue "=== 5. WWW-Authenticate header on /api/mcp 401 ==="
HEADER=$(curl -sS -X POST "$BACKEND/api/mcp" -H "Content-Type: application/json" -d '{}' -D - -o /dev/null | grep -i www-authenticate || true)
[[ -n "$HEADER" ]] || { red "FAIL: no WWW-Authenticate header"; exit 1; }
echo "$HEADER"
echo "$HEADER" | grep -q "resource_metadata=" || { red "FAIL: header missing resource_metadata"; exit 1; }
echo "$HEADER" | grep -q "scope=\"mcp:full\"" || { red "FAIL: header missing scope"; exit 1; }

blue "=== 6. Invalid token returns 401 ==="
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$BACKEND/api/auth/me" -H "Authorization: Bearer at_invalid")
[[ "$STATUS" == "401" ]] || { red "FAIL: expected 401 got $STATUS"; exit 1; }
green "at_invalid -> 401 ✓"

blue "=== 7. Negative DCR: reject evil.com ==="
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BACKEND/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Bad","redirect_uris":["https://evil.example.com/cb"]}')
[[ "$STATUS" == "400" ]] || { red "FAIL: expected 400 got $STATUS"; exit 1; }
green "evil redirect -> 400 ✓"

blue "=== 8. Token endpoint rejects missing grant_type ==="
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BACKEND/oauth/token" -d 'foo=bar')
[[ "$STATUS" == "400" ]] || { red "FAIL: expected 400 got $STATUS"; exit 1; }
green "missing grant_type -> 400 ✓"

blue "=== 9. Revocation always 200 ==="
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BACKEND/oauth/revoke" -d 'token=rt_nonexistent')
[[ "$STATUS" == "200" ]] || { red "FAIL: expected 200 got $STATUS"; exit 1; }
green "revoke nonexistent -> 200 ✓"

green "============================================"
green "  All smoke checks passed (1-9)."
green "  Steps 10-12 (full code -> token -> mcp call) require a logged-in"
green "  user session; they're covered by manual Claude Desktop testing."
green "============================================"

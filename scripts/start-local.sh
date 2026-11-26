#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
network=marketme-loopback
if ! docker network inspect "$network" >/dev/null 2>&1; then
  docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 "$network" >/dev/null
fi
binding=$(docker network inspect --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}' "$network")
if [[ "$binding" != 127.0.0.1 ]]; then
  echo 'The local Supabase network must publish ports on 127.0.0.1.' >&2
  exit 1
fi
# The CLI includes local credentials in its startup summary.
if ! node_modules/.bin/supabase start --network-id "$network" >/dev/null 2>&1; then
  echo 'Local Supabase failed to start. Check Docker and the local Supabase configuration.' >&2
  exit 1
fi
ports=$(docker ps --filter 'label=com.supabase.cli.project=marketme' --format '{{.Ports}}')
if [[ -z "$ports" || "$ports" =~ (0\.0\.0\.0|\[::\]): || ! "$ports" =~ 127\.0\.0\.1:54321- ]]; then
  echo 'Unexpected Supabase port bindings. Stop the existing local stack and start it with npm run db:start.' >&2
  exit 1
fi
# Kong's default access log records complete signed Storage URLs. The Docker
# logger and the optional analytics collector both receive that output.
docker exec supabase_kong_marketme sh -ec '
  cd /usr/local/kong
  for log in access.log admin_access.log error.log email_templates_access.log; do
    ln -sfn /dev/null "logs/$log"
  done
  nginx -p /usr/local/kong -c nginx.conf -s reopen
'
echo 'Local Supabase is listening on 127.0.0.1 with gateway request logging disabled.'

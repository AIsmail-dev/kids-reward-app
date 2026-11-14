#!/bin/sh
# Builds and (re)starts the production kids-reward-app on this Mac in Docker (Colima), database included:
#   kids-db    Supabase Postgres (pg_cron, pg_net); data in the `kids-db-data` volume; 127.0.0.1:55432 for admin
#   kids-rest  PostgREST, reachable only from kids-web
#   kids-web   frontend + api/*.js, proxies /rest/v1 to kids-rest; 127.0.0.1:8082
#   kids-psn   PlayStation Family bridge (docker/psn/), reachable only from kids-web; PSN login in
#              the `kids-playstation` volume
# Caddy (~/Projects/home-proxy) serves kids-web as http://kids.lan and, through Tailscale Funnel,
# https://ahmeds-macbook-pro.tail712747.ts.net. Development (npm run dev, 5173) is http://dev.kids.lan.
#   Deploy / update: ./deploy.sh        (data from the cloud project: scripts/migrate-cloud-to-local.sh)
#   Logs: docker logs -f kids-web  (or kids-rest, kids-db)
#   SQL:  docker exec -it kids-db psql -U postgres
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"
DB_IMAGE=public.ecr.aws/supabase/postgres:17.6.1.165
REST_IMAGE=public.ecr.aws/supabase/postgrest:v16.1

# .env.docker (gitignored) is generated once. Keep it: the database's passwords are set from it on
# first start only, and every issued login token is signed with its JWT secret.
if [ ! -f .env.docker ]; then
  docker run --rm -v "$PWD/scripts:/s:ro" node:22-alpine node /s/gen-prod-secrets.mjs > .env.docker
  chmod 600 .env.docker
fi
set -a; . ./.env.docker; set +a

docker network inspect kids-prod >/dev/null 2>&1 || docker network create kids-prod >/dev/null

if ! docker container inspect kids-db >/dev/null 2>&1; then
  docker run -d --name kids-db --network kids-prod --restart unless-stopped \
    -p 127.0.0.1:55432:5432 \
    -v kids-db-data:/var/lib/postgresql/data \
    -v "$PWD/docker/db-init.sql:/docker-entrypoint-initdb.d/init-scripts/99-kids-init.sql:ro" \
    -e POSTGRES_PASSWORD -e POSTGRES_HOST=/var/run/postgresql \
    -e JWT_SECRET="$SUPABASE_JWT_SECRET" -e TZ=Asia/Riyadh \
    "$DB_IMAGE" >/dev/null
fi
# TCP only opens once first-start initialisation (init scripts, Supabase migrations) has finished.
until docker exec kids-db pg_isready -h localhost -q; do sleep 2; done

if ! docker container inspect kids-rest >/dev/null 2>&1; then
  docker run -d --name kids-rest --network kids-prod --restart unless-stopped \
    -e PGRST_DB_URI="postgres://authenticator:$POSTGRES_PASSWORD@kids-db:5432/postgres" \
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
    -e PGRST_DB_ANON_ROLE=anon -e PGRST_DB_MAX_ROWS=1000 -e PGRST_DB_USE_LEGACY_GUCS=false \
    -e PGRST_JWT_SECRET="$SUPABASE_JWT_SECRET" \
    "$REST_IMAGE" >/dev/null
fi

# PlayStation time (api/playstation.js): no published port, only kids-web calls it.
docker build -q -t kids-psn:latest docker/psn >/dev/null
docker rm -f kids-psn 2>/dev/null || true
docker run -d --name kids-psn --network kids-prod --restart unless-stopped \
  -v kids-playstation:/data -e TZ=Asia/Riyadh \
  kids-psn:latest >/dev/null

docker build -t kids-web:latest --build-arg VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" .
docker rm -f kids-web 2>/dev/null || true
# Loopback only: other devices go through Caddy.
docker run -d --name kids-web --network kids-prod --restart unless-stopped \
  -p 127.0.0.1:8082:8080 \
  -e VITE_SUPABASE_URL=http://localhost:8080 -e REST_UPSTREAM=http://kids-rest:3000 \
  -e SUPABASE_SERVICE_ROLE_KEY -e SUPABASE_JWT_SECRET \
  -v kids-familylink:/data -e FAMILYLINK_DATA_DIR=/data -e FAMILYLINK_AUTH_USER \
  -e PSN_SERVICE_URL=http://kids-psn:8090 \
  kids-web:latest >/dev/null

# Scheduled jobs (daily tasks, prayer reminders) call kids-web from inside the database.
docker exec -i kids-db psql -q -U postgres -v ON_ERROR_STOP=1 < docker/prod-cron.sql
echo "kids-web is up on http://127.0.0.1:8082"

# App image for the Docker production stack on the home Mac (see deploy.sh): the built frontend
# plus api/*.js, served by scripts/dev-api-server.mjs, which also proxies /rest/v1 to PostgREST.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# No VITE_SUPABASE_URL: the page talks to the address it was loaded from (src/supabaseClient.js).
ARG VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_ANON_KEY" && npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY api ./api
COPY scripts/dev-api-server.mjs ./scripts/
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production DEV_API_PORT=8080 STATIC_DIR=/app/dist TZ=Asia/Riyadh
EXPOSE 8080
CMD ["node", "scripts/dev-api-server.mjs"]

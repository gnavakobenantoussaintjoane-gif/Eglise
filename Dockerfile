# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Étape 1 — compilation : installe toutes les dépendances, compile l'API et
# construit l'interface, puis ne conserve que les dépendances de production.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV npm_config_fund=false \
    npm_config_audit=false \
    npm_config_update_notifier=false

# Les manifestes seuls d'abord : la couche `npm ci` reste en cache tant que
# les dépendances ne changent pas.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

# Sources, puis build des deux workspaces (manifestes compris).
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------------------------------------------------------------------------
# Étape 2 — exécution : uniquement le code compilé et les dépendances de
# production. L'API sert aussi `frontend/dist` (déploiement mono-service).
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    API_PREFIX=/api/v1 \
    PGLITE_DATA_DIR=/data/pglite \
    STORAGE_LOCAL_DIR=/data/uploads

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/supabase ./supabase

# Données persistantes (uploads, éventuelle base PGlite) : monter un volume.
RUN mkdir -p /data/uploads /data/pglite && chown -R node:node /data /app
VOLUME ["/data"]

USER node

EXPOSE 4000

# `fetch` est disponible nativement à partir de Node 18 : pas de curl dans
# l'image slim.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+(process.env.API_PREFIX||'/api/v1')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/dist/server.js"]

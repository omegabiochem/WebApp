# syntax = docker/dockerfile:1

# --- Build stage (Debian/glibc) ---
FROM node:20-slim AS build
WORKDIR /app

# Make sure openssl exists (good practice for Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# 1) deps
COPY package*.json ./
RUN npm ci

# 2) prisma client
COPY prisma ./prisma
RUN npx prisma generate

# 3) source & build
COPY . .
RUN npm run build

# 4) keep only prod deps
RUN npm prune --omit=dev

# 5) copy compiled output AS-IS
RUN set -eux; \
    mkdir -p /out; \
    cp -r /app/dist/* /out/; \
    echo "---- Copied /app/dist -> /out ----"; ls -lah /out; \
    # sanity: ensure one of these entrypoints exists
    if [ ! -f /out/main.js ] && [ ! -f /out/src/main.js ] && [ ! -f /out/apps/api/main.js ]; then \
      echo "❌ No bootstrap found under /out"; ls -R /out || true; exit 1; \
    fi

# --- Run stage (Debian/glibc) ---
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# optional but fine
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# where the Fly volume will be mounted
RUN mkdir -p /data/uploads

# copy runtime deps + artifacts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /out ./dist

EXPOSE 3000

# Auto-detect compiled entrypoint (dist/main.js | dist/src/main.js | dist/apps/api/main.js)
# CMD ["sh","-lc","for f in dist/main.js dist/src/main.js dist/apps/api/main.js; do if [ -f \"$f\" ]; then echo \"Starting $f\"; exec node \"$f\"; fi; done; echo '❌ No bootstrap found under dist/'; ls -R dist; exit 1"]
CMD ["npm", "run", "start:prod"]

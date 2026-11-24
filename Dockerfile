# syntax=docker/dockerfile:1.7

# --- Build stage: install all dependencies and produce the Vite bundle -------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# --- Runtime stage: production dependencies + server sources only -------------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    CADENCE_DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY tsconfig.json server.ts ./
COPY server ./server
COPY src/types ./src/types
COPY src/utils ./src/utils
COPY src/data ./src/data

# Run as the unprivileged node user; the data volume stays writable by it.
RUN mkdir -p /app/data/uploads && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "--import", "tsx", "server.ts"]

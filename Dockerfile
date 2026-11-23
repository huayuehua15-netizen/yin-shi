FROM node:22-alpine AS base

WORKDIR /app

# Install dependencies cleanly (uses npm ci when package-lock.json is present)
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy application source and build the frontend bundle
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV CADENCE_DATA_DIR=/app/data

RUN mkdir -p /app/data/uploads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]

# ─── Stage 1: Build ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and prisma schema
COPY tsconfig.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY src ./src/

# Generate Prisma client
RUN npx prisma generate

# Compile TypeScript
RUN npx tsc --outDir dist

# ─── Stage 2: Production ────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Only copy what's needed to run
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled JS, prisma schema, and generated client
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/generated ./dist/generated/

# Create directory for SQLite data (will be mounted as volume)
RUN mkdir -p /app/data

# Default env vars (override via docker-compose or -e flags)
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/app/data/noc.db

# OpenTelemetry auto-instrumentation
ENV OTEL_TRACES_EXPORTER="otlp"
ENV OTEL_METRICS_EXPORTER="otlp"
ENV OTEL_NODE_RESOURCE_DETECTORS="env,host,os"
ENV OTEL_NODE_DISABLED_INSTRUMENTATIONS="fs,dns,net"
ENV OTEL_SERVICE_NAME="workflow-agent"
ENV NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"

# OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS
# should be set via docker-compose env_file or environment variables

# Push schema to create tables on first run, then start app
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]

EXPOSE 3000

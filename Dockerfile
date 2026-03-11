FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY src ./src/

RUN npx prisma generate

RUN npx tsc --outDir dist

FROM node:20-alpine AS production

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/generated ./dist/generated/

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/app/data/noc.db
ENV OTEL_TRACES_EXPORTER="otlp"
ENV OTEL_METRICS_EXPORTER="otlp"
ENV OTEL_NODE_RESOURCE_DETECTORS="env,host,os"
ENV OTEL_NODE_DISABLED_INSTRUMENTATIONS="fs,dns,net"
ENV OTEL_SERVICE_NAME="workflow-agent"
ENV NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"

CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]

EXPOSE 3000

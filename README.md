# Workflow Agent

NOC Automation Server — receives OpManager webhooks, filters alerts by rules, correlates into incidents, and creates tickets in ServiceDesk Plus.

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
npm install
npx prisma generate
npx prisma db push
```

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
SERVICEDESK_BASE_URL=https://localhost:5000
SERVICEDESK_API_KEY=your-api-key
OPMANAGER_BASE_URL=http://localhost:8060
OPMANAGER_API_KEY=your-api-key
DRY_RUN=false
CORRELATION_WINDOW_MINUTES=5
DATABASE_URL="file:./dev.db"
```

## Run (Development)

```bash
npm run dev
```

## Run with OpenTelemetry Auto-Instrumentation

Set up the following environment variables before starting the app:

```bash
export OTEL_TRACES_EXPORTER="otlp"
export OTEL_METRICS_EXPORTER="otlp"
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.kloudmate.com:4318"
export OTEL_EXPORTER_OTLP_HEADERS="authorization=YOUR_PRIVATE_KEY"
export OTEL_NODE_RESOURCE_DETECTORS="env,host,os"
export OTEL_NODE_DISABLED_INSTRUMENTATIONS="fs,dns,net"
export OTEL_SERVICE_NAME="workflow-agent"
export NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"
```

Then run the application:

```bash
npm run dev
```

## Run with Docker

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

To enable OpenTelemetry in Docker, add to `docker-compose.yml` environment:

```yaml
environment:
  - OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.kloudmate.com:4318
  - OTEL_EXPORTER_OTLP_HEADERS=authorization=YOUR_PRIVATE_KEY
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/opmanager` | Receive OpManager alarm webhooks |
| GET | `/api/rules` | List all filter rules |
| POST | `/api/rules` | Create a new filter rule |
| PUT | `/api/rules/:id` | Update a filter rule |
| DELETE | `/api/rules/:id` | Delete a filter rule |
| GET | `/api/dashboard/stats` | Overview metrics |
| GET | `/api/dashboard/alerts` | Recent alerts |
| GET | `/api/dashboard/incidents` | Active incidents |
| GET | `/api/dashboard/tickets` | Recent tickets |
| GET | `/api/dashboard/audit-logs` | Audit trail |
| GET | `/health` | Health check |
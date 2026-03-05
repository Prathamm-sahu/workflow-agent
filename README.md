# Workflow Agent

Filter Rule

{
  name: "Critical Alerts → Create Ticket (High Priority)",
  enabled: true,
  conditions: [
    { field: "severity", operator: "equals", value: "Critical" }
  ],
  matchMode: "all",    // AND, any if OR
  actions: {
    createTicket: true,
    acknowledgeAlarm: true,
    priority: "High"
  },
  order: 0           
}


{
  name: "Device Down on Firewalls → High Priority",
  conditions: [
    { field: "eventType", operator: "contains", value: "Device Down" },
    { field: "deviceCategory", operator: "equals", value: "Firewall" }
  ],
  matchMode: "all",
  actions: {
    createTicket: true,
    acknowledgeAlarm: true,
    priority: "High"
  },
  order: 1
}

## Correlation Window

1. Site-Based Correlation (Time Window)
2. If a device has a dependent field set in OpManager


export OTEL_TRACES_EXPORTER="otlp"
export OTEL_METRICS_EXPORTER="otlp"
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.kloudmate.dev:4318"
export OTEL_EXPORTER_OTLP_HEADERS="authorization=sk_nIPpQrv3Y8qFTBTQwN9LO1NL"
export OTEL_NODE_RESOURCE_DETECTORS="env,host,os"
export OTEL_NODE_DISABLED_INSTRUMENTATIONS="fs,dns,net"
export OTEL_SERVICE_NAME="workflow-agent"
export NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"